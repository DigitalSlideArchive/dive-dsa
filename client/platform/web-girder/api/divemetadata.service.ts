import girderRest from 'platform/web-girder/plugins/girder';
import { JobResponse } from 'vue-girder-slicer-cli-ui/dist/api/girderSlicerApi';
import { GirderModelBase } from 'vue-girder-slicer-cli-ui/dist/girderTypes';
import { XMLBaseValue } from 'vue-girder-slicer-cli-ui/dist/parser/parserTypes';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';

export interface MetadataFilterItem {
    category: 'search' | 'categorical' | 'numerical' | 'boolean',
    value?: boolean | string | string[] | number | number[]
    range?: number[]
    regEx?: boolean;
}

export interface FilterDisplayConfig {
    display: string[];
    hide: string[];
    categoricalLimit: number;
    slicerCLI: 'Disabled' | 'Owner' | 'All Users'
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
    import: true, keys: ['width', 'height', 'display_aspect_ratio'],
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

function addDiveMetadataKey(rootMetadataFolder: string, key: string, category: 'numerical' | 'categorical' | 'search' | 'boolean', unlocked = false, valueList: string[] = [], defaultValue?: number | string | boolean) {
  const values = valueList.length ? valueList.join(',') : undefined;
  return girderRest.put(`dive_metadata/${rootMetadataFolder}/add_key`, null, {
    params: {
      key, category, unlocked, values, default_value: defaultValue,
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

function deleteDiveDatasetMetadataKey(diveDatasetId: string, key: string) {
  return girderRest.delete(`dive_metadata/${diveDatasetId}`, { params: { key } });
}
function setDiveDatasetMetadataKey(diveDatasetId: string, key: string, updateValue?: number | string | boolean) {
  const value = updateValue === undefined ? null : updateValue;
  return girderRest.patch(`dive_metadata/${diveDatasetId}`, null, {
    params: {
      key, value,
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

async function updateDiveMetadataSlicerConfig(folderId:string, value: 'Disabled' | 'Owner' | 'All Users') {
  const resp = await girderRest.get<GirderModelBase>(`folder/${folderId}`);
  const DIVEMetadataFilter = resp.data.meta.DIVEMetadataFilter as FilterDisplayConfig;
  if (DIVEMetadataFilter) {
    DIVEMetadataFilter.slicerCLI = value;
    await girderRest.put(`folder/${folderId}/metadata`, { DIVEMetadataFilter });
  }
}

async function runSlicerMetadataTask(rootId: string, taskId: string, filters: DIVEMetadataFilter, params: Record<string, XMLBaseValue>) {
  return girderRest.post<JobResponse>(`dive_metadata/${rootId}/slicer-cli-task`, { taskId, filterParams: { filters, params } }, { params: { taskId, filterParams: { filters, params } } });
}

async function exportDiveMetadata(folderId: string, filters: DIVEMetadataFilter, format: 'csv' | 'json') {
  const response = await girderRest.post(`dive_metadata/${folderId}/export`, filters, {
    params: { format },
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

export {
  getMetadataFilterValues,
  filterDiveMetadata,
  createDiveMetadataClone,
  createDiveMetadataFolder,
  modifyDiveMetadataPermission,
  addDiveMetadataKey,
  deleteDiveMetadataKey,
  deleteDiveDatasetMetadataKey,
  setDiveDatasetMetadataKey,
  updateDiveMetadataDisplay,
  updateDiveMetadataSlicerConfig,
  runSlicerMetadataTask,
  exportDiveMetadata,
};
