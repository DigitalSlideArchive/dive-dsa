import girderRest from 'platform/web-girder/plugins/girder';
import { Pipe } from 'dive-common/apispec';

function postProcess(folderId: string, skipJobs = false, skipTranscoding = false) {
  return girderRest.post(`dive_rpc/postprocess/${folderId}`, null, {
    params: { skipJobs, skipTranscoding },
  });
}

export {
  postProcess,
};
