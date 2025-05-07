/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
import { ref, watch, Ref } from 'vue';
import {
  getRLEMask, RLETrackFrameData, uploadMask, deleteMask,
} from 'platform/web-girder/api/annotation.service';
import { RectBounds } from 'vue-media-annotator/utils';
import { Handler } from 'vue-media-annotator/provides';

// Dynamically import the worker
const RLEWorker = () => new Worker(new URL('../workers/rleWorker.js', import.meta.url), { type: 'module' });
const rleWorker = RLEWorker();

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

const useRLE = true;
const ENABLE_TIMING_LOGS = true;
let lastTime = 0;
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
  }

  function initializeMaskData(maskData: { masks: Readonly<MaskItem[]> }) {
    masks.value = [...maskData.masks];
  }

  rleWorker.onmessage = (event) => {
    const img = new Image();
    const { trackId, frameId, objectURL } = event.data;
    if (ENABLE_TIMING_LOGS) {
      const end = performance.now();
      console.log(`🧾 Worker End: ${end}`);
      console.log(`🧾 Worker Time: ${end - lastTime}ms`);
      lastTime = end;
    }
    img.src = objectURL;
    const key = frameKey(frameId, trackId);
    cache.set(key, img);
    //inFlightWorker.delete(key);
  };

  rleWorker.onerror = (error) => {
    console.error('Worker error:', error);
  };

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

  function preloadImage(mask: MaskItem, key: string) {
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function preloadWindow(currentFrame: number) {
    const { minFrame, maxFrame } = getFrameWindow(currentFrame);

    clearOutOfWindow(minFrame, maxFrame);
    if (!useRLE) {
      masks.value.forEach((mask) => {
        if (!mask.metadata || mask.metadata.frameId === undefined || mask.metadata.trackId === undefined) {
          console.warn(`Mask ${mask.filename} does not have metadata`);
          return;
        }
        const frameId = Number(mask.metadata?.frameId);
        const { trackId } = mask.metadata;
        const key = frameKey(mask.metadata.frameId, trackId);
        if (frameId >= minFrame && frameId <= maxFrame && !cache.has(key) && !inFlightRequests.has(key)) {
          preloadImage(mask, key);
        }
      });
    } else {
      const maskList: RLETrackFrameData = {};
      Object.keys(rleMasks.value).forEach((trackIdstr) => {
        Object.keys(rleMasks.value[trackIdstr]).forEach((frameIdstr) => {
          const trackId = Number(trackIdstr);
          const frameId = Number(frameIdstr);
          const key = frameKey(Number(frameId), Number(trackId));
          if (frameId >= minFrame && frameId <= maxFrame && !cache.has(key)) {
            maskList[trackId] = maskList[trackId] || {};
            maskList[trackId][frameId] = rleMasks.value[trackId][frameId];
          }
        });
      });
      if (ENABLE_TIMING_LOGS) {
        lastTime = performance.now();
        console.log(`🧾 Worker Start: ${lastTime}`);
      }
      rleWorker.postMessage({ rleMasks: maskList });
    }
  }

  function getMask(trackId: number, frameId: number): HTMLImageElement | undefined {
    return cache.get(frameKey(frameId, trackId));
  }

  watch(frame, (newFrame) => {
    if (typeof newFrame === 'number') {
      preloadWindow(newFrame);
    }
  }, { immediate: true });

  return {
    initializeMaskData,
    setFrameRate,
    getMask,
    getFolderRLEMasks,
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
