"""General CRUD operations and utilities shared among views"""

from enum import Enum
import functools
import os
from typing import List, Type

from girder.constants import AccessType
from girder.exceptions import RestException, ValidationException
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.model_base import AccessControlledModel, Model
import pydantic
from pydantic.main import BaseModel

from dive_utils import TRUTHY_META_VALUES, asbool, constants, fromMeta, models, strNumericCompare
from dive_utils.types import GirderModel, GirderUserModel


class FileType(Enum):
    DIVE_JSON = 1
    VIAME_CSV = 2
    COCO_JSON = 3
    DIVE_CONF = 4
    MEVA_KPF = 5


def get_validated_model(model: BaseModel, **kwargs):
    try:
        return model(**kwargs)
    except pydantic.ValidationError as err:
        raise ValidationException(err)


class PydanticModel(Model):
    schema: Type[BaseModel]

    def initialize(self, name: str, schema: Type[BaseModel]):
        self.name = name
        self.schema = schema
        self.exposeFields(AccessType.READ, schema.schema()['properties'].keys())

    def validate(self, doc: dict):
        validated = self.schema(**doc)
        return validated.dict()

    def create(self, item: BaseModel):
        return self.save(item.dict())


class PydanticAccessControlModel(PydanticModel, AccessControlledModel):
    pass


def get_or_create_auxiliary_folder(folder, user):
    return Folder().createFolder(
        folder, constants.AuxiliaryFolderName, reuseExisting=True, creator=user
    )


def get_or_create_source_folder(folder, user):
    return Folder().createFolder(folder, "source", reuseExisting=True, creator=user)


def itemIsWebsafeVideo(item: Item) -> bool:
    return fromMeta(item, "codec") == "h264"


def saveImportAttributes(folder, attributes, user):
    attributes_dict = fromMeta(folder, 'attributes', {})
    # we don't overwrite any existing meta attributes
    for attribute in attributes.values():
        validated: models.Attribute = models.Attribute(**attribute)
        if attribute['key'] not in attributes_dict:
            attributes_dict[str(validated.key)] = validated.dict(exclude_none=True)

    folder['meta']['attributes'] = attributes_dict
    Folder().save(folder)


def verify_dataset(folder: GirderModel):
    """Verify that a given folder is a DIVE dataset"""
    if not asbool(fromMeta(folder, constants.DatasetMarker, False)):
        raise RestException('Source folder is not a valid DIVE dataset', code=404)
    dstype = fromMeta(folder, 'type')
    if dstype not in [constants.ImageSequenceType, constants.VideoType]:
        raise ValueError(f'Source folder is marked as dataset but has invalid type {dstype}')
    if dstype == constants.VideoType:
        fps = fromMeta(folder, 'fps')
        if type(fps) not in [int, float]:
            raise ValueError(f'Video missing numerical fps, found {fps}')
    return True


def getCloneRoot(owner: GirderModel, source_folder: GirderModel):
    """Get the source media folder associated with a clone"""
    verify_dataset(source_folder)
    next_id = source_folder.get(constants.ForeignMediaIdMarker, False)
    while next_id is not False:
        # Recurse through source folders to find the root, allowing clones of clones
        source_folder = Folder().load(
            next_id,
            level=AccessType.READ,
            user=owner,
            force=True,
        )
        if source_folder is None:
            raise RestException(
                (
                    f"Referenced media source missing. Folder Id {next_id} was not found."
                    " This may be a cloned dataset where the source was deleted."
                ),
                code=404,
            )
        verify_dataset(source_folder)
        next_id = source_folder.get(constants.ForeignMediaIdMarker, False)
    return source_folder


def valid_images(
    folder: GirderModel,
    user: GirderUserModel,
) -> List[GirderModel]:
    """
    Any time images are used where frame alignment matters, this function must be used
    """
    images = Folder().childItems(
        getCloneRoot(user, folder),
        filters={"lowerName": {"$regex": constants.safeImageRegex}},
    )

    def unwrapItem(item1, item2):
        return strNumericCompare(item1['name'], item2['name'])

    return sorted(
        images,
        key=functools.cmp_to_key(unwrapItem),
    )


def valid_image_names_dict(images: List[GirderModel]):
    """Get a map of image names (without extension) to frame numbers"""
    imageNameMap = {}
    for i, image in enumerate(images):
        imageName, _ = os.path.splitext(image['name'])
        imageNameMap[imageName] = i
    return imageNameMap


def get_valid_masks(folder: GirderModel, user: GirderUserModel) -> List[GirderModel]:
    """
    Get all valid masks in a folder
    """
    mask_folder = Folder().findOne(
        {
            'parentId': folder['_id'],
            f'meta.{constants.MASK_MARKER}': {'$in': TRUTHY_META_VALUES},
        }
    )
    print(f'MASKFOLDERID: {mask_folder["_id"]}')
    if mask_folder is None:
        return []
    masks_tracks = Folder().childFolders(
        parent=mask_folder,
        parentType='folder',
        filters={
            f'meta.{constants.MASK_TRACK_MARKER}': {'$in': TRUTHY_META_VALUES},
        },
        user=user,
    )
    output_track_frames = []
    for mask_track in list(masks_tracks):
        track_frames = Item().find(
            {
                'folderId': mask_track['_id'],
                f'meta.{constants.MASK_TRACK_FRAME_MARKER}': {'$in': TRUTHY_META_VALUES},
            }
        )
        if track_frames.count() > 0:
            output_track_frames += list(track_frames)
    return output_track_frames
