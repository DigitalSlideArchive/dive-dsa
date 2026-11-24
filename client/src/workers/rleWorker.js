/* eslint-disable no-await-in-loop */
/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
import { decode, maskToLuminanceAlpha } from '../use/rle';

let shouldStop = false; // control flag

// Yield to the event loop (so a 'stop' message can be handled) after this much
// decode work. A MessageChannel round trip avoids setTimeout's ~4ms clamp,
// which used to be paid once per mask.
const YIELD_EVERY_MS = 8;
const yieldChannel = new MessageChannel();
const yieldQueue = [];
yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();
function yieldToEventLoop() {
  return new Promise((resolve) => {
    yieldQueue.push(resolve);
    yieldChannel.port2.postMessage(null);
  });
}

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
    let decodeMs = 0;
    let lastYield = performance.now();

    // Use for...of with await to allow interruption checks
    for (const item of rleMasks) {
      if (performance.now() - lastYield > YIELD_EVERY_MS) {
        await yieldToEventLoop();
        lastYield = performance.now();
      }
      if (shouldStop) {
        break;
      }

      const decodeStart = performance.now();
      results.push(processOneMask(item.trackId, item.frameId, item.rleWrapper.rle));
      decodeMs += performance.now() - decodeStart;
    }

    if (!shouldStop) {
      // Transfer the decoded buffers instead of structured-cloning them
      self.postMessage({
        rleLuminanceMasks: results,
        decodeMs,
      }, results.map((result) => result.data.buffer));
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
