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
}

export interface MetadataFilterKeysItem {
    category: 'search' | 'categorical' | 'numerical' | 'boolean';
    count: number;
    set?: string[] | number[];
    range?: {
        min: number,
        max: number;
    };

}

export interface DIVEMetadaFilter {
    search?: string;
    metadataFilters?: Record<string, MetadataFilterItem>;
}

export interface DIVEMetadataFilterValueResults {
    _id: string;
    created: string;
    root: string;
    metadataKeys: Record<string, MetadataFilterKeysItem>;
}

export interface DIVEMetadataResults {
    pageResults: MetadataResultItem[];
    totalPages: number;
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

function filterDiveMetadata(folderId: string, filters: DIVEMetadaFilter, offset = 0, limit = 50, sort = 'filename', sortdir = -1) {
  return girderRest.get<DIVEMetadataResults>(`dive_metadata/${folderId}/filter`, {
    params: {
      filters, offset, limit, sort, sortdir,
    },
  });
}

function createDiveMetadataClone(folderId: string, filters: DIVEMetadaFilter, destFolder: string, destName: string) {
  return girderRest.get<string>(`dive_metadata/${folderId}/filter`, {
    params: {
      filters, destFolder, destName,
    },
  });
}

export {
  getMetadataFilterValues,
  filterDiveMetadata,
  createDiveMetadataClone,
};
