import json
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.constants import AccessType
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.file import File

from dive_utils import asbool, fromMeta, TRUTHY_META_VALUES
from dive_utils.constants import DatasetMarker, FPSMarker, MarkForPostProcess, TypeMarker, jsonRegex
from dive_utils.metadata.models import DIVE_Metadata
from typing import Dict, List, Optional, Tuple, TypedDict


class DIVEMetadata(Resource):
    """DIVE Metadata processing and filtering for parent folders"""

    def __init__(self, resourceName):
        super(DIVEMetadata, self).__init__()
        self.resourceName = resourceName
        self.route("POST", ("process_metadata", ":id"), self.process_metadata)
        self.route("GET", ("all", ), self.get_all)
        self.route("GET", (':id', 'metadata_keys'), self.get_metadata_keys)
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
        user = self.getCurrentUser()
        # lets first search for JSON files in the folder
        json_items = list(Folder().childItems(
                folder,
                filters={"lowerName": {"$regex": jsonRegex}},
            )
        )
        if len(json_items) > 0:
            json_import_item = json_items[0]
            file = next(Item().childFiles(json_import_item), None)
            # Now lets convert the XML to TrackJSON
            if file is None:
                return None
            file_generator = File().download(file, headers=False)()
            file_string = b"".join(list(file_generator)).decode()
            json_data = json.loads(file_string)
            # Now we determine data types from the array of data
            if not isinstance(json_data, list):
                print("JSON metadata isn't an array")
            else:
                print(json_data)
                for item in json_data:
                    # need to use the matcher to try to find the DIVE dataset that matches the name

                    query = {'$and': [{'name': {'$in': [f"Video {item[matcher]}", item[matcher]]}}, {"meta.annotate": {'$in': TRUTHY_META_VALUES}}]}
                    print(query)
                    results = list(Folder().findWithPermissions(query=query, user=user))
                    print(results)
                    if len(results) > 0:
                        datasetFolder = results[0]
                        metadata_item = DIVE_Metadata().createMetadata(datasetFolder, folder, user, item)
                        print(f'created metadata item: {item["Filename"]}')




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
        user = self.getCurrentUser()
        query = {'root': str(folder['_id'])}
        metadata_items = list(
            DIVE_Metadata().find(
                query=query,
                user=user,
            )
        )
        print(metadata_items)
        metadata_items.sort(key=lambda d: d["created"], reverse=True)
        keys_dict = {}
        for item in metadata_items:
            if 'metadata' in item.keys():
                for metadatakey in item['metadata'].keys():
                    keys_dict[metadatakey] = True
        return keys_dict

    @access.user
    @autoDescribeRoute(
        Description("Get a list of filter keys for a specific folder")
    )
    def get_all(
        self,
    ):
        query = {}
        metadata_items = list(
            DIVE_Metadata().find(
                query=query,
                user=self.getCurrentUser(),
            )
        )
        return metadata_items

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
    def get_metadata_filter(self, folder, keys = None):
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
        if keys is not None:
            for key in keys:
                results[key] = set()
        print(metadata_items)
        for item in metadata_items:
            if 'metadata' in item.keys():
                for key in item['metadata'].keys():
                    print(item['metadata'][key])
                    if keys is None and key not in results.keys():
                        results[key] = set()
                    if item['metadata'].get(key, None) is not None and not isinstance(item['metadata'][key], list):
                        results[key].add(item['metadata'][key])
                    elif item['metadata'].get(key, None) is not None and isinstance(item['metadata'][key], list):
                        for array_item in item['metadata'][key]:
                            results[key].add(array_item)

        for key in results.keys():
            results[key] = sorted(results[key])

        return results
