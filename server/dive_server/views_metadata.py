from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.constants import AccessType
from girder.models.folder import Folder
from girder.models.item import Item

from dive_utils import asbool, fromMeta
from dive_utils.constants import DatasetMarker, FPSMarker, MarkForPostProcess, TypeMarker
from dive_utils.metadata.models import DIVE_Metadata

from . import crud_rpc


class RpcResource(Resource):
    """Remote procedure calls to celery and other non-RESTful operations"""

    def __init__(self, resourceName):
        super(RpcResource, self).__init__()
        self.resourceName = resourceName
        self.route("POST", ("process_metadata", ":id"), self.process_metadata)
        self.route("GET", (':id', 'metadata_filter'), self.get_metadata_filter)
        self.route("GET", (':id', 'metadata_filter'), self.get_metadata_filter)

    @access.user
    @autoDescribeRoute(
        Description("Processing a folder and any children folder that have a specified format")
        .modelParam(
            "id",
            description="Folder containing the items to process",
            model=Folder,
            level=AccessType.WRITE,
        )
        .param(
            "fileType",
            "FileType to process if the folder is not a DIVE dataset (json, csv, ndjson))",
            paramType="formData",
            dataType="string",
            default='json',
            required=False,
        )
        .param(
            "matcher",
            "What field to match with the DIVE Dataset filename to determine the linked folderId for each row/item",
            paramType="formData",
            dataType="string",
            default="Filename",
            required=True,
        )
    )
    def process_metadata(self, folder, fileType, matcher):
        # Process the current folder for the specified fileType using the matcher to generate DIVE_Metadata
        # make sure the folder is set to a DIVE Metadata folder using DIVE_METADATA = True
        return False

    @access.user
    @autoDescribeRoute(
        Description("Get a list of filter keys for a specific folder").modelParam(
            "id",
            description="Base folder ID",
            model=Folder,
            level=AccessType.READ,
        )
    )
    def get_metadata_keys(
        self,
        folder,
    ):
        query = {'root': str(folder['_id'])}
        metadata_items = list(
            DIVE_Metadata().find(
                query,
                user=self.getCurrentUser(),
            )
        )
        metadata_items.sort(key=lambda d: d["created"], reverse=True)
        keys_dict = {}
        for item in metadata_items:
            for key in item.keys():
                keys_dict[key] = True
        return keys_dict

    @access.user
    @autoDescribeRoute(
        Description("Get a list of filter values for parent folder Metadata ")
        .modelParam(
            "id",
            description="Base folder ID",
            model=Folder,
            level=AccessType.READ,
        )
        .jsonParam(
            "keys",
            "JSON keys for the filtering",
            required=False,
        )
    )
    def get_metadata_filter(self, folder, keys):
        # Create initial Meva State based off of information
        query = {'root': str(folder['_id'])}
        metadata_items = list(
            DIVE_Metadata().find(
                query,
                user=self.getCurrentUser(),
            )
        )
        metadata_items.sort(key=lambda d: d["created"], reverse=True)
        # Compile a list of dates/ times and start/end Pairs
        results = {}
        for key in keys:
            results[key] = set()
        for item in metadata_items:
            for key in keys:
                if item.get(key, None) is not None:
                    results[key].add(item[key])

        for key in keys:
            results[key] = sorted(results[key])

        return results
