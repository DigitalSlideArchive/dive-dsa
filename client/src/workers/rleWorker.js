/* eslint-disable no-await-in-loop */
/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
import { decode, maskToLuminanceAlpha } from '../use/rle';

let shouldStop = false; // control flag

self.onmessage = async (event) => {
  const { command, rleMasks } = event.data;

  if (command === 'stop') {
    // set stop flag so current processing halts
    shouldStop = true;
    return;
  }

  if (command === 'start' || !command) {
    shouldStop = false;
    const results = [];

    // Use for...of with await to allow interruption checks
    for (const item of rleMasks) {
      if (shouldStop) {
        break;
      }

      // Optional: yield control to the event loop occasionally
      // to stay responsive and allow message handling
      await new Promise((resolve) => setTimeout(resolve, 0));

      results.push(processOneMask(item.trackId, item.frameId, item.rleWrapper.rle));
    }

    if (!shouldStop) {
      self.postMessage({
        rleLuminanceMasks: results,
      });
    } else {
      self.postMessage({
        status: 'stopped',
      });
    }
  }
};

function processOneMask(trackId, frameId, rleObject) {
  const binaryMask = maskToLuminanceAlpha(
    decode([rleObject]).data,
    rleObject.size[1],
    rleObject.size[0],
  );
  const height = rleObject.size[0];
  const width = rleObject.size[1];

  return {
    trackId,
    frameId,
    width,
    height,
    data: binaryMask,
  };
}
