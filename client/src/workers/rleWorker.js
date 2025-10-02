/* eslint-disable no-await-in-loop */
/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
import { decode, maskToLuminanceAlpha } from '../use/rle';

self.onmessage = async (event) => {
  const { rleMasks } = event.data;
  const results = [];
  rleMasks.forEach((item) => {
    results.push(processOneMask(item.trackId, item.frameId, item.rleWrapper.rle));
  });
  self.postMessage({
    rleLuminanceMasks: results,
  });
};
function processOneMask(trackId, frameId, rleObject) {
  const binaryMask = maskToLuminanceAlpha(decode([rleObject]).data, rleObject.size[1], rleObject.size[0]);
  const height = rleObject.size[0]; // height first
  const width = rleObject.size[1]; // then width
  const rleDecoded = {
    trackId,
    frameId,
    width,
    height,
    data: binaryMask,
  };
  return rleDecoded;
}
