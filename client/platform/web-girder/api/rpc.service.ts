import girderRest from 'platform/web-girder/plugins/girder';
import type { GirderJob } from '@girder/components/src';

function postProcess(folderId: string, skipJobs = false, skipTranscoding = false, additive = false, additivePrepend = '') {
  return girderRest.post(`dive_rpc/postprocess/${folderId}`, null, {
    params: {
      skipJobs, skipTranscoding, additive, additivePrepend,
    },
  });
}

async function maskTracking(datasetId: string, trackId: number, frameId: number, frameCount: number, SAMModel = 'Tiny', batchSize = 300, notifyPercent = 0.1): Promise<GirderJob> {
  const result = await girderRest.post('dive_rpc/sam2_mask_track', null, {
    params: {
      datasetId, trackId, frameId, frameCount, SAMModel, batchSize, notifyPercent,
    },
  });
  return result.data;
}

export {
  // eslint-disable-next-line import/prefer-default-export
  postProcess,
  maskTracking,
};
