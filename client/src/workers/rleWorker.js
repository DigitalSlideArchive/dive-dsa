/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
import { decode } from '../use/rle';

self.onmessage = async (event) => {
  const { rleMasks } = event.data;

  const results = {};
  const promises = [];

  for (const [trackId, frames] of Object.entries(rleMasks)) {
    results[trackId] = {};
    for (const [frameId, rleWrapper] of Object.entries(frames)) {
      promises.push((async () => {
        const binaryMask = decode([rleWrapper.rle]);

        const canvas = new OffscreenCanvas(rleWrapper.rle.size[0], rleWrapper.rle.size[1]);
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(canvas.width, canvas.height);

        for (let i = 0; i < binaryMask.data.length; i += 1) {
          const value = binaryMask.data[i] ? 255 : 0;
          imageData.data[i * 4 + 0] = value;
          imageData.data[i * 4 + 1] = value;
          imageData.data[i * 4 + 2] = value;
          imageData.data[i * 4 + 3] = value;
        }

        ctx.putImageData(imageData, 0, 0);
        const blob = await canvas.convertToBlob();
        results[trackId][frameId] = URL.createObjectURL(blob);
      })());
    }
  }

  await Promise.all(promises);

  self.postMessage(results);
};
