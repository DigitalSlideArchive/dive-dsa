/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
import { decode } from '../use/rle';

// Reusable canvas/context
let canvas = null;
let ctx = null;
let currentWidth = 0;
let currentHeight = 0;

// Track in-flight promises: key = `${trackId}_${frameId}`
const inFlightPromises = new Map();

self.onmessage = async (event) => {
  const { rleMasks } = event.data;

  for (const [trackId, frames] of Object.entries(rleMasks)) {
    for (const [frameId, rleWrapper] of Object.entries(frames)) {
      const key = `${trackId}_${frameId}`;

      if (inFlightPromises.has(key)) {
        // Skip if there's already a pending promise for this key
        // eslint-disable-next-line no-continue
        continue;
      }

      const promise = (async () => {
        try {
          const binaryMask = decode([rleWrapper.rle]);

          const width = rleWrapper.rle.size[0];
          const height = rleWrapper.rle.size[1];

          // Initialize or resize canvas if needed
          if (!canvas || width !== currentWidth || height !== currentHeight) {
            canvas = new OffscreenCanvas(width, height);
            ctx = canvas.getContext('2d');
            currentWidth = width;
            currentHeight = height;
          }

          const imageData = ctx.createImageData(width, height);

          for (let row = 0; row < height; row += 1) {
            for (let col = 0; col < width; col += 1) {
              const cocoIndex = row + col * height;
              const value = binaryMask.data[cocoIndex] ? 255 : 0;
              const imgIndex = (row * width + col) * 4;
              imageData.data[imgIndex + 0] = value;
              imageData.data[imgIndex + 1] = value;
              imageData.data[imgIndex + 2] = value;
              imageData.data[imgIndex + 3] = value;
            }
          }

          ctx.putImageData(imageData, 0, 0);
          const blob = await canvas.convertToBlob();
          const objectURL = URL.createObjectURL(blob);

          self.postMessage({
            trackId,
            frameId,
            objectURL,
          });
        } finally {
          // Clean up after completion
          inFlightPromises.delete(key);
        }
      })();

      inFlightPromises.set(key, promise);
    }
  }
};
