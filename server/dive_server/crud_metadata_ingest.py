"""DIVE metadata domain logic: indexing, NDJSON ingest, and bulk update.

Callable from REST handlers and Celery ``local`` worker tasks. Keep HTTP/Resource
concerns in ``views_metadata`` and job enqueue in ``crud_metadata_jobs``.
"""

from __future__ import annotations

from datetime import datetime
import io
import json

from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.collection import Collection
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload
from girder.utility import path as path_util
from girder_jobs.models.job import Job
from pandas import pandas as pd
import pymongo

from dive_utils import FALSY_META_VALUES, TRUTHY_META_VALUES
from dive_utils.constants import (
    DIVEMetadataFilter,
    DIVEMetadataHistoryMarker,
    DIVEMetadataMarker,
    csvRegex,
    jsonRegex,
    ndjsonRegex,
)
from dive_utils.metadata.models import DIVE_Metadata, DIVE_MetadataKeys
from dive_utils.metadata.numeric import (
    categorical_values_for_schema,
    finalize_metadata_keys_numerical_range,
    is_nonfinite_numeric_placeholder,
    merge_finite_numeric_range_dict,
    sanitize_value_tree_for_girder_json,
    safe_min_max,
)

from . import crud_dataset

_PROCESS_METADATA_DISPLAY_DEFAULT = {
    "display": ['Batch', 'SampleDate', 'SubjectId', 'StudyId', 'ExperimentTag'],
    "hide": ["ETag", "ETagDuplicated", "Size"],
}
_PROCESS_METADATA_FFPROBE_DEFAULT = {
    "import": False,
    "keys": ["width", "height", "display_aspect_ratio"],
}

# Metadata may store keys that duplicate injected export columns; strip by lowercase name so CSV has one Filename, etc.
_EXPORT_INJECTED_FIELD_LOWERS = frozenset({'divedataset', 'filename', 'dive_url'})


def _metadata_fieldnames_for_export(metadata_items):
    """Sorted metadata keys excluding fields we emit as fixed leading columns."""
    keys = {key for item in metadata_items for key in item.get('metadata', {}).keys()}
    return sorted(k for k in keys if k.lower() not in _EXPORT_INJECTED_FIELD_LOWERS)


def _strip_injected_metadata_keys_copy(meta: dict):
    """Remove duplicate injected keys before JSON export (canonical DIVEDataset / Filename / DIVE_URL follow)."""
    out = dict(meta)
    for k in list(out.keys()):
        if k.lower() in _EXPORT_INJECTED_FIELD_LOWERS:
            del out[k]
    return out


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


def _is_blank_metadata_value_for_stats(raw) -> bool:
    """
    True when a stored value should not contribute to count / set / range aggregates.

    Skips nulls, NaN/inf placeholders, whitespace-only strings, empty containers, and
    string-only lists/tuples where every string is empty or whitespace.
    """
    if raw is None:
        return True
    if is_nonfinite_numeric_placeholder(raw):
        return True
    if isinstance(raw, str):
        return raw.strip() == ''
    if isinstance(raw, (list, tuple)):
        if len(raw) == 0:
            return True
        if any(not isinstance(el, str) for el in raw):
            return False
        return not any(
            isinstance(el, str)
            and el.strip() != ''
            and not is_nonfinite_numeric_placeholder(el)
            for el in raw
        )
    if isinstance(raw, dict):
        return len(raw) == 0
    return False


def _accumulate_flat_metadata_key_stats(metadataKeys, flat_dict):
    """
    Merge one flat metadata dict into in-progress metadataKeys stats (same rules
    as JSON import / recursive dataset creation: finite numerics, no NaN in string sets).
    """
    for key, raw in flat_dict.items():
        if _is_blank_metadata_value_for_stats(raw):
            continue
        if key not in metadataKeys:
            metadataKeys[key] = {
                'type': python_to_javascript_type(type(raw)),
                'set': set(),
                'count': 0,
            }
        typ = metadataKeys[key]['type']
        if typ == 'string':
            if is_nonfinite_numeric_placeholder(raw):
                continue
            metadataKeys[key]['set'].add(raw)
            metadataKeys[key]['count'] += 1
        elif typ == 'array':
            added_string = False
            for el in raw:
                if python_to_javascript_type(type(el)) != 'string':
                    continue
                if is_nonfinite_numeric_placeholder(el):
                    continue
                if isinstance(el, str) and el.strip() == '':
                    continue
                metadataKeys[key]['set'].add(el)
                added_string = True
            if added_string:
                metadataKeys[key]['count'] += 1
        elif typ == 'number':
            merged = merge_finite_numeric_range_dict(metadataKeys[key].get('range'), raw)
            if merged is None:
                continue
            metadataKeys[key]['range'] = merged


def _finalize_metadata_keys_categories(metadataKeys, categorical_limit):
    """Assign categorical vs search vs numerical; JSON-safe sets and numerical ranges."""
    for key in metadataKeys.keys():
        bucket = metadataKeys[key]
        bucket['unique'] = len(bucket['set'])
        t = bucket['type']
        if t in ('string', 'array') and (
            bucket['unique'] < categorical_limit
            or (bucket['count'] <= len(bucket['set']) and len(bucket['set']) < categorical_limit)
        ):
            bucket['category'] = 'categorical'
            bucket['set'] = categorical_values_for_schema(list(bucket['set']))
        elif t == 'string':
            bucket['category'] = 'search'
            del bucket['set']
        elif t == 'number':
            bucket['category'] = 'numerical'
            del bucket['set']
            rng = bucket.get('range')
            if isinstance(rng, dict):
                finalize_metadata_keys_numerical_range(rng)
        else:
            del bucket['set']


# Keys we do not attach imported {value, description} schema text to (matchers / system fields).
_METADATA_IMPORT_DESCRIPTION_EXCLUDE_KEYS = frozenset(
    {
        'DIVEDataset',
        'Filename',
        'DIVE_Path',
        'DIVE_DatasetId',
        'DIVE_Name',
        'pathMatches',
        'LastModifiedTime',
        'LastModifiedBy',
    }
)


def _metadata_import_description_allowed(key):
    if key in _METADATA_IMPORT_DESCRIPTION_EXCLUDE_KEYS:
        return False
    if key.startswith('ffprobe_') or key.startswith('DIVE_'):
        return False
    return True


def unwrap_metadata_json_value(raw):
    """
    Support JSON fields shaped as {"value": <stored>, "description": "..."}.
    Only dicts that include a 'value' key are treated as this wrapper (plain dicts are unchanged).
    Returns (value_for_storage, description_or_none).
    """
    if isinstance(raw, dict) and 'value' in raw:
        desc = raw.get('description')
        if isinstance(desc, str):
            desc = desc.strip() or None
        else:
            desc = None
        return raw['value'], desc
    return raw, None


def normalize_metadata_row_for_storage(row):
    """
    Flatten wrapped field values for DB storage; collect per-key descriptions.

    Supported shapes:
    - Per field: ``"MyKey": {"value": <stored>, "description": "..."}``
    - Per row: ``"DIVEMetadataKeyDescriptions": {"MyKey": "...", "Other": {"description": "..."}}``
      (this object is not stored on dataset rows).
    """
    if isinstance(row, dict):
        # JSON may contain NaN/Infinity; pandas CSV rows use float nan — keep trees Girder-JSON-safe.
        sanitize_value_tree_for_girder_json(row, minmax_keys_to_zero=False)
    if not isinstance(row, dict):
        return row, {}
    out = {}
    descriptions = {}
    schema = row.get('DIVEMetadataKeyDescriptions')
    if isinstance(schema, dict):
        for sk, sv in schema.items():
            if not _metadata_import_description_allowed(sk):
                continue
            if isinstance(sv, str) and sv.strip():
                descriptions[sk] = sv.strip()
            elif isinstance(sv, dict):
                t = sv.get('description')
                if isinstance(t, str) and t.strip():
                    descriptions[sk] = t.strip()
    for k, v in row.items():
        if k == 'DIVEMetadataKeyDescriptions':
            continue
        val, desc = unwrap_metadata_json_value(v)
        out[k] = val
        if desc and _metadata_import_description_allowed(k):
            descriptions[k] = desc
    return out, descriptions


def merge_first_metadata_import_descriptions(accum, new_descs):
    """First non-empty description wins per key (stable across row order for duplicates)."""
    for k, d in new_descs.items():
        if d and k not in accum:
            accum[k] = d


def _apply_imported_descriptions_to_metadata_keys(metadata_keys, descriptions):
    if not descriptions:
        return
    for k, desc in descriptions.items():
        if desc and k in metadata_keys:
            metadata_keys[k]['description'] = desc


def _normalize_metadata_config(config, default_config):
    if isinstance(config, dict):
        normalized = dict(default_config)
        normalized.update(config)
        return normalized

    if isinstance(config, str):
        try:
            parsed = json.loads(config)
            if isinstance(parsed, dict):
                normalized = dict(default_config)
                normalized.update(parsed)
                return normalized
        except json.JSONDecodeError:
            pass

    return dict(default_config)


def _ensure_filter_lists_in_display_config(display_config):
    """
    When saving DIVEMetadataFilter, copy list-view display/hide into filterDisplay/filterHide
    if those keys are absent so new folders can diverge list vs filter later.
    """
    if not isinstance(display_config, dict):
        return
    if display_config.get('filterDisplay') is None and display_config.get('filterHide') is None:
        display_config['filterDisplay'] = list(display_config.get('display', []))
        display_config['filterHide'] = list(display_config.get('hide', []))


def remove_before_folder(path, folder_name):
    if not isinstance(path, str):
        return None
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


def _loads_metadata_import_json(s: str):
    """
    Parse JSON for metadata bulk / folder import.

    Python's json.loads accepts NaN/Infinity by default; map those to None so we
    never propagate non-finite floats like sparse CSV cells do.
    """
    return json.loads(s, parse_constant=lambda _c: None)


def read_girder_file_bytes(file, girder_client=None) -> bytes:
    """
    Read file contents from Girder.

    Prefer ``GirderClient`` HTTP download when provided (worker path — no shared
    assetstore mount). Fall back to ``File().download`` for in-process use.
    """
    if girder_client is not None:
        resp = girder_client.get(f'file/{file["_id"]}/download', jsonResp=False)
        content = getattr(resp, 'content', None)
        if content is None:
            # Some girder_client versions return raw bytes when jsonResp=False
            if isinstance(resp, (bytes, bytearray)):
                return bytes(resp)
            raise RestException(f'Unexpected download response for file {file["_id"]}')
        return content
    file_generator = File().download(file, headers=False)()
    return b"".join(list(file_generator))


def load_ndjson_string(ndjson_string):
    # Split the string into lines and parse each line as JSON
    return [_loads_metadata_import_json(line) for line in ndjson_string.splitlines()]


def load_metadata_json(search_folder, type='ndjson', girder_client=None):
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
        file_string = read_girder_file_bytes(file, girder_client=girder_client).decode()
        json_data = {}
        if type == 'json':
            json_data = _loads_metadata_import_json(file_string)
        elif type == 'ndjson':
            json_data = load_ndjson_string(file_string)
        # Now we determine data types from the array of data
        if not isinstance(json_data, list):
            print("JSON metadata isn't an array")
            return False
        return json_data, file['name']


_BULK_IMPORT_SKIP_KEYS = frozenset(
    {'divedataset', 'filename', 'dive_path', 'divemetadatakeydescriptions'}
)


def _metadata_schema_key_stats_refresh_is_locked(key: str) -> bool:
    """Keys whose schema buckets are managed separately; do not overwrite from DB scan."""
    if key in ('LastModifiedTime', 'LastModifiedBy', 'DIVEDataset', 'filename', 'DIVE_Path'):
        return True
    if key.startswith('DIVE_') or key.startswith('ffprobe'):
        return True
    return False


def _metadata_dict_for_schema_stats_refresh(meta: dict) -> dict:
    """Strip locked keys before aggregating schema stats from a stored metadata dict."""
    return {k: v for k, v in meta.items() if not _metadata_schema_key_stats_refresh_is_locked(k)}


def _empty_metadata_key_stats_bucket(old_bucket: dict) -> dict:
    """Schema entry for a key that has no non-null samples across stored rows."""
    cat = old_bucket.get('category', 'search')
    typ = old_bucket.get('type', 'string')
    out: dict = {'category': cat, 'count': 0, 'type': typ}
    if cat == 'categorical':
        out['set'] = []
        out['unique'] = 0
    elif cat == 'numerical':
        rng = old_bucket.get('range')
        if isinstance(rng, dict):
            out['range'] = {
                'min': float(rng.get('min', 0.0)),
                'max': float(rng.get('max', 0.0)),
            }
            finalize_metadata_keys_numerical_range(out['range'])
        else:
            out['range'] = {'min': 0.0, 'max': 0.0}
    elif cat == 'search' and typ == 'string':
        out['unique'] = 0
    desc = old_bucket.get('description')
    if isinstance(desc, str) and desc.strip():
        out['description'] = desc.strip()
    return out


def _merge_recomputed_metadata_key_stats_into_existing(
    existing_keys: dict,
    recomputed: dict,
) -> dict:
    """
    Merge finalized stats from ``recomputed`` into ``existing_keys``.
    Locked keys are copied unchanged; descriptions on editable keys are preserved.
    """
    out: dict = {}
    for key, old_bucket in existing_keys.items():
        if _metadata_schema_key_stats_refresh_is_locked(key):
            out[key] = dict(old_bucket)
            continue
        if key in recomputed:
            nb = dict(recomputed[key])
            desc = old_bucket.get('description')
            if isinstance(desc, str) and desc.strip():
                nb['description'] = desc.strip()
            out[key] = nb
        else:
            out[key] = _empty_metadata_key_stats_bucket(old_bucket)
    for key, rec_bucket in recomputed.items():
        if _metadata_schema_key_stats_refresh_is_locked(key):
            continue
        if key not in out:
            out[key] = dict(rec_bucket)
    return out


def refresh_metadata_keys_stats_from_stored_dive_metadata(root_folder, categorical_limit: int) -> None:
    """
    Recompute aggregate fields on the metadata schema (count, type, unique, set/range,
    category) from all ``DIVE_Metadata`` rows for this root.

    Used after bulk updates: ``updateKey`` / ``updateKeyValue`` only widen categorical
    sets and numerical ranges and never maintain counts or ``type``/``unique`` like
    ``process_metadata`` does.
    """
    root_id = str(root_folder['_id'])
    keys_doc = DIVE_MetadataKeys().findOne({'root': root_id})
    if not keys_doc:
        return
    accum: dict = {}
    for row in DIVE_Metadata().find({'root': root_id}):
        flat = _metadata_dict_for_schema_stats_refresh(row.get('metadata') or {})
        _accumulate_flat_metadata_key_stats(accum, flat)
    _finalize_metadata_keys_categories(accum, categorical_limit)
    keys_doc['metadataKeys'] = _merge_recomputed_metadata_key_stats_into_existing(
        keys_doc['metadataKeys'],
        accum,
    )
    DIVE_MetadataKeys().save(keys_doc)


_CREATE_METADATA_DISPLAY_DEFAULT = {
    "display": ['DIVE_DatasetId', 'DIVE_Name'],
    "hide": [""],
}
_CREATE_METADATA_FFPROBE_DEFAULT = {
    "import": True,
    "keys": ["width", "height", "display_aspect_ratio", "nb_frames", "duration"],
}


def _is_dive_metadata_folder(folder) -> bool:
    return folder.get('meta', {}).get(DIVEMetadataMarker) in TRUTHY_META_VALUES


def _find_existing_dive_metadata_child(parent_folder, user):
    """Return a direct child folder already marked as DIVE metadata, if any."""
    for child in Folder().childFolders(parent_folder, 'folder', user=user):
        if _is_dive_metadata_folder(child):
            return child
    return None


def _load_girder_folder_parent(folder, user):
    """
    Return the immediate Girder parent model and parentType for a folder.

    Nested folders may still carry collection ancestry in ``parentCollection``; resolve
    the direct parent by loading ``parentId`` as a folder first, then as a collection.
    """
    parent_id = folder.get('parentId')
    if not parent_id:
        return None, None
    parent_folder = Folder().load(
        str(parent_id),
        level=AccessType.WRITE,
        user=user,
        force=True,
    )
    if parent_folder is not None:
        return parent_folder, 'folder'
    parent_collection = Collection().load(
        str(parent_id),
        level=AccessType.WRITE,
        user=user,
        force=True,
    )
    if parent_collection is not None:
        return parent_collection, 'collection'
    return None, None


def _metadata_folder_name_for_dataset_folder(dataset_folder, name_suffix):
    return f"{dataset_folder['name']} - {name_suffix}"


def _find_existing_dive_metadata_sibling(dataset_folder, user, metadata_name):
    """Return a sibling metadata folder (same parent as ``dataset_folder``), if any."""
    parent, parent_type = _load_girder_folder_parent(dataset_folder, user)
    if parent is None:
        return None
    for sibling in Folder().childFolders(parent, parent_type, user=user):
        if not _is_dive_metadata_folder(sibling):
            continue
        if sibling['name'] == metadata_name:
            return sibling
    return None


def _create_dive_metadata_sibling_folder(dataset_folder, metadata_name, user):
    """Create a DIVE metadata folder next to ``dataset_folder`` (not inside it)."""
    parent, parent_type = _load_girder_folder_parent(dataset_folder, user)
    if parent is None:
        raise RestException(
            f'Could not resolve parent for folder "{dataset_folder.get("name", "")}"',
            code=400,
        )
    return Folder().createFolder(parent, metadata_name, parentType=parent_type)


def _folder_has_recursive_datasets(folder, user) -> bool:
    probe: list = []
    crud_dataset.get_recursive_datasets(folder, user, probe, limit=1)
    return len(probe) > 0


def _normalize_create_metadata_configs(displayConfig, ffprobeMetadata):
    display_config = _normalize_metadata_config(displayConfig, _CREATE_METADATA_DISPLAY_DEFAULT)
    ffprobe_metadata = _normalize_metadata_config(ffprobeMetadata, _CREATE_METADATA_FFPROBE_DEFAULT)
    return display_config, ffprobe_metadata


def _display_config_from_metadata_folder(metadata_folder):
    """Build display config for indexing from an existing DIVE metadata folder."""
    stored = metadata_folder.get('meta', {}).get(DIVEMetadataFilter) or {}
    display_config = _normalize_metadata_config(stored, _CREATE_METADATA_DISPLAY_DEFAULT)
    if stored.get('categoricalLimit') is not None:
        display_config['categoricalLimit'] = stored['categoricalLimit']
    return display_config


def _categorical_limit_from_metadata_folder(metadata_folder, display_config):
    return (
        metadata_folder.get('meta', {})
        .get(DIVEMetadataFilter, {})
        .get('categoricalLimit', display_config.get('categoricalLimit', 50))
    )


def _build_default_dataset_metadata_row(item, user, ffprobe_metadata):
    data = {
        'DIVE_DatasetId': str(item['_id']),
        'DIVE_Name': str(item['lowerName']),
        'DIVE_Path': path_util.getResourcePath('folder', item, user=user),
    }
    if ffprobe_metadata.get('import', False):
        ffmetadata = item.get('meta', {}).get('ffprobe_info', {})
        ffkeys = ffprobe_metadata.get('keys', [])
        for ff_metadata_key in ffkeys:
            if ffmetadata.get(ff_metadata_key) is not None:
                raw_value = ffmetadata[ff_metadata_key]
                try:
                    data[f'ffprobe_{ff_metadata_key}'] = float(raw_value)
                except (ValueError, TypeError):
                    data[f'ffprobe_{ff_metadata_key}'] = str(raw_value)
    sanitize_value_tree_for_girder_json(data, minmax_keys_to_zero=False)
    return data


def _apply_dive_metadata_folder_marker(base_folder, display_config, categorical_limit):
    base_folder['meta'][DIVEMetadataMarker] = True
    display_config['categoricalLimit'] = categorical_limit
    if display_config.get('hide', False) is False:
        display_config['hide'] = [""]
    _ensure_filter_lists_in_display_config(display_config)
    base_folder['meta'][DIVEMetadataFilter] = display_config
    Folder().save(base_folder)


def _populate_dive_metadata_folder(
    base_folder,
    root_folder,
    user,
    display_config,
    ffprobe_metadata,
    categorical_limit,
    replace_metadata=False,
):
    """
    Index datasets under ``root_folder`` into ``base_folder``.

    When ``replace_metadata`` is false, existing per-dataset rows and schema docs are left
    unchanged; only missing datasets are added and key stats are refreshed if needed.
    """
    dataset_list = []
    crud_dataset.get_recursive_datasets(root_folder, user, dataset_list)
    added = 0
    existing_count = 0
    metadata_keys = {}
    root_id = str(base_folder['_id'])
    for item in dataset_list:
        data = _build_default_dataset_metadata_row(item, user, ffprobe_metadata)
        existing_row = DIVE_Metadata().findOne(
            {'DIVEDataset': str(item['_id']), 'root': root_id}
        )
        if existing_row and not replace_metadata:
            existing_count += 1
            continue
        DIVE_Metadata().createMetadata(
            item,
            base_folder,
            user,
            data,
            replace=replace_metadata or existing_row is None,
        )
        added += 1
        _accumulate_flat_metadata_key_stats(metadata_keys, data)

    keys_doc = DIVE_MetadataKeys().findOne({'root': root_id})
    if replace_metadata or keys_doc is None:
        _finalize_metadata_keys_categories(metadata_keys, categorical_limit)
        DIVE_MetadataKeys().createMetadataKeys(
            base_folder,
            user,
            metadata_keys,
            replace=replace_metadata or keys_doc is None,
        )
    elif added > 0:
        refresh_metadata_keys_stats_from_stored_dive_metadata(base_folder, categorical_limit)

    if not _is_dive_metadata_folder(base_folder):
        _apply_dive_metadata_folder_marker(base_folder, display_config, categorical_limit)

    return {
        'added': added,
        'existing': existing_count,
        'datasetCount': len(dataset_list),
        'metadataKeys': metadata_keys,
    }


def _resolve_create_metadata_targets(resource_id, resource_type, user):
    if resource_type == 'collection':
        collection = Collection().load(
            resource_id,
            level=AccessType.WRITE,
            user=user,
            force=True,
        )
        if collection is None:
            raise RestException('Collection not found', code=404)
        return collection, 'collection'

    folder = Folder().load(
        resource_id,
        level=AccessType.WRITE,
        user=user,
        force=True,
    )
    if folder is None:
        raise RestException('Folder not found', code=404)
    if _is_dive_metadata_folder(folder):
        raise RestException(
            'Cannot create metadata inside an existing DIVE metadata folder',
            code=400,
        )
    return folder, 'folder'


def _list_immediate_child_folders(parent, parent_type, user):
    return list(Folder().childFolders(parent, parent_type, user=user))


def _bulk_import_row_is_matcher_key(key):
    """True for columns used only to locate a row (never stored via updateKey)."""
    return isinstance(key, str) and key.lower() in _BULK_IMPORT_SKIP_KEYS


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
    normalized_updates = []
    aggregated_descriptions = {}
    for entry in updates:
        norm, row_desc = normalize_metadata_row_for_storage(entry)
        normalized_updates.append(norm)
        merge_first_metadata_import_descriptions(aggregated_descriptions, row_desc)
    # Helper to infer type/category
    new_keys = {}
    for entry in normalized_updates:
        for key, value in entry.items():
            if key not in metadata_keys_doc["metadataKeys"]:
                if key not in new_keys:
                    new_keys[key] = set()
                new_keys[key].add(value)
    # Infer types/categories for new keys
    for key, values in new_keys.items():
        # CSV/partial rows often yield NaN for empty cells; min/max must stay JSON-finite.
        mm = safe_min_max(values)
        if mm is not None:
            category = 'numerical'
        elif any(isinstance(v, str) for v in values):
            category = 'categorical' if len(values) < categoricalLimit else 'search'
        else:
            category = 'search'
        info = {
            "category": category,
            "count": len(values),
        }
        if category == 'categorical':
            info['set'] = categorical_values_for_schema(values)
        elif category == 'numerical':
            info['range'] = {'min': mm[0], 'max': mm[1]}
        DIVE_MetadataKeys().addKey(rootFolder, user, key, info, unlocked=False)
    for entry in normalized_updates:
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
            # List matches once: the old code only set dive_metadata inside count() > 1, so a
            # unique Filename never matched and every row looked like "not_found".
            filename_matches = list(
                DIVE_Metadata().find(
                    {"filename": video_name, 'root': str(rootFolder["_id"])}
                )
            )
            if len(filename_matches) == 0:
                dive_metadata = None
            elif len(filename_matches) == 1:
                dive_metadata = filename_matches[0]
            else:
                dive_path = entry.get('DIVE_Path', False)
                if not dive_path:
                    reason = (
                        f"Multiple datasets found with videoName {video_name}, need DIVE_Path to disambiguate"
                    )
                else:
                    for item in filename_matches:
                        if item.get('DIVE_Path', False) == dive_path:
                            dive_metadata = item
                            break
                    if not dive_metadata:
                        reason = f"No dataset matched videoName {video_name} with DIVE_Path {dive_path}"
            if not dive_metadata and not reason:
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
                if _bulk_import_row_is_matcher_key(key):
                    continue
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
    if aggregated_descriptions:
        DIVE_MetadataKeys().mergeImportedKeyDescriptions(
            rootFolder, user, aggregated_descriptions
        )
    if any(r.get('status') in ('success', 'partial_success') for r in results):
        refresh_metadata_keys_stats_from_stored_dive_metadata(rootFolder, categoricalLimit)
    return results


def _ingest_job_progress(job, current, total, log=None):
    """Optional progress updates when running inside a Girder job."""
    if job is None:
        return
    from girder_worker.utils import JobStatus

    kwargs = {
        'progressCurrent': current,
        'progressTotal': total,
        'status': JobStatus.RUNNING,
    }
    if log:
        kwargs['log'] = log
    Job().updateJob(job, **kwargs)


def find_oldest_bulk_import_item(root_folder):
    """Return the oldest JSON/NDJSON/CSV item directly under the metadata root, or None."""
    unprocessed_items = Folder().childItems(
        root_folder,
        filters={
            "$or": [
                {"lowerName": {"$regex": jsonRegex}},
                {"lowerName": {"$regex": ndjsonRegex}},
                {"lowerName": {"$regex": csvRegex}},
            ]
        },
        sort=[("created", pymongo.ASCENDING)],
    )
    if unprocessed_items is None or unprocessed_items.count() == 0:
        return None
    return unprocessed_items[0]


def load_updates_from_item(item, girder_client=None):
    """Parse JSON / NDJSON / CSV updates from a Girder item's first file."""
    file = next(Item().childFiles(item), None)
    if file is None:
        raise RestException('No file found in the item to process.')
    file_string = read_girder_file_bytes(file, girder_client=girder_client).decode()
    name = file.get('name') or item.get('name') or ''
    if name.endswith('.json'):
        return _loads_metadata_import_json(file_string)
    if name.endswith('.ndjson'):
        return [_loads_metadata_import_json(line) for line in file_string.splitlines()]
    if name.endswith('.csv'):
        df = pd.read_csv(io.StringIO(file_string))
        return df.to_dict(orient='records')
    raise RestException(f'Unsupported bulk update file type: {name}')


def persist_bulk_updates_item(user, root_folder, updates):
    """Write a JSON body to a temp item under the metadata root for worker handoff."""
    item = Item().createItem(
        f'bulk_update_{datetime.now().isoformat()}.json',
        creator=user,
        folder=root_folder,
        reuseExisting=False,
    )
    json_bytes = json.dumps(updates).encode('utf-8')
    byte_io = io.BytesIO(json_bytes)
    Upload().uploadFromFile(
        byte_io,
        len(json_bytes),
        item['name'],
        parentType='item',
        parent=item,
        user=user,
        mimeType='application/json',
    )
    return item


def bulk_metadata_process_file(user, root_folder, updates, replace=False):
    """
    Snapshot current metadata, apply bulk updates, and write history on full success.
    """
    query = {'root': str(root_folder['_id'])}
    metadata_items = list(DIVE_Metadata().find(query, user=user))

    previous_data = []
    for item in metadata_items:
        export_item = item.get('metadata', {}).copy()
        export_item['DIVEDataset'] = str(item['DIVEDataset'])
        previous_data.append(export_item)

    results = bulk_metadata_update_process(user, root_folder, updates, replace)
    failed = any(
        item.get('status') in ('not_found', 'error', 'partial_success') for item in results
    )
    if failed:
        return results

    metadata_folder = Folder().findOne(
        {
            "name": DIVEMetadataHistoryMarker,
            "parent": str(root_folder["_id"]),
            f'meta.{DIVEMetadataHistoryMarker}': {'$in': TRUTHY_META_VALUES},
        },
        user=user,
        level=AccessType.WRITE,
    )
    if not metadata_folder:
        metadata_folder = Folder().createFolder(
            root_folder,
            DIVEMetadataHistoryMarker,
            reuseExisting=True,
            creator=user,
        )
        Folder().setMetadata(metadata_folder, {DIVEMetadataHistoryMarker: True})
    previous_item = Item().createItem(
        f'History_{datetime.now().isoformat()}.json',
        creator=user,
        folder=metadata_folder,
        reuseExisting=True,
    )
    json_bytes = json.dumps(previous_data).encode('utf-8')
    byte_io = io.BytesIO(json_bytes)
    Upload().uploadFromFile(
        byte_io,
        len(json_bytes),
        previous_item['name'],
        parentType="item",
        parent=previous_item,
        user=user,
        mimeType="application/json",
    )
    return results


def run_process_metadata_core(
    user,
    folder_id,
    sibling_path,
    file_type,
    matcher,
    path_key,
    display_config,
    ffprobe_metadata,
    categorical_limit,
    additive,
    job=None,
    girder_client=None,
):
    """NDJSON/JSON metadata ingest (former process_metadata request body)."""
    folder = Folder().load(folder_id, level=AccessType.WRITE, user=user, force=True)
    if folder is None:
        raise RestException('Folder not found', code=404)
    display_config = _normalize_metadata_config(
        display_config, _PROCESS_METADATA_DISPLAY_DEFAULT
    )
    ffprobe_metadata = _normalize_metadata_config(
        ffprobe_metadata, _PROCESS_METADATA_FFPROBE_DEFAULT
    )

    root_query = {"root": str(folder["_id"])}
    found = DIVE_Metadata().findOne(query=root_query, user=user)
    if found and additive is not True:
        DIVE_Metadata().removeWithQuery(root_query)
        DIVE_MetadataKeys().removeWithQuery(root_query)
        root_folder = Folder().setMetadata(
            folder, {DIVEMetadataMarker: None, DIVEMetadataFilter: None}
        )
        Folder().save(root_folder)

    search_folder = folder
    if sibling_path:
        found_folder = find_folder_by_path(folder, sibling_path, user)
        if found_folder:
            search_folder = found_folder

    data = None
    error_log = []
    added = 0
    data_file_name = ''
    if file_type in ['json', 'ndjson']:
        loaded = load_metadata_json(
            search_folder, file_type, girder_client=girder_client
        )
        if loaded:
            data, data_file_name = loaded
    if not data:
        raise RestException('No metadata JSON/NDJSON file found to process', code=404)

    metadata_keys = {}
    root_name = folder['name']
    key_import_descriptions = {}
    total = len(data)
    _ingest_job_progress(job, 0, total, log=f'Processing {total} metadata rows\n')

    for idx, raw_row in enumerate(data):
        item, row_desc = normalize_metadata_row_for_storage(raw_row)
        merge_first_metadata_import_descriptions(key_import_descriptions, row_desc)

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
            child_folders = list(Folder().childFolders(folder, 'folder', user=user))
            modified_key_paths = [
                {"root": root_name, "modified_path": base_modified_key_path}
            ]
            for child_folder in child_folders:
                modified_key_paths.append(
                    {
                        "root": child_folder["name"],
                        "modified_path": remove_before_folder(
                            key_path, child_folder['name']
                        ),
                    }
                )
            resource_path = ""
            for dataset_folder in results:
                resource_path = path_util.getResourcePath(
                    'folder', dataset_folder, user=user
                )
                for root_obj in modified_key_paths:
                    root = root_obj['root']
                    modified_path = root_obj['modified_path']
                    if modified_path is None:
                        continue
                    resource_path = remove_before_folder(resource_path, root)
                    if resource_path is None:
                        continue
                    resource_path = resource_path.replace(
                        f'/Video {item[matcher]}', f'/{item[matcher]}'
                    )
                    if modified_path:
                        if modified_path == resource_path:
                            item['pathMatches'] = True
                            item['DIVE_DatasetId'] = str(dataset_folder['_id'])
                            item['DIVE_Name'] = dataset_folder['lowerName']
                            item['DIVE_Path'] = resource_path
                            dataset_folder.get('name')
                            _ff_import = ffprobe_metadata.get('import', False)
                            if isinstance(_ff_import, str):
                                _ff_import = _ff_import.strip().lower() in (
                                    'true',
                                    '1',
                                    'yes',
                                )
                            if _ff_import:
                                ffmetadata = dataset_folder.get('meta', {}).get(
                                    'ffprobe_info', {}
                                )
                                ffkeys = ffprobe_metadata.get('keys', [])
                                if not isinstance(ffkeys, (list, tuple)):
                                    ffkeys = []
                                for ff_metadata_key in ffkeys:
                                    if ffmetadata.get(ff_metadata_key, False):
                                        item[f'ffprobe_{ff_metadata_key}'] = (
                                            ffmetadata.get(ff_metadata_key, False)
                                        )
                            sanitize_value_tree_for_girder_json(
                                item, minmax_keys_to_zero=False
                            )
                            DIVE_Metadata().createMetadata(
                                dataset_folder, folder, user, item
                            )
                            added += 1
                            matched = True
                            break
                        else:
                            item['pathMatches'] = False
                if matched:
                    break

            if not matched:
                error_log.append(
                    f"using matcher: {matcher} and key_path: {key_path} Could not find "
                    f"any matching key file path for Video file {item[matcher]} "
                    f"with path: {resource_path}"
                )
        else:
            error_log.append(f"Could not find any results for Video file {item[matcher]}")
        _accumulate_flat_metadata_key_stats(metadata_keys, item)
        if job is not None and (idx + 1) % 100 == 0:
            _ingest_job_progress(job, idx + 1, total)

    _finalize_metadata_keys_categories(metadata_keys, categorical_limit)
    _apply_imported_descriptions_to_metadata_keys(metadata_keys, key_import_descriptions)
    DIVE_MetadataKeys().createMetadataKeys(folder, user, metadata_keys)
    folder['meta'][DIVEMetadataMarker] = True
    display_config['categoricalLimit'] = categorical_limit
    _ensure_filter_lists_in_display_config(display_config)
    folder['meta'][DIVEMetadataFilter] = display_config
    Folder().save(folder)
    _ingest_job_progress(job, total, total, log=f'Added {added} folders\n')

    return {
        "dataFileName": data_file_name,
        "results": f"added {added} folders",
        "added": added,
        "errors": error_log,
        "metadataKeys": metadata_keys,
        "folderId": str(folder['_id']),
    }


def run_create_metadata_folder_core(
    user,
    parent_folder_id,
    name,
    root_folder_id,
    display_config,
    ffprobe_metadata,
    categorical_limit,
    job=None,
):
    parent = Folder().load(parent_folder_id, level=AccessType.WRITE, user=user, force=True)
    if parent is None:
        raise RestException('Parent folder not found', code=404)
    metadata_folder = _find_existing_dive_metadata_child(parent, user)
    base_folder = metadata_folder or Folder().createFolder(parent, name)
    root_folder = Folder().load(
        root_folder_id,
        level=AccessType.WRITE,
        user=user,
        force=True,
    )
    if root_folder is None:
        raise RestException('Root folder not found', code=404)
    display_config, ffprobe_metadata = _normalize_create_metadata_configs(
        display_config,
        ffprobe_metadata,
    )
    _ingest_job_progress(job, 0, 1, log='Indexing datasets into metadata folder\n')
    populate_result = _populate_dive_metadata_folder(
        base_folder,
        root_folder,
        user,
        display_config,
        ffprobe_metadata,
        categorical_limit,
        replace_metadata=False,
    )
    added = populate_result['added']
    _ingest_job_progress(job, 1, 1)
    return {
        "results": f"added {added} datasets",
        "errors": [],
        "metadataKeys": populate_result['metadataKeys'],
        "folderId": str(base_folder['_id']),
        "existing": populate_result['existing'],
        "added": added,
    }


def run_create_metadata_recursive_core(
    user,
    resource_id,
    resource_type,
    scope,
    name,
    parent_folder_id,
    display_config,
    ffprobe_metadata,
    categorical_limit,
    job=None,
):
    resource_type = (resource_type or 'folder').strip().lower()
    if resource_type not in ('folder', 'collection'):
        raise RestException('resourceType must be folder or collection', code=400)
    scope_norm = (scope or 'subfolders').strip().lower()
    if scope_norm not in ('single', 'subfolders'):
        raise RestException('scope must be single or subfolders', code=400)

    resource, parent_type = _resolve_create_metadata_targets(resource_id, resource_type, user)
    display_config, ffprobe_metadata = _normalize_create_metadata_configs(
        display_config,
        ffprobe_metadata,
    )
    created = []
    existing_results = []
    errors = []

    if scope_norm == 'single':
        if resource_type == 'collection':
            parent = resource
            parent_folder_type = 'collection'
            scan_roots = _list_immediate_child_folders(resource, 'collection', user)
        else:
            parent = Folder().load(
                parent_folder_id or resource_id,
                level=AccessType.WRITE,
                user=user,
                force=True,
            )
            parent_folder_type = 'folder'
            scan_roots = [resource]

        metadata_folder = _find_existing_dive_metadata_child(parent, user)
        reused_existing = metadata_folder is not None
        base_folder = metadata_folder or Folder().createFolder(
            parent, name, parentType=parent_folder_type
        )
        populate_result = {'added': 0, 'existing': 0}
        if resource_type == 'collection':
            if not scan_roots:
                errors.append(f'No folders under collection {resource["name"]}')
            for child in scan_roots:
                extra = _populate_dive_metadata_folder(
                    base_folder,
                    child,
                    user,
                    display_config,
                    ffprobe_metadata,
                    categorical_limit,
                    replace_metadata=False,
                )
                populate_result['added'] += extra['added']
                populate_result['existing'] += extra['existing']
        else:
            populate_result = _populate_dive_metadata_folder(
                base_folder,
                resource,
                user,
                display_config,
                ffprobe_metadata,
                categorical_limit,
                replace_metadata=False,
            )
        entry = {
            'rootFolderId': str(resource['_id']),
            'metadataFolderId': str(base_folder['_id']),
            'added': populate_result['added'],
            'existing': populate_result['existing'],
        }
        if reused_existing:
            entry['reusedExisting'] = True
        if reused_existing and populate_result['added'] == 0:
            existing_results.append({**entry, 'reason': 'existing_metadata_folder'})
        else:
            created.append(entry)
    else:
        child_folders = _list_immediate_child_folders(resource, parent_type, user)
        total = max(len(child_folders), 1)
        for idx, child in enumerate(child_folders):
            _ingest_job_progress(job, idx, total)
            if _is_dive_metadata_folder(child):
                existing_results.append(
                    {
                        'rootFolderId': str(child['_id']),
                        'reason': 'folder_is_metadata_root',
                    }
                )
                continue
            if not _folder_has_recursive_datasets(child, user):
                existing_results.append(
                    {
                        'rootFolderId': str(child['_id']),
                        'reason': 'no_datasets',
                    }
                )
                continue
            metadata_name = _metadata_folder_name_for_dataset_folder(child, name)
            metadata_folder = _find_existing_dive_metadata_sibling(child, user, metadata_name)
            if metadata_folder is None:
                metadata_folder = _find_existing_dive_metadata_child(child, user)
            reused_existing = metadata_folder is not None
            try:
                base_folder = metadata_folder or _create_dive_metadata_sibling_folder(
                    child, metadata_name, user
                )
            except RestException as exc:
                errors.append(f'{child["name"]}: {exc}')
                continue
            populate_result = _populate_dive_metadata_folder(
                base_folder,
                child,
                user,
                display_config,
                ffprobe_metadata,
                categorical_limit,
                replace_metadata=False,
            )
            entry = {
                'rootFolderId': str(child['_id']),
                'metadataFolderId': str(base_folder['_id']),
                'added': populate_result['added'],
                'existing': populate_result['existing'],
            }
            if reused_existing:
                entry['reusedExisting'] = True
            if reused_existing and populate_result['added'] == 0:
                existing_results.append({**entry, 'reason': 'existing_metadata_folder'})
            else:
                created.append(entry)
        _ingest_job_progress(job, total, total)

    return {
        'scope': scope_norm,
        'resourceType': resource_type,
        'resourceId': str(resource['_id']),
        'created': created,
        'existing': existing_results,
        'errors': errors,
    }


def run_index_metadata_folder_core(
    user,
    metadata_folder_id,
    root_folder_id,
    replace_metadata,
    ffprobe_metadata,
    job=None,
):
    folder = Folder().load(metadata_folder_id, level=AccessType.WRITE, user=user, force=True)
    if folder is None:
        raise RestException('Metadata folder not found', code=404)
    if not _is_dive_metadata_folder(folder):
        raise RestException('Folder is not a DIVE Metadata folder', code=400)
    root_folder = Folder().load(
        root_folder_id,
        level=AccessType.WRITE,
        user=user,
        force=True,
    )
    if root_folder is None:
        raise RestException('Root folder not found', code=404)
    display_config = _display_config_from_metadata_folder(folder)
    ffprobe_metadata = _normalize_metadata_config(
        ffprobe_metadata,
        _CREATE_METADATA_FFPROBE_DEFAULT,
    )
    categorical_limit = _categorical_limit_from_metadata_folder(folder, display_config)
    _ingest_job_progress(job, 0, 1, log='Indexing folder into metadata root\n')
    populate_result = _populate_dive_metadata_folder(
        folder,
        root_folder,
        user,
        display_config,
        ffprobe_metadata,
        categorical_limit,
        replace_metadata=replace_metadata is True,
    )
    _ingest_job_progress(job, 1, 1)
    return {
        'results': (
            f"indexed {populate_result['datasetCount']} datasets: "
            f"added {populate_result['added']}, skipped {populate_result['existing']} existing"
        ),
        'metadataFolderId': str(folder['_id']),
        'folderId': str(folder['_id']),
        'rootFolderId': str(root_folder['_id']),
        'added': populate_result['added'],
        'existing': populate_result['existing'],
        'datasetCount': populate_result['datasetCount'],
    }


def run_bulk_update_from_item_core(
    user,
    root_folder_id,
    item_id,
    replace=False,
    job=None,
    girder_client=None,
):
    root_folder = Folder().load(root_folder_id, level=AccessType.WRITE, user=user, force=True)
    if root_folder is None:
        raise RestException('Folder not found', code=404)
    if root_folder['meta'].get(DIVEMetadataMarker, False) is False:
        raise RestException('Folder is not a DIVE Metadata folder', code=404)
    item = Item().load(item_id, level=AccessType.WRITE, user=user, force=True)
    if item is None:
        raise RestException('Import item not found', code=404)
    _ingest_job_progress(job, 0, 2, log=f'Loading bulk update file {item.get("name")}\n')
    updates = load_updates_from_item(item, girder_client=girder_client)
    Item().remove(item)
    _ingest_job_progress(job, 1, 2, log=f'Applying {len(updates)} bulk update rows\n')
    results = bulk_metadata_process_file(user, root_folder, updates, replace)
    _ingest_job_progress(job, 2, 2)
    return {
        'results': results,
        'folderId': str(root_folder['_id']),
        'rowCount': len(updates) if isinstance(updates, list) else None,
    }


