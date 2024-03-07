import json
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.constants import AccessType
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.file import File
from girder.exceptions import RestException

from dive_utils import asbool, fromMeta, TRUTHY_META_VALUES
from dive_utils.constants import DatasetMarker, FPSMarker, MarkForPostProcess, TypeMarker, jsonRegex
from dive_utils.metadata.models import DIVE_Metadata, DIVE_MetadataKeys
from typing import Dict, List, Optional, Tuple, TypedDict


def python_to_javascript_type(py_type):
    type_mapping = {
        int: "number",
        float: "number",
        str: "string",
        list: "array",
        dict: "object",
        bool: "boolean",
        tuple: "array"  # You can map tuple to array, as JavaScript doesn't have a built-in tuple type
        # Add more mappings as needed for other types
    }
    return type_mapping.get(py_type, "unknown")


class DIVEMetadata(Resource):
    """DIVE Metadata processing and filtering for parent folders"""

    def __init__(self, resourceName):
        super(DIVEMetadata, self).__init__()
        self.resourceName = resourceName
        self.route("POST", ("process_metadata", ":id"), self.process_metadata)
        self.route("GET", ("all", ), self.get_all)
        self.route("GET", (':id', 'metadata_keys'), self.get_metadata_keys)
        self.route("GET", (':id', 'metadata_filter'), self.get_metadata_filter)
        self.route("DELETE", (':rootId',), self.delete_metadata)

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
                metadataKeys = {}
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
                    for key in item.keys():
                        if key not in metadataKeys.keys():
                            datatype = python_to_javascript_type(type(item[key]))
                            metadataKeys[key] = {
                                "type": datatype,
                                "set": set(),
                                "count": 1
                            }
                        if metadataKeys[key]['type'] == 'string':
                            print(metadataKeys[key])
                            metadataKeys[key]['set'].add(item[key])
                            metadataKeys[key]['count'] += 1
                        if metadataKeys[key]['type'] == 'array':
                            for arrayitem in item[key]:
                                if python_to_javascript_type(type(arrayitem)) == 'string':
                                    metadataKeys[key]['set'].add(arrayitem)
                            metadataKeys[key]['count'] += 1
                        if metadataKeys[key]['type'] == 'number':
                            if 'range' not in metadataKeys[key].keys():
                                metadataKeys[key]['range'] = { "min": item[key], "max": item[key]}
                            metadataKeys[key]['range'] = {
                                 "min": min(item[key], metadataKeys[key]["range"]["min"]),
                                 "max": max(item[key], metadataKeys[key]["range"]["max"]),
                            }
                # now we need to determine what is categorical vs what is a search field
                for key in metadataKeys.keys():
                    item = metadataKeys[key]
                    if item["type"] in ['string', 'array'] and (item["count"] < 50 or item["count"] < len(item["set"])):
                        metadataKeys[key]["category"] = "categorical"
                        metadataKeys[key]['set'] = list(metadataKeys[key]['set'])
                    elif item["type"] == 'string':
                        metadataKeys[key]["category"] = "search"
                        del metadataKeys[key]['set']
                    elif item["type"] == 'number':
                        metadataKeys[key]["category"] = "numerical"
                        del metadataKeys[key]['set']
                    else:
                        del metadataKeys[key]['set']
                DIVE_MetadataKeys().createMetadataKeys(datasetFolder, folder, user, metadataKeys)


                    




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
        metadata_key = DIVE_MetadataKeys().findOne(
            query=query,
            user=user,
        )
        return metadata_key

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

    @access.user
    @autoDescribeRoute(
        Description("Delete Folder VideoState")
        .modelParam(
            "rootId",
            description="FolderId to get state from",
            model=Folder,
            level=AccessType.READ,
            destName="rootId",
        )
    )
    def delete_metadata(self, rootId):
        user = self.getCurrentUser()
        query = {"root": str(rootId["_id"])}
        found = DIVE_Metadata().findOne(query=query, user=user)
        if found:
            DIVE_Metadata().removeWithQuery(query)
            DIVE_MetadataKeys().removeWithQuery(query)
        else:
            raise RestException('Could not find a state to delete')