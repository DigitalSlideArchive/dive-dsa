from contextlib import suppress
import json
import os
from pathlib import Path
import shutil
import tempfile
from typing import Dict, List, Literal
import zipfile

from GPUtil import getGPUs
from PIL import Image
from girder_client import GirderClient
from girder_worker.app import app
from girder_worker.task import Task
from girder_worker.utils import JobManager, JobStatus
import numpy as np
from pycocotools import mask as mask_utils

from dive_tasks import utils
from dive_tasks.frame_alignment import check_and_fix_frame_alignment
from dive_tasks.manager import patch_manager
from dive_utils import constants, fromMeta
from dive_utils.types import AvailableJobSchema, GirderModel

EMPTY_JOB_SCHEMA: AvailableJobSchema = {
    'pipelines': {},
    'training': {
        'configs': [],
        'default': None,
    },
}

# https://github.com/VIAME/VIAME/blob/master/cmake/download_viame_addons.csv
UPGRADE_JOB_DEFAULT_URLS: List[str] = [
    'https://viame.kitware.com/api/v1/item/627b145487bad2e19a4c4697/download',  # HabCam
    'https://viame.kitware.com/api/v1/item/627b32b1994809b024f207a7/download',  # SEFSC
    'https://viame.kitware.com/api/v1/item/627b3289ea630db5587b577d/download',  # SWFSC-PengHead
    'https://viame.kitware.com/api/v1/item/627b326fea630db5587b577b/download',  # Motion
    'https://viame.kitware.com/api/v1/item/627b326cc4da86e2cd3abb5b/download',  # EM Tuna
    'https://viame.kitware.com/api/v1/item/627b3282c4da86e2cd3abb5d/download',  # MOUSS
    'https://viame.kitware.com/api/v1/item/615bc7aa7e5c13a5bb9af7a7/download',  # Aerial Penguin
    'https://viame.kitware.com/api/v1/item/629807c192adc2f0ecfa5b54/download',  # Sea Lion
]


def get_gpu_environment() -> Dict[str, str]:
    """Get environment variables for using CUDA enabled GPUs."""
    env = os.environ.copy()

    gpu_uuid = env.get("WORKER_GPU_UUID")
    gpus = [gpu.id for gpu in getGPUs() if gpu.uuid == gpu_uuid]

    # Only set this env var if WORKER_GPU_UUID was supplied,
    # and it matches an installed GPU
    if gpus:
        env["CUDA_VISIBLE_DEVICES"] = str(gpus[0])

    return env


class Config:
    def __init__(self):
        self.gpu_process_env = get_gpu_environment()
        self.viame_install_directory = os.environ.get(
            'VIAME_INSTALL_PATH',
            '/opt/noaa/viame',
        )
        self.addon_root_directory = os.environ.get(
            'ADDON_ROOT_DIR',
            '/tmp/addons',
        )
        self.kwiver_log_level = os.environ.get(
            'KWIVER_DEFAULT_LOG_LEVEL',
            'warn',
        )

        self.viame_install_path = Path(self.viame_install_directory)
        assert self.viame_install_path.exists(), "VIAME Base install directory missing."
        self.viame_setup_script = self.viame_install_path / "setup_viame.sh"
        assert self.viame_setup_script.is_file(), "VIAME Setup Script missing"
        self.viame_training_executable = self.viame_install_path / "bin" / "viame_train_detector"
        assert self.viame_training_executable.is_file(), "VIAME Training Executable missing"

        # The subdirectory within VIAME_INSTALL_PATH where pipelines can be found
        self.pipeline_subdir = 'configs/pipelines'
        self.viame_pipeine_path = self.viame_install_path / self.pipeline_subdir
        assert self.viame_pipeine_path.exists(), "VIAME common pipe directory missing."

        self.addon_root_path = Path(self.addon_root_directory)
        self.addon_zip_path = utils.make_directory(self.addon_root_path / 'zips')
        self.addon_extracted_path = utils.make_directory(self.addon_root_path / 'extracted')

        # Set include directory to include pipelines from this path
        # https://github.com/VIAME/VIAME/issues/131
        self.gpu_process_env['SPROKIT_PIPE_INCLUDE_PATH'] = str(
            self.addon_extracted_path / self.pipeline_subdir
        )

    def get_extracted_pipeline_path(self, missing_ok=False) -> Path:
        """
        Includes subdirectory for pipelines
        """
        pipeline_path = self.addon_extracted_path / self.pipeline_subdir
        if not missing_ok:
            assert pipeline_path.exists(), f"Missing path {pipeline_path}"
        return pipeline_path


@app.task(bind=True, acks_late=True, ignore_result=True)
def convert_video(
    self: Task, folderId: str, itemId: str, user_id: str, user_login: str, skip_transcoding=False
):
    context: dict = {}
    gc: GirderClient = self.girder_client
    manager: JobManager = patch_manager(self.job_manager)
    if utils.check_canceled(self, context):
        manager.updateStatus(JobStatus.CANCELED)
        return

    folderData = gc.getFolder(folderId)
    requestedFps = fromMeta(folderData, constants.FPSMarker)

    with tempfile.TemporaryDirectory() as _working_directory, suppress(utils.CanceledError):
        _working_directory_path = Path(_working_directory)
        item: GirderModel = gc.getItem(itemId)
        file_name = str(_working_directory_path / item['name'])
        output_file_path = (_working_directory_path / item['name']).with_suffix('.transcoded.mp4')
        manager.write(f'Fetching input from {itemId} to {file_name}...\n')
        gc.downloadItem(itemId, _working_directory_path, name=item.get('name'))

        command = [
            "ffprobe",
            "-print_format",
            "json",
            "-v",
            "quiet",
            "-show_format",
            "-show_streams",
            file_name,
        ]
        stdout = utils.stream_subprocess(
            self, context, manager, {'args': command}, keep_stdout=True
        )
        jsoninfo = json.loads(stdout)
        videostream = list(filter(lambda x: x["codec_type"] == "video", jsoninfo["streams"]))
        multiple_video_streams = None
        if len(videostream) != 1:
            multiple_video_streams = (
                "More than One video stream found, defaulting to the first stream"
            )

        # Extract average framerate
        avgFpsString: str = videostream[0]["avg_frame_rate"]
        originalFps = None
        if avgFpsString:
            dividend, divisor = [int(v) for v in avgFpsString.split('/')]
            originalFps = dividend / divisor
        else:
            raise Exception('Expected key avg_frame_rate in ffprobe')

        if requestedFps == -1:
            newAnnotationFps = originalFps
        else:
            newAnnotationFps = min(requestedFps, originalFps)
        if newAnnotationFps < 1:
            raise Exception('FPS lower than 1 is not supported')

        # lets determine if we don't need to transcode this file
        if (
            skip_transcoding
            and videostream[0]['codec_name'] == 'h264'
            and item['name'].endswith('.mp4')
        ):
            # Now we can update the meta data and push the values
            manager.updateStatus(JobStatus.PUSHING_OUTPUT)
            gc.addMetadataToItem(
                itemId,
                {
                    "source_video": False,  # even though it is, this for requesting
                    "transcoder": "ffmpeg",
                    constants.OriginalFPSMarker: originalFps,
                    constants.OriginalFPSStringMarker: avgFpsString,
                    "codec": "h264",
                },
            )
            ffprobe_info = videostream[0]
            if multiple_video_streams:
                ffprobe_info['multiple_video_streams'] = multiple_video_streams
            gc.addMetadataToFolder(
                folderId,
                {
                    constants.DatasetMarker: True,  # mark the parent folder as able to annotate.
                    constants.OriginalFPSMarker: originalFps,
                    constants.OriginalFPSStringMarker: avgFpsString,
                    constants.FPSMarker: newAnnotationFps,
                    constants.MarkForPostProcess: False,
                    "ffprobe_info": ffprobe_info,
                },
            )
            return
        elif skip_transcoding:
            print('Transcoding cannot be skipped:')
            if videostream[0]['codec_name'] != 'h264':
                print(f'Codec Name: {videostream[0]["codec_name"]}')
                print('Codec name is not h264 so file will be transcoded')
            if not item['name'].endswith('.mp4'):
                print(f'File Container is not .mp4: {item["name"]}')

        command = [
            "ffmpeg",
            "-i",
            file_name,
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            # https://github.com/Kitware/dive/issues/855
            "-crf",
            "22",
            # https://askubuntu.com/questions/1315697/could-not-find-tag-for-codec-pcm-s16le-in-stream-1-codec-not-currently-support
            "-c:a",
            "aac",
            # see native/<platform> code for a discussion of this option
            "-vf",
            "scale=ceil(iw*sar/2)*2:ceil(ih/2)*2,setsar=1",
            str(output_file_path),
        ]
        utils.stream_subprocess(self, context, manager, {'args': command})
        # Check to see if frame alignment remains the same
        aligned_file = check_and_fix_frame_alignment(self, output_file_path, context, manager)

        manager.updateStatus(JobStatus.PUSHING_OUTPUT)
        new_file = gc.uploadFileToFolder(folderId, aligned_file)
        gc.addMetadataToItem(
            new_file['itemId'],
            {
                "source_video": False,
                "transcoder": "ffmpeg",
                constants.OriginalFPSMarker: originalFps,
                constants.OriginalFPSStringMarker: avgFpsString,
                "codec": "h264",
            },
        )
        gc.addMetadataToItem(
            itemId,
            {
                "source_video": True,
                constants.OriginalFPSMarker: originalFps,
                constants.OriginalFPSStringMarker: avgFpsString,
                "codec": videostream[0]["codec_name"],
            },
        )
        gc.addMetadataToFolder(
            folderId,
            {
                constants.DatasetMarker: True,  # mark the parent folder as able to annotate.
                constants.OriginalFPSMarker: originalFps,
                constants.OriginalFPSStringMarker: avgFpsString,
                constants.FPSMarker: newAnnotationFps,
                constants.MarkForPostProcess: False,
                "ffprobe_info": videostream[0],
            },
        )


@app.task(bind=True, acks_late=True)
def convert_images(self: Task, folderId, user_id: str, user_login: str):
    """
    Ensures that all images in a folder are in a web friendly format (png or jpeg).

    If conversions succeeds for an image, it will replace the image with an image
    of the same name, but in a web friendly extension.

    Returns the number of images successfully converted.
    """
    context: dict = {}
    gc: GirderClient = self.girder_client
    manager: JobManager = patch_manager(self.job_manager)
    if utils.check_canceled(self, context):
        manager.updateStatus(JobStatus.CANCELED)
        return

    items_to_convert = [
        item
        for item in gc.listItem(folderId)
        if (
            constants.imageRegex.search(item["name"])
            and not constants.safeImageRegex.search(item["name"])
        )
    ]

    with tempfile.TemporaryDirectory() as _working_directory, suppress(utils.CanceledError):
        working_directory_path = Path(_working_directory)
        images_path = utils.make_directory(working_directory_path / 'images')

        for item in items_to_convert:
            # Assumes 1 file per item
            gc.downloadItem(item["_id"], images_path, item["name"])

            item_path = images_path / item["name"]
            new_item_path = images_path / ".".join([*item["name"].split(".")[:-1], "png"])
            command = ["ffmpeg", "-i", str(item_path), str(new_item_path)]
            utils.stream_subprocess(self, context, manager, {'args': command})
            gc.uploadFileToFolder(folderId, new_item_path)
            gc.delete(f"item/{item['_id']}")

        gc.addMetadataToFolder(
            str(folderId),
            {"annotate": True},  # mark the parent folder as able to annotate.
        )


@app.task(bind=True, acks_late=True, ignore_result=True)
def extract_zip(self: Task, input_folder: str, itemId: str, user_id: str, user_login: str, logic: Literal['replace', 'additive', 'merge'] = 'replace'):
    context: dict = {}
    gc: GirderClient = self.girder_client
    manager: JobManager = patch_manager(self.job_manager)
    if utils.check_canceled(self, context):
        manager.updateStatus(JobStatus.CANCELED)
        return

    with tempfile.TemporaryDirectory() as _working_directory, suppress(utils.CanceledError):
        _working_directory_path = Path(_working_directory)
        item: GirderModel = gc.getItem(itemId)
        file_name = str(_working_directory_path / item['name'])
        manager.write(f'Fetching input from {itemId} to {file_name}...\n')
        gc.downloadItem(itemId, _working_directory, item["name"])
        discovered_folders = {}

        with zipfile.ZipFile(file_name, 'r') as zipObj:
            listOfFileNames = zipObj.namelist()
            sum_file_size = sum([data.file_size for data in zipObj.filelist])
            sum_compress_size = sum([data.compress_size for data in zipObj.filelist])
            ratio = sum_file_size / sum_compress_size
            if ratio > 600:
                manager.write(
                    f"Compression ratio is exceedingly high at {ratio}\n"
                    "Please contact an admin at viame-web@kitware.com if this is a valid zip file"
                )
                raise Exception("High Compression Ratio for Zip File")

            for fileName in listOfFileNames:
                folderName = os.path.dirname(fileName)
                parentName = os.path.dirname(folderName)
                if 'masks' in file_name:
                    manager.write(f"Extracting: {fileName}\n")
                    zipObj.extract(fileName, f'{_working_directory}')
                    continue
                if parentName in discovered_folders and folderName != '':
                    discovered_folders[folderName] = 'ignored'
                    continue
                if fileName.endswith(os.path.sep):
                    continue
                if folderName not in discovered_folders:
                    discovered_folders[folderName] = 'unstructured'
                if constants.metaRegex.search(os.path.basename(fileName)):
                    discovered_folders[folderName] = 'dataset'
                if fileName.endswith('.zip'):
                    raise Exception("Nested Zip Files are invalid")
                manager.write(f"Extracting: {fileName}\n")
                zipObj.extract(fileName, f'{_working_directory}')

        os.remove(file_name)
        masks_path = _working_directory_path / 'masks'
        if masks_path.exists():
            manager.write("Processing special 'masks' folder...\n")
            manager.write("Removing Zip File\n")
            gc.delete(f"item/{item['_id']}")
            process_masks_folder(
                gc,
                manager,
                input_folder,
                masks_path,
                'masks',
                logic
            )
            shutil.rmtree(masks_path)
            return

        created_folder = gc.createFolder(
            input_folder,
            constants.SourceFolderName,
            reuseExisting=True,
        )
        gc.sendRestRequest(
            "PUT",
            f"/item/{str(item['_id'])}?folderId={str(created_folder['_id'])}",
        )

        make_subfolders = (
            len(discovered_folders) - list(discovered_folders.values()).count('ignored')
        ) > 1

        for folderName, folderType in discovered_folders.items():
            subFolderName = folderName if make_subfolders else ''
            if folderType == 'unstructured':
                utils.upload_zipped_flat_media_files(
                    gc,
                    manager,
                    input_folder,
                    _working_directory_path / folderName,
                    subFolderName,
                )
            elif folderType == 'dataset':
                utils.upload_exported_zipped_dataset(
                    gc,
                    manager,
                    input_folder,
                    _working_directory_path / folderName,
                    subFolderName,
                )
            else:
                manager.write(f'Ignoring {folderName}\n')

        if make_subfolders:
            gc.sendRestRequest(
                "DELETE",
                f"folder/{input_folder}/metadata",
                json=[constants.TypeMarker, constants.FPSMarker, constants.DatasetMarker],
            )


def process_masks_folder(gc, manager, folderId, masks_path: Path, subfolder_name='masks', logic: Literal['replace', 'additive', 'merge'] = 'replace'):
    """
    Upload mask images and RLE_MASKS.json file (if available or generate an empty one).
    """
    if logic == 'replace':
        folders = list(gc.listFolder(folderId, 'folder', name=subfolder_name))
        if len(folders) > 0:
            for folder in folders:
                if folder['name'] == subfolder_name and folder['meta'].get('mask', True):
                    manager.write(f"Deleting existing folder {subfolder_name} in {folderId}\n")
                    # Delete the existing folder
                    gc.delete(f"folder/{folder['_id']}")
    masks_folder = gc.createFolder(folderId, subfolder_name, reuseExisting=True)
    gc.addMetadataToFolder(masks_folder['_id'], {'mask': True})
    # Create subfolder in Girder for masks
    rle_path = masks_path / 'RLE_MASKS.json'
    has_rle_mask = rle_path.exists()
    if has_rle_mask:
        manager.write("Found RLE_MASKS.json, uploading...\n")
        rle_masks = list(gc.listItem(masks_folder['_id'], name='RLE_MASKS.json'))
        if len(rle_masks) > 0:
            # Delete the existing RLE_MASKS.json file
            manager.write("Deleting existing RLE_MASKS.json\n")
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
    manager.write(f"Processing mask tracks...{masks_path}\n")
    for track_dir in masks_path.iterdir():
        manager.write(f"Processing track: {track_dir.name}\n")
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
                    manager.write(f"Track {track_id} already exists, Deleting item")
                    # Delete the existing track folder
                    gc.delete(f"folder/{track_folders[0]['_id']}")
        track_folder = gc.createFolder(masks_folder['_id'], track_id, reuseExisting=True)
        gc.addMetadataToFolder(track_folder['_id'], {'mask_track': True})

        for image_path in track_dir.glob("*.png"):
            frame_number = image_path.stem
            manager.write(f"Uploading mask: track {track_id}, frame {frame_number}\n")
            if logic == 'merge':
                # Check if the image already exists
                existing_items = list(gc.listItem(track_folder['_id'], name=image_path.name))
                if len(existing_items) > 0:
                    if existing_items[0]['meta'].get('mask_track_frame', False) and \
                            existing_items[0]['meta'].get('mask_frame_parent_track', False) == track_id and \
                            existing_items[0]['meta'].get('mask_frame_value', False) == frame_number:
                        manager.write(f"Image {image_path.name} already exists, Deleting Existing Item\n")
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
        manager.write("Created empty RLE_MASKS.json\n")
        rle_masks = list(gc.listItem(masks_folder['_id'], name='RLE_MASKS.json'))
        if len(rle_masks) > 0:
            # Delete the existing RLE_MASKS.json file
            manager.write("Deleting existing RLE_MASKS.json\n")
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
            existing_tracks = gc.sendRestRequest('GET', f'/dive_annotation/track', {'folderId': folderId})
            track_map = {}
            for track in existing_tracks:
                # Check if the track already exists in the new JSON
                if track['id'] not in track_map.keys():
                    # If not, add it to the new JSON
                    track_map[str(track['id'])] = track
            for trackId in json_data['tracks']:
                # Check if the track already exists in the new JSON
                if trackId not in track_map.keys():
                    # If not, add it to the new JSON
                    json_data['tracks'][trackId] = track_map[trackId]
                else:
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

            # Save the updated TrackJSON.json
            updated_track_json_path = masks_path / 'NewTrackJSON.json'
            manager.write(f'{json_data}\n')
            with open(updated_track_json_path, 'w') as f:
                json.dump(json_data, f, indent=2)
            # Upload the updated TrackJSON.json file
            manager.write("Uploading updated TrackJSON.json\n")
            gc.uploadFileToFolder(
                folderId,
                str(updated_track_json_path),
            )
            result = gc.post(f'dive_rpc/postprocess/{folderId}', data={"skipJobs": True})
            manager.write(f"Postprocess result: {result}\n")

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

