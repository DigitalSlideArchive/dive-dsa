import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Literal, Optional, Tuple, Union
from urllib import request
from urllib.parse import urlparse

from PIL import Image
import cv2
from girder_client import GirderClient
from girder_worker.app import app
from girder_worker.task import Task
from girder_worker.utils import JobManager, JobStatus
from hydra import initialize
from hydra.core.global_hydra import GlobalHydra
import numpy as np
from pycocotools import mask as mask_utils
from sam2.build_sam import build_sam2_video_predictor
import torch

from dive_tasks import utils
from dive_tasks.manager import patch_manager
from dive_utils import constants


def get_filename_from_url(url):
    """Extracts the filename from a URL."""
    parsed_url = urlparse(url)
    return os.path.basename(parsed_url.path)


@app.task(bind=True, acks_late=True, ignore_result=True)
def download_sam_models(
    self: Task,
    sam2_config=constants.DEFAULT_SAM2_FILES,
    force: bool = False,
):
    """Download and organize SAM models"""
    context: dict = {}
    manager: JobManager = patch_manager(self.job_manager)
    if utils.check_canceled(self, context):
        manager.updateStatus(JobStatus.CANCELED)
        return

    gc: GirderClient = self.girder_client
    Path(constants.SAM2_MODEL_PATH).mkdir(parents=True, exist_ok=True)

    def progress_report_hook_factory(filename):
        last_percent = {'value': -1}

        def reporthook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = math.floor(downloaded * 100 / total_size)
                if percent != last_percent['value']:
                    last_percent['value'] = percent
                    manager.write(f"{filename}: {percent}% downloaded\n")
            else:
                manager.write(f"{filename}: downloading... {downloaded} bytes so far\n")

        return reporthook

    models = []
    for model_name, files in sam2_config.items():
        model_dir = Path(constants.SAM2_MODEL_PATH) / model_name
        models.append(model_name)
        model_dir.mkdir(parents=True, exist_ok=True)

        if utils.check_canceled(self, context, force=False):
            manager.updateStatus(JobStatus.CANCELED)
            return

        # Download the checkpoint
        checkpoint_url = files['checkpoint']
        checkpoint_dest = model_dir / Path(checkpoint_url).name
        if not checkpoint_dest.exists():
            manager.write(f"Downloading checkpoint for {model_name} - {checkpoint_url}\n")
            request.urlretrieve(
                checkpoint_url,
                checkpoint_dest,
                reporthook=progress_report_hook_factory(checkpoint_dest.name),
            )

        # Download the config
        config_url = files['config']
        config_dest = model_dir / Path(config_url).name
        if not config_dest.exists():
            manager.write(f"Downloading config for {model_name} - {config_url}.\n")
            request.urlretrieve(
                config_url, config_dest, reporthook=progress_report_hook_factory(config_dest.name)
            )

        if utils.check_canceled(self, context, force=False):
            manager.updateStatus(JobStatus.CANCELED)
            return
    base_dive_config = gc.get('dive_configuration/dive_config')
    manager.write(f'{base_dive_config}\n')
    sam2_base_config = base_dive_config.get('SAM2Config', {'queues': ['celery'], 'models': []})
    dive_config_queue = base_dive_config.get('celeryQueue', False)
    if dive_config_queue and dive_config_queue not in sam2_base_config.get('queues', []):
        sam2_base_config['queues'].insert(0, dive_config_queue)

    sam2_base_config['models'] = models
    base_dive_config["SAM2Config"] = sam2_base_config
    manager.write(f'{base_dive_config}\n')
    gc.put('dive_configuration/dive_config', json=base_dive_config)


@app.task(bind=True, acks_late=True, ignore_result=True)
def run_sam2_inference(
    self: Task,
    datasetId: str,
    trackId: int,
    frameId: int,
    frameLength: int,
    SAMModel: str = 'Tiny',
    additive: bool = 'True',
    upload_each: bool = True,
    notify_percent: float = 0.1,
    batch_size: int = 300,
):
    context: dict = {}
    manager: JobManager = patch_manager(self.job_manager)
    if utils.check_canceled(self, context):
        manager.updateStatus(JobStatus.CANCELED)
        return
    gc: GirderClient = self.girder_client

    with tempfile.TemporaryDirectory() as working_directory:
        working_dir_path = Path(working_directory)
        # get either default container model files or a girderFolder with model files
        manager.write(f'Getting the Models files for model: {SAMModel}\n')
        sam2_config, sam2_checkpoint = get_model_files(gc, SAMModel)
        # get the bbbox from existing trackJSON and the mask image file if it exists
        manager.write(
            f'Retrieving bbox or mask for the source trackId: {trackId} and frameId: {frameId}\n'
        )
        bbox, mask_location, existing_tracks, track_type = get_mask_or_bbox(
            gc, datasetId, trackId, frameId, working_dir_path
        )
        manager.write(f'BBOX: {bbox} mask_location: {mask_location}\n')
        # running inference with the models and the bbox/masks and returing a structured output directory

        output_dir = run_inference(
            self,
            gc,
            manager,
            sam2_config,
            sam2_checkpoint,
            trackId,
            frameId,
            frameLength,
            track_type,
            bbox,
            mask_location,
            working_dir_path,
            datasetId,
            additive,
            upload_each,
            batch_size=batch_size,
            notify_percent=notify_percent,
        )
        # Now I can either use the system Zip Upload and processing or I can do my own processing in the file.
        # only do if you aren't uploading each value
        if not upload_each:
            process_masks_folder(gc, datasetId, output_dir, 'masks', 'merge')


def get_model_files(gc: GirderClient, SAMModel: str = 'Tiny') -> Tuple[Path, Path]:
    config_file = None
    checkpoint_file = None
    # Log existence of default files
    if not Path(f'{constants.SAM2_MODEL_PATH}/{SAMModel}').exists():
        print(f"Config not found at {SAMModel}\n")
    else:
        print(f"Model Directory found: {SAMModel}\n")

    models_path = Path(f'{constants.SAM2_MODEL_PATH}/{SAMModel}')
    # grapb th4 .pt and .yaml files from the directory and return them
    for fname in sorted(os.listdir(models_path)):
        if fname.endswith('.yaml'):
            config_file = models_path / fname
        if fname.endswith('.pt'):
            checkpoint_file = models_path / fname

    if config_file and checkpoint_file:
        return config_file, checkpoint_file
    else:
        if not config_file:
            raise ValueError(f'Cannot find config_file (name.yaml) for {SAMModel}')
        if not checkpoint_file:
            raise ValueError(f'Cannot find checkpoint_file (checkpoint.pt) for {checkpoint_file}')


def get_mask_or_bbox(
    gc: GirderClient, dataset_id: str, track_id: str, start_frame: int, working_directory: Path
) -> Tuple[Optional[list], Optional[Path]]:
    """
    Fetch existing mask or bounding box for the specified track/frame.

    Returns:
        Tuple of bbox (list or None), mask file path (Path or None), and full track map.
    """
    existing_tracks = gc.get('dive_annotation/track', {'folderId': dataset_id})
    track_map = {str(track['id']): track for track in existing_tracks}
    track = track_map.get(str(track_id))

    bbox = None
    mask_location = None
    track_type = 'unknown'

    if track:
        features = track.get('features', [])
        matching_feature = next((f for f in features if f.get('frame') == int(start_frame)), None)
        if matching_feature:
            if matching_feature.get('hasMask', False):
                media_results = gc.get(f'dive_dataset/{dataset_id}/media')
                masks = media_results.get('masks', [])
                matching_mask = next(
                    (m for m in masks if m.get('metadata', {}).get('frameId') == int(start_frame)),
                    None,
                )
                if matching_mask:
                    mask_file_id = matching_mask.get('id')
                    mask_dir = working_directory / 'base_mask'
                    mask_dir.mkdir(exist_ok=True, parents=True)
                    gc.downloadItem(mask_file_id, str(mask_dir))
                    mask_location = mask_dir / matching_mask['filename']
            bbox = matching_feature.get('bounds')
            track_type = track.get('confidencePairs', [['unknown', 1.0]])[0][0]
    else:
        print(f'TRACK {track_id} IS EMPTY: {track_map}')
    return bbox, mask_location, track_map, track_type


def extract_frames(
    gc: GirderClient,
    manager: JobManager,
    dataset_id: str,
    start_frame: int,
    tracking_frames: int,
    working_directory: Path,
) -> Path:
    media_results = gc.get(f'/dive_dataset/{dataset_id}/media')
    video = media_results.get('video', None)
    if video is None:
        raise ValueError('Video file does not exists for this dataset so SAM can not be run')
    video_item_id = video.get('id', None)
    video_item = gc.getItem(video_item_id)
    if video is None:
        raise ValueError('Video file Id doe not exists for this dataset so SAM can not be run')
    gc.downloadItem(video_item_id, working_directory)
    video_name = video_item.get('name')
    video_file_path = working_directory / video_name
    frame_dir = working_directory / 'frames'
    frame_dir.mkdir(parents=True, exist_ok=True)
    # Generate filter string to extract only the required frames
    end_frame = start_frame + tracking_frames - 1
    select_filter = f"select='between(n\\,{start_frame}\\,{end_frame})',setpts=N/FRAME_RATE/TB"

    # ffmpeg uses 0-based frame indexing by default
    subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(video_file_path),
            "-vf",
            select_filter,
            "-vsync",
            "0",
            "-q:v",
            "2",
            "-start_number",
            "0",
            str(frame_dir / "%08d.jpg"),
        ],
        check=True,
    )
    list_directory_contents(frame_dir)
    return frame_dir


def load_png_mask_as_tensor(filename: Union[str, Path]) -> torch.Tensor:
    """
    Converts an RGBA PNG mask file into a binary PyTorch tensor.

    Returns:
        Tensor with shape matching image size, containing binary mask.
    """
    img = Image.open(filename).convert("RGBA")
    alpha = np.array(img)[:, :, 3]
    binary_mask = (alpha > 0).astype(np.uint8)
    return torch.from_numpy(binary_mask)


def list_directory_contents(path: Path):
    """
    Prints the contents of a given directory.
    """
    try:
        contents = list(path.iterdir())
        print(f"Contents of {path}: {[p.name for p in contents]}\n")
    except Exception as e:
        print(f"Could not list contents of {path}: {e}\n")


def save_and_record_mask(
    mask: torch.Tensor,
    output_dir: Path,
    obj_id: str,
    frame_idx: int,
    track_type: str,
    rle_masks: dict,
    track_data: dict,
) -> None:
    """
    Saves mask as PNG and records metadata for RLE encoding and track annotation.
    """
    obj_dir = output_dir / str(obj_id)
    obj_dir.mkdir(parents=True, exist_ok=True)
    path = obj_dir / f"{frame_idx}.png"

    mask_np = mask.detach().cpu().numpy()
    mask_bin = (mask_np > 0.5).astype(np.uint8).squeeze()
    alpha = mask_bin * 255

    h, w = mask.shape[-2:]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0:3] = 255
    rgba[..., 3] = alpha
    cv2.imwrite(str(path), rgba)

    rle = mask_utils.encode(np.asfortranarray(mask_bin))
    if isinstance(rle['counts'], bytes):
        rle['counts'] = rle['counts'].decode('utf-8')

    rle_masks.setdefault(str(obj_id), {})[str(frame_idx)] = {
        'rle': {'size': list(mask_bin.shape), 'counts': rle['counts']}
    }

    track = track_data['tracks'].setdefault(
        str(obj_id),
        {
            'id': str(obj_id),
            'begin': frame_idx,
            'end': frame_idx,
            'confidencePairs': [[track_type, 1.0]],
            'features': [],
            'group': None,
            'attributes': {},
            'hasMask': True,
            'interpolate': False,
        },
    )

    y_indices, x_indices = np.where(mask_bin > 0)
    bounds = (
        [int(x_indices.min()), int(y_indices.min()), int(x_indices.max()), int(y_indices.max())]
        if x_indices.size and y_indices.size
        else [0, 0, 0, 0]
    )

    new_feature = {
        'frame': frame_idx,
        'flick': frame_idx * 100000,
        'bounds': bounds,
        'attributes': {},
        'hasMask': True,
        'interpolate': False,
        'keyframe': True,
    }

    # Try to find an existing feature with the same frame index
    for i, feature in enumerate(track['features']):
        if feature['frame'] == frame_idx:
            # Replace the existing feature
            track['features'][i] = new_feature
            break
    else:
        # No existing feature found; append the new one
        track['features'].append(new_feature)
    track['begin'] = min(track['begin'], frame_idx)
    track['end'] = max(track['end'], frame_idx)


def process_masks_folder(
    gc: GirderClient,
    folderId: str,
    masks_path: Path,
    subfolder_name='masks',
    logic: Literal['replace', 'additive', 'merge'] = 'merge',
):
    """
    Upload mask images and RLE_MASKS.json file (if available or generate an empty one).
    """
    if logic == 'replace':
        folders = list(gc.listFolder(folderId, 'folder', name=subfolder_name))
        if len(folders) > 0:
            for folder in folders:
                if folder['name'] == subfolder_name and folder['meta'].get('mask', True):
                    # Delete the existing folder
                    gc.delete(f"folder/{folder['_id']}")
    masks_folder = gc.createFolder(folderId, subfolder_name, reuseExisting=True)
    gc.addMetadataToFolder(masks_folder['_id'], {'mask': True})
    # Create subfolder in Girder for masks
    rle_path = masks_path / 'RLE_MASKS.json'
    has_rle_mask = rle_path.exists()
    if has_rle_mask:
        rle_masks = list(gc.listItem(masks_folder['_id'], name='RLE_MASKS.json'))
        if len(rle_masks) > 0:
            # Delete the existing RLE_MASKS.json file
            gc.delete(f"item/{rle_masks[0]['_id']}")

        rle_item = gc.uploadFileToFolder(masks_folder['_id'], str(rle_path))
        gc.addMetadataToItem(
            rle_item['itemId'],
            {
                'description': 'Nested JSON with COCO RLE for all tracks and frames',
                'RLE_MASK_FILE': True,
            },
        )

    # Upload all image files
    rle_masks_json = None
    if not has_rle_mask:
        rle_masks_json = {}
    for track_dir in masks_path.iterdir():
        if not track_dir.is_dir():
            continue
        track_id = track_dir.name
        if not has_rle_mask:
            rle_masks_json[str(track_id)] = {}
        if logic == 'replace':
            # Check if the track already exists
            track_folders = list(gc.listFolder(masks_folder['_id'], 'folder', name=track_id))
            if len(track_folders) > 0:
                if track_folders[0]['meta'].get('mask_track', False):
                    # Delete the existing track folder
                    gc.delete(f"folder/{track_folders[0]['_id']}")
        track_folder = gc.createFolder(masks_folder['_id'], track_id, reuseExisting=True)
        gc.addMetadataToFolder(track_folder['_id'], {'mask_track': True})

        for image_path in track_dir.glob("*.png"):
            frame_number = image_path.stem
            if logic == 'merge':
                # Check if the image already exists
                existing_items = list(gc.listItem(track_folder['_id'], name=image_path.name))
                if len(existing_items) > 0:
                    if (
                        existing_items[0]['meta'].get('mask_track_frame', False)
                        and existing_items[0]['meta'].get('mask_frame_parent_track', False)
                        == track_id
                        and existing_items[0]['meta'].get('mask_frame_value', False) == frame_number
                    ):
                        # Delete the existing image
                        gc.delete(f"item/{existing_items[0]['_id']}")
            item = gc.uploadFileToFolder(track_folder["_id"], str(image_path))
            gc.addMetadataToItem(
                item['itemId'],
                {
                    'mask_frame_parent_track': track_id,
                    'mask_frame_value': frame_number,
                    'mask_track_frame': True,
                },
            )
            if not has_rle_mask:
                rle_masks_json[str(track_id)][str(frame_number)] = {
                    'file_name': str(image_path),
                    'rle': {},
                }
                # Create RLE for the image
                image = Image.open(image_path)
                np_img = np.array(image.convert('1'))
                # COCO RLE expects Fortran order and uint8 data
                rle = mask_utils.encode(np.asfortranarray(np_img.astype(np.uint8)))
                # The counts value needs to be JSON serializable (i.e. a string)
                rle['counts'] = rle['counts'].decode('utf-8')

                rle_masks_json[str(track_id)][str(frame_number)]['rle'] = {
                    "size": list(image.size),
                    "counts": rle['counts'],
                }

    # Handle RLE_MASKS.json
    if rle_masks_json is not None:
        # Create empty RLE file
        with open(rle_path, 'w') as fp:
            json.dump({}, fp)
        rle_masks = list(gc.listItem(masks_folder['_id'], name='RLE_MASKS.json'))
        if len(rle_masks) > 0:
            # Delete the existing RLE_MASKS.json file
            gc.delete(f"item/{rle_masks[0]['_id']}")

        rle_item = gc.uploadFileToFolder(masks_folder['_id'], str(rle_path))
        gc.addMetadataToItem(
            rle_item['itemId'],
            {
                'description': 'Nested JSON with COCO RLE for all tracks and frames',
                'RLE_MASK_FILE': True,
            },
        )

    track_json_path = masks_path / 'TrackJSON.json'
    if track_json_path.exists():
        # Process the  TrackJSON.json file based on the logic parameter
        if logic == 'replace':
            # Replace the existing TrackJSON.json file
            gc.uploadFileToFolder(
                folderId,
                str(track_json_path),
            )
            gc.post(f'dive_rpc/postprocess/{folderId}', data={"skipJobs": True})
        if logic in ['additive', 'merge']:
            with open(track_json_path, 'r') as f:
                json_data = json.load(f)
            # Get the existing Tracks in the system
            existing_tracks = gc.get('/dive_annotation/track', {'folderId': folderId})
            track_map = {}
            for track in existing_tracks:
                # Check if the track already exists in the new JSON
                if track['id'] not in track_map.keys():
                    # If not, add it to the new JSON
                    track_map[str(track['id'])] = track
            for trackId in json_data['tracks']:
                # Check if the track already exists in the new JSON
                if trackId in track_map.keys():
                    # If it does exist, check for merges or conversions
                    # we want to merge any new changes
                    old_features = track_map[trackId]['features']
                    new_features = json_data['tracks'][trackId]['features']
                    merged_features = merge_features(old_features, new_features)
                    begin = min(track_map[trackId]['begin'], json_data['tracks'][trackId]['begin'])
                    end = max(track_map[trackId]['end'], json_data['tracks'][trackId]['end'])

                    # Update the track with the new begin and end
                    json_data['tracks'][trackId]['begin'] = begin
                    json_data['tracks'][trackId]['end'] = end

                    # Update the track with the merged features
                    json_data['tracks'][trackId]['features'] = merged_features
            # Add in any missing previous tracks
            for trackmapId in track_map.keys():
                if trackmapId not in json_data['tracks']:
                    json_data['tracks'][trackmapId] = track_map[trackmapId]

            # Save the updated TrackJSON.json
            updated_track_json_path = masks_path / 'NewTrackJSON.json'
            with open(updated_track_json_path, 'w') as f:
                json.dump(json_data, f, indent=2)
            # Upload the updated TrackJSON.json file
            gc.uploadFileToFolder(
                folderId,
                str(updated_track_json_path),
            )
            gc.post(f'dive_rpc/postprocess/{folderId}', data={"skipJobs": True})


def merge_features(features1, features2):
    # Index features1 by 'frame'
    merged_dict = {}
    for f in features1:
        merged_dict[f['frame']] = f
    # Override or add entries from features2
    for f in features2:
        merged_dict[f['frame']] = f
    # Convert back to list
    return list(merged_dict.values())


def run_inference(
    task,
    gc: GirderClient,
    manager: JobManager,
    sam2_config: str,
    sam2_checkpoint: str,
    trackId: str,
    startFrame: int,
    trackingFrames: int,
    track_type: str,
    bbox: Optional[list],
    mask_location: Optional[Path],
    working_directory: Path,
    datasetId: str,
    additive: bool = True,
    upload_each: bool = True,
    batch_size: Optional[int] = 300,
    notify_percent: float = 0.1,
) -> Path:
    device = (
        torch.device("cuda")
        if torch.cuda.is_available()
        else torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
    )
    manager.write(f'Device: {str(device)}\n')

    track_data = {'tracks': {}, 'groups': {}, 'version': 2}
    if additive:  # we download the track data instead of using new tracks
        downloaded_tracks = gc.get(
            'dive_annotation/track', {"limit": 0, "sort": "id", "dir": 1, "folderId": datasetId}
        )
        for item in downloaded_tracks:
            track_data['tracks'][str(item['id'])] = item
    rle_masks = {}
    # Target directory you want to link to
    GlobalHydra.instance().clear()

    # SAM2 initialization needs to be a relative path
    initialize(config_path='../../../../tmp/SAM2/models')
    manager.write('Initialized Hydro Config\n')
    # The config needs to be relative to the initialized configuration path
    updated_sam2_config = str(sam2_config).replace('/tmp/SAM2/models/', './')
    predictor = build_sam2_video_predictor(updated_sam2_config, sam2_checkpoint, device=device)
    manager.write('Predictor Built\n')
    output_dir = working_directory / 'output/masks'
    output_dir.mkdir(parents=True, exist_ok=True)
    track_folder_id = None
    items_uploaded = []
    last_update_frame = 0
    total_frames = trackingFrames
    final_mask_path = mask_location
    folderObj = gc.get(f'folder/{datasetId}')
    ffprobe_info = folderObj.get('meta', {}).get('ffprobe_info', False)
    if ffprobe_info:
        nb_frames = ffprobe_info.get('nb_frames', False)
        if nb_frames:
            if startFrame + total_frames > int(nb_frames):
                trackingFrames = int(nb_frames) - startFrame

    notify_interval = max(1, int(trackingFrames * notify_percent))
    for batch_start in range(0, trackingFrames, batch_size or trackingFrames):
        batch_end = min(batch_start + (batch_size or trackingFrames), trackingFrames)
        batch_frame_count = batch_end - batch_start
        absolute_start = startFrame + batch_start

        manager.write(f'Processing batch: {batch_start} to {batch_end}\n')
        manager.write(f'Extracting {batch_end-batch_start} frames from the Dataset Video\n')
        frame_dir = extract_frames(
            gc, manager, datasetId, absolute_start, batch_frame_count, working_directory
        )
        with torch.inference_mode(), torch.autocast(str(device), dtype=torch.bfloat16):
            state = predictor.init_state(str(frame_dir))
            ann_obj_id = trackId
            if final_mask_path and final_mask_path.exists():
                torch_mask = load_png_mask_as_tensor(final_mask_path)
                frame_idx, object_ids, masks = predictor.add_new_mask(
                    state, 0, ann_obj_id, torch_mask
                )
            else:
                frame_idx, object_ids, masks = predictor.add_new_points_or_box(
                    state, frame_idx=0, box=bbox, obj_id=ann_obj_id
                )
            manager.write('Initial Seed mask created\n')
            for _obj_id, mask in zip(object_ids, masks):
                save_and_record_mask(
                    mask, output_dir, trackId, absolute_start, track_type, rle_masks, track_data
                )
            for _count, (frame_idx, object_ids, masks) in enumerate(
                predictor.propagate_in_video(state, 0, batch_frame_count)
            ):
                if utils.check_canceled(task, {}):
                    manager.updateStatus(JobStatus.CANCELED)
                    return

                absolute_frame = absolute_start + frame_idx
                if absolute_frame >= startFrame + trackingFrames:
                    continue

                for obj_id, mask in zip(object_ids, masks):
                    save_and_record_mask(
                        mask, output_dir, trackId, absolute_frame, track_type, rle_masks, track_data
                    )
                    if upload_each:
                        update_results = update_annotation(
                            task,
                            gc,
                            output_dir,
                            datasetId,
                            trackId,
                            obj_id,
                            absolute_frame,
                            track_folder_id,
                            track_data,
                        )
                        track_folder_id = update_results['trackFolderId']
                        items_uploaded.append(update_results['item'])
                        manager.updateProgress(
                            trackingFrames, absolute_frame - startFrame, 'Frame updated'
                        )

                if (absolute_frame - last_update_frame) >= notify_interval:
                    update_client(gc, datasetId, absolute_frame, items_uploaded, track_data)
                    items_uploaded.clear()
                    last_update_frame = absolute_frame

        # save the final frame mask to use as seed
        final_mask_path = output_dir / f"{trackId}" / f"{absolute_frame}.png"

    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / "RLE_MASKS.json", "w") as f:
        json.dump(rle_masks, f, indent=2)
    with open(output_dir / "TrackJSON.json", "w") as f:
        json.dump(track_data, f, indent=2)

    return output_dir


def update_annotation(
    task,
    gc: GirderClient,
    output_dir: Path,
    datasetId: str,
    trackId: int,
    objectId: int,
    frameId: int,
    track_folder_id: str | None,
    track_data: dict,
):
    # find the new mask
    mask_path = output_dir / f'{trackId}' / f'{frameId}.png'
    item = None
    if os.path.exists(mask_path):
        if not track_folder_id:
            mask_folder = gc.createFolder(
                datasetId, name='masks', reuseExisting=True, metadata={'mask': True}
            )
            track_folder = gc.createFolder(
                mask_folder["_id"],
                name=f'{trackId}',
                reuseExisting=True,
                metadata={'mask_track': True},
            )
            track_folder_id = str(track_folder["_id"])
        file = gc.uploadFileToFolder(track_folder_id, str(mask_path))
        gc.addMetadataToItem(
            file['itemId'],
            {
                constants.MASK_FRAME_PARENT_TRACK_MARKER: trackId,
                constants.MASK_FRAME_VALUE: frameId,
                constants.MASK_TRACK_FRAME_MARKER: True,
            },
        )
        item = {'_id': str(file['itemId'])}
        item["name"] = file['name']
        item["meta"] = {
            constants.MASK_FRAME_PARENT_TRACK_MARKER: trackId,
            constants.MASK_FRAME_VALUE: frameId,
            constants.MASK_TRACK_FRAME_MARKER: True,
        }
    # Now we need to upsert the track without creating a revision
    track_obj = track_data['tracks'].get(str(trackId), None)
    if track_obj:  # Now we upsert the new track to indicate it should be updated
        patch_data = {
            "tracks": {"upsert": [track_obj], "delete": []},
            "groups": {
                "upsert": [],
                "delete": [],
            },
        }
        gc.patch(
            '/dive_annotation', {"preventRevision": True, "folderId": datasetId}, json=patch_data
        )
    # Now send a task update with a json structure of the ItemId and the new Track data to be added
    if item and track_obj:
        return {
            'trackFolderId': track_folder_id,
            'item': item,
            'track': track_obj,
        }


def update_client(
    gc: GirderClient, dataset_id: str, current_frame: int, items_uploaded, track_data: dict
):
    # POST to custom endpoint
    masks = []
    frame_ids = set()
    track_id = None

    for item in items_uploaded:
        file_name = item['name']
        track_id = item["meta"].get(constants.MASK_FRAME_PARENT_TRACK_MARKER, None)
        frame_id = item["meta"].get(constants.MASK_FRAME_VALUE, None)

        if frame_id is not None:
            frame_ids.add(int(frame_id))

        url = f"/api/v1/item/{str(item['_id'])}/download"
        masks.append(
            {
                "id": str(item["_id"]),
                "filename": file_name,
                "metadata": {
                    "frameId": frame_id,
                    "trackId": track_id,
                },
                "url": url,
            }
        )

    all_features = track_data['tracks'].get(str(track_id), {}).get('features', [])
    filtered_features = [f for f in all_features if int(f.get('frame', -1)) in frame_ids]

    payload = {
        'datasetId': dataset_id,
        'currentFrame': current_frame,
        'trackFeatures': filtered_features,
        'trackId': track_id,
        'masks': masks,
    }

    gc.post(f'/dive_rpc/mask_notification/{dataset_id}', json=payload)
