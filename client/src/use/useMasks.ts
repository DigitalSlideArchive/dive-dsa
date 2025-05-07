/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
import { ref, watch, Ref } from 'vue';
import {
  getRLEMask, RLETrackFrameData, RLEData, uploadMask, deleteMask,
} from 'platform/web-girder/api/annotation.service';
import { RectBounds } from 'vue-media-annotator/utils';
import { Handler } from 'vue-media-annotator/provides';
import { decode } from './rle';

// Dynamically import the worker
const RLEWorker = () => new Worker(new URL('../workers/rleWorker.js', import.meta.url), { type: 'module' });

type MaskItem = {
  filename: string;
  id: string;
  metadata?: {
    frameId?: number;
    trackId?: number;
  };
  url: string;
};

export type MaskTriggerActions = null | 'save' | 'delete';
export interface UseMaskInterface {
  getMask: (trackId: number, frameId: number) => HTMLImageElement | undefined;
  editorOptions: {
    toolEnabled: Ref<MaskEditingTools>,
    brushSize: Ref<number>,
    maxBrushSize: Ref<number>,
    opacity: Ref<number>,
    triggerAction: Ref<null | 'save' | 'delete'>, // Used to communicate with the MaskEditorLayer
  },
  editorFunctions: {
    setEditorOptions: (data: { toolEnabled?: MaskEditingTools, brushSize?: number, maxBrushSize?: number, opactiy?: number, triggerAction?: MaskTriggerActions}) => void;
    addUpdateMaskFrame: (trackId: number, Image: HTMLImageElement) => Promise<void>;
    deleteMaskFrame: (trackId: number) => Promise<void>;
  },

}

const useRLE = false;
const ENABLE_TIMING_LOGS = true;
const timingTotals = {
  decode: 0,
  canvasSetup: 0,
  populate: 0,
  render: 0,
  load: 0,
  total: 0,
};

export async function getMaskBlobAndBoundsFromImage(
  image: HTMLImageElement,
): Promise<{ blob: Blob; bounds: RectBounds | null }> {
  // Draw image to a canvas
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return { blob: new Blob(), bounds: null };

  ctx.drawImage(image, 0, 0);

  // Convert to Blob
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) return { blob: new Blob(), bounds: null };

  // Decode the blob into an ImageBitmap
  const bitmap = await createImageBitmap(blob);
  const offscreenCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const offscreenCtx = offscreenCanvas.getContext('2d');
  if (!offscreenCtx) return { blob, bounds: null };

  offscreenCtx.drawImage(bitmap, 0, 0);
  const imageData = offscreenCtx.getImageData(0, 0, bitmap.width, bitmap.height);
  const { data } = imageData;

  let minX = bitmap.width; let minY = bitmap.height; let maxX = 0; let
    maxY = 0;
  let hasMask = false;

  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const index = (y * bitmap.width + x) * 4;
      const alpha = data[index + 3];

      if (alpha > 0) {
        hasMask = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bounds: RectBounds | null = hasMask ? [minX, minY, maxX, maxY] : null;
  return { blob, bounds };
}

export type MaskEditingTools = 'pointer' | 'brush' | 'eraser';

export default function useMasks(
  frame: Readonly<Ref<number>>,
  flick: Readonly<Ref<number>>,
  datasetId: Readonly<Ref<string>>,
  handler: Handler,
) {
  const frameRate = ref(30);
  const masks = ref<MaskItem[]>([]);
  const cache = new Map<string, HTMLImageElement>();
  const inFlightRequests = new Map<string, { image: HTMLImageElement, controller: AbortController }>();
  const rleMasks: Ref<RLETrackFrameData> = ref({});
  const toolEnabled: Ref<MaskEditingTools> = ref('brush');
  const brushSize = ref(20); // Brush size for Painting/Editing
  const triggerAction: Ref<MaskTriggerActions> = ref(null);
  const opacity = ref(50);
  const maxBrushSize = ref(50);

  function setEditorOptions(data:
    {
      toolEnabled?: MaskEditingTools,
      brushSize?: number,
      opactiy?: number,
      triggerAction?: MaskTriggerActions,
      maxBrushSize?: number,
     }) {
    if (data.toolEnabled !== undefined) {
      toolEnabled.value = data.toolEnabled;
    }
    if (data.brushSize !== undefined) {
      brushSize.value = data.brushSize;
    }
    if (data.maxBrushSize !== undefined) {
      maxBrushSize.value = data.maxBrushSize;
    }
    if (data.opactiy !== undefined) {
      opacity.value = data.opactiy;
    }
    if (data.triggerAction !== undefined) {
      triggerAction.value = data.triggerAction;
    }
  }

  async function addUpdateMaskFrame(trackId: number, image: HTMLImageElement) {
    const { bounds, blob } = await getMaskBlobAndBoundsFromImage(image);
    if (bounds) {
      handler.updateRectBounds(frame.value, flick.value, bounds, false, true);
    }
    await uploadMask(datasetId.value, trackId, frame.value, blob);
    cache.set(frameKey(frame.value, trackId), image);
    handler.save();
  }

  async function deleteMaskFrame(trackId: number) {
    cache.delete(frameKey(frame.value, trackId));
    const result = await deleteMask(datasetId.value, trackId, frame.value);
    const foundMaskIndex = masks.value.findIndex((item) => item.metadata?.frameId === frame.value && item.metadata.trackId === trackId);
    if (foundMaskIndex !== -1) {
      masks.value.splice(foundMaskIndex, 1);
    }
    if (result) {
      handler.removeAnnotation();
    }
    handler.save();
  }

  async function getFolderRLEMasks(folderId: string) {
    rleMasks.value = (await getRLEMask(folderId)).data;
    if (useRLE) {
      await convertAllRLEMasksToImagesWebWorker();
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

  async function convertAllRLEMasksToImagesWebWorker() {
    const totalStart = performance.now();
    const rleWorker = RLEWorker();

    return new Promise<void>((resolve, reject) => {
      rleWorker.onmessage = (event) => {
        const results = event.data;

        for (const trackId in results) {
          const frames = results[trackId];
          for (const frameId in frames) {
            const key = frameKey(Number(frameId), Number(trackId));
            const img = new Image();
            img.src = frames[frameId];
            cache.set(key, img);
          }
        }

        const totalEnd = performance.now();
        if (ENABLE_TIMING_LOGS) {
          console.log(`🧾 Worker Total Elapsed: ${(totalEnd - totalStart).toFixed(2)} ms`);
        }

        resolve();
      };

      rleWorker.onerror = (error) => {
        console.error('Worker error:', error);
        reject(error);
      };

      rleWorker.postMessage({ rleMasks: rleMasks.value });
    });
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
      if (!mask.metadata || mask.metadata.frameId === undefined || mask.metadata.trackId === undefined) {
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
    convertAllRLEMasksToImagesWebWorker,
    convertAllRLEMasksToImages,
    editorOptions: {
      toolEnabled,
      brushSize,
      opacity,
      triggerAction,
      maxBrushSize,
    },
    editorFunctions: {
      setEditorOptions,
      addUpdateMaskFrame,
      deleteMaskFrame,
    },
  };
}
