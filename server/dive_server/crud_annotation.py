import io
import json
from typing import Callable, Dict, Generator, Iterable, List, Optional, Tuple

from PIL import Image
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload
from girder.models.user import User
import numpy as np
from pycocotools import mask as mask_utils
from pydantic import Field
from pydantic.main import BaseModel
import pymongo
from pymongo.cursor import Cursor

from dive_server import crud, crud_dataset
from dive_utils import TRUTHY_META_VALUES, constants, fromMeta, models, types
from dive_utils.serializers import viame

DATASET = 'dataset'
REVISION_DELETED = 'rev_deleted'
REVISION_CREATED = 'rev_created'
REVISION = 'revision'
IDENTIFIER = 'id'

DEFAULT_ANNOTATION_SORT = [[IDENTIFIER, 1]]
DEFAULT_REVISION_SORT = [[REVISION, pymongo.DESCENDING]]


class BaseItem(crud.PydanticModel):
    def list(
        self,
        dsFolder: types.GirderModel,
        limit=0,
        offset=0,
        sort=DEFAULT_ANNOTATION_SORT,
        revision: Optional[int] = None,
    ) -> Cursor:
        head: int = RevisionLogItem().latest(dsFolder) if revision is None else revision
        query = {
            DATASET: dsFolder['_id'],
            REVISION_CREATED: {'$lte': head},
            '$or': [{REVISION_DELETED: {'$gt': head}}, {REVISION_DELETED: {'$exists': False}}],
        }
        return self.find(
            offset=offset, limit=limit, sort=sort, query=query, fields=self.PROJECT_FIELDS
        )

    def initialize(self):
        self._indices = [
            # Index for finding tracks in a dataset
            [[(DATASET, 1), (IDENTIFIER, 1)], {}],
            # Index for ensuring uniqueness and dataset consistency
            [[(DATASET, 1), (IDENTIFIER, 1), (REVISION_CREATED, 1)], {'unique': True}],
        ]
        super().initialize(self.NAME, self.MODEL)


class TrackItem(BaseItem):
    PROJECT_FIELDS = {
        **{'_id': 0},
        **{key: 1 for key in models.Track.schema()['properties'].keys()},
    }
    NAME = 'trackItem'
    MODEL = models.TrackItemSchema


class GroupItem(BaseItem):
    PROJECT_FIELDS = {
        **{'_id': 0},
        **{key: 1 for key in models.Group.schema()['properties'].keys()},
    }
    NAME = 'groupItem'
    MODEL = models.GroupItemSchema


class RevisionLogItem(crud.PydanticModel):
    PROJECT_FIELDS = {'_id': 0}

    def initialize(self):
        self._indices = [
            [[(DATASET, 1), (REVISION, 1)], {'unique': True}],
            [[('created', 1)], {}],
        ]
        super().initialize("revisionLogItem", models.RevisionLog)

    def latest(self, dsFolder: types.GirderModel) -> int:
        query = {DATASET: dsFolder['_id']}
        result = self.findOne(query, sort=[[REVISION, pymongo.DESCENDING]]) or {}
        return result.get(REVISION, 0)  # Revision 0 is always the empty revision

    def list(
        self,
        dsFolder: types.GirderModel,
        limit=0,
        offset=0,
        sort=DEFAULT_REVISION_SORT,
        before: Optional[int] = None,
    ) -> Tuple[Cursor, int]:
        query: dict = {DATASET: dsFolder['_id']}
        if before is not None:
            query[REVISION] = {'$lte': before}
        cursor = self.find(
            offset=offset,
            limit=limit,
            sort=sort,
            query=query,
            fields=RevisionLogItem.PROJECT_FIELDS,
        )
        total = self.find(query=query).count()
        return cursor, total


def rollback(dsFolder: types.GirderModel, revision: int):
    """Reset to previous revision."""
    # TODO implement immutabble forward-rollback (like git revert)
    # Logic: delete everything created after revision
    # And erase deletions for anything deleted after revision
    dsId = dsFolder['_id']
    RevisionLogItem().removeWithQuery({DATASET: dsId, REVISION: {'$gt': revision}})
    listQuery = {DATASET: dsId, REVISION_CREATED: {'$gt': revision}}
    updateQuery = {'$unset': {REVISION_DELETED: ""}}
    TrackItem().removeWithQuery(listQuery)
    TrackItem().update(listQuery, updateQuery)
    GroupItem().removeWithQuery(listQuery)
    GroupItem().update(listQuery, updateQuery)


def get_annotation_csv_generator(
    folder: types.GirderModel,
    user: types.GirderUserModel,
    excludeBelowThreshold=False,
    typeFilter=None,
    revision=None,
) -> Tuple[str, Callable[[], Generator[str, None, None]]]:
    """Get the annotation generator for a folder"""
    fps = None
    imageFiles = None

    source_type = fromMeta(folder, constants.TypeMarker)
    if source_type == constants.VideoType:
        fps = fromMeta(folder, constants.FPSMarker)
    elif source_type == constants.ImageSequenceType:
        imageFiles = [img['name'] for img in crud.valid_images(folder, user)]

    thresholds = fromMeta(folder, "confidenceFilters", {})

    def downloadGenerator():
        datalist = TrackItem().list(folder, revision=revision)
        for data in viame.export_tracks_as_csv(
            datalist,
            excludeBelowThreshold,
            thresholds=thresholds,
            filenames=imageFiles,
            fps=fps,
            typeFilter=typeFilter,
            revision=revision,
        ):
            yield data

    filename = folder["name"] + ".csv"
    return filename, downloadGenerator


class TrackUpdateArgs(BaseModel):
    delete: List[int] = Field(default_factory=list)
    upsert: List[models.Track] = Field(default_factory=list)


class GroupUpdateArgs(BaseModel):
    delete: List[int] = Field(default_factory=list)
    upsert: List[models.Group] = Field(default_factory=list)


class AnnotationUpdateArgs(BaseModel):
    tracks: TrackUpdateArgs = Field(default_factory=TrackUpdateArgs)
    groups: GroupUpdateArgs = Field(default_factory=GroupUpdateArgs)

    class Config:
        extra = 'ignore'


class TrackPutArgs(BaseModel):
    tracks: List[models.Track] = Field(default_factory=list)


def save_annotations(
    dsFolder: types.GirderModel,
    user: types.GirderUserModel,
    upsert_tracks: Optional[Iterable[dict]] = None,
    delete_tracks: Optional[Iterable[int]] = None,
    upsert_groups: Optional[Iterable[dict]] = None,
    delete_groups: Optional[Iterable[int]] = None,
    description="save",
    overwrite=False,
    preventRevision=False,
):
    """
    Annotations are lazy-deleted by marking their staleness property as true.
    """
    datasetId = dsFolder['_id']
    new_revision = RevisionLogItem().latest(dsFolder) + 1
    delete_annotation_update = {'$set': {REVISION_DELETED: new_revision}}

    if upsert_tracks is None:
        upsert_tracks = []
    if upsert_groups is None:
        upsert_groups = []
    if delete_tracks is None:
        delete_tracks = []
    if delete_groups is None:
        delete_groups = []

    def update_collection(
        collection: crud.PydanticModel,
        upsert_list: Iterable[dict],
        delete_list: Iterable[int],
    ):
        expire_operations = []  # Mark existing records as deleted
        expire_result = {}
        insert_operations = []  # Insert new records
        insert_result = {}

        if overwrite:
            query = {DATASET: datasetId, REVISION_DELETED: {'$exists': False}}
            expire_result = collection.collection.bulk_write(
                [pymongo.UpdateMany(query, delete_annotation_update)]
            ).bulk_api_result

        for id in delete_list:
            filter = {IDENTIFIER: id, DATASET: datasetId, REVISION_DELETED: {'$exists': False}}
            # UpdateMany for safety, UpdateOne would also work
            expire_operations.append(pymongo.UpdateMany(filter, delete_annotation_update))

        for newdict in upsert_list:
            newdict.update({DATASET: datasetId, REVISION_CREATED: new_revision})
            newdict.pop(REVISION_DELETED, None)
            filter = {
                IDENTIFIER: newdict[IDENTIFIER],
                DATASET: datasetId,
                REVISION_DELETED: {'$exists': False},
            }
            if not overwrite:
                # UpdateMany for safety, UpdateOne would also work
                expire_operations.append(pymongo.UpdateMany(filter, delete_annotation_update))
            insert_operations.append(pymongo.InsertOne(newdict))

        # Ordered=false allows fast parallel writes
        if len(expire_operations):
            expire_result = collection.collection.bulk_write(
                expire_operations, ordered=False
            ).bulk_api_result
        if len(insert_operations):
            insert_result = collection.collection.bulk_write(
                insert_operations, ordered=False
            ).bulk_api_result

        additions = insert_result.get('nInserted', 0)
        deletions = expire_result.get('nModified', 0)
        return additions, deletions

    track_additions, track_deletions = update_collection(TrackItem(), upsert_tracks, delete_tracks)
    delete_mask_list = [[i, -1] for i in delete_tracks]
    if len(delete_mask_list) > 0:
        delete_masks(user, dsFolder, delete_mask_list)
    group_additions, group_deletions = update_collection(GroupItem(), upsert_groups, delete_groups)
    additions = track_additions + group_additions
    deletions = track_deletions + group_deletions

    if (additions or deletions) and not preventRevision:
        # Write the revision to the log
        log_entry = models.RevisionLog(
            dataset=datasetId,
            author_name=user['login'],
            author_id=user['_id'],
            revision=new_revision,
            additions=additions,
            deletions=deletions,
            description=description,
        )
        RevisionLogItem().create(log_entry)

    return {"updated": additions, "deleted": deletions}


def clone_annotations(
    source: types.GirderModel,
    dest: types.GirderModel,
    user: types.GirderUserModel,
    revision: Optional[int] = None,
):
    track_iter = TrackItem().list(source, revision=revision)
    group_iter = GroupItem().list(source, revision=revision)
    save_annotations(
        dest,
        user,
        upsert_tracks=track_iter,
        upsert_groups=group_iter,
        description="initialize clone",
    )


def get_annotations(dataset: types.GirderModel, revision: Optional[int] = None):
    """Get the DIVE json annotation file as a dict"""
    tracks = TrackItem().list(dataset, revision=revision)
    groups = GroupItem().list(dataset, revision=revision)
    annotations: types.DIVEAnnotationSchema = {
        'tracks': {},
        'groups': {},
        'version': constants.AnnotationsCurrentVersion,
    }
    for t in tracks:
        serialized = models.Track(**t).dict(exclude_none=True)
        annotations['tracks'][serialized['id']] = serialized
    for g in groups:
        serialized = models.Group(**g).dict(exclude_none=True)
        annotations['groups'][serialized['id']] = serialized
    return annotations


def add_annotations(
    dataset: types.GirderModel, new_tracks: dict, prepend='', revision: Optional[int] = None
):
    tracks = TrackItem().list(dataset, revision=revision)
    annotations: types.DIVEAnnotationSchema = {
        'tracks': {},
        'groups': {},
        'version': constants.AnnotationsCurrentVersion,
    }
    max_track_id = -1
    for t in tracks:
        serialized = models.Track(**t).dict(exclude_none=True)
        annotations['tracks'][serialized['id']] = serialized
        max_track_id = max(max_track_id, serialized['id'])
    # Now add in the new tracks while renaming them
    for key in new_tracks.keys():
        new_id = int(key) + max_track_id + 1
        annotations['tracks'][new_id] = new_tracks[key]
        annotations['tracks'][new_id]['id'] = new_id
        if prepend != '':
            track = annotations['tracks'][new_id]
            newPairs = []
            for confidencePairs in track['confidencePairs']:
                newPairs.append([f'{prepend}_{confidencePairs[0]}', confidencePairs[1]])
            annotations['tracks'][new_id]['confidencePairs'] = newPairs

    return annotations['tracks']


def get_labels(user: types.GirderUserModel, published=False, shared=False):
    """Find all the labels in all datasets belonging to the user"""
    accessLevel = AccessType.WRITE
    if published or shared:
        accessLevel = AccessType.READ
    pipeline = [
        {
            # Begin query by selecting datasets
            '$match': crud_dataset.get_dataset_query(
                user, published=published, shared=shared, level=accessLevel
            )
        },
        {
            # Left join to get annotationItems for all datasets
            '$lookup': {
                'from': 'trackItem',
                # Map the foreign key _id to dataset_id in the query
                'let': {'dataset_id': '$_id'},
                # Create a new field 'label' for each annotation
                'as': 'label',
                'pipeline': [
                    {'$match': {'$expr': {'$eq': ['$dataset', '$$dataset_id']}}},
                    {'$match': {'$expr': {'$eq': [{'$type': "$rev_deleted"}, 'missing']}}},
                    # Select the confidencePairs, which is the only field needed
                    {'$project': {'confidencePairs': 1}},
                    # Use the first confidence pair in the array, which assumes they are
                    # sorted in descending order
                    {'$set': {'confidencePairs': {'$first': '$confidencePairs'}}},
                    {'$set': {'confidencePairs': {'$first': '$confidencePairs'}}},
                ],
            },
        },
        # after the lookup, label will be an array of strings on each dataset.
        # unwind to duplicate N records in the query for N labels.
        {'$unwind': '$label'},
        # Preserve properties of dataset by moving them into a sub-object.
        {'$set': {'dataset': {'id': '$_id', 'name': '$name'}}},
        # Drop unwanted fields.
        {'$project': {'label.confidencePairs': 1, '_id': 1, 'dataset': 1}},
        # Group records by label values
        {
            '$group': {
                '_id': '$label.confidencePairs',
                'count': {'$count': {}},
                'datasets': {'$addToSet': '$dataset'},
            }
        },
        {'$sort': {'_id': 1}},
    ]
    return Folder().collection.aggregate(pipeline)


def get_mask_folder(folder: Folder) -> Folder | None:
    mask_folder = Folder().findOne(
        {
            'parentId': folder['_id'],
            f'meta.{constants.MASK_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )
    return mask_folder


def get_mask_item(user: User, folder: Folder, trackId: int, frameId: int, remove=True):
    mask_folder = Folder().findOne(
        {
            'parentId': folder['_id'],
            f'meta.{constants.MASK_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )
    if mask_folder is None:
        mask_folder = Folder().createFolder(folder, 'masks', reuseExisting=True, creator=user)
        Folder().setMetadata(
            mask_folder,
            {
                constants.MASK_MARKER: True,
            },
        )
    track_folder = Folder().createFolder(
        mask_folder, str(trackId), reuseExisting=True, creator=user
    )
    Folder().setMetadata(
        track_folder,
        {
            constants.MASK_TRACK_MARKER: True,
        },
    )
    item = Item().findOne(
        {
            'folderId': track_folder['_id'],
            'name': f'{frameId}.png',
        }
    )
    if item is None:
        item = Item().createItem(
            f'{frameId}.png',
            creator=user,
            folder=track_folder,
            reuseExisting=True,
        )
        Item().setMetadata(
            item,
            {
                constants.MASK_TRACK_FRAME_MARKER: True,
                constants.MASK_FRAME_PARENT_TRACK_MARKER: trackId,
                constants.MASK_FRAME_VALUE: frameId,
            },
        )
    if remove:
        for file in Item().childFiles(item):
            File().remove(file)
    return item


def get_mask_items(
    user: User,
    folder: dict,
    track_frame_pairs: Optional[List[Tuple[int, int]]] = None,
) -> Dict[int, List[dict]]:
    """
    Returns files associated with existing mask items for given track/frame pairs.
    If no pairs are provided, returns files for all items with MASK_TRACK_FRAME_MARKER metadata.

    Returns a dict: {track_id: [file1, file2, ...], ...}
    """
    result: Dict[int, Dict[int, dict]] = {}

    # Find or identify mask folder
    mask_folder = Folder().findOne(
        {
            'parentId': folder['_id'],
            f'meta.{constants.MASK_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )

    if not mask_folder:
        return result  # No mask folder, nothing to return

    if track_frame_pairs is None:
        # Find all items in child folders of mask_folder that have MASK_TRACK_FRAME_MARKER
        child_folder_ids = [
            f['_id'] for f in Folder().childFolders(mask_folder, parentType='folder', user=user)
        ]
        print(f'CHILD FOLDER IDS: {child_folder_ids}')
        all_items = Item().find({'folderId': {'$in': child_folder_ids}})
        print(f'ALL ITEMS: {all_items.count()}')
        for item in all_items:
            meta = item.get('meta', {})
            if constants.MASK_TRACK_FRAME_MARKER in meta:
                track_id = meta.get(constants.MASK_FRAME_PARENT_TRACK_MARKER)
                frame_id = meta.get(constants.MASK_FRAME_VALUE)
                if track_id is not None:
                    files = list(Item().childFiles(item))
                    if len(files) == 0:
                        continue
                    if result.get(track_id) is None:
                        result[track_id] = {}
                    if result[track_id].get(frame_id) is None:
                        result[track_id][frame_id] = files[0]
    else:
        # Only find matching items based on provided pairs
        for track_id, frame_id in track_frame_pairs:
            track_folder = Folder().findOne({'parentId': mask_folder['_id'], 'name': str(track_id)})

            if not track_folder:
                continue  # Track folder doesn't exist

            item = Item().findOne(
                {
                    'folderId': track_folder['_id'],
                    'name': f'{frame_id}.png',
                }
            )

            if not item:
                continue  # Item doesn't exist

            files = list(Item().childFiles(item))
            if len(files) == 0:
                continue
            if result.get(track_id) is None:
                result[track_id] = {}
            if result[track_id].get(frame_id) is None:
                result[track_id][frame_id] = files[0]
    return result


def get_mask_json(folder: Folder) -> Dict:
    """
    Retrieves the contents of the RLE_MASKS.json file associated with a given folder.

    :param folderId: The ID (or folder dict with `_id`) of the base folder containing the mask folder.
    :return: A dictionary representing the RLE mask JSON data, or an empty dict if not found.
    """
    folderId = folder['_id']

    # Find the mask folder under the given folder
    mask_folder = Folder().findOne(
        {
            'parentId': folderId,
            f'meta.{constants.MASK_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )

    if not mask_folder:
        return {}

    # Find the RLE_MASKS.json item in the mask folder
    rle_item = Item().findOne(
        {
            'folderId': mask_folder['_id'],
            f'meta.{constants.MASK_RLE_FILE_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )

    if not rle_item:
        return {}

    # Get the file associated with the RLE item
    file_obj = next(Item().childFiles(rle_item), None)
    if not file_obj:
        return {}

    # Download and parse the JSON file
    file_generator = File().download(file_obj, headers=False)()
    file_string = b"".join(list(file_generator)).decode()

    try:
        return json.loads(file_string)
    except json.JSONDecodeError:
        return {}


def update_RLE_masks(
    user: User, folder: dict, track_frame_pairs: Optional[List[Tuple[int, int]]] = None
) -> str:
    """
    Updates the JSON file (RLE_MASKS.json) in the mask folder with the encoded RLE data.

    If track_frame_pairs is provided (list of [trackId, frameId] pairs), it updates only the given items.
    If None, it loads all items in the mask folder that have MASK_TRACK_FRAME_MARKER metadata.

    Returns a JSON string representation of the updated data.
    """
    # Locate the mask folder under the provided folder
    mask_folder = Folder().findOne(
        {
            'parentId': folder['_id'],
            f'meta.{constants.MASK_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )

    if mask_folder is None:
        # No mask folder exists; nothing to update.
        return json.dumps({})

    # Retrieve the RLE JSON item (if exists) from the mask folder
    rle_item = Item().findOne(
        {
            'folderId': mask_folder['_id'],
            f'meta.{constants.MASK_RLE_FILE_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )

    # Load the current JSON data from the RLE file if available.
    json_data = {}
    if rle_item is not None:
        file_obj = next(Item().childFiles(rle_item), None)
        if file_obj is not None:
            file_generator = File().download(file_obj, headers=False)()
            file_string = b"".join(list(file_generator)).decode()
            json_data = json.loads(file_string)
            # Remove the file so that the new version can be uploaded
            File().remove(file_obj)

    # Get the image files associated with the track/frame pairs (or all if None)
    # Here get_mask_items returns a dict in the form: {track_id: {frame_id: file_dict, ...}, ...}
    files_dict: Dict[int, Dict[int, dict]] = get_mask_items(user, folder, track_frame_pairs)

    # Process each file
    for track_id, frame_items in files_dict.items():
        # Ensure that json_data has the key for this track
        if str(track_id) not in json_data:
            json_data[str(track_id)] = {}
        for frame_id, image_file in frame_items.items():
            # Download the image file
            file_obj = image_file  # image_file is a file document from Item.childFiles()
            file_generator = File().download(file_obj, headers=False)()
            file_bytes = b"".join(list(file_generator))
            # Load image using PIL and convert to a binary (black/white) image
            image = Image.open(io.BytesIO(file_bytes))
            np_img = np.array(image.convert('1'))
            # COCO RLE expects Fortran order and uint8 data
            rle = mask_utils.encode(np.asfortranarray(np_img.astype(np.uint8)))
            # The counts value needs to be JSON serializable (i.e. a string)
            rle['counts'] = rle['counts'].decode('utf-8')

            # Update the JSON structure with the new RLE and original image file name.
            # Keys in the JSON are stored as strings.
            json_data[str(track_id)][str(frame_id)] = {
                'rle': rle,
                'file_name': image_file.get('name'),
            }

    # If no RLE item exists, create one.
    if rle_item is None:
        rle_item = Item().createItem(
            'RLE_MASKS.json',
            creator=user,
            folder=mask_folder,
            reuseExisting=True,
        )
        Item().setMetadata(
            rle_item,
            {
                constants.MASK_RLE_FILE_MARKER: True,
            },
        )

    # Convert updated JSON data to bytes
    json_bytes = json.dumps(json_data).encode()
    byteIO = io.BytesIO(json_bytes)

    # Upload updated JSON file, replacing the previous version.
    Upload().uploadFromFile(
        byteIO,
        len(json_bytes),
        rle_item['name'],
        parentType="item",
        parent=rle_item,
        user=user,
        mimeType="application/json",
    )

    return json_data


def delete_masks(
    user: User,
    folder: Folder,
    track_frame_pairs: Optional[List[Tuple[int, int]]] = None,  # -1 frame means entire track
) -> Dict:
    """
    Deletes specified mask items or track folders, and updates RLE_MASKS.json.

    Returns a summary:
        {
            "deletedTracks": [int],
            "deletedFrames": [(trackId, frameId)],
            "missingTracks": [int],
            "missingFrames": [(trackId, frameId)]
        }
    """
    result = {
        "deletedTracks": [],
        "deletedFrames": [],
        "missingTracks": [],
        "missingFrames": [],
    }

    # Locate the mask folder
    mask_folder = Folder().findOne(
        {
            'parentId': folder['_id'],
            f'meta.{constants.MASK_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )
    if not mask_folder:
        return  # mask folder doesn't exist so this can be skipped

    if not track_frame_pairs:
        raise RestException("No track/frame pairs provided for deletion.", code=400)

    rle_json = get_mask_json(folder)

    for track_id, frame_id in track_frame_pairs:
        track_str = str(track_id)
        track_folder = Folder().findOne({'parentId': mask_folder['_id'], 'name': track_str})

        if not track_folder:
            result["missingTracks"].append(track_id)
            continue

        if frame_id == -1:
            # Delete the entire track
            Folder().remove(track_folder)
            result["deletedTracks"].append(track_id)
            if track_str in rle_json:
                del rle_json[track_str]
        else:
            item = Item().findOne({'folderId': track_folder['_id'], 'name': f'{frame_id}.png'})

            if item:
                Item().remove(item)
                result["deletedFrames"].append((track_id, frame_id))
            else:
                result["missingFrames"].append((track_id, frame_id))

            # Remove from RLE JSON
            if track_str in rle_json and str(frame_id) in rle_json[track_str]:
                del rle_json[track_str][str(frame_id)]
                if not rle_json[track_str]:
                    del rle_json[track_str]

    # Update RLE_MASKS.json
    rle_item = Item().findOne(
        {
            'folderId': mask_folder['_id'],
            f'meta.{constants.MASK_RLE_FILE_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )

    if rle_item:
        old_file = next(Item().childFiles(rle_item), None)
        if old_file:
            File().remove(old_file)
    else:
        rle_item = Item().createItem(
            'RLE_MASKS.json',
            creator=user,
            folder=mask_folder,
            reuseExisting=True,
        )
        Item().setMetadata(rle_item, {constants.MASK_RLE_FILE_MARKER: True})

    json_bytes = json.dumps(rle_json).encode()
    byteIO = io.BytesIO(json_bytes)

    Upload().uploadFromFile(
        byteIO,
        len(json_bytes),
        rle_item['name'],
        parentType="item",
        parent=rle_item,
        user=user,
        mimeType="application/json",
    )

    return result
