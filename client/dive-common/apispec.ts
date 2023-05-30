import { provide } from '@vue/composition-api';
import { AnnotationId } from 'vue-media-annotator/BaseAnnotation';
import { GroupData } from 'vue-media-annotator/Group';

import { use } from 'vue-media-annotator/provides';
import { TrackData } from 'vue-media-annotator/track';
import {
  Attribute, AttributeFilter,
  SwimlaneGraph, TimelineGraph,
} from 'vue-media-annotator/use/AttributeTypes';
import { CustomStyle } from 'vue-media-annotator/StyleManager';
import { Configuration, DiveConfiguration } from 'vue-media-annotator/ConfigurationManager';

type DatasetType = 'image-sequence' | 'video' | 'multi';
type MultiTrackRecord = Record<string, TrackData>;
type MultiGroupRecord = Record<string, GroupData>;
type SubType = 'stereo' | 'multicam' | null; // Additional type info used for UI display enabled pipelines

interface AnnotationSchema {
  version: number;
  tracks: MultiTrackRecord;
  groups: MultiGroupRecord;
}

/**
 * Variation on AnnotationSchema where annotations are lists
 * instead of objects, used for convenience with pagination.
 */
interface AnnotationSchemaList {
  version: number;
  tracks: TrackData[];
  groups: GroupData[];
}

interface SaveDetectionsArgs {
  tracks: {
    delete: AnnotationId[];
    upsert: TrackData[];
  };
  groups: {
    delete: AnnotationId[];
    upsert: GroupData[];
  };
}

interface SaveAttributeArgs {
  delete: string[];
  upsert: Attribute[];
}

interface SaveTimelineArgs {
  delete: string[];
  upsert: TimelineGraph[];
}
interface SaveSwimlaneArgs {
  delete: string[];
  upsert: SwimlaneGraph[];
}

interface SaveFilterArgs {
  delete: string[];
  upsert: AttributeFilter[];
}

interface FrameImage {
  url: string;
  filename: string;
}

export interface MultiCamImportFolderArgs {
  defaultDisplay: string; // In multicam the default camera to display
  sourceList: Record<string, {
    sourcePath: string;
    trackFile: string;
  }>; // path/track file per camera
  calibrationFile?: string; // NPZ calibation matrix file
  type: 'image-sequence' | 'video';
}

export interface MultiCamImportKeywordArgs {
  defaultDisplay: string; // In multicam the default camera to display
  sourcePath: string; // Base folder used for import, globList will filter folder
  globList: Record<string, {
    glob: string;
    trackFile: string;
  }>; // glob pattern for base folder
  calibrationFile?: string; // NPZ calibation matrix file
  type: 'image-sequence'; // Always image-sequence type for glob matching
}

export type MultiCamImportArgs = MultiCamImportFolderArgs | MultiCamImportKeywordArgs;

interface MultiCamMedia {
  cameras: Record<string, {
    type: DatasetType;
    imageData: FrameImage[];
    videoUrl: string;
  }>;
  defaultDisplay: string; // Default camera for displaying the MultiCamMedia
}

interface MediaImportResponse {
  jsonMeta: {
    originalImageFiles: string[];
  };
  globPattern: string;
  mediaConvertList: string[];
}


/**
 * The parts of metadata a user should be able to modify.
 */
interface DatasetMetaMutable {
  customTypeStyling?: Record<string, CustomStyle>;
  customGroupStyling?: Record<string, CustomStyle>;
  confidenceFilters?: Record<string, number>;
  attributes?: Readonly<Record<string, Attribute>>;
  timelines?: Readonly<Record<string, TimelineGraph>>;
  swimlanes?: Readonly<Record<string, SwimlaneGraph>>;
  filters?: Readonly<Record<string, AttributeFilter>>;
  configuration?: Configuration;
}
const DatasetMetaMutableKeys = ['attributes', 'confidenceFilters', 'customTypeStyling', 'customGroupStyling', 'timelines', 'swimlanes'];


interface DatasetMeta {
  id: Readonly<string>;
  imageData: Readonly<FrameImage[]>;
  videoUrl: Readonly<string | undefined>;
  type: Readonly<DatasetType | 'multi'>;
  fps: Readonly<number>; // this will become mutable in the future.
  name: Readonly<string>;
  createdAt: Readonly<string>;
  originalFps?: Readonly<number>;
  subType: Readonly<SubType>; // In future this could have stuff like IR/EO
  multiCamMedia: Readonly<MultiCamMedia | null>;
}

interface Api {

  loadMetadata(datasetId: string): Promise<{
    metadata: DatasetMeta & DatasetMetaMutable;
    diveConfig: DiveConfiguration & {metadata: DatasetMetaMutable};
}>;
  loadDetections(datasetId: string, revision?: number): Promise<AnnotationSchemaList>;

  saveDetections(datasetId: string, args: SaveDetectionsArgs): Promise<unknown>;
  saveMetadata(datasetId: string, metadata: DatasetMetaMutable): Promise<unknown>;
  saveAttributes(datasetId: string, args: SaveAttributeArgs): Promise<unknown>;
  saveTimelines(datasetId: string, args: SaveTimelineArgs): Promise<unknown>;
  saveSwimlanes(datasetId: string, args: SaveSwimlaneArgs): Promise<unknown>;
  saveFilters(datasetId: string, args: SaveFilterArgs): Promise<unknown>;
  saveConfiguration(datasetId: string, args: DiveConfiguration['metadata']['configuration']): Promise<unknown>;
  transferConfiguration(source: string, dest: string): Promise<unknown>;
  // Non-Endpoint shared functions
  openFromDisk(datasetType: DatasetType | 'calibration' | 'annotation' | 'text' | 'zip', directory?: boolean):
    Promise<{canceled?: boolean; filePaths: string[]; fileList?: File[]; root?: string}>;
    importAnnotationFile(id: string, path: string, file?: File,
      additive?: boolean, additivePrepend?: string): Promise<boolean>;
  }
const ApiSymbol = Symbol('api');

/**
 * provideApi specifies an implementation of the data persistence interface
 * for use in vue-web-common
 * @param api an api implementation
 */
function provideApi(api: Api) {
  provide(ApiSymbol, api);
}

function useApi() {
  return use<Readonly<Api>>(ApiSymbol);
}

export {
  provideApi,
  useApi,
};

export {
  AnnotationSchema,
  Api,
  DatasetMeta,
  DatasetMetaMutable,
  DatasetMetaMutableKeys,
  DatasetType,
  SubType,
  FrameImage,
  MultiTrackRecord,
  MultiGroupRecord,
  SaveDetectionsArgs,
  SaveAttributeArgs,
  SaveTimelineArgs,
  SaveSwimlaneArgs,
  SaveFilterArgs,
  MultiCamMedia,
  MediaImportResponse,
};
