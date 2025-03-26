import { GirderJob, GirderModel } from '@girder/components/src';
import girderRest from 'platform/web-girder/plugins/girder';

function deleteResources(resources: Array<GirderModel>) {
  const formData = new FormData();
  formData.set(
    'resources',
    JSON.stringify({
      folder: resources
        .filter((resource) => resource._modelType === 'folder')
        .map((resource) => resource._id),
      item: resources
        .filter((resource) => resource._modelType === 'item')
        .map((resource) => resource._id),
    }),
  );
  return girderRest.delete('resource', { data: formData });
}

function getItemsInFolder(folderId: string, limit: number) {
  return girderRest.get<GirderModel[]>('item', {
    params: { folderId, limit },
  });
}

function getRecentSlicerJobs(limit: number, offset: number, statuses?: number[]) {
  return girderRest.get<(GirderJob & { type: string})[]>('job', {
    params: {
      limit,
      offset,
      statuses: JSON.stringify(statuses),
      sort: 'created',
      sortdir: -1,
      handler: 'jobs._local',
    },
  });
}

function getFolder(folderId: string) {
  return girderRest.get<GirderModel>(`folder/${folderId}`);
}

export interface AccessType {
  flags: string[];
  id: string;
  level: number;
  login: string;
  name: string;
}
export interface FolderAccessType {
  groups: AccessType[];
  users: AccessType[];
}

function getFolderAccess(folderId: string) {
  return girderRest.get<FolderAccessType>(`folder/${folderId}/access`);
}

function setUsePrivateQueue(userId: string, value = false) {
  return girderRest.put<{
    user_private_queue_enabled: boolean;
  }>(`user/${userId}/use_private_queue`, null, {
    params: {
      privateQueueEnabled: value,
    },
  });
}

export {
  deleteResources,
  getItemsInFolder,
  getRecentSlicerJobs,
  getFolder,
  setUsePrivateQueue,
  getFolderAccess,
};
