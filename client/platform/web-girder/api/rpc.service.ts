import girderRest from 'platform/web-girder/plugins/girder';

function postProcess(folderId: string, skipJobs = false, skipTranscoding = false, additive = false, additivePrepend = '') {
  return girderRest.post(`dive_rpc/postprocess/${folderId}`, null, {
    params: {
      skipJobs, skipTranscoding, additive, additivePrepend,
    },
  });
}

export {
  // eslint-disable-next-line import/prefer-default-export
  postProcess,
};
