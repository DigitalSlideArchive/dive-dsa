"""DIVE Metadata REST resource.

Domain logic lives in ``crud_metadata_ingest``; job enqueue in ``crud_metadata_jobs``.
"""

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
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token
from girder_jobs.models.job import Job
from girder_plugin_worker.utils import getWorkerApiUrl

from dive_utils import FALSY_META_VALUES, TRUTHY_META_VALUES, setContentDisposition
from dive_utils.constants import (
    DIVEMetadataClonedFilter,
    DIVEMetadataClonedFilterBase,
    DIVEMetadataFilter,
    DIVEMetadataMarker,
)
from dive_utils.metadata.models import DIVE_Metadata, DIVE_MetadataKeys
from dive_utils.metadata.numeric import (
    coerce_export_empty_strings,
    sanitize_metadata_keys_doc_for_api,
    sanitize_value_tree_for_girder_json,
)
from dive_utils.types import DiveDatasetList, DIVEMetadataSlicerCLITaskParams

from dive_server.crud_metadata_ingest import (
    _CREATE_METADATA_DISPLAY_DEFAULT,
    _CREATE_METADATA_FFPROBE_DEFAULT,
    _PROCESS_METADATA_DISPLAY_DEFAULT,
    _PROCESS_METADATA_FFPROBE_DEFAULT,
    _is_dive_metadata_folder,
    _metadata_fieldnames_for_export,
    _normalize_create_metadata_configs,
    _normalize_metadata_config,
    _resolve_create_metadata_targets,
    _strip_injected_metadata_keys_copy,
    bulk_metadata_process_file,
    find_oldest_bulk_import_item,
    persist_bulk_updates_item,
)


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
        self.route("POST", ("create_metadata_recursive",), self.create_metadata_recursive)
        self.route("POST", (":id", "index_folder"), self.index_metadata_folder)
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
        self.route("PATCH", (':root', 'key_description'), self.update_metadata_key_description)
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
        Description(
            "Enqueue processing of a folder's NDJSON/JSON metadata file on the local worker. "
            "Returns a Girder job immediately; poll the job for results."
        )
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
            required=False,
            default=_PROCESS_METADATA_DISPLAY_DEFAULT,
        )
        .jsonParam(
            "ffprobeMetadata",
            "List Metadata keys to extract from the ffprobe metadata from videos.  Setting 'import' to 'true' will import the data",
            required=False,
            default=_PROCESS_METADATA_FFPROBE_DEFAULT,
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
        """Enqueue NDJSON/JSON metadata ingest on the local worker; returns a Girder job."""
        from dive_server.crud_metadata_jobs import enqueue_metadata_ingest_job

        user = self.getCurrentUser()
        displayConfig = _normalize_metadata_config(
            displayConfig, _PROCESS_METADATA_DISPLAY_DEFAULT
        )
        ffprobeMetadata = _normalize_metadata_config(
            ffprobeMetadata, _PROCESS_METADATA_FFPROBE_DEFAULT
        )
        return enqueue_metadata_ingest_job(
            user,
            'process_metadata',
            {
                'folderId': str(folder['_id']),
                'sibling_path': sibling_path,
                'fileType': fileType,
                'matcher': matcher,
                'path_key': path_key,
                'displayConfig': displayConfig,
                'ffprobeMetadata': ffprobeMetadata,
                'categoricalLimit': categoricalLimit,
                'additive': additive is True,
            },
        )

    @access.user
    @autoDescribeRoute(
        Description(
            "Enqueue creation/indexing of a DIVE metadata folder on the local worker. "
            "Returns a Girder job immediately; poll the job for results."
        )
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
        """Enqueue folder indexing on the local worker; returns a Girder job."""
        from dive_server.crud_metadata_jobs import enqueue_metadata_ingest_job

        user = self.getCurrentUser()
        root_folder = Folder().load(
            rootFolderId,
            level=AccessType.WRITE,
            user=user,
            force=True,
        )
        if root_folder is None:
            raise RestException('Root folder not found', code=404)
        display_config, ffprobe_metadata = _normalize_create_metadata_configs(
            displayConfig,
            ffprobeMetadata,
        )
        return enqueue_metadata_ingest_job(
            user,
            'create_metadata_folder',
            {
                'parentFolderId': str(folder['_id']),
                'name': name,
                'rootFolderId': str(rootFolderId),
                'displayConfig': display_config,
                'ffprobeMetadata': ffprobe_metadata,
                'categoricalLimit': categoricalLimit,
            },
        )

    @access.user
    @autoDescribeRoute(
        Description(
            "Create DIVE metadata for a Girder collection or folder. "
            "Can create one metadata folder for the whole resource or one per immediate subfolder. "
            "Existing DIVE metadata folders and per-dataset rows are not replaced."
        )
        .param(
            "resourceId",
            "Folder or collection ID to scan for DIVE datasets",
            paramType="formData",
            dataType="string",
            required=True,
        )
        .param(
            "resourceType",
            "Girder resource type: folder or collection",
            paramType="formData",
            dataType="string",
            default="folder",
            required=False,
        )
        .param(
            "scope",
            "single: one metadata folder for all datasets under the resource; "
            "subfolders: one metadata folder per immediate child folder, created as a sibling of that folder",
            paramType="formData",
            dataType="string",
            default="subfolders",
            required=False,
        )
        .param(
            "name",
            "Metadata folder name (single scope) or name suffix (subfolders: '<child> - <name>')",
            paramType="formData",
            dataType="string",
            default="DIVE Metadata",
            required=False,
        )
        .param(
            "parentFolderId",
            "Parent folder for a new metadata folder in single scope (defaults to resourceId when resource is a folder)",
            paramType="formData",
            dataType="string",
            required=False,
        )
        .jsonParam(
            "displayConfig",
            "List of Main Display Keys for the metadata and keys to hide from the filter",
            required=True,
            default=_CREATE_METADATA_DISPLAY_DEFAULT,
        )
        .jsonParam(
            "ffprobeMetadata",
            "List Metadata keys to extract from the ffprobe metadata from videos",
            required=True,
            default=_CREATE_METADATA_FFPROBE_DEFAULT,
        )
        .param(
            "categoricalLimit",
            "Above this number make a field a search field instead of a dropdown",
            paramType="formData",
            dataType="integer",
            default=50,
        )
    )
    def create_metadata_recursive(
        self,
        resourceId,
        resourceType,
        scope,
        name,
        parentFolderId,
        displayConfig,
        ffprobeMetadata,
        categoricalLimit,
    ):
        """Enqueue recursive metadata creation on the local worker; returns a Girder job."""
        from dive_server.crud_metadata_jobs import enqueue_metadata_ingest_job

        user = self.getCurrentUser()
        resource_type = (resourceType or 'folder').strip().lower()
        if resource_type not in ('folder', 'collection'):
            raise RestException('resourceType must be folder or collection', code=400)
        scope_norm = (scope or 'subfolders').strip().lower()
        if scope_norm not in ('single', 'subfolders'):
            raise RestException('scope must be single or subfolders', code=400)
        # Validate access before enqueue
        _resolve_create_metadata_targets(resourceId, resource_type, user)
        display_config, ffprobe_metadata = _normalize_create_metadata_configs(
            displayConfig,
            ffprobeMetadata,
        )
        return enqueue_metadata_ingest_job(
            user,
            'create_metadata_recursive',
            {
                'resourceId': str(resourceId),
                'resourceType': resource_type,
                'scope': scope_norm,
                'name': name,
                'parentFolderId': parentFolderId,
                'displayConfig': display_config,
                'ffprobeMetadata': ffprobe_metadata,
                'categoricalLimit': categoricalLimit,
            },
        )

    @access.user
    @autoDescribeRoute(
        Description(
            "Index DIVE datasets from another folder into an existing DIVE metadata folder. "
            "Adds rows for datasets not yet in the metadata root; optionally replaces default "
            "fields for datasets already indexed from the same scan."
        )
        .modelParam(
            "id",
            description="Existing DIVE metadata folder",
            model=Folder,
            level=AccessType.WRITE,
        )
        .param(
            "rootFolderId",
            "Folder to scan recursively for DIVE datasets to add or refresh",
            paramType="formData",
            dataType="string",
            required=True,
        )
        .param(
            "replaceMetadata",
            "When true, overwrite default metadata rows for datasets found under rootFolderId",
            paramType="formData",
            dataType="boolean",
            default=False,
            required=False,
        )
        .jsonParam(
            "ffprobeMetadata",
            "ffprobe keys to import for newly indexed or replaced rows",
            required=False,
            default=_CREATE_METADATA_FFPROBE_DEFAULT,
        )
    )
    def index_metadata_folder(self, folder, rootFolderId, replaceMetadata, ffprobeMetadata):
        """Enqueue indexing into an existing metadata folder; returns a Girder job."""
        from dive_server.crud_metadata_jobs import enqueue_metadata_ingest_job

        user = self.getCurrentUser()
        if not _is_dive_metadata_folder(folder):
            raise RestException('Folder is not a DIVE Metadata folder', code=400)
        root_folder = Folder().load(
            rootFolderId,
            level=AccessType.WRITE,
            user=user,
            force=True,
        )
        if root_folder is None:
            raise RestException('Root folder not found', code=404)
        ffprobe_metadata = _normalize_metadata_config(
            ffprobeMetadata,
            _CREATE_METADATA_FFPROBE_DEFAULT,
        )
        return enqueue_metadata_ingest_job(
            user,
            'index_metadata_folder',
            {
                'metadataFolderId': str(folder['_id']),
                'rootFolderId': str(rootFolderId),
                'replaceMetadata': replaceMetadata is True,
                'ffprobeMetadata': ffprobe_metadata,
            },
        )

    @access.user
    @autoDescribeRoute(
        Description(
            "Get a list of filter keys for a specific folder.  Provides the type and range for values in the metadata"
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
        # NaN/inf in numerical ranges or categorical sets (common after partial CSV imports)
        # breaks json.dumps(allow_nan=False).
        if sanitize_metadata_keys_doc_for_api(metadata_key):
            DIVE_MetadataKeys().save(metadata_key)
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
            page_list = list(metadata_items)
            # Dataset rows can contain pandas NaN in metadata (e.g. sparse CSV); Girder JSON forbids NaN.
            for doc in page_list:
                if sanitize_value_tree_for_girder_json(doc, minmax_keys_to_zero=False):
                    DIVE_Metadata().save(doc)
            structured_results = {
                'totalPages': pages,
                'pageResults': page_list,
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
        Description("Get a list of filter values for DIVE Metadata, use for debugging")
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
        sanitize_value_tree_for_girder_json(results, minmax_keys_to_zero=False)
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
        mf = rootId.get('meta', {}).get('DIVEMetadataFilter')
        if isinstance(mf, dict):
            changed_lists = False
            for list_key in ('display', 'hide', 'filterDisplay', 'filterHide'):
                lst = mf.get(list_key)
                if isinstance(lst, list) and key in lst:
                    lst.remove(key)
                    changed_lists = True
            if changed_lists:
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
        .param(
            "description",
            "Optional human-readable description of this metadata key",
            required=False,
            default=None,
        )
    )
    def add_metadata_key(
        self, root, key, category, unlocked, values='', default_value=None, description=None  # noqa: B006
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
                # Do not use inf sentinels — Girder JSON responses use allow_nan=False.
                info['range'] = {'min': 0.0, 'max': 0.0}
            if info.get('set', None) is None:
                info['set'] = []
            desc_text = (description or '').strip() if description is not None else ''
            if desc_text:
                info['description'] = desc_text
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
                    diveDatasetFolder, str(root["_id"]), user, key, default_value, force=True
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

    @autoDescribeRoute(
        Description("Set or clear the optional description for a metadata key")
        .modelParam(
            "root",
            description="Root metadata FolderId",
            model=Folder,
            level=AccessType.READ,
            destName="root",
        )
        .param(
            "key",
            "Metadata key name",
            required=True,
        )
        .param(
            "description",
            "Description text; omit or send empty string to clear",
            required=False,
            default=None,
        )
    )
    def update_metadata_key_description(self, root, key, description=None):
        user = self.getCurrentUser()
        query = {"root": str(root["_id"])}
        found = DIVE_MetadataKeys().findOne(query=query, owner=str(user['_id']))
        if found:
            if found.get('owner', False) is False:
                DIVE_MetadataKeys().initialize_updated_data(root, user)
            DIVE_MetadataKeys().updateKeyDescription(root, user, key, description)
            Folder().save(root)
        else:
            raise RestException(
                f'Could not find Metadata for FolderId: {root["_id"]} to update key description.'
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
        .param(
            "baseURL",
            "Base URL to prepend to dataset links in the export",
            required=False,
            default="",
        )
    )
    def export_metadata(self, folder, filters, format, baseURL):
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
            # Infer CSV headers from metadata keys, excluding columns we inject once (avoids duplicate Filename).
            meta_headers = _metadata_fieldnames_for_export(metadata_items)
            headers = ['DIVEDataset', 'Filename', 'DIVE_URL', *meta_headers]
            writer = csv.DictWriter(output, fieldnames=headers, extrasaction='ignore')
            writer.writeheader()
            for item in metadata_items:

                row = {key: item.get('metadata', {}).get(key, '') for key in meta_headers}
                row['DIVEDataset'] = str(item['DIVEDataset'])
                row['Filename'] = item.get('filename', '')
                # generate the url for the dive metadata it should be of the format like
                # base_url/#/viewer/{dataset_id}?diveMetadataRootId={metadata_root_id}
                if baseURL:
                    row['DIVE_URL'] = (
                        f"{baseURL.rstrip('/')}/#/viewer/{item['DIVEDataset']}?"
                        f"diveMetadataRootId={item['root']}"
                    )
                else:
                    tempBaseURL = getApiUrl().replace('/api/v1', '')
                    row['DIVE_URL'] = f"{tempBaseURL}/#/viewer/{item['DIVEDataset']}?diveMetadataRootId={item['root']}"
                sanitize_value_tree_for_girder_json(row, minmax_keys_to_zero=False)
                coerce_export_empty_strings(row)
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
                export_item = _strip_injected_metadata_keys_copy(item.get('metadata', {}))
                export_item['DIVEDataset'] = str(item['DIVEDataset'])
                export_item['Filename'] = item.get('filename', '')
                export_data.append(export_item)
                # generate the url for the dive metadata it should be of the format like
                # base_url/#/viewer/{dataset_id}?diveMetadataRootId={metadata_root_id}
                if baseURL:
                    export_item['DIVE_URL'] = (
                        f"{baseURL.rstrip('/')}/#/viewer/{item['DIVEDataset']}?"
                        f"diveMetadataRootId={item['root']}"
                    )
                else:
                    tempBaseURL = getApiUrl().replace('/api/v1', '')
                    export_item['DIVE_URL'] = f"{tempBaseURL}/#/viewer/{item['DIVEDataset']}?diveMetadataRootId={item['root']}"
                sanitize_value_tree_for_girder_json(export_item, minmax_keys_to_zero=False)
                coerce_export_empty_strings(export_item)
            setContentDisposition(filename, mime='application/json')
            setRawResponse()

            setResponseHeader('Content-Type', 'application/json')
            return json.dumps(export_data).encode('utf-8')

    def bulk_metadata_process_file(self, user, rootFolder, updates, replace=False):
        """Backward-compatible wrapper; prefer module-level ``bulk_metadata_process_file``."""
        return bulk_metadata_process_file(user, rootFolder, updates, replace)

    @access.user
    @autoDescribeRoute(
        Description(
            "Enqueue processing of an uploaded JSON/NDJSON/CSV file in the metadata root. "
            "Returns a Girder job immediately; poll the job for results."
        )
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
        from dive_server.crud_metadata_jobs import enqueue_metadata_ingest_job

        user = self.getCurrentUser()
        if rootFolder['meta'].get(DIVEMetadataMarker, False) is False:
            raise RestException('Folder is not a DIVE Metadata folder', code=404)
        item = find_oldest_bulk_import_item(rootFolder)
        if item is None:
            raise RestException('No JSON/NDJSON/CSV files found in the folder to process.')
        file = next(Item().childFiles(item), None)
        if file is None:
            raise RestException('No file found in the item to process.')
        return enqueue_metadata_ingest_job(
            user,
            'bulk_update',
            {
                'rootFolderId': str(rootFolder['_id']),
                'itemId': str(item['_id']),
                'replace': replace is True,
            },
        )

    @access.user
    @autoDescribeRoute(
        Description(
            "Enqueue bulk metadata updates from a JSON body. "
            "Returns a Girder job immediately; poll the job for results."
        )
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
        from dive_server.crud_metadata_jobs import enqueue_metadata_ingest_job

        user = self.getCurrentUser()
        if rootFolder['meta'].get(DIVEMetadataMarker, False) is False:
            raise RestException('Folder is not a DIVE Metadata folder', code=404)
        item = persist_bulk_updates_item(user, rootFolder, updates)
        return enqueue_metadata_ingest_job(
            user,
            'bulk_update',
            {
                'rootFolderId': str(rootFolder['_id']),
                'itemId': str(item['_id']),
                'replace': replace is True,
            },
        )

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
        root_id = str(rootId["_id"])
        query = {
            "DIVEDataset": str(divedataset["_id"]),
            "root": root_id,
        }
        found = DIVE_Metadata().findOne(query=query, user=user, level=AccessType.READ)
        if found:
            DIVE_MetadataKeys().addModifiedKeys(rootId)
            rootFolder = Folder().load(root_id, user=user, level=AccessType.WRITE)
            categoricalLimit = (
                rootFolder['meta'].get(DIVEMetadataFilter, {}).get('categoricalLimit', 50)
            )

            DIVE_Metadata().updateKey(
                divedataset,
                root_id,
                user,
                'LastModifiedTime',
                datetime.now().isoformat(),
                categoricalLimit,
                force=True,
            )
            DIVE_Metadata().updateKey(
                divedataset,
                root_id,
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
