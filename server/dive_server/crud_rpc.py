import json
from typing import Dict, List, Optional, TypedDict

from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.token import Token
from girder_jobs.models.job import Job, JobStatus
from girder_worker.girder_plugin.status import CustomJobStatus
from pydantic import BaseModel
import pymongo

from dive_server import crud, crud_annotation
from dive_tasks import tasks
from dive_utils import constants, fromMeta, models, types
from dive_utils.serializers import dive, kpf, kwcoco, viame

from . import crud_dataset


class RunTrainingArgs(BaseModel):
    folderIds: List[str]
    labelText: Optional[str]


def _get_queue_name(user: types.GirderUserModel, default="celery") -> str:
    if user.get(constants.UserPrivateQueueEnabledMarker, False):
        return f'{user["login"]}@private'
    return default


def _check_running_jobs(folder_id_str: str):
    """Find running jobs associated with the given folder"""
    return (
        Job().findOne(
            {
                constants.JOBCONST_DATASET_ID: folder_id_str,
                'status': {
                    '$in': [
                        # All possible states for an incomplete job
                        JobStatus.INACTIVE,
                        JobStatus.QUEUED,
                        JobStatus.RUNNING,
                        CustomJobStatus.CANCELING,
                        CustomJobStatus.CONVERTING_OUTPUT,
                        CustomJobStatus.CONVERTING_INPUT,
                        CustomJobStatus.FETCHING_INPUT,
                        CustomJobStatus.PUSHING_OUTPUT,
                    ],
                },
            }
        )
        is not None
    )


GetDataReturnType = TypedDict(
    'GetDataReturnType',
    {
        'annotations': Optional[types.DIVEAnnotationSchema],
        'meta': Optional[dict],
        'attributes': Optional[dict],
        'type': crud.FileType,
    },
)


def _get_data_by_type(
    file: types.GirderModel,
    image_map: Optional[Dict[str, int]] = None,
) -> Optional[GetDataReturnType]:
    """
    Given an arbitrary Girder file model, figure out what kind of file it is and
    parse it appropriately.

    Any given file type can result in updates to annotations, metadata, and/or attributes

    :param file: Girder file model
    :param image_map: Mapping of image names to frame numbers
    """
    if file is None:
        return None
    file_generator = File().download(file, headers=False)()
    file_string = b"".join(list(file_generator)).decode()
    data_dict = None

    # Discover the type of the mystery file
    if file['exts'][-1] == 'csv':
        as_type = crud.FileType.VIAME_CSV
    elif file['exts'][-1] == 'json':
        data_dict = json.loads(file_string)
        if type(data_dict) is list:
            raise RestException('No array-type json objects are supported')
        if kwcoco.is_coco_json(data_dict):
            as_type = crud.FileType.COCO_JSON
        elif models.MetadataMutable.is_dive_configuration(data_dict):
            data_dict = models.MetadataMutable(**data_dict).dict(exclude_none=True)
            as_type = crud.FileType.DIVE_CONF
        else:
            as_type = crud.FileType.DIVE_JSON
    elif file['exts'][-1] in ['yml', 'yaml']:
        as_type = crud.FileType.MEVA_KPF
    else:
        raise RestException('Got file of unknown and unusable type')

    # Parse the file as the now known type
    if as_type == crud.FileType.VIAME_CSV:
        converted, attributes = viame.load_csv_as_tracks_and_attributes(
            file_string.splitlines(), image_map
        )
        return {'annotations': converted, 'meta': None, 'attributes': attributes, 'type': as_type}
    if as_type == crud.FileType.MEVA_KPF:
        converted, attributes = kpf.convert(kpf.load(file_string))
        return {'annotations': converted, 'meta': None, 'attributes': attributes, 'type': as_type}

    # All filetypes below are JSON, so if as_type was specified, it needs to be loaded.
    if data_dict is None:
        data_dict = json.loads(file_string)
    if as_type == crud.FileType.COCO_JSON:
        converted, attributes = kwcoco.load_coco_as_tracks_and_attributes(data_dict)
        return {'annotations': converted, 'meta': None, 'attributes': attributes, 'type': as_type}
    if as_type == crud.FileType.DIVE_CONF:
        return {'annotations': None, 'meta': data_dict, 'attributes': None, 'type': as_type}
    if as_type == crud.FileType.DIVE_JSON:
        migrated = dive.migrate(data_dict)
        annotations, attributes = viame.load_json_as_track_and_attributes(data_dict)
        return {'annotations': migrated, 'meta': None, 'attributes': attributes, 'type': as_type}
    return None


def process_items(
    folder: types.GirderModel, user: types.GirderUserModel, additive=False, additivePrepend=''
):
    """
    Discover unprocessed items in a dataset and process them by type in order of creation
    """
    unprocessed_items = Folder().childItems(
        folder,
        filters={
            "$or": [
                {"lowerName": {"$regex": constants.csvRegex}},
                {"lowerName": {"$regex": constants.jsonRegex}},
                {"lowerName": {"$regex": constants.ymlRegex}},
            ]
        },
        # Processing order: oldest to newest
        sort=[("created", pymongo.ASCENDING)],
    )
    print(f'Creating Auxiliary Folder: {user}')
    auxiliary = crud.get_or_create_auxiliary_folder(
        folder,
        user,
    )
    for item in unprocessed_items:
        file: Optional[types.GirderModel] = next(Item().childFiles(item), None)
        if file is None:
            raise RestException('Item had no associated files')

        try:
            image_map = None
            if fromMeta(folder, constants.TypeMarker) == 'image-sequence':
                image_map = crud.valid_image_names_dict(crud.valid_images(folder, user))
            results = _get_data_by_type(file, image_map=image_map)
        except Exception as e:
            Item().remove(item)
            raise RestException(f'{file["name"]} was not a supported file type: {e}') from e

        if results is None:
            Item().remove(item)
            raise RestException(f'Unknown file type for {file["name"]}')

        item['meta'][constants.ProcessedMarker] = True
        Item().move(item, auxiliary)
        if results['annotations']:
            updated_tracks = results['annotations']['tracks'].values()
            if additive:  # get annotations and add them to the end
                tracks = crud_annotation.add_annotations(
                    folder, results['annotations']['tracks'], additivePrepend
                )
                updated_tracks = tracks.values()
            print(f'Saving Annotations: {user}')
            crud_annotation.save_annotations(
                folder,
                user,
                upsert_tracks=updated_tracks,
                upsert_groups=results['annotations']['groups'].values(),
                overwrite=True,
                description=f'Import {results["type"].name} from {file["name"]}',
            )
        if results['attributes']:
            crud.saveImportAttributes(folder, results['attributes'], user)
        if results['meta']:
            crud_dataset.update_metadata(folder, results['meta'], False)


def postprocess(
    user: types.GirderUserModel,
    dsFolder: types.GirderModel,
    skipJobs: bool,
    skipTranscoding=False,
    additive=False,
    additivePrepend='',
    logic='replace',
) -> types.GirderModel:
    """
    Post-processing to be run after media/annotation import

    When skipJobs=False, the following may run as jobs:
        Transcoding of Video
        Transcoding of Images
        Conversion of KPF annotations into track JSON
        Extraction and upload of zip files

    In either case, the following may run synchronously:
        Conversion of CSV annotations into track JSON
    """
    job_is_private = user.get(constants.UserPrivateQueueEnabledMarker, False)
    isClone = dsFolder.get(constants.ForeignMediaIdMarker, None) is not None
    # add default confidence filter threshold to folder metadata
    dsFolder['meta'][constants.ConfidenceFiltersMarker] = {'default': 0.1}

    # Validate user-supplied metadata fields are present
    if fromMeta(dsFolder, constants.FPSMarker) is None:
        raise RestException(f'{constants.FPSMarker} missing from metadata')
    if fromMeta(dsFolder, constants.TypeMarker) is None:
        raise RestException(f'{constants.TypeMarker} missing from metadata')

    if not skipJobs:
        token = Token().createToken(user=user, days=2)

        # extract ZIP Files if not already completed
        zipItems = list(
            Folder().childItems(
                dsFolder,
                filters={"lowerName": {"$regex": constants.zipRegex}},
            )
        )
        if len(zipItems) > 1:
            raise RestException('There are multiple zip files in the folder.')
        for item in zipItems:
            newjob = tasks.extract_zip.apply_async(
                kwargs=dict(
                    input_folder=str(item["folderId"]),
                    itemId=str(item["_id"]),
                    user_id=str(user["_id"]),
                    user_login=str(user["login"]),
                    logic=logic,
                    girder_job_title=f"Extracting {item['_id']} to folder {str(dsFolder['_id'])}",
                    girder_client_token=str(token["_id"]),
                    girder_job_type="private" if job_is_private else "convert",
                ),
            )
            newjob.job[constants.JOBCONST_PRIVATE_QUEUE] = job_is_private
            newjob.job[constants.JOBCONST_DATASET_ID] = str(item["folderId"])
            newjob.job[constants.JOBCONST_CREATOR] = str(user['_id'])
            Job().save(newjob.job)
            return dsFolder

        if not isClone:
            # transcode VIDEO if necessary
            videoItems = Folder().childItems(
                dsFolder, filters={"lowerName": {"$regex": constants.videoRegex}}
            )

            for item in videoItems:
                if item.get("meta", {}).get("codec", None) is not None:
                    continue
                newjob = tasks.convert_video.apply_async(
                    kwargs=dict(
                        folderId=str(item["folderId"]),
                        itemId=str(item["_id"]),
                        user_id=str(user["_id"]),
                        user_login=str(user["login"]),
                        skip_transcoding=skipTranscoding,
                        girder_job_title=f"Converting {item['_id']} to a web friendly format",
                        girder_client_token=str(token["_id"]),
                        girder_job_type="private" if job_is_private else "convert",
                    ),
                )
                newjob.job[constants.JOBCONST_PRIVATE_QUEUE] = job_is_private
                newjob.job[constants.JOBCONST_DATASET_ID] = dsFolder["_id"]
                Job().save(newjob.job)

            # transcode IMAGERY if necessary
            imageItems = Folder().childItems(
                dsFolder, filters={"lowerName": {"$regex": constants.imageRegex}}
            )
            safeImageItems = Folder().childItems(
                dsFolder, filters={"lowerName": {"$regex": constants.safeImageRegex}}
            )

            if imageItems.count() > safeImageItems.count():
                newjob = tasks.convert_images.apply_async(
                    queue='celery',
                    kwargs=dict(
                        folderId=dsFolder["_id"],
                        user_id=str(user["_id"]),
                        user_login=str(user["login"]),
                        girder_client_token=str(token["_id"]),
                        girder_job_title=f"Converting {dsFolder['_id']} to a web friendly format",
                        girder_job_type="private" if job_is_private else "convert",
                    ),
                )
                newjob.job[constants.JOBCONST_PRIVATE_QUEUE] = job_is_private
                newjob.job[constants.JOBCONST_DATASET_ID] = dsFolder["_id"]
                Job().save(newjob.job)

            elif imageItems.count() > 0:
                dsFolder["meta"][constants.DatasetMarker] = True

            Folder().save(dsFolder)
    print(f'Processing Items: {user}')
    process_items(dsFolder, user, additive, additivePrepend)
    return dsFolder
