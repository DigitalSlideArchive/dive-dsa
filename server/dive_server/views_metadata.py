import csv
from datetime import datetime
import io
import json
import math
import re

import cherrypy
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource, getApiUrl, setRawResponse, setResponseHeader
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token
from girder.models.upload import Upload
from girder.utility import path as path_util
from girder_jobs.models.job import Job
from girder_worker.girder_plugin.utils import getWorkerApiUrl
from pandas import pandas as pd
import pymongo

from dive_utils import FALSY_META_VALUES, TRUTHY_META_VALUES, setContentDisposition
from dive_utils.constants import (
    DIVEMetadataClonedFilter,
    DIVEMetadataClonedFilterBase,
    DIVEMetadataFilter,
    DIVEMetadataHistoryMarker,
    DIVEMetadataMarker,
    csvRegex,
    jsonRegex,
    ndjsonRegex,
)
from dive_utils.metadata.models import DIVE_Metadata, DIVE_MetadataKeys
from dive_utils.types import DiveDatasetList, DIVEMetadataSlicerCLITaskParams

from . import crud_dataset


def python_to_javascript_type(py_type):
    type_mapping = {
        int: "number",
        float: "number",
        str: "string",
        list: "array",
        dict: "object",
        bool: "boolean",
        tuple: "array",  # You can map tuple to array, as JavaScript
        # doesn't have a built-in tuple type
        # Add more mappings as needed for other types
    }
    return type_mapping.get(py_type, "unknown")


def remove_before_folder(path, folder_name):
    index = path.find(folder_name)
    if index != -1:
        return path[index:]
    else:
        return None


def find_folder_by_path(folder, sibling_path, user):
    components = sibling_path.split('/')
    current_folder = folder
    for component in components:
        found = False
        current_folders = list(Folder().childFolders(current_folder, 'folder', user=user))
        for subfolder in current_folders:
            if subfolder['name'] == component:
                current_folder = subfolder
                found = True
        if not found:
            return None
    return current_folder


def load_ndjson_string(ndjson_string):
    # Split the string into lines and parse each line as JSON
    return [json.loads(line) for line in ndjson_string.splitlines()]


def load_metadata_json(search_folder, type='ndjson'):
    regex = ndjsonRegex
    if type == 'json':
        regex = jsonRegex
    json_items = list(
        Folder().childItems(
            search_folder,
            filters={"lowerName": {"$regex": regex}},
            sort=[("updated", pymongo.DESCENDING)],
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
        json_data = {}
        if type == 'json':
            json_data = json.loads(file_string)
        elif type == 'ndjson':
            json_data = load_ndjson_string(file_string)
        # Now we determine data types from the array of data
        if not isinstance(json_data, list):
            print("JSON metadata isn't an array")
            return False
        return json_data, file['name']


def bulk_metadata_update_process(user, rootFolder, updates, replace=False):
    results = []
    # Get or create MetadataKeys for the root
    if rootFolder['meta'].get(DIVEMetadataMarker, False) is False:
        raise RestException('Folder is not a DIVE Metadata folder', code=404)
    query = {"root": str(rootFolder["_id"])}
    metadata_keys_doc = DIVE_MetadataKeys().findOne(query=query)
    categoricalLimit = (
        rootFolder.get('meta', {}).get('DIVEMetadataFilter', {}).get('categoricalLimit', 50)
    )
    # Helper to infer type/category
    new_keys = {}
    for _idx, entry in enumerate(updates):
        for key, value in entry.items():
            if key not in metadata_keys_doc["metadataKeys"]:
                if key not in new_keys:
                    new_keys[key] = set()
                new_keys[key].add(value)
    # Infer types/categories for new keys
    for key, values in new_keys.items():
        if isinstance(next(iter(values)), str):
            category = 'categorical' if len(values) < categoricalLimit else 'search'
        elif isinstance(next(iter(values)), (int, float)):
            category = 'numerical'

        else:
            category = 'search'
        info = {
            "category": category,
            "count": len(values),
        }
        if category == 'categorical':
            info['set'] = list(values)
        elif category == 'numerical':
            info['range'] = {
                "min": min(values),
                "max": max(values),
            }
        DIVE_MetadataKeys().addKey(rootFolder, user, key, info, unlocked=False)
    for _idx, entry in enumerate(updates):
        reason = None
        # Try to find by DIVEDataset by the matchers
        dive_metadata = None
        matcher = None
        if entry.get('DIVEDataset', False):
            dataset_id = entry['DIVEDataset']
            video_name = None
            matcher = 'DIVEDataset'
        elif entry.get('Filename', False):
            dataset_id = None
            video_name = entry['Filename']
            matcher = 'Filename'
        if dataset_id:
            dive_metadata = DIVE_Metadata().findOne(
                {"DIVEDataset": dataset_id, 'root': str(rootFolder["_id"])}
            )
            if not dive_metadata:
                reason = f"No dataset found with id {dataset_id}"
        elif video_name:
            dive_metadata_items = DIVE_Metadata().find(
                {"filename": video_name, 'root': str(rootFolder["_id"])}
            )
            if dive_metadata_items.count() > 1:
                # do we have to match the resouce with the DIVE Path
                dive_path = entry.get('DIVE_Path', False)
                if not dive_path:
                    reason = f"Multiple datasets found with videoName {video_name}, need DIVE_Path to disambiguate"
                else:
                    for item in dive_metadata_items:
                        if item.get('DIVE_Path', False) == dive_path:
                            dive_metadata = item
                            break
            if not dive_metadata:
                reason = f"No dataset found with videoName or DIVE_Name {video_name}"
        else:
            raise RestException('Metadata Updates need either DIVEDataset or Filename', code=400)
        if dive_metadata:
            # Find the DIVE_Metadata entry for this dataset and root
            dataset = Folder().load(dive_metadata['DIVEDataset'], level=AccessType.READ, user=user)
            updated_keys = []
            errors = []
            # initial pass for all metadata keys:
            rootId = str(rootFolder["_id"])
            if replace:
                DIVE_Metadata().removeCustomKeys(dataset, rootId, user)
            for key, value in entry.items():
                # Set the value for this key on the dataset
                try:
                    DIVE_Metadata().updateKey(
                        dataset, rootId, user, key, value, categoricalLimit, force=True
                    )
                    updated_keys.append(key)
                except Exception as ex:
                    errors.append(f"Failed to set {key}: {str(ex)}")
            if updated_keys and not errors:
                results.append(
                    {
                        "matcher": matcher,
                        "status": "success",
                        "datasetId": str(dataset["_id"]),
                        "updatedKeys": updated_keys,
                    }
                )
            elif updated_keys and errors:
                results.append(
                    {
                        "matcher": matcher,
                        "status": "partial_success",
                        "datasetId": str(dataset["_id"]),
                        "updatedKeys": updated_keys,
                        "errors": errors,
                    }
                )
            else:
                results.append(
                    {
                        "matcher": matcher,
                        "status": "error",
                        "datasetId": str(dataset["_id"]),
                        "errors": errors,
                    }
                )
        else:
            results.append(
                {
                    "matcher": matcher,
                    "status": "not_found",
                    "error": reason,
                }
            )
    return results


class DIVEMetadata(Resource):
    """DIVE Metadata processing and filtering for parent folders"""

    def __init__(self, resourceName):
        super(DIVEMetadata, self).__init__()
        self.resourceName = resourceName
        self.route("POST", ("process_metadata", ":id"), self.process_metadata)
        self.route(
            "GET",
            (
                ':id',
                "filter",
            ),
            self.filter_folder,
        )
        self.route("POST", ("create_metadata_folder", ":id"), self.create_metadata_folder)
        self.route("POST", (':id', "clone_filter"), self.clone_filter)
        self.route("GET", (':id', 'metadata_keys'), self.get_metadata_keys)
        self.route("GET", (':id', 'metadata_filter_values'), self.get_metadata_filter)
        self.route(
            "DELETE",
            (
                ':root',
                'root_metadata',
            ),
            self.delete_metadata,
        )
        self.route("DELETE", (':rootId', 'delete_key'), self.delete_metadata_key)
        self.route("PUT", (':root', 'add_key'), self.add_metadata_key)
        self.route("PATCH", (':root', 'modify_key_permission'), self.modify_key_permission)
        self.route("PATCH", (':divedataset',), self.set_key_value)
        self.route("DELETE", (':divedataset',), self.delete_key_value)
        self.route(
            "POST",
            (
                ':rootId',
                'slicer-cli-task',
            ),
            self.run_slicer_cli_task,
        )
        self.route("POST", (":id", "export"), self.export_metadata)
        self.route("POST", ("bulk_update_metadata", ':rootFolder'), self.bulk_update_metadata)
        self.route("POST", ("bulk_update_file", ':rootFolder'), self.bulk_update_metadata_file)
        self.route("PUT", (':divedataset', 'last_modified'), self.set_last_modified)

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
            "sibling_path",
            description="Sibling folder path to look for CSV or JSON files.  Uses the format of sibling/child1/child2 if more folders, if blank it will look in the root folder",
            paramType="formData",
            dataType="string",
            default='info',
            required=False,
        )
        .param(
            "fileType",
            "FileType to process if the folder is not a DIVE dataset (json, ndjson))",
            paramType="formData",
            dataType="string",
            default='ndjson',
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
        .param(
            "path_key",
            "What field to match attempt to match the folder hierarchy with",
            paramType="formData",
            dataType="string",
            default="Key",
            required=True,
        )
        .jsonParam(
            "displayConfig",
            "List of Main Display Keys for the metadata and keys to hide from the filter",
            required=True,
            default={
                "display": ['Batch', 'SampleDate', 'SubjectId', 'StudyId', 'ExperimentTag'],
                "hide": ["ETag", "ETagDuplicated", "Size"],
            },
        )
        .jsonParam(
            "ffprobeMetadata",
            "List Metadata keys to extract from the ffprobe metadata from videos.  Setting 'import' to 'true' will import the data",
            required=True,
            default={
                "import": False,
                "keys": ["width", "height", "display_aspect_ratio"],
            },
        )
        .param(
            "categoricalLimit",
            "Above this number make a field a search field instead of a dropdown",
            paramType="formData",
            dataType="integer",
            default=50,
        )
        .param(
            "additive",
            "Additive Metadata, will add imported data to existing metadata",
            paramType="formData",
            dataType="boolean",
            default=False,
        )
    )
    def process_metadata(
        self,
        folder,
        sibling_path,
        fileType,
        matcher,
        path_key,
        displayConfig,
        ffprobeMetadata,
        categoricalLimit,
        additive,
    ):
        # Process the current folder for the specified fileType using the matcher to generate DIVE_Metadata
        # make sure the folder is set to a DIVE Metadata folder using DIVE_METADATA = True
        user = self.getCurrentUser()
        # Delete existing data if it is there already:
        rootQuery = {"root": str(folder["_id"])}
        found = DIVE_Metadata().findOne(query=rootQuery, user=user)
        if found and additive is not True:
            DIVE_Metadata().removeWithQuery(rootQuery)
            DIVE_MetadataKeys().removeWithQuery(rootQuery)
            rootFolder = Folder().setMetadata(
                folder, {DIVEMetadataMarker: None, DIVEMetadataFilter: None}
            )
            Folder().save(rootFolder)

        # first determine the search folder for the system
        search_folder = folder
        if sibling_path:
            found_folder = find_folder_by_path(folder, sibling_path, user)
            if found_folder:
                search_folder = found_folder
        # lets first search for JSON files in the folder
        data = None
        errorLog = []
        added = 0
        dataFileName = ''
        if fileType in ['json', 'ndjson']:
            data, dataFileName = load_metadata_json(search_folder, fileType)
        if not data:
            return False
        else:
            metadataKeys = {}
            root_name = folder['name']
            for item in data:
                # need to use the matcher to try to find the DIVE dataset that matches the name

                query = {
                    '$and': [
                        {'name': {'$in': [f"Video {item[matcher]}", item[matcher]]}},
                        {"meta.annotate": {'$in': TRUTHY_META_VALUES}},
                        {"baseParentId": folder['baseParentId']},
                    ]
                }
                results = list(Folder().findWithPermissions(query=query, user=user))
                if len(results) > 0:
                    matched = False
                    key_path = item.get(path_key, False)
                    base_modified_key_path = remove_before_folder(key_path, root_name)
                    childFolders = list(Folder().childFolders(folder, 'folder', user=user))
                    modified_key_paths = [
                        {"root": root_name, "modified_path": base_modified_key_path}
                    ]
                    for childFolder in childFolders:
                        modified_key_paths.append(
                            {
                                "root": childFolder["name"],
                                "modified_path": remove_before_folder(
                                    key_path, childFolder['name']
                                ),
                            }
                        )
                    resource_path = ""
                    for datasetFolder in results:
                        resource_path = path_util.getResourcePath(
                            'folder', datasetFolder, user=user
                        )
                        # lets modify the path so it contains only the root folder down
                        for rootObj in modified_key_paths:
                            root = rootObj['root']
                            modified_path = rootObj['modified_path']
                            if modified_path is None:
                                continue
                            resource_path = remove_before_folder(resource_path, root)
                            if resource_path is None:
                                continue
                            resource_path = resource_path.replace(
                                f'/Video {item[matcher]}', f'/{item[matcher]}'
                            )
                            # now we check to see if the path matches the DIVE dataset item found.
                            if modified_path:
                                if modified_path == resource_path:
                                    item['pathMatches'] = True
                                    # add in DIVE Keys:
                                    item['DIVE_DatasetId'] = str(datasetFolder['_id'])
                                    item['DIVE_Name'] = datasetFolder['lowerName']
                                    item['DIVE_Path'] = resource_path
                                    datasetFolder.get('name')
                                    if ffprobeMetadata.get(
                                        'import', False
                                    ):  # Add in ffprobe metadata to the system
                                        ffmetadata = datasetFolder.get('meta', {}).get(
                                            'ffprobe_info', {}
                                        )
                                        ffkeys = ffprobeMetadata.get('keys', [])
                                        for ffMetadataKey in ffkeys:
                                            if ffmetadata.get(ffMetadataKey, False):
                                                item[f'ffprobe_{ffMetadataKey}'] = ffmetadata.get(
                                                    ffMetadataKey, False
                                                )
                                    DIVE_Metadata().createMetadata(
                                        datasetFolder, folder, user, item
                                    )
                                    added += 1
                                    matched = True
                                    break
                                else:
                                    item['pathMatches'] = False
                        if matched:
                            break

                    if not matched:
                        errorLog.append(
                            f"using matcher: {matcher} and key_path: {key_path} Could not find any matching key file path for Video file {item[matcher]} with path: {resource_path}"
                        )

                else:
                    errorLog.append(f"Could not find any results for Video file {item[matcher]}")
                for key in item.keys():
                    if key not in metadataKeys.keys() and item[key] is not None:
                        datatype = python_to_javascript_type(type(item[key]))
                        metadataKeys[key] = {"type": datatype, "set": set(), "count": 0}
                    if item[key] is None:
                        continue  # we skip null values for processing
                    if metadataKeys[key]['type'] == 'string':
                        metadataKeys[key]['set'].add(item[key])
                        metadataKeys[key]['count'] += 1
                    if metadataKeys[key]['type'] == 'array':
                        for arrayitem in item[key]:
                            if python_to_javascript_type(type(arrayitem)) == 'string':
                                metadataKeys[key]['set'].add(arrayitem)
                        metadataKeys[key]['count'] += 1
                    if metadataKeys[key]['type'] == 'number':
                        if 'range' not in metadataKeys[key].keys():
                            metadataKeys[key]['range'] = {"min": item[key], "max": item[key]}
                        metadataKeys[key]['range'] = {
                            "min": min(item[key], metadataKeys[key]["range"]["min"]),
                            "max": max(item[key], metadataKeys[key]["range"]["max"]),
                        }
            # now we need to determine what is categorical vs what is a search field
            for key in metadataKeys.keys():
                item = metadataKeys[key]
                metadataKeys[key]["unique"] = len(item["set"])
                if item["type"] in ['string', 'array'] and (
                    item["unique"] < categoricalLimit
                    or (item["count"] <= len(item["set"]) and len(item["set"]) < categoricalLimit)
                ):
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
            DIVE_MetadataKeys().createMetadataKeys(folder, user, metadataKeys)
            # add metadata to root folder for
            folder['meta'][DIVEMetadataMarker] = True
            displayConfig['categoricalLimit'] = categoricalLimit
            folder['meta'][DIVEMetadataFilter] = displayConfig
            Folder().save(folder)

        return {
            "dataFileName": dataFileName,
            "results": f"added {added} folders",
            "errors": errorLog,
            "metadataKeys": metadataKeys,
        }

    @access.user
    @autoDescribeRoute(
        Description("Processing a folder and any children folder that have a specified format")
        .modelParam(
            "id",
            description="Parent Folder of where to add the new metadata folder",
            model=Folder,
            level=AccessType.WRITE,
        )
        .param(
            "name",
            description="Metadata Folder Name",
            paramType="formData",
            dataType="string",
            default='New Metadata Folder Name',
            required=False,
        )
        .param(
            "rootFolderId",
            "Root folder to search for all files underneath and crate metadata entries for all of them",
            paramType="formData",
            dataType="string",
            required=True,
        )
        .jsonParam(
            "displayConfig",
            "List of Main Display Keys for the metadata and keys to hide from the filter",
            required=True,
            default={
                "display": ['DIVE_DatasetId', 'DIVE_Name'],
                "hide": [""],
            },
        )
        .jsonParam(
            "ffprobeMetadata",
            "List Metadata keys to extract from the ffprobe metadata from videos.  Setting 'import' to 'true' will import the data",
            required=True,
            default={
                "import": True,
                "keys": ["width", "height", "display_aspect_ratio", "nb_frames", "duration"],
            },
        )
        .param(
            "categoricalLimit",
            "Above this number make a field a search field instead of a dropdown",
            paramType="formData",
            dataType="integer",
            default=50,
        )
    )
    def create_metadata_folder(
        self, folder, name, rootFolderId, displayConfig, ffprobeMetadata, categoricalLimit
    ):
        # Process the current folder for the specified fileType using the matcher to generate DIVE_Metadata
        # make sure the folder is set to a DIVE Metadata folder using DIVE_METADATA = True
        user = self.getCurrentUser()

        base_folder = Folder().createFolder(folder, name)
        data = None
        errorLog = []
        added = 0
        metadataKeys = {}
        datasetList = []
        rootFolder = Folder().load(
            rootFolderId,
            level=AccessType.WRITE,
            user=user,
            force=True,
        )
        crud_dataset.get_recursive_datasets(rootFolder, user, datasetList)

        for item in datasetList:
            data = {}
            data['DIVE_DatasetId'] = str(item['_id'])
            data['DIVE_Name'] = str(item['lowerName'])
            resource_path = path_util.getResourcePath('folder', item, user=user)
            data['DIVE_Path'] = resource_path
            if ffprobeMetadata.get('import', False):  # Add in ffprobe metadata to the system
                ffmetadata = item.get('meta', {}).get('ffprobe_info', {})
                ffkeys = ffprobeMetadata.get('keys', [])
                for ffMetadataKey in ffkeys:
                    if ffmetadata.get(ffMetadataKey) is not None:
                        raw_value = ffmetadata[ffMetadataKey]
                        try:
                            data[f'ffprobe_{ffMetadataKey}'] = float(raw_value)
                        except (ValueError, TypeError):
                            data[f'ffprobe_{ffMetadataKey}'] = str(raw_value)
            DIVE_Metadata().createMetadata(item, base_folder, user, data)
            for key in data.keys():
                if key not in metadataKeys.keys() and data[key] is not None:
                    datatype = python_to_javascript_type(type(data[key]))
                    metadataKeys[key] = {"type": datatype, "set": set(), "count": 0}
                if data[key] is None:
                    continue  # we skip null values for processing
                if metadataKeys[key]['type'] == 'string':
                    metadataKeys[key]['set'].add(data[key])
                    metadataKeys[key]['count'] += 1
                if metadataKeys[key]['type'] == 'array':
                    for arrayitem in data[key]:
                        if python_to_javascript_type(type(arrayitem)) == 'string':
                            metadataKeys[key]['set'].add(arrayitem)
                    metadataKeys[key]['count'] += 1
                if metadataKeys[key]['type'] == 'number':
                    if 'range' not in metadataKeys[key].keys():
                        metadataKeys[key]['range'] = {"min": data[key], "max": data[key]}
                    metadataKeys[key]['range'] = {
                        "min": min(data[key], metadataKeys[key]["range"]["min"]),
                        "max": max(data[key], metadataKeys[key]["range"]["max"]),
                    }

            # now we need to determine what is categorical vs what is a search field
        for key in metadataKeys.keys():
            item = metadataKeys[key]
            metadataKeys[key]["unique"] = len(item["set"])
            if item["type"] in ['string', 'array'] and (
                item["unique"] < categoricalLimit
                or (item["count"] <= len(item["set"]) and len(item["set"]) < categoricalLimit)
            ):
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
        DIVE_MetadataKeys().createMetadataKeys(base_folder, user, metadataKeys)
        # add metadata to root folder for
        base_folder['meta'][DIVEMetadataMarker] = True
        displayConfig['categoricalLimit'] = categoricalLimit
        if displayConfig.get('hide', False) is False:
            displayConfig['hide'] = [""]
        base_folder['meta'][DIVEMetadataFilter] = displayConfig
        Folder().save(base_folder)

        return {
            "results": f"added {added} folders",
            "errors": errorLog,
            "metadataKeys": metadataKeys,
            "folderId": str(base_folder['_id']),
        }

    @access.user
    @autoDescribeRoute(
        Description(
            "Get a list of filter keys for a specific folder.  This is more used for debugging values in the metadata"
        ).modelParam(
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
        keys = metadata_key['metadataKeys']
        for key in keys:
            item = keys[key]
            if item.get('category', False):
                if item['category'] == 'numerical':
                    if (
                        item['range']
                        and item['range']['min'] == float('inf')
                        or item['range']['max'] == float('-inf')
                    ):
                        item['range'] = {'min': 0, 'max': 0}
        if metadata_key.get('unlocked', False) is False:
            metadata_key['unlocked'] = []
            DIVE_MetadataKeys().initialize_updated_data(folder, None)
        return metadata_key

    @access.user
    @autoDescribeRoute(
        Description("Filter DIVE Datasets based on metadata")
        .modelParam(
            "id",
            description="Base root Folder to filter on",
            model=Folder,
            level=AccessType.READ,
        )
        .jsonParam(
            "filters",
            "JSON Settings for the filtering",
            required=False,
        )
        .pagingParams(defaultSort='filename')
    )
    def filter_folder(self, folder, filters, limit, offset, sort):
        if folder['meta'].get(DIVEMetadataMarker, False) is False:
            raise RestException('Folder is not a DIVE Metadata folder', code=404)

        user = self.getCurrentUser()
        query = self.get_filter_query(folder, user, filters)
        total_query = self.get_filter_query(folder, user, {})
        total_items = DIVE_Metadata().find(total_query).count()
        metadata_items = DIVE_Metadata().find(
            query, offset=offset, limit=limit, sort=sort, user=self.getCurrentUser()
        )
        if metadata_items is not None:
            pages = math.ceil(metadata_items.count() / limit)
            structured_results = {
                'totalPages': pages,
                'pageResults': list(metadata_items),
                'count': total_items,
                'filtered': metadata_items.count(),
            }
            return structured_results

        return metadata_items

    @access.user
    @autoDescribeRoute(
        Description("Filter DIVE Datasets based on metadata")
        .modelParam(
            "id",
            destName="baseFolder",
            description="Base root Folder to filter on",
            model=Folder,
            level=AccessType.READ,
            required=True,
        )
        .modelParam(
            "destFolder",
            destName="destFolder",
            paramType="formData",
            description="Destination folder to clone into",
            model=Folder,
            level=AccessType.READ,
            required=True,
        )
        .jsonParam(
            "filters",
            "JSON Settings for the filtering",
            required=False,
        )
    )
    def clone_filter(
        self,
        baseFolder,
        destFolder,
        filters,
    ):
        if baseFolder['meta'].get(DIVEMetadataMarker, False) is False:
            raise RestException('Folder is not a DIVE Metadata folder', code=404)

        user = self.getCurrentUser()
        query = self.get_filter_query(baseFolder, user, filters)
        metadata_items = DIVE_Metadata().find(query, user=self.getCurrentUser())
        Folder().setMetadata(
            destFolder,
            {
                DIVEMetadataClonedFilter: json.dumps(filters),
                DIVEMetadataClonedFilterBase: baseFolder["_id"],
            },
        )
        if metadata_items is not None:
            for item in list(metadata_items):
                item_folder = Folder().load(item['DIVEDataset'], level=AccessType.READ, user=user)
                crud_dataset.createSoftClone(
                    self.getCurrentUser(),
                    item_folder,
                    destFolder,
                    item_folder['name'],
                    None,
                )
            return str(destFolder['_id'])
        else:
            raise RestException('Filter is empty can not clone', code=404)

    def get_filter_query(self, folder, user, filters):
        query = {'root': str(folder['_id'])}
        if filters is not None:
            query = {'$and': [query]}
            if 'search' in filters.keys():
                if 'searchRegEx' in filters.keys():
                    query["$and"].append(
                        {'filename': {'$regex': filters['search']}},
                    )
                else:
                    query["$and"].append(
                        {'filename': {'$regex': re.escape(filters['search'])}},
                    )
            # Now we need to go through the other filters and create querys for them
            # each filter in metadataFilters will have a type associated with it
            if 'metadataFilters' in filters.keys():
                for key in filters['metadataFilters'].keys():
                    filter = filters['metadataFilters'][key]
                    if filter['category'] == 'categorical':
                        query["$and"].append({f'metadata.{key}': {'$in': filter['value']}})
                    if filter['category'] == 'boolean':
                        test_val = TRUTHY_META_VALUES
                        if not filter['value']:
                            test_val = FALSY_META_VALUES
                        query["$and"].append({f'metadata.{key}': {'$in': test_val}})
                    if filter['category'] == 'numerical':
                        query["$and"].append(
                            {
                                '$and': [
                                    {f'metadata.{key}': {'$gte': filter['range'][0]}},
                                    {f'metadata.{key}': {'$lte': filter['range'][1]}},
                                ]
                            }
                        )
                    if filter['category'] == 'search' and filter.get('value', False):
                        if filter.get('regEx', False) is True:
                            query["$and"].append({f'metadata.{key}': {'$regex': filter['value']}})
                        else:
                            query["$and"].append(
                                {f'metadata.{key}': {'$regex': re.escape(filter['value'])}}
                            )
        return query

    @access.user
    @autoDescribeRoute(
        Description("Get a list of filter values for DIVE Metadata")
        .modelParam(
            "id",
            description="Base folder ID",
            model=Folder,
            level=AccessType.READ,
        )
        .jsonParam(
            "keys",
            "JSON keys for the filtering in an array ['key1', 'key2']",
            required=False,
        )
    )
    def get_metadata_filter(self, folder, keys=None):
        # Create initial Meva State based off of information
        query = {'root': str(folder['_id'])}
        found = DIVE_MetadataKeys().findOne(query=query)
        unlocked = found['unlocked']
        print(f'UNLOCKED: {unlocked}')
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
        for item in metadata_items:
            if 'metadata' in item.keys():
                for key in item['metadata'].keys():
                    if keys is None and key not in results.keys():
                        results[key] = set()
                    if (
                        item['metadata'].get(key, None) is not None or key in unlocked
                    ) and not isinstance(item['metadata'][key], list):
                        results[key].add(item['metadata'][key])
                    elif (
                        item['metadata'].get(key, None) is not None or key in unlocked
                    ) and isinstance(item['metadata'][key], list):
                        for array_item in item['metadata'][key]:
                            results[key].add(array_item)

        for key in results.keys():
            results[key] = sorted(results[key])

        return results

    @access.user
    @autoDescribeRoute(
        Description("Delete Folder Metadata").modelParam(
            "root",
            description="FolderId to get state from",
            model=Folder,
            level=AccessType.READ,
            destName="root",
        )
    )
    def delete_metadata(self, root):
        user = self.getCurrentUser()
        query = {"root": str(root["_id"])}
        found = DIVE_Metadata().findOne(query=query, user=user)
        if found:
            DIVE_Metadata().removeWithQuery(query)
            DIVE_MetadataKeys().removeWithQuery(query)
            root = Folder().setMetadata(root, {DIVEMetadataMarker: None, DIVEMetadataFilter: None})
            Folder().save(root)
        else:
            raise RestException('Could not find a state to delete')

    @access.user
    @autoDescribeRoute(
        Description("Delete Metadata Key from Metadata Folder")
        .modelParam(
            "rootId",
            description="Root metadata FolderId",
            model=Folder,
            level=AccessType.READ,
            destName="rootId",
        )
        .param(
            "key",
            "Metadata key to remove",
            required=True,
        )
        .param(
            "removeValues",
            "Will remove all values set on DIVE Dataset Metadata for this value",
            dataType='boolean',
            required=False,
            default=False,
        )
    )
    def delete_metadata_key(self, rootId, key, removeValues):
        user = self.getCurrentUser()
        query = {"root": str(rootId["_id"]), "owner": str(user['_id'])}
        found = DIVE_MetadataKeys().findOne(query=query, user=user)
        if found:
            DIVE_MetadataKeys().deleteKey(rootId, user, key)
            Folder().save(rootId)
        else:
            raise RestException(
                f'Could not find Metadata for FolderId: {rootId["_id"]} to delete key.'
            )
        if removeValues:
            query = {
                "root": str(rootId["_id"]),
            }
            existing_data = DIVE_Metadata().find(query)
            for item in existing_data:
                diveDatasetFolder = Folder().load(
                    item['DIVEDataset'], level=AccessType.WRITE, user=user, force=True
                )
                DIVE_Metadata().deleteKey(diveDatasetFolder, rootId, user, key)
        display_items = rootId['meta'].get('DIVEMetadataFilter', {}).get('display', False)
        if display_items and key in display_items:
            display_items.remove(key)
            Folder().save(rootId)

    @autoDescribeRoute(
        Description("Add Metadata Key to Metdata Folder")
        .modelParam(
            "root",
            description="Root metadata FolderId",
            model=Folder,
            level=AccessType.WRITE,
            destName="root",
        )
        .param(
            "key",
            "Metadata key to add",
            required=False,
        )
        .param(
            "category",
            "type of metadata to add",
            enum=['numerical', 'categorical', 'search', 'boolean'],
            required=True,
            default='numerical',
        )
        .param(
            "unlocked",
            "If this value for each metadata item should be modified by regular users",
            dataType='boolean',
            required=True,
            default=False,
        )
        .param(
            "values",
            "List of values, either numbers for numerical category or string for categorical, for search this field isn't required. I.E key1, key2, key3",
            required=False,
            default=[],
        )
        .param(
            "default_value",
            "If this value for each metadata item should be modified by regular users",
            required=False,
            default=None,
        )
    )
    def add_metadata_key(
        self, root, key, category, unlocked, values='', default_value=None  # noqa: B006
    ):
        user = self.getCurrentUser()
        query = {"root": str(root["_id"]), "owner": str(user['_id'])}
        found = DIVE_MetadataKeys().findOne(query=query)
        if len(values) > 0:
            values_arr = values.split(',')
        else:
            values_arr = []
        if found:
            info = {"count": 0, "category": category}
            if category == 'categorical' and values_arr and len(values_arr) > 0:
                info['set'] = list(set(values_arr))
            if category == 'numerical':
                info['range'] = {'min': float('inf'), 'max': float('-inf')}
            if info.get('set', None) is None:
                info['set'] = []
            DIVE_MetadataKeys().addKey(root, user, key, info, unlocked)
            Folder().save(root)
        else:
            raise RestException(f'Could not find for FolderId: {root["_id"]} to delete key.')
        query = {"root": str(root["_id"])}
        existing_data = DIVE_Metadata().find(query)
        for item in existing_data:
            diveDatasetFolder = Folder().load(
                item['DIVEDataset'], level=AccessType.WRITE, user=user, force=True
            )
            if default_value:
                DIVE_Metadata().updateKey(
                    diveDatasetFolder, root, user, key, default_value, force=True
                )

    @autoDescribeRoute(
        Description("Add Metadata Key to Metdata Folder")
        .modelParam(
            "root",
            description="Root metadata FolderId",
            model=Folder,
            level=AccessType.READ,
            destName="root",
        )
        .param(
            "key",
            "Metadata key to add",
            required=False,
        )
        .param(
            "unlocked",
            "If this value for each metadata item should be modified by regular users",
            dataType='boolean',
            required=True,
            default=False,
        )
    )
    def modify_key_permission(self, root, key, unlocked):
        user = self.getCurrentUser()
        query = {"root": str(root["_id"])}
        found = DIVE_MetadataKeys().findOne(query=query, owner=str(user['_id']))
        if found:
            if found.get('owner', False) is False:
                DIVE_MetadataKeys().initialize_updated_data(root, user)
            DIVE_MetadataKeys().modifyKeyPermission(root, user, key, unlocked)
            Folder().save(root)
        else:
            raise RestException(
                f'Could not find Metadata for FolderId: {root["_id"]} to delete key.'
            )

    @access.user
    @autoDescribeRoute(
        Description("Set MetadataKey value for a folder")
        .modelParam(
            "divedataset",
            description="The folder to set the key on",
            model=Folder,
            level=AccessType.WRITE,
            destName="divedataset",
        )
        .modelParam(
            "rootId",
            description="The root metadata folder this dataset belongs to",
            model=Folder,
            level=AccessType.READ,
            destName="rootId",
        )
        .param(
            "key",
            "Metadata key to add",
            required=False,
        )
        .param(
            "value",
            "Value to set the key to, empty is a None value",
            required=True,
            default=None,
        )
    )
    def set_key_value(self, divedataset, rootId, key, value):
        user = self.getCurrentUser()
        query = {
            "DIVEDataset": str(divedataset["_id"]),
            "root": str(rootId["_id"]),
        }
        found = DIVE_Metadata().findOne(query=query, user=user, level=AccessType.WRITE)
        if found:
            rootId = found['root']
            rootFolder = Folder().load(rootId, user=user, level=AccessType.WRITE)
            categoricalLimit = (
                rootFolder['meta'].get(DIVEMetadataFilter, {}).get('categoricalLimit', 50)
            )
            DIVE_Metadata().updateKey(divedataset, rootId, user, key, value, categoricalLimit)
        else:
            raise RestException(
                f'Could not find for FolderId: {divedataset["_id"]} to modify key-value: {key} - {value}.'
            )

    @autoDescribeRoute(
        Description("Delete a key from a specific DIVE Dataset")
        .modelParam(
            "divedataset",
            description="The folder to delete the key from",
            model=Folder,
            level=AccessType.WRITE,
            destName="divedataset",
        )
        .modelParam(
            "rootId",
            description="The root metadata folder this dataset belongs to",
            model=Folder,
            level=AccessType.READ,
            destName="rootId",
        )
        .param(
            "key",
            "Metadata key to delete",
            required=False,
        )
    )
    def delete_key_value(self, divedataset, rootId, key):
        user = self.getCurrentUser()
        query = {
            "DIVEDataset": str(divedataset["_id"]),
            "root": str(rootId["_id"]),
        }
        found = DIVE_Metadata().findOne(query=query, user=user)
        if found:
            rootId = found['root']
            DIVE_Metadata().deleteKey(divedataset, rootId, user, key)
        else:
            raise RestException(f'Could not find for FolderId: {divedataset["_id"]} to delete key.')

    @access.user
    @autoDescribeRoute(
        Description("Run Slicer-CLI Task on metadata Filter")
        .modelParam(
            "rootId",
            destName="rootId",
            description="Base root Folder to filter on",
            model=Folder,
            level=AccessType.READ,
            required=True,
        )
        .param(
            'taskId',
            'TaskId',
            paramType='formData',
            dataType='string',
            required=True,
        )
        .jsonParam(
            "filterParams",
            paramType='formData',
            description="JSON Settings for the filtering",
            required=False,
            default={"filters": {}, "params": {}},
        )
    )
    def run_slicer_cli_task(
        self,
        rootId,
        taskId,
        filterParams,
    ):
        if rootId['meta'].get(DIVEMetadataMarker, False) is False:
            raise RestException('Folder is not a DIVE Metadata folder', code=404)

        filters = filterParams['filters']
        params = filterParams['params']
        user = self.getCurrentUser()
        query = self.get_filter_query(rootId, user, filters)
        metadata_items = list(DIVE_Metadata().find(query, user=self.getCurrentUser()))
        # TODO Maybe convert to using cursor in the future

        dataset_list: DiveDatasetList = []
        for item in metadata_items:
            dataset_id = str(item['DIVEDataset'])
            datasetFolder = Folder().load(dataset_id, level=AccessType.READ, user=user, force=True)
            task_defaults = crud_dataset.get_task_defaults(
                datasetFolder, self.getCurrentUser()
            ).dict(exclude_none=True)
            video_id = None
            if 'video' in task_defaults.keys():
                video_id = task_defaults['video']['fileId']
            dataset_list.append(
                {
                    "DIVEDataset": dataset_id,
                    "DIVEMetadata": str(item['_id']),
                    "DIVEDatasetName": item['filename'],
                    "DIVEVideo": video_id,
                }
            )
        token = Token().createToken(user=user, days=2)

        dive_metadata_slicer_task_params: DIVEMetadataSlicerCLITaskParams = {
            "dataset_list": dataset_list,
            "cli_item": taskId,
            "DIVEMetadataRoot": str(rootId['_id']),
            "filter": filters,
            "slicer_params": params,
            "userId": str(user['_id']),
            "girderToken": str(token['_id']),
            "girderApiUrl": getWorkerApiUrl(),
        }
        if not Setting().get('worker.api_url'):
            Setting().set('worker.api_url', getApiUrl())
        job = Job().createLocalJob(
            module='dive_tasks.dive_metadata_slicer_cli',
            function='batchSlicerMetadataTask',
            kwargs={'params': dive_metadata_slicer_task_params, 'url': cherrypy.url()},
            title='Batch process Dive Metadata Filter',
            type='Dive Metadata Slicer CLI Batch',
            user=user,
            public=True,
            asynchronous=True,
        )
        job = Job().save(job)
        Job().scheduleJob(job)
        return job

    @access.user
    @autoDescribeRoute(
        Description("Export filtered DIVE metadata as JSON or CSV")
        .modelParam(
            "id",
            description="Base root Folder to filter on",
            model=Folder,
            level=AccessType.READ,
        )
        .jsonParam(
            "filters",
            "JSON Settings for the filtering",
            required=False,
        )
        .param(
            "format",
            description="Export format: 'json' or 'csv'",
            required=True,
            enum=["json", "csv"],
        )
    )
    def export_metadata(self, folder, filters, format):
        if folder['meta'].get(DIVEMetadataMarker, False) is False:
            raise RestException('Folder is not a DIVE Metadata folder', code=404)

        user = self.getCurrentUser()
        query = self.get_filter_query(folder, user, filters)
        metadata_items = list(DIVE_Metadata().find(query, user=user))

        filename = f"metadata_export.{format}"
        if not metadata_items:
            raise RestException('No metadata items to export.')

        if format == 'csv':
            output = io.StringIO(newline='')
            # Infer CSV headers from all keys used across items
            headers = sorted(
                {key for item in metadata_items for key in item.get('metadata', {}).keys()}
            )
            headers.insert(0, 'DIVEDataset')  # Add DIVEDataset as first column
            headers.insert(1, 'Filename')  # Add filename as second column
            writer = csv.DictWriter(output, fieldnames=headers, extrasaction='ignore')
            writer.writeheader()
            for item in metadata_items:

                row = {key: item.get('metadata', {}).get(key, '') for key in headers}
                row['DIVEDataset'] = str(item['DIVEDataset'])
                row['Filename'] = item.get('filename', '')
                writer.writerow(row)

            csv_output = output.getvalue()
            output.close()

            setRawResponse()
            setContentDisposition(filename, mime='text/csv')
            setResponseHeader('Content-Type', 'text/csv')
            return csv_output.encode('utf-8')

        else:  # JSON
            export_data = []
            for item in metadata_items:
                export_item = item.get('metadata', {}).copy()
                export_item['DIVEDataset'] = str(item['DIVEDataset'])
                export_item['Filename'] = item.get('filename', '')
                export_data.append(export_item)
            setContentDisposition(filename, mime='application/json')
            setRawResponse()

            setResponseHeader('Content-Type', 'application/json')
            return json.dumps(export_data).encode('utf-8')

    def bulk_metadata_process_file(self, user, rootFolder, updates, replace=False):
        query = self.get_filter_query(rootFolder, user, None)
        metadata_items = list(DIVE_Metadata().find(query, user=user))

        previous_data = []
        for item in metadata_items:
            export_item = item.get('metadata', {}).copy()
            export_item['DIVEDataset'] = str(item['DIVEDataset'])
            previous_data.append(export_item)
        json.dumps(previous_data).encode('utf-8')

        results = bulk_metadata_update_process(user, rootFolder, updates, replace)
        # get errors in the results
        errors = []
        for item in results:
            if 'error' in item.keys():
                errors.append(item['error'])
        if len(errors) > 0:
            return results
        # Check and find DIVEMetadataMarker folder or create it if it doesn't exist
        metadata_folder = Folder().findOne(
            {
                "name": DIVEMetadataHistoryMarker,
                "parent": str(rootFolder["_id"]),
                f'meta.{DIVEMetadataHistoryMarker}': {'$in': TRUTHY_META_VALUES},
            },
            user=user,
            level=AccessType.WRITE,
        )
        if not metadata_folder:
            metadata_folder = Folder().createFolder(
                rootFolder,
                DIVEMetadataHistoryMarker,
                reuseExisting=True,
                creator=user,
            )
            Folder().setMetadata(metadata_folder, {DIVEMetadataHistoryMarker: True})
        # now save the previous_data with a timestamp for the name in the folder
        previous_item = Item().createItem(
            f'History_{datetime.now().isoformat()}.json',
            creator=user,
            folder=metadata_folder,
            reuseExisting=True,
        )

        json_bytes = json.dumps(previous_data).encode('utf-8')
        byteIO = io.BytesIO(json_bytes)

        Upload().uploadFromFile(
            byteIO,
            len(json_bytes),
            previous_item['name'],
            parentType="item",
            parent=previous_item,
            user=user,
            mimeType="application/json",
        )
        return results

    @access.user
    @autoDescribeRoute(
        Description("Processes any uploaded JSON files to the rootFolder to bulk update metadata")
        .modelParam(
            "rootFolder",
            description="Root metadata FolderId",
            model=Folder,
            level=AccessType.WRITE,
            destName="rootFolder",
        )
        .param(
            "replace",
            "If true will replace the metadata values instead of merging them",
            dataType='boolean',
            required=False,
            default=False,
        )
    )
    def bulk_update_metadata_file(self, rootFolder, replace):
        user = self.getCurrentUser()
        # We Need to find any JSON file in the folder and be able to proces it
        unprocessed_items = Folder().childItems(
            rootFolder,
            filters={
                "$or": [
                    {"lowerName": {"$regex": jsonRegex}},
                    {"lowerName": {"$regex": ndjsonRegex}},
                    {"lowerName": {"$regex": csvRegex}},
                ]
            },
            # Processing order: oldest to newest
            sort=[("created", pymongo.ASCENDING)],
        )
        if unprocessed_items is None or unprocessed_items.count() == 0:
            raise RestException('No JSON/NDJSON/CSV files found in the folder to process.')
        updates = None
        if unprocessed_items:
            item = unprocessed_items[0]
            file = next(Item().childFiles(item), None)
            if file is None:
                raise RestException('No file found in the item to process.')
            file_generator = File().download(file, headers=False)()
            file_string = b"".join(list(file_generator)).decode()
            if file['name'].endswith('.json'):  # standard json file
                updates = json.loads(file_string)
            elif file['name'].endswith('.ndjson'):  # new line delimited json
                updates = [json.loads(line) for line in file_string.splitlines()]
            elif file['name'].endswith('.csv'):  # use pandas for automatic type conversion
                df = pd.read_csv(io.StringIO(file_string))
                updates = df.to_dict(orient='records')
            Item().remove(item)
            results = self.bulk_metadata_process_file(user, rootFolder, updates, replace)
            return results
        else:
            raise RestException('No valid update files found.')

    @access.user
    @autoDescribeRoute(
        Description("Bulk update metadata for multiple datasets via JSON upload.")
        .modelParam(
            "rootFolder",
            description="Root metadata FolderId",
            model=Folder,
            level=AccessType.WRITE,
            destName="rootFolder",
        )
        .jsonParam(
            "updates",
            description="Array of objects but requires that the user have 'DIVEDataset' or 'Filename' that matches a filename in the system",
            required=True,
            paramType="body",
            requireArray=True,
            default=[{}],
        )
        .param(
            "replace",
            "If true will replace the metadata values instead of merging them",
            dataType='boolean',
            required=False,
            default=False,
        )
    )
    def bulk_update_metadata(self, rootFolder, updates, replace=False):
        user = self.getCurrentUser()
        # We want to get the Data before processing
        results = self.bulk_metadata_process_file(user, rootFolder, updates, replace)

        return results

    @access.user
    @autoDescribeRoute(
        Description("Set Last Modified Date for a DIVE Dataset")
        .modelParam(
            "divedataset",
            description="The folder to set last modified date for",
            model=Folder,
            level=AccessType.WRITE,
            destName="divedataset",
        )
        .modelParam(
            "rootId",
            description="The root metadata folder this dataset belongs to",
            model=Folder,
            level=AccessType.READ,
            destName="rootId",
        )
    )
    def set_last_modified(self, divedataset, rootId):
        user = self.getCurrentUser()
        query = {
            "DIVEDataset": str(divedataset["_id"]),
            "root": str(rootId["_id"]),
        }
        found = DIVE_Metadata().findOne(query=query, user=user, level=AccessType.READ)
        if found:
            DIVE_MetadataKeys().addModifiedKeys(rootId)
            rootFolder = Folder().load(str(rootId["_id"]), user=user, level=AccessType.WRITE)
            categoricalLimit = (
                rootFolder['meta'].get(DIVEMetadataFilter, {}).get('categoricalLimit', 50)
            )

            DIVE_Metadata().updateKey(
                divedataset,
                rootId,
                user,
                'LastModifiedTime',
                datetime.now().isoformat(),
                categoricalLimit,
                force=True,
            )
            DIVE_Metadata().updateKey(
                divedataset,
                rootId,
                user,
                'LastModifiedBy',
                user['email'],
                categoricalLimit,
                force=True,
            )
        else:
            raise RestException(
                f'Could not find for FolderId: {divedataset["_id"]} to set last modified date.'
            )
