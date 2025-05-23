import type { TrackData } from 'vue-media-annotator/track';
import type { GroupData } from 'vue-media-annotator/Group';
import type { SaveDetectionsArgs } from 'dive-common/apispec';

import girderRest from 'platform/web-girder/plugins/girder';

export const AnnotationsCurrentVersion = 2;

export interface Revision {
  additions: Readonly<number>;
  deletions: Readonly<number>;
  author_id: Readonly<string>;
  author_name: Readonly<string>;
  created: Readonly<string>;
  dataset: Readonly<string>;
  description: Readonly<string>;
  revision: Readonly<number>;
}

export interface Label {
  _id: string;
  count: number;
  datasets: Record<string, {
    id: string;
    name: string;
    color?: string;
  }>;
}

export type RLETrackFrameData = Record<string, Record<string, RLEFrameData>>;
export interface RLEData {
  counts: string;
  size: [number, number];
}
export interface RLEFrameData {
  file_name: string;
  rle: RLEData
}

async function loadDetections(folderId: string, revision?: number) {
  const params: Record<string, unknown> = { folderId };
  if (revision !== undefined) {
    params.revision = revision;
  }
  return {
    tracks: (await girderRest.get<TrackData[]>('dive_annotation/track', { params })).data,
    groups: (await girderRest.get<GroupData[]>('dive_annotation/group', { params })).data,
    version: AnnotationsCurrentVersion,
  };
}

function loadRevisions(
  folderId: string,
  limit?: number,
  offset?: number,
  sort?: string,
) {
  return girderRest.get<Revision[]>('dive_annotation/revision', {
    params: {
      folderId, sortdir: -1, limit, offset, sort,
    },
  });
}

function getLatestRevision(
  folderId: string,
) {
  return girderRest.get<Revision[]>('dive_annotation/revision', {
    params: {
      folderId, sortdir: -1, limit: 1,
    },
  });
}

function saveDetections(folderId: string, args: SaveDetectionsArgs) {
  return girderRest.patch('dive_annotation', args, {
    params: { folderId },
  });
}

async function getLabels() {
  const response = await girderRest.get<Label[]>('dive_annotation/labels');
  return response;
}

async function uploadMask(
  folderId: string,
  trackId: number,
  frameId: number,
  blob: Blob,
  RLEUpdate = false,
) {
  const params = {
    folderId,
    trackId,
    frameId,
    size: blob.size,
    RLEUpdate,
  };

  // First request to initialize upload
  const { data: uploadMetadata } = await girderRest.post('dive_annotation/mask', blob, {
    params,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
  });

  return uploadMetadata;
}

async function updateRLEMasks(folderId: string, trackFrameList?: [number, number][]) {
  // First request to initialize upload
  const { data: uploadMetadata } = await girderRest.post('dive_annotation/rle_mask', { folderId, trackFrameList });

  return uploadMetadata;
}

async function getRLEMask(folderId: string) {
  const response = await girderRest.get<RLETrackFrameData>('dive_annotation/rle_mask', {
    params: {
      folderId,
    },
  });
  return response;
}

export interface DeleteMaskResponse {
  status: string;
  message: string;
  deleted: {
    deletedTracks: number[];
    deletedFrames: [number, number][];
  };
}

async function deleteMask(folderId: string, trackId: number, frameId: number) {
  const { data } = await girderRest.delete<DeleteMaskResponse>('dive_annotation/mask', {
    params: {
      folderId,
      trackId,
      frameId,
    },
  });
  return data;
}

export {
  getLabels,
  loadDetections,
  loadRevisions,
  getLatestRevision,
  saveDetections,
  uploadMask,
  updateRLEMasks,
  getRLEMask,
  deleteMask,

};
