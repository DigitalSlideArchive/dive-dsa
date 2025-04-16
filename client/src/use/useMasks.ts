/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
import { ref, watch, Ref } from 'vue';
import { getRLEMask, RLETrackFrameData, RLEData } from 'platform/web-girder/api/annotation.service';
import { decode } from './rle';

type MaskItem = {
  filename: string;
  id: string;
  metadata?: {
    frameId?: number;
    trackId?: number;
  };
  url: string;
};

export interface UseMaskInterface {
  getMask: (trackId: number, frameId: number) => HTMLImageElement | undefined;
}

const useRLE = true;
const ENABLE_TIMING_LOGS = true;
const timingTotals = {
  decode: 0,
  canvasSetup: 0,
  populate: 0,
  render: 0,
  load: 0,
  total: 0,
};

export default function useMasks(frame: Readonly<Ref<number>>) {
  const frameRate = ref(30);
  const masks = ref<MaskItem[]>([]);
  const cache = new Map<string, HTMLImageElement>();
  const inFlightRequests = new Map<string, { image: HTMLImageElement, controller: AbortController }>();
  const rleMasks: Ref<RLETrackFrameData> = ref({});

  async function getFolderRLEMasks(folderId: string) {
    rleMasks.value = (await getRLEMask(folderId)).data;
    if (useRLE) {
      await convertAllRLEMasksToImages();
    }
  }

  function initializeMaskData(maskData: { masks: Readonly<MaskItem[]> }) {
    masks.value = [...maskData.masks];
    if (!useRLE) {
      preloadWindow(frame.value);
    }
  }

  async function rleToImageElement(rle: RLEData, key?: string): Promise<HTMLImageElement> {
    const totalStart = performance.now();

    const decodeStart = performance.now();
    const binaryMask = decode([rle]);
    const decodeEnd = performance.now();

    const canvasStart = performance.now();
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = rle.size;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const canvasEnd = performance.now();

    const populateStart = performance.now();
    for (let i = 0; i < binaryMask.data.length; i += 1) {
      const value = binaryMask.data[i] ? 255 : 0;
      imageData.data[i * 4 + 0] = value;
      imageData.data[i * 4 + 1] = value;
      imageData.data[i * 4 + 2] = value;
      imageData.data[i * 4 + 3] = value;
    }
    const populateEnd = performance.now();

    const renderStart = performance.now();
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL();
    const renderEnd = performance.now();

    const loadStart = performance.now();
    const img = new Image();
    img.src = dataUrl;

    await new Promise((resolve, reject) => {
      img.onload = () => resolve(null);
      img.onerror = reject;
    });
    const loadEnd = performance.now();

    const totalEnd = performance.now();

    // Accumulate timings
    timingTotals.decode += decodeEnd - decodeStart;
    timingTotals.canvasSetup += canvasEnd - canvasStart;
    timingTotals.populate += populateEnd - populateStart;
    timingTotals.render += renderEnd - renderStart;
    timingTotals.load += loadEnd - loadStart;
    timingTotals.total += totalEnd - totalStart;

    if (ENABLE_TIMING_LOGS && key) {
      console.log(`⏱ [${key}] RLE decode: ${(decodeEnd - decodeStart).toFixed(2)} ms`);
      console.log(`⏱ [${key}] Canvas setup: ${(canvasEnd - canvasStart).toFixed(2)} ms`);
      console.log(`⏱ [${key}] Populate image data: ${(populateEnd - populateStart).toFixed(2)} ms`);
      console.log(`⏱ [${key}] Render & toDataURL: ${(renderEnd - renderStart).toFixed(2)} ms`);
      console.log(`⏱ [${key}] Image load: ${(loadEnd - loadStart).toFixed(2)} ms`);
      console.log(`✅ [${key}] Total: ${(totalEnd - totalStart).toFixed(2)} ms`);
    }

    return img;
  }

  async function convertAllRLEMasksToImages() {
    const totalStart = performance.now();
    const promises: Promise<void | Map<string, HTMLImageElement>>[] = [];

    for (const trackId in rleMasks.value) {
      const frames = rleMasks.value[trackId];
      for (const frameId in frames) {
        const rleWrapper = frames[frameId];
        const key = frameKey(Number(frameId), Number(trackId));

        if (!cache.has(key)) {
          const promise = rleToImageElement(rleWrapper.rle, key)
            .then((img) => cache.set(key, img))
            .catch((err) => {
              console.error(`❌ Failed to convert RLE to image for key ${key}`, err);
            });
          promises.push(promise);
        }
      }
    }

    await Promise.all(promises);
    const totalEnd = performance.now();

    if (ENABLE_TIMING_LOGS) {
      console.log('\n🧾 RLE Mask Timing Summary (All Images):');
      console.log(`   - RLE Decode: ${timingTotals.decode.toFixed(2)} ms`);
      console.log(`   - Canvas Setup: ${timingTotals.canvasSetup.toFixed(2)} ms`);
      console.log(`   - Populate ImageData: ${timingTotals.populate.toFixed(2)} ms`);
      console.log(`   - Render + toDataURL: ${timingTotals.render.toFixed(2)} ms`);
      console.log(`   - Image Load: ${timingTotals.load.toFixed(2)} ms`);
      console.log(`   - Total (Sum): ${timingTotals.total.toFixed(2)} ms`);
      console.log(`   - Wrapper Total (Elapsed): ${(totalEnd - totalStart).toFixed(2)} ms\n`);
    }
  }

  function setFrameRate(newRate: number) {
    frameRate.value = newRate;
  }

  function getFrameWindow(currentFrame: number) {
    const minFrame = Math.max(0, Math.floor(currentFrame - frameRate.value * 2));
    const maxFrame = Math.floor(currentFrame + frameRate.value * 5);
    return { minFrame, maxFrame };
  }

  function frameKey(frameId: number, trackId: number) {
    return `${frameId}_${trackId}`;
  }

  function clearOutOfWindow(minFrame: number, maxFrame: number) {
    Array.from(inFlightRequests.entries()).forEach(([key, { controller }]) => {
      const [frameIdStr] = key.split('_');
      const frameId = Number(frameIdStr);
      if (frameId < minFrame || frameId > maxFrame) {
        controller.abort();
        inFlightRequests.delete(key);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function preloadWindow(currentFrame: number) {
    const { minFrame, maxFrame } = getFrameWindow(currentFrame);

    clearOutOfWindow(minFrame, maxFrame);
    masks.value.forEach((mask) => {
      if (!mask.metadata || !mask.metadata.frameId || !mask.metadata.trackId) {
        console.warn(`Mask ${mask.filename} does not have metadata`);
        return;
      }
      const frameId = Number(mask.metadata?.frameId);
      const { trackId } = mask.metadata;
      const key = frameKey(mask.metadata.frameId, trackId);
      if (frameId >= minFrame && frameId <= maxFrame && !cache.has(key) && !inFlightRequests.has(key)) {
        const img = new Image();
        const controller = new AbortController();

        img.onload = () => {
          cache.set(key, img);
          inFlightRequests.delete(key);
        };
        img.onerror = () => {
          inFlightRequests.delete(key);
        };

        controller.signal.addEventListener('abort', () => {
          img.src = '';
        });

        inFlightRequests.set(key, { image: img, controller });
        img.src = mask.url;
      }
    });
  }

  function getMask(trackId: number, frameId: number): HTMLImageElement | undefined {
    return cache.get(frameKey(frameId, trackId));
  }

  watch(frame, (newFrame) => {
    if (typeof newFrame === 'number') {
      if (!useRLE) {
        preloadWindow(newFrame);
      }
    }
  }, { immediate: true });

  return {
    initializeMaskData,
    setFrameRate,
    getMask,
    getFolderRLEMasks,
  };
}
