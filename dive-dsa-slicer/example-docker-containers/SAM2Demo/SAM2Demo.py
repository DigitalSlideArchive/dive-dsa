import os
import json
import logging
import shutil
import tempfile
import pprint
import subprocess
from datetime import timedelta
from pathlib import Path
from typing import Tuple, Optional, Union, Literal

import cv2
import numpy as np
import torch
from PIL import Image
from pycocotools import mask as mask_utils
import girder_client
from hydra import initialize, compose
from hydra.core.global_hydra import GlobalHydra

from sam2.build_sam import build_sam2_video_predictor
from sam2.sam2_video_predictor import SAM2VideoPredictor
from ctk_cli import CLIArgumentParser  # noqa: I004
from slicer_cli_web import ctk_cli_adjustment  # noqa

logging.basicConfig(level=logging.CRITICAL)


def process_input_args(args, gc: girder_client.GirderClient) -> None:
    DIVEDatasetId = args.DIVEDirectory.split('/')[-2]
    DIVEVideo = args.DIVEVideo
    startFrame = args.StartFrame
    trackId = args.TrackId
    trackingFrames = args.TrackingFrames

    with tempfile.TemporaryDirectory() as working_directory:
        working_dir_path = Path(working_directory)
        # get either default container model files or a girderFolder with model files
        sam2_config, sam2_checkpoint = get_model_files(gc, args, working_dir_path)
        # extract the frames between startFrame and startFrame+trackingFrames into a frame_dir
        frame_dir = extract_frames(DIVEVideo, startFrame, trackingFrames, working_dir_path)
        # get the bbbox from existing trackJSON and the mask image file if it exists
        bbox, mask_location, existing_tracks = get_mask_or_bbox(gc, DIVEDatasetId, trackId, startFrame, working_dir_path)
        # running inference with the models and the bbox/masks and returing a structured output directory
        output_dir = run_inference(
            gc,
            sam2_config,
            sam2_checkpoint,
            frame_dir,
            trackId,
            startFrame,
            trackingFrames,
            bbox,
            mask_location,
            working_dir_path,
        )
        # Now I can either use the system Zip Upload and processing or I can do my own processing in the file.
        process_masks_folder(
            gc,
            DIVEDatasetId,
            output_dir,
            'masks',
            'merge'
        )


def run_inference(
    gc: girder_client.GirderClient,
    sam2_config: str,
    sam2_checkpoint: str,
    frame_dir: Path,
    trackId: str,
    startFrame: int,
    trackingFrames: int,
    bbox: Optional[list],
    mask_location: Optional[Path],
    working_directory: Path
) -> Path:
    device = (
        torch.device("cuda") if torch.cuda.is_available()
        else torch.device("mps") if torch.backends.mps.is_available()
        else torch.device("cpu")
    )

    track_data = {'tracks': {}, 'groups': {}, 'version': 2}
    rle_masks = {}
    # Target directory you want to link to
    target_dir = '/opt/SAM2/models'
    GlobalHydra.instance().clear()
    os.makedirs('/SAM2Demo/models', exist_ok=True)
    shutil.copy(Path(target_dir) / sam2_config, '/SAM2Demo/models')
    shutil.copy(Path(target_dir) / sam2_checkpoint, '/SAM2Demo/models')

    os.chdir("/SAM2Demo")

    initialize(config_path='models')

    predictor = build_sam2_video_predictor(sam2_config, f'./models/{sam2_checkpoint}', device=device)
    with torch.inference_mode(), torch.autocast(str(device), dtype=torch.bfloat16):
        state = predictor.init_state(str(frame_dir))
        ann_obj_id = trackId

        print(f'BBOX: {bbox}')
        print(f'MASK: {mask_location}')
        if mask_location:
            torch_mask = load_png_mask_as_tensor(mask_location)
            frame_idx, object_ids, masks = predictor.add_new_mask(state, 0, ann_obj_id, torch_mask)
        else:
            frame_idx, object_ids, masks = predictor.add_new_points_or_box(
                state, frame_idx=0, box=bbox, obj_id=ann_obj_id
            )
        output_dir = working_directory / 'output/masks'
        for obj_id, mask in zip(object_ids, masks):
            save_and_record_mask(mask, output_dir, trackId, frame_idx+startFrame, rle_masks, track_data)

        for count, (frame_idx, object_ids, masks) in enumerate(
            predictor.propagate_in_video(state, 0, trackingFrames)
        ):
            if frame_idx < startFrame or frame_idx >= trackingFrames:
                continue
            for obj_id, mask in zip(object_ids, masks):
                save_and_record_mask(mask, output_dir, trackId, frame_idx+startFrame, rle_masks, track_data)

    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / "RLE_MASKS.json", "w") as f:
        json.dump(rle_masks, f, indent=2)
    with open(output_dir / "TrackJSON.json", "w") as f:
        json.dump(track_data, f, indent=2)

    return output_dir


def get_mask_or_bbox(
    gc: girder_client.GirderClient,
    dataset_id: str,
    track_id: str,
    start_frame: int,
    working_directory: Path
) -> Tuple[Optional[list], Optional[Path]]:
    existing_tracks = gc.get('dive_annotation/track', {'folderId': dataset_id})
    track_map = {str(track['id']): track for track in existing_tracks}
    track = track_map.get(str(track_id))

    bbox = None
    mask_location = None

    if track:
        features = track.get('features', [])
        matching_feature = next((f for f in features if f.get('frame') == int(start_frame)), None)
        if matching_feature:
            if matching_feature.get('hasMask', False):
                media_results = gc.get(f'dive_dataset/{dataset_id}/media')
                masks = media_results.get('masks', [])
                matching_mask = next(
                    (m for m in masks if m.get('metadata', {}).get('frameId') == int(start_frame)),
                    None
                )
                if matching_mask:
                    mask_file_id = matching_mask.get('id')
                    mask_dir = working_directory / 'base_mask'
                    mask_dir.mkdir(exist_ok=True, parents=True)
                    gc.downloadItem(mask_file_id, str(mask_dir))
                    mask_location = mask_dir / matching_mask['filename']
            bbox = matching_feature.get('bounds')
    else:
        print(f'TRACK {track_id} IS EMPTY: {track_map}')
    return bbox, mask_location, track_map


def save_and_record_mask(mask: torch.Tensor, output_dir: Path, obj_id: str, frame_idx: int,
                         rle_masks: dict, track_data: dict) -> None:
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

    track = track_data['tracks'].setdefault(str(obj_id), {
        'id': str(obj_id),
        'begin': frame_idx,
        'end': frame_idx,
        'confidencePairs': [['SAM2', 1.0]],
        'features': [],
        'group': None,
        'attributes': {},
        'hasMask': True,
        'interpolate': False,
    })

    y_indices, x_indices = np.where(mask_bin > 0)
    bounds = [int(x_indices.min()), int(y_indices.min()), int(x_indices.max()), int(y_indices.max())] \
        if x_indices.size and y_indices.size else [0, 0, 0, 0]

    track['features'].append({
        'frame': frame_idx,
        'flick': frame_idx * 100000,
        'bounds': bounds,
        'attributes': {},
        'hasMask': True,
        'interpolate': False,
        'keyframe': True
    })
    track['begin'] = min(track['begin'], frame_idx)
    track['end'] = max(track['end'], frame_idx)


def extract_frames(
    video_path: Union[str, Path],
    start_frame: int,
    tracking_frames: int,
    working_directory: Path
) -> Path:
    frame_dir = working_directory / 'frames'
    frame_dir.mkdir(parents=True, exist_ok=True)

    # Generate filter string to extract only the required frames
    end_frame = start_frame + tracking_frames - 1
    select_filter = f"select='between(n\\,{start_frame}\\,{end_frame})',setpts=N/FRAME_RATE/TB"

    # ffmpeg uses 0-based frame indexing by default
    subprocess.run([
        "ffmpeg",
        "-i", str(video_path),
        "-vf", select_filter,
        "-vsync", "0",
        "-q:v", "2",
        "-start_number", "0",
        str(frame_dir / "%05d.jpg")
    ], check=True)
    list_directory_contents(frame_dir)
    return frame_dir

def load_png_mask_as_tensor(filename: Union[str, Path]) -> torch.Tensor:
    img = Image.open(filename).convert("RGBA")
    alpha = np.array(img)[:, :, 3]
    binary_mask = (alpha > 0).astype(np.uint8)
    return torch.from_numpy(binary_mask)

def list_directory_contents(path: Path):
    try:
        contents = list(path.iterdir())
        print(f"Contents of {path}: {[p.name for p in contents]}\n")
    except Exception as e:
        print(f"Could not list contents of {path}: {e}\n")


def get_model_files(gc: girder_client.GirderClient, args, working_directory: Path) -> Tuple[Path, Path]:
    default_config = "sam2.1_hiera_t.yaml"
    default_checkpoint = "sam2.1_hiera_tiny.pt"

    # Log existence of default files
    if not Path(f'/opt/SAM2/models/{default_config}').exists():
        print(f"Default config not found at {default_config}\n")
    else:
        print(f"Default config found: {default_config}\n")

    if not Path(f'/opt/SAM2/models/{default_checkpoint}').exists():
        print(f"Default checkpoint not found at {default_checkpoint}\n")
    else:
        print(f"Default checkpoint found: {default_checkpoint}\n")

    model_folder = getattr(args, 'SAM2ModelFolder', None)

    if not model_folder:
        return default_config, default_checkpoint

    folder_id = model_folder.split('/')[-2]
    model_dir = working_directory / 'models'
    model_dir.mkdir(parents=True, exist_ok=True)

    config_path = model_dir / 'config.yml'
    checkpoint_path = model_dir / 'checkpoint.pt'

    for item in gc.listItem(folder_id):
        if item['name'].endswith('.yaml'):
            gc.downloadItem(item['_id'], str(config_path))
        elif item['name'].endswith('.pt'):
            gc.downloadItem(item['_id'], str(checkpoint_path))

    return config_path, checkpoint_path

def process_masks_folder(
        gc: girder_client.GirderClient,
        folderId: str,
        masks_path: Path,
        subfolder_name='masks',
        logic: Literal['replace', 'additive', 'merge'] = 'merge'):
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
                    if existing_items[0]['meta'].get('mask_track_frame', False) and \
                            existing_items[0]['meta'].get('mask_frame_parent_track', False) == track_id and \
                            existing_items[0]['meta'].get('mask_frame_value', False) == frame_number:
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
            existing_tracks = gc.get(f'/dive_annotation/track', {'folderId': folderId})
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
            result = gc.post(f'dive_rpc/postprocess/{folderId}', data={"skipJobs": True})

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



def main(args) -> None:
    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)
    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))
    process_input_args(args, gc)


if __name__ == '__main__':
    main(CLIArgumentParser().parse_args())
