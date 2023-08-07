from contextlib import suppress
import json
import os
from pathlib import Path
import shlex
import shutil
import tempfile
from typing import Dict, List, Tuple
from urllib import request
from urllib.parse import urlparse
import zipfile

from GPUtil import getGPUs
from girder_client import GirderClient
from girder_worker.app import app
from girder_worker.task import Task
from girder_worker.utils import JobManager, JobStatus

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
        if len(videostream) != 1:
            raise Exception('Expected 1 video stream, found {}'.format(len(videostream)))

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
            gc.addMetadataToFolder(
                folderId,
                {
                    constants.DatasetMarker: True,  # mark the parent folder as able to annotate.
                    constants.OriginalFPSMarker: originalFps,
                    constants.OriginalFPSStringMarker: avgFpsString,
                    constants.FPSMarker: newAnnotationFps,
                    "ffprobe_info": videostream[0],
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
def extract_zip(self: Task, folderId: str, itemId: str, user_id: str, user_login: str):
    """
    Discovery logic:
    * Find all folders that have at least one child file (potential datasets)
    * Exclude folders which are sub-folders of previously discovered folders
      because datasets cannot be nested in other datasets
    """
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
                    f"Compression ratio is exceedingly high at {ratio}\n\
                    Please contact an admin at viame-web@kitware.com if this is a valid zip file"
                )
                raise Exception("High Compression Ratio for Zip File")

            for fileName in listOfFileNames:
                folderName = os.path.dirname(fileName)
                parentName = os.path.dirname(folderName)
                if parentName in discovered_folders and folderName != '':
                    discovered_folders[folderName] = 'ignored'
                    continue
                if fileName.endswith(os.path.sep):
                    continue
                if folderName not in discovered_folders:
                    discovered_folders[folderName] = 'unstructured'
                if constants.metaRegex.search(os.path.basename(fileName)):
                    # sub folder has a meta.json so it is an exported dataset
                    discovered_folders[folderName] = 'dataset'
                if fileName.endswith('.zip'):
                    raise Exception("Nested Zip Files are invalid")
                manager.write(f"Extracting: {fileName}\n")
                zipObj.extract(fileName, f'{_working_directory}')

        # remove the zip file so it isn't uploaded back to the folder
        os.remove(file_name)
        # Create source folder and move zip file there
        created_folder = gc.createFolder(
            folderId,
            constants.SourceFolderName,
            reuseExisting=True,
        )
        gc.sendRestRequest(
            "PUT",
            f"/item/{str(item['_id'])}?folderId={str(created_folder['_id'])}",
        )
        # Only make subfolders if more than 1 discovered folder exists
        make_subfolders = (
            len(discovered_folders) - list(discovered_folders.values()).count('ignored')
        ) > 1
        for folderName, folderType in discovered_folders.items():
            subFolderName = folderName if make_subfolders else ''
            if folderType == 'unstructured':
                utils.upload_zipped_flat_media_files(
                    gc,
                    manager,
                    folderId,
                    _working_directory_path / folderName,
                    subFolderName,
                )
            elif folderType == 'dataset':
                utils.upload_exported_zipped_dataset(
                    gc,
                    manager,
                    folderId,
                    _working_directory_path / folderName,
                    subFolderName,
                )
            else:
                manager.write(f'Ignoring {folderName}\n')

        if make_subfolders:
            gc.sendRestRequest(
                "DELETE",
                f"folder/{folderId}/metadata",
                json=[constants.TypeMarker, constants.FPSMarker, constants.DatasetMarker],
            )
