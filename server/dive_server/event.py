from datetime import datetime, timedelta
import logging
import os

from bson.objectid import ObjectId
import cherrypy
from girder.api.rest import getApiUrl
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token
from girder.models.user import User
from girder.settings import SettingKey
from girder.utility.mail_utils import renderTemplate, sendMail
from girder_jobs.models.job import Job
from girder_plugin_worker.utils import getWorkerApiUrl

from dive_tasks.dive_batch_postprocess import DIVEBatchPostprocessTaskParams
from dive_utils import asbool, fromMeta
from dive_utils.constants import (
    AssetstoreSourceMarker,
    AssetstoreSourcePathMarker,
    DatasetMarker,
    FPSMarker,
    MarkForPostProcess,
    TypeMarker,
    VideoType,
    videoRegex,
)

logger = logging.getLogger(__name__)


def send_new_user_email(event):
    try:
        info = event.info
        email = info.get('email')
        brandName = Setting().get(SettingKey.BRAND_NAME)
        rendered = renderTemplate('welcome.mako')
        sendMail(f'Welcome to {brandName}', rendered, [email])
    except Exception:
        logger.exception("Failed to send new user email")


def process_assetstore_import(event, meta: dict):
    """
    Function for appending the appropriate metadata to no-copy import data
    """
    info = event.info
    objectType = info.get("type")
    importPath = info.get("importPath")

    if not importPath or not objectType or objectType != "item":
        return

    dataset_type = None

    # DIVE-DSA is main used for Video data, remove auto importing of image-sequences for S3
    # if imageRegex.search(importPath):
    #     dataset_type = ImageSequenceType

    if videoRegex.search(importPath):
        item = Item().findOne({"_id": info["id"]})
        item['meta'].update(
            {
                **meta,
                AssetstoreSourcePathMarker: importPath,
            }
        )
        # Look for existing video dataset directory
        parentFolder = Folder().findOne({"_id": item["folderId"]})
        userId = parentFolder['creatorId'] or parentFolder['baseParentId']
        user = User().findOne({'_id': ObjectId(userId)})
        foldername = f'Video {item["name"]}'
        # reuse existing folder if it already exists with same name
        dest = Folder().createFolder(parentFolder, foldername, creator=user, reuseExisting=True)
        now = datetime.now()
        if now - dest['created'] > timedelta(hours=1):
            # Remove the old referenced item, replace it with the new one.
            oldItem = Item().findOne({'folderId': dest['_id'], 'name': item['name']})
            if oldItem is not None:
                if oldItem['meta'].get('codec', False):
                    meta = {
                        'source_video': oldItem['meta'].get('source_video', None),
                        'transcoder': oldItem['meta'].get('ffmpeg', None),
                        'originalFps': oldItem['meta'].get('originalFps', None),
                        'originalFpsString': oldItem['meta'].get('originalFpsString', None),
                        'codec': oldItem['meta'].get('codec', None),
                    }
                    item['meta'].update(meta)
                    Item().save(item)
                Item().remove(oldItem)
        Item().move(item, dest)
        # Set the dataset to Video Type
        dataset_type = VideoType

    if dataset_type is not None:
        # Update metadata of parent folder
        Item().save(item)
        folder = Folder().findOne({"_id": item["folderId"]})
        root, _ = os.path.split(importPath)
        # if the parent folder is not marked as a DIVE Dataset, Mark it.
        if not asbool(fromMeta(folder, DatasetMarker)):
            folder["meta"].update(
                {
                    TypeMarker: dataset_type,  # Sets to video
                    FPSMarker: -1,  # auto calculate the FPS from import
                    AssetstoreSourcePathMarker: root,
                    MarkForPostProcess: True,  # skip transcode or transcode if required
                    **meta,
                }
            )
            Folder().save(folder)


def _job_cherrypy_callback_url() -> str:
    """REST handlers have a CherryPy request; Celery workers do not."""
    try:
        return cherrypy.url()
    except Exception:
        return getWorkerApiUrl()


def convert_video_recrusive(folder, user):
    """
    Start a batch postprocess job for all folders with MarkForPostProcess flag.
    This replaces the manual recursive postprocess calls with a single batch job.
    """
    token = Token().createToken(user=user, days=2)

    dive_batch_postprocess_task_params: DIVEBatchPostprocessTaskParams = {
        "source_folder_id": str(folder['_id']),
        "skipJobs": False,
        "skipTranscoding": True,
        "additive": False,
        "additivePrepend": '',
        "userId": str(user['_id']),
        "girderToken": str(token['_id']),
        "girderApiUrl": getWorkerApiUrl(),
    }
    if not Setting().get('worker.api_url'):
        Setting().set('worker.api_url', getApiUrl())
    job = Job().createLocalJob(
        module='dive_tasks.dive_batch_postprocess',
        function='batchPostProcessingTaskLauncher',
        kwargs={'params': dive_batch_postprocess_task_params, 'url': _job_cherrypy_callback_url()},
        title='Batch process Dive Batch Postprocess',
        type='DIVE Batch Postprocess',
        user=user,
        public=True,
        asynchronous=True,
    )
    from dive_tasks.local_tasks import run_batch_postprocess_job

    run_batch_postprocess_job.delay(str(job['_id']))


def run_post_assetstore_import(event):
    """
    Run after Assetstore.importData completes.

    Bound on Celery ``local`` workers via ``dive_tasks.worker_girder_events``.
    """
    info = event.info
    parent = info.get('parent')
    parentType = info.get('parentType')
    user = info.get('user')
    if not parent or not parentType or not user:
        return
    userId = parent['creatorId'] or parent['baseParentId']
    owner = User().findOne({'_id': ObjectId(userId)})
    if parentType == 'folder':
        convert_video_recrusive(parent, owner)
    elif parentType in ('collection', 'user'):
        child_folders = Folder().find({'parentId': parent['_id']})
        for child in child_folders:
            convert_video_recrusive(child, owner)


def process_fs_import(event):
    return process_assetstore_import(event, {AssetstoreSourceMarker: 'filesystem'})


def process_s3_import(event):
    return process_assetstore_import(event, {AssetstoreSourceMarker: 's3'})
