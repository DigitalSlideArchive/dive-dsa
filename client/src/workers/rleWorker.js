/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
import { decode } from '../use/rle';

// Track the current task ID (generation)
let currentTaskId = 0;

self.onmessage = async (event) => {
  currentTaskId += 1;
  const thisTaskId = currentTaskId;
  const { rleMasks } = event.data;

  const promises = [];

  for (const [trackId, frames] of Object.entries(rleMasks)) {
    for (const [frameId, rleWrapper] of Object.entries(frames)) {
      promises.push((async () => {
        const binaryMask = decode([rleWrapper.rle]);

        const canvas = new OffscreenCanvas(rleWrapper.rle.size[0], rleWrapper.rle.size[1]);
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(canvas.width, canvas.height);

        for (let row = 0; row < canvas.height; row += 1) {
          for (let col = 0; col < canvas.width; col += 1) {
            const cocoIndex = row + col * canvas.height;
            const value = binaryMask.data[cocoIndex] ? 255 : 0;
            const imgIndex = (row * canvas.width + col) * 4;
            imageData.data[imgIndex + 0] = value;
            imageData.data[imgIndex + 1] = value;
            imageData.data[imgIndex + 2] = value;
            imageData.data[imgIndex + 3] = value;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        const blob = await canvas.convertToBlob();
        const objectURL = URL.createObjectURL(blob);

        // Only post back if this is still the current task
        if (thisTaskId === currentTaskId) {
          self.postMessage({
            trackId,
            frameId,
            objectURL,
          });
        }
      })());
    }
  }

  // Optionally wait for all promises to complete (can omit if not needed)
  await Promise.all(promises);
};
