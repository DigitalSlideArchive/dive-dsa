import girderRest from 'platform/web-girder/plugins/girder';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';

export interface MetadataFilterItem {
    category: 'search' | 'categorical' | 'numerical' | 'boolean',
    value?: boolean | string | string[] | number | number[]
    range?: number[]
}

export interface FilterDisplayConfig {
    display: string[];
    hide: string[];
    categoricalLimit: number;
}

export interface MetadataFilterKeysItem {
    category: 'search' | 'categorical' | 'numerical' | 'boolean';
    count: number;
    unique: number;
    set?: string[] | number[];
    range?: {
        min: number,
        max: number;
    };

}

export interface DIVEMetadataFilter {
    search?: string;
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
  return girderRest.post<DIVEMetadataResults>(`dive_metadata/create_metadata_folder/${parentFolder}`, null, {
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

function addDiveMetadataKey(rootMetadataFolder: string, key: string, category: 'numerical' | 'categorical' | 'search' | 'boolean', unlocked = false, values = []) {
  return girderRest.put(`dive_metadata/${rootMetadataFolder}/add_key`, null, {
    params: {
      key, category, unlocked, values,
    },
  });
}

function deleteDiveMetadataKey(rootMetadataFolder:string, key: string) {
  return girderRest.delete(`dive_metadata/${rootMetadataFolder}/delete_key`, {
    params: {
      key,
    },
  });
}

function deleteDiveDatasetMetadataKey(diveDatasetId: string, key: string) {
  return girderRest.delete(`dive_metadata/${diveDatasetId}`, { params: { key } });
}
function setDiveDatasetMetadataKey(diveDatasetId: string, key: string, value: number | string | boolean) {
  return girderRest.patch(`dive_metadata/${diveDatasetId}`, {
    params: {
      key, value,
    },
  });
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
};
