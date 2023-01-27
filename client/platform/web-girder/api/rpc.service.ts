import girderRest from 'platform/web-girder/plugins/girder';

function postProcess(folderId: string, skipJobs = false, skipTranscoding = false) {
  return girderRest.post(`dive_rpc/postprocess/${folderId}`, null, {
    params: { skipJobs, skipTranscoding },
  });
}

export {
  // eslint-disable-next-line import/prefer-default-export
  postProcess,
};
