import type { GirderModel } from '@girder/components/src';

import {
  DatasetMetaMutable, FrameImage, SaveTimelineArgs,
  SaveAttributeArgs, SaveFilterArgs, SaveSwimlaneArgs,
  SaveStylingArgs,
} from 'dive-common/apispec';
import { GirderMetadataStatic } from 'platform/web-girder/constants';
import girderRest from 'platform/web-girder/plugins/girder';
import { DiveConfiguration } from 'vue-media-annotator/ConfigurationManager';
import { postProcess } from './rpc.service';

interface HTMLFile extends File {
  webkitRelativePath?: string;
}

function getDataset(folderId: string) {
  return girderRest.get<GirderMetadataStatic>(`dive_dataset/${folderId}`);
}

function getDiveConfiguration(folderId: string) {
  return girderRest.get<DiveConfiguration>(`dive_dataset/${folderId}/configuration`);
}

async function getDatasetList(
  limit?: number,
  offset?: number,
  sort?: string,
  sortDir?: number,
  shared?: boolean,
  published?: boolean,
) {
  const response = await girderRest.get<GirderModel[]>('dive_dataset', {
    params: {
      limit,
      offset,
      sort,
      sortDir,
      shared,
      published,
    },
  });
  response.data.forEach((element) => {
    // eslint-disable-next-line no-param-reassign
    element._modelType = 'folder';
  });
  return response;
}

interface MediaResource extends FrameImage {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  fileId?: string;
}

export interface DatasetSourceMedia {
  imageData: MediaResource[];
  video?: MediaResource;
  overlays?: MediaResource[];
  masks?: MediaResource[];
}

export interface DatasetTaskDefaults {
  imageData: MediaResource[];
  video?: MediaResource;
  overlays?: MediaResource[];
  folderName: string;
}

function getDatasetMedia(folderId: string) {
  return girderRest.get<DatasetSourceMedia>(`dive_dataset/${folderId}/media`);
}

function getTaskDefaults(folderId: string) {
  return girderRest.get<DatasetTaskDefaults>(`dive_dataset/${folderId}/task-defaults`);
}

function clone({
  folderId, name, parentFolderId, revision,
}: {
  folderId: string;
  parentFolderId: string;
  name: string;
  revision?: number;
}) {
  return girderRest.post<GirderModel>('dive_dataset', null, {
    params: {
      cloneId: folderId, parentFolderId, name, revision,
    },
  });
}

function makeViameFolder({
  folderId, name, fps, type,
}: {
  folderId: string;
  name: string;
  fps: number;
  type: string;
}) {
  return girderRest.post(
    '/folder',
    `metadata=${JSON.stringify({
      fps,
      type,
    })}`,
    {
      params: { parentId: folderId, name },
    },
  );
}

async function importAnnotationFile(parentId: string, path: string, file?: HTMLFile, additive = false, additivePrepend = '') {
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
      let skipJobs = false;
      if (path.endsWith('.json') || path.endsWith('.csv')) {
        skipJobs = true;
      }
      const final = await postProcess(parentId, skipJobs, false, additive, additivePrepend);
      return final.status === 200;
    }
  }
  return false;
}

function saveAttributes(folderId: string, args: SaveAttributeArgs) {
  return girderRest.patch(`/dive_dataset/${folderId}/attributes`, args);
}
function saveStyling(folderId: string, args: SaveStylingArgs) {
  return girderRest.patch(`/dive_dataset/${folderId}/styling`, args);
}

function saveTimelines(folderId: string, args: SaveTimelineArgs) {
  return girderRest.patch(`/dive_dataset/${folderId}/timelines`, args);
}

function saveSwimlanes(folderId: string, args: SaveSwimlaneArgs) {
  return girderRest.patch(`/dive_dataset/${folderId}/swimlanes`, args);
}

function saveFilters(folderId: string, args: SaveFilterArgs) {
  return girderRest.patch(`/dive_dataset/${folderId}/filters`, args);
}

function saveConfiguration(folderId: string, config: DiveConfiguration['metadata']['configuration']) {
  return girderRest.patch(`/dive_dataset/${folderId}/configuration`, config);
}
function transferConfiguration(source: string, dest: string) {
  return girderRest.post(`/dive_dataset/${source}/transfer_config/${dest}`);
}

function saveMetadata(folderId: string, metadata: DatasetMetaMutable) {
  return girderRest.patch(`/dive_dataset/${folderId}`, metadata);
}

interface ValidationResponse {
  ok: boolean;
  type: 'video' | 'image-sequence';
  media: string[];
  annotations: string[];
  message: string;
}

function validateUploadGroup(names: string[]) {
  return girderRest.post<ValidationResponse>('dive_dataset/validate_files', names);
}

export {
  clone,
  getDataset,
  getDatasetList,
  getDatasetMedia,
  getTaskDefaults,
  getDiveConfiguration,
  importAnnotationFile,
  makeViameFolder,
  saveAttributes,
  saveStyling,
  saveTimelines,
  saveSwimlanes,
  saveFilters,
  saveConfiguration,
  saveMetadata,
  validateUploadGroup,
  transferConfiguration,
};
