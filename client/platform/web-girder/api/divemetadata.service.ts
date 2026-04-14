import girderRest from 'platform/web-girder/plugins/girder';
import type { JobResponse } from 'vue-girder-slicer-cli-ui/dist/api/girderSlicerApi';
import type { GirderModelBase } from 'vue-girder-slicer-cli-ui/dist/girderTypes';
import type { XMLBaseValue } from 'vue-girder-slicer-cli-ui/dist/parser/parserTypes';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';

export interface MetadataFilterItem {
    category: 'search' | 'categorical' | 'numerical' | 'boolean',
    value?: boolean | string | string[] | number | number[]
    range?: number[]
    regEx?: boolean;
}

export interface FilterDisplayConfig {
    /** Keys shown as main columns on the metadata search page (list view). */
    display: string[];
    /** Keys hidden from the list view Advanced section (and not in main columns). */
    hide: string[];
    /** Preferred display order for metadata keys across metadata UIs. */
    order?: string[];
    /** Optional key groups used to organize metadata fields in UI. */
    groups?: MetadataKeyGroup[];
    /**
     * Keys shown in the primary filter row. If omitted, `display` is used (legacy).
     */
    filterDisplay?: string[];
    /**
     * Keys excluded from the filter UI. If omitted, `hide` is used (legacy).
     */
    filterHide?: string[];
    categoricalLimit: number;
    slicerCLI: 'Disabled' | 'Owner' | 'All Users'
}

export interface MetadataKeyGroup {
  id: string;
  name: string;
  description?: string;
  keys: string[];
}

export function effectiveFilterLists(config: FilterDisplayConfig): { filterDisplay: string[]; filterHide: string[] } {
  return {
    filterDisplay: config.filterDisplay !== undefined ? config.filterDisplay : (config.display || []),
    filterHide: config.filterHide !== undefined ? config.filterHide : (config.hide || []),
  };
}

export function orderMetadataKeys(keys: string[], config: FilterDisplayConfig): string[] {
  const uniqueKeys = Array.from(new Set(keys));
  const preferredOrder = config.order || [];
  const orderedKeys: string[] = [];
  preferredOrder.forEach((key) => {
    if (uniqueKeys.includes(key)) {
      orderedKeys.push(key);
    }
  });
  uniqueKeys.forEach((key) => {
    if (!orderedKeys.includes(key)) {
      orderedKeys.push(key);
    }
  });
  return orderedKeys;
}

export function partitionMetadataKeys(
  keys: string[],
  config: FilterDisplayConfig,
  options?: { includeEmptyGroups?: boolean },
): { groups: MetadataKeyGroup[]; ungrouped: string[] } {
  const includeEmptyGroups = options?.includeEmptyGroups || false;
  const orderedKeys = orderMetadataKeys(keys, config);
  const orderedKeySet = new Set(orderedKeys);
  const assigned = new Set<string>();
  const grouped = (config.groups || [])
    .map((group) => {
      const groupKeySet = new Set(group.keys || []);
      const groupKeys = orderedKeys.filter((key) => (
        orderedKeySet.has(key)
        && groupKeySet.has(key)
        && !assigned.has(key)
      ));
      groupKeys.forEach((key) => assigned.add(key));
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        keys: groupKeys,
      };
    })
    .filter((group) => includeEmptyGroups || group.keys.length > 0);
  const ungrouped = orderedKeys.filter((key) => !assigned.has(key));
  return { groups: grouped, ungrouped };
}

export interface MetadataFilterKeysItem {
    category: 'search' | 'categorical' | 'numerical' | 'boolean';
    count: number;
    unique: number;
    regEx?: boolean;
    set?: string[] | number[];
    range?: {
        min: number,
        max: number;
    };
    /** Optional human-readable explanation of this metadata field. */
    description?: string;

}

export interface DIVEMetadataFilter {
    search?: string;
    searchRegEx?: boolean;
    metadataFilters?: Record<string, MetadataFilterItem>;
}

export interface DIVEMetadataFilterValueResults {
    _id: string;
    created: string;
    root: string;
    metadataKeys: Record<string, MetadataFilterKeysItem>;
    unlocked: string[];
}

export interface DIVEMetadataResults {
    pageResults: MetadataResultItem[];
    totalPages: number;
    filtered: number;
    count: number;
}

export interface MetadataResultItem {
    DIVEDataset: string;
    filename: string;
    root: string;
    metadata: StringKeyObject;
}

function getMetadataFilterValues(folderId: string, keys?: string[]) {
  return girderRest.get<DIVEMetadataFilterValueResults>(`dive_metadata/${folderId}/metadata_keys`, {
    params: { keys },
  });
}

function filterDiveMetadata(folderId: string, filters: DIVEMetadataFilter, offset = 0, limit = 50, sort = 'filename', sortdir = 1) {
  return girderRest.get<DIVEMetadataResults>(`dive_metadata/${folderId}/filter`, {
    params: {
      filters, offset, limit, sort, sortdir,
    },
  });
}

/** Metadata fields for the current dataset row under a metadata root (same lookup as DatasetInfo). */
async function getDiveDatasetMetadataRow(
  metadataRootId: string,
  datasetFolderId: string,
): Promise<StringKeyObject | null> {
  const { data } = await filterDiveMetadata(
    metadataRootId,
    {
      metadataFilters: {
        DIVE_DatasetId: {
          category: 'search',
          value: datasetFolderId,
        },
      },
    },
    0,
    1,
  );
  const row = data.pageResults?.[0];
  if (!row?.metadata) {
    return null;
  }
  return row.metadata;
}

function createDiveMetadataClone(folder: string, filters: DIVEMetadataFilter, destFolder: string) {
  return girderRest.post<string>(`dive_metadata/${folder}/clone_filter`, null, {
    params: {
      baseFolder: folder, filters, destFolder,
    },
  });
}

export interface createDiveMetadataResponse {
  'results': string,
  'errors': string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'metadataKeys': any[];
  'folderId': string;

}

function createDiveMetadataFolder(
  parentFolder: string,
  name: string,
  rootFolderId: string,
  categoricalLimit = 50,
  displayConfig = {
    display: ['DIVE_DatasetId', 'DIVE_Name'],
  },
  ffprobeMetadata = {
    import: true, keys: ['width', 'height', 'display_aspect_ratio', 'nb_frames', 'duration'],
  },
) {
  return girderRest.post<createDiveMetadataResponse>(`dive_metadata/create_metadata_folder/${parentFolder}`, null, {
    params: {
      name, rootFolderId, categoricalLimit, displayConfig, ffprobeMetadata,
    },
  });
}

function modifyDiveMetadataPermission(rootMetadataFolder: string, key: string, unlocked: boolean) {
  return girderRest.patch(`dive_metadata/${rootMetadataFolder}/modify_key_permission`, null, {
    params: {
      key, unlocked,
    },
  });
}

function addDiveMetadataKey(
  rootMetadataFolder: string,
  key: string,
  category: 'numerical' | 'categorical' | 'search' | 'boolean',
  unlocked = false,
  valueList: string[] = [],
  defaultValue?: number | string | boolean,
  description?: string,
) {
  const values = valueList.length ? valueList.join(',') : undefined;
  const desc = description?.trim();
  return girderRest.put(`dive_metadata/${rootMetadataFolder}/add_key`, null, {
    params: {
      key, category, unlocked, values, default_value: defaultValue, description: desc || undefined,
    },
  });
}

function updateDiveMetadataKeyDescription(rootMetadataFolder: string, key: string, description: string) {
  return girderRest.patch(`dive_metadata/${rootMetadataFolder}/key_description`, null, {
    params: {
      key,
      description: description.trim(),
    },
  });
}

function deleteDiveMetadataKey(rootMetadataFolder:string, key: string, removeValues = false) {
  return girderRest.delete(`dive_metadata/${rootMetadataFolder}/delete_key`, {
    params: {
      key,
      removeValues,
    },
  });
}

function deleteDiveDatasetMetadataKey(diveDatasetId: string, rootId: string, key: string) {
  return girderRest.delete(`dive_metadata/${diveDatasetId}`, { params: { key, rootId } });
}
function setDiveDatasetMetadataKey(diveDatasetId: string, rootId: string, key: string, updateValue?: number | string | boolean) {
  const value = updateValue === undefined ? null : updateValue;
  return girderRest.patch(`dive_metadata/${diveDatasetId}`, null, {
    params: {
      key, value, rootId,
    },
  });
}

async function updateDiveMetadataDisplay(folderId: string, key: string, state: 'display' | 'hidden' | 'none') {
  const resp = await girderRest.get<GirderModelBase>(`folder/${folderId}`);
  const DIVEMetadataFilter = resp.data.meta.DIVEMetadataFilter as FilterDisplayConfig;
  if (DIVEMetadataFilter) {
    const { display } = DIVEMetadataFilter;
    const { hide } = DIVEMetadataFilter;
    if (display.includes(key)) {
      display.splice(display.findIndex((item) => item === key), 1);
    }
    if (hide.includes(key)) {
      hide.splice(hide.findIndex((item) => item === key), 1);
    }
    if (state === 'display') {
      display.push(key);
    }
    if (state === 'hidden') {
      hide.push(key);
    }
    await girderRest.put(`folder/${folderId}/metadata`, { DIVEMetadataFilter });
  }
}

async function updateDiveMetadataFilterVisibility(folderId: string, key: string, state: 'display' | 'hidden' | 'none') {
  const resp = await girderRest.get<GirderModelBase>(`folder/${folderId}`);
  const DIVEMetadataFilter = resp.data.meta.DIVEMetadataFilter as FilterDisplayConfig;
  if (DIVEMetadataFilter) {
    let filterDisplay: string[];
    let filterHide: string[];
    if (DIVEMetadataFilter.filterDisplay === undefined && DIVEMetadataFilter.filterHide === undefined) {
      filterDisplay = [...(DIVEMetadataFilter.display || [])];
      filterHide = [...(DIVEMetadataFilter.hide || [])];
    } else {
      filterDisplay = [...(DIVEMetadataFilter.filterDisplay ?? DIVEMetadataFilter.display ?? [])];
      filterHide = [...(DIVEMetadataFilter.filterHide ?? DIVEMetadataFilter.hide ?? [])];
    }
    DIVEMetadataFilter.filterDisplay = filterDisplay;
    DIVEMetadataFilter.filterHide = filterHide;
    if (filterDisplay.includes(key)) {
      filterDisplay.splice(filterDisplay.findIndex((item) => item === key), 1);
    }
    if (filterHide.includes(key)) {
      filterHide.splice(filterHide.findIndex((item) => item === key), 1);
    }
    if (state === 'display') {
      filterDisplay.push(key);
    }
    if (state === 'hidden') {
      filterHide.push(key);
    }
    await girderRest.put(`folder/${folderId}/metadata`, { DIVEMetadataFilter });
  }
}

async function updateDiveMetadataSlicerConfig(folderId:string, value: 'Disabled' | 'Owner' | 'All Users') {
  const resp = await girderRest.get<GirderModelBase>(`folder/${folderId}`);
  const DIVEMetadataFilter = resp.data.meta.DIVEMetadataFilter as FilterDisplayConfig;
  if (DIVEMetadataFilter) {
    DIVEMetadataFilter.slicerCLI = value;
    await girderRest.put(`folder/${folderId}/metadata`, { DIVEMetadataFilter });
  }
}

async function updateDiveMetadataOrder(folderId: string, order: string[], groups?: MetadataKeyGroup[]) {
  const resp = await girderRest.get<GirderModelBase>(`folder/${folderId}`);
  const DIVEMetadataFilter = resp.data.meta.DIVEMetadataFilter as FilterDisplayConfig;
  if (DIVEMetadataFilter) {
    DIVEMetadataFilter.order = order;
    if (groups !== undefined) {
      DIVEMetadataFilter.groups = groups;
    }
    await girderRest.put(`folder/${folderId}/metadata`, { DIVEMetadataFilter });
  }
}

async function runSlicerMetadataTask(rootId: string, taskId: string, filters: DIVEMetadataFilter, params: Record<string, XMLBaseValue>) {
  return girderRest.post<JobResponse>(`dive_metadata/${rootId}/slicer-cli-task`, { taskId, filterParams: { filters, params } }, { params: { taskId, filterParams: { filters, params } } });
}

async function exportDiveMetadata(folderId: string, filters: DIVEMetadataFilter, format: 'csv' | 'json', baseUrl?: string) {
  const response = await girderRest.post(`dive_metadata/${folderId}/export`, null, {
    params: { format, filters, baseURL: baseUrl },
    responseType: 'blob',
  });

  const blob = new Blob([response.data], {
    type: format === 'csv' ? 'text/csv' : 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `metadata_export.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function putDiveMetadataLastModified(folderId:string, rootId: string) {
  return girderRest.put(`dive_metadata/${folderId}/last_modified`, null, { params: { rootId } });
}

async function processImportedFile(rootId:string, replace = false) {
  return girderRest.post(`dive_metadata/bulk_update_file/${rootId}`, null, { params: { replace } });
}

interface HTMLFile extends File {
  webkitRelativePath?: string;
}

async function importMetadataFile(parentId: string, path: string, file?: HTMLFile, replace = false) {
  if (file === undefined) {
    return false;
  }
  const resp = await girderRest.post('/file', null, {
    params: {
      parentType: 'folder',
      parentId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
    },
  });
  if (resp.status === 200) {
    const uploadResponse = await girderRest.post('file/chunk', file, {
      params: {
        uploadId: resp.data._id,
        offset: 0,
      },
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    if (uploadResponse.status === 200) {
      const final = await processImportedFile(parentId, replace);
      return final.status === 200;
    }
  }
  return false;
}

export {
  getMetadataFilterValues,
  filterDiveMetadata,
  getDiveDatasetMetadataRow,
  createDiveMetadataClone,
  createDiveMetadataFolder,
  modifyDiveMetadataPermission,
  addDiveMetadataKey,
  updateDiveMetadataKeyDescription,
  deleteDiveMetadataKey,
  deleteDiveDatasetMetadataKey,
  setDiveDatasetMetadataKey,
  updateDiveMetadataDisplay,
  updateDiveMetadataFilterVisibility,
  updateDiveMetadataSlicerConfig,
  updateDiveMetadataOrder,
  runSlicerMetadataTask,
  exportDiveMetadata,
  putDiveMetadataLastModified,
  processImportedFile,
  importMetadataFile,
};
