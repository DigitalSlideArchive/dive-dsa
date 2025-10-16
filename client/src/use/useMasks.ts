/* eslint-disable no-console */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
import {
  ref, watch, Ref, computed,
  ComputedRef,
} from 'vue';
import {
  getRLEMaskData,
  RLETrackFrameData,
  uploadMask,
  deleteMask,
  RLEFrameData,
} from 'platform/web-girder/api/annotation.service';
import { RectBounds } from 'vue-media-annotator/utils';
import { Handler } from 'vue-media-annotator/provides';
import { imageToRLEObject, maskToLuminanceAlpha, decode } from './rle';
import { createRLEPreloader } from './usePreloadWorkers';

// Dynamically import the worker
const RLEWorker = () => new Worker(new URL('../workers/rleWorker.js', import.meta.url), { type: 'module' });
const rleWorker = RLEWorker();

const ENABLE_TIMING_LOGS = false;
const { preloadRLEMasks, clearQueue } = createRLEPreloader(RLEWorker, {
  batchSize: 20,
  enableTimingLogs: ENABLE_TIMING_LOGS,
});

export type MaskItem = {
  filename: string;
  id: string;
  metadata?: {
    frameId?: number;
    trackId?: number;
  };
  url: string;
};

let cacheWindow = { minFrame: 0, maxFrame: 0 };
let cachedTracks: number[] = [];

export type MaskSAM2UpdateItem = MaskItem & { rleMask: RLEFrameData };

export type MaskTriggerActions = null | 'save' | 'delete';
export interface UseMaskInterface {
  getMask: (trackId: number, frameId: number) => HTMLImageElement | undefined;
  getRLEMask: (trackId: number, frameId: number) => RLEFrameData | undefined;
  getRLELuminanceMask: (
    trackId: number,
    frameId: number
  ) => { width: number; height: number; data: Uint8Array } | undefined;
  editorOptions: {
    toolEnabled: Ref<MaskEditingTools>;
    brushSize: Ref<number>;
    maxBrushSize: Ref<number>;
    hasMasks: Ref<boolean>;
    opacity: Ref<number>;
    triggerAction: Ref<null | 'save' | 'delete'>; // Used to communicate with the MaskEditorLayer
    loadingFrame: Ref<string | false>;
    useRLE: Ref<boolean>;
  };
  editorFunctions: {
    setEditorOptions: (data: {
      toolEnabled?: MaskEditingTools;
      brushSize?: number;
      maxBrushSize?: number;
      opactiy?: number;
      triggerAction?: MaskTriggerActions;
    }) => void;
    addUpdateMaskFrame: (trackId: number, Image: HTMLImageElement) => Promise<void>;
    deleteMaskFrame: (trackId: number) => Promise<void>;
    updateMaskData: (maskData: MaskSAM2UpdateItem[]) => void;
  };
}

const useRLE = ref(true); // This should only be false for testing purposes
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

  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = 0;
  let maxY = 0;
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
  maskModeEnabled: ComputedRef<boolean>,
  visibleTracks: Ref<number[]>,
) {
  const frameRate = ref(60);
  const masks = ref<MaskItem[]>([]);
  const cache = new Map<string, HTMLImageElement>();
  const rleCache = new Map<string, { width: number; height: number; data: Uint8Array }>();
  const inFlightRequests = new Map<
    string,
    { image: HTMLImageElement; controller: AbortController }
  >();
  const inFlightWorker = new Map<string, boolean>();
  const rleMasks: Ref<RLETrackFrameData> = ref({});
  const toolEnabled: Ref<MaskEditingTools> = ref('brush');
  const brushSize = ref(20); // Brush size for Painting/Editing
  const triggerAction: Ref<MaskTriggerActions> = ref(null);
  const opacity = ref(50);
  const maxBrushSize = ref(50);
  const loadingFrame: Ref<string | false> = ref(false);

  function setEditorOptions(data: {
    toolEnabled?: MaskEditingTools;
    brushSize?: number;
    opactiy?: number;
    triggerAction?: MaskTriggerActions;
    maxBrushSize?: number;
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
    if (!useRLE.value) {
      cache.set(frameKey(frame.value, trackId), image);
    } else {
      // Create RLE data from the image
      const rleObject = imageToRLEObject(image);
      const rleData: RLEFrameData = {
        rle: rleObject,
        file_name: `${trackId}_${frame.value}.png`,
      };
      rleMasks.value[trackId] = rleMasks.value[trackId] || {};
      rleMasks.value[trackId][frame.value] = rleData;
      const binaryMask = maskToLuminanceAlpha(decode([rleObject]).data, rleData.rle.size[1], rleData.rle.size[0]);
      const rleDecoded = {
        trackId,
        frame: frame.value,
        width: rleData.rle.size[1],
        height: rleData.rle.size[0],
        data: binaryMask,
      };
      rleCache.set(frameKey(frame.value, trackId), rleDecoded);
      loadingFrame.value = false;
    }
    handler.trackSelect(trackId, false);
    handler.save();
  }

  async function deleteLocalMasks(trackId: number, frameIds: number[]) {
    if (!useRLE.value) {
      frameIds.forEach(async (frameId) => {
        cache.delete(frameKey(frameId, trackId));
      });
    } else {
      frameIds.forEach(async (frameId) => {
        const key = frameKey(frameId, trackId);
        rleCache.delete(key);
        if (rleMasks.value[trackId]) {
          delete rleMasks.value[trackId][frameId];
          if (Object.keys(rleMasks.value[trackId]).length === 0) {
            delete rleMasks.value[trackId];
          }
        }
      });
    }
  }

  async function deleteMaskFrame(trackId: number) {
    cache.delete(frameKey(frame.value, trackId));
    const result = await deleteMask(datasetId.value, trackId, frame.value);
    const foundMaskIndex = masks.value.findIndex(
      (item) => item.metadata?.frameId === frame.value && item.metadata.trackId === trackId,
    );
    if (foundMaskIndex !== -1) {
      masks.value.splice(foundMaskIndex, 1);
    }
    if (result) {
      handler.removeAnnotation();
    }
    handler.save();
  }

  async function getFolderRLEMasks(folderId: string) {
    rleMasks.value = (await getRLEMaskData(folderId)).data;
    if (useRLE.value) {
      preloadWindow(frame.value);
    }
  }

  function initializeMaskData(maskData: { masks: Readonly<MaskItem[]> }) {
    masks.value = [...maskData.masks];
    if (!useRLE.value) {
      preloadWindow(frame.value);
    }
  }

  function updateMaskData(newMaskData: MaskSAM2UpdateItem[]) {
    newMaskData.forEach((newMask) => {
      const frameId = newMask.metadata?.frameId;
      const trackId = newMask.metadata?.trackId;

      if (frameId === undefined || trackId === undefined) {
        console.warn(`Skipping mask ${newMask.filename} due to missing metadata`);
        return;
      }
      if (useRLE.value) {
        if (!newMask.rleMask) {
          console.warn(`Skipping RLE mask ${newMask.filename} due to missing rleMask`);
          return;
        }
        // Update RLE mask data
        rleMasks.value[trackId] = rleMasks.value[trackId] || {};
        rleMasks.value[trackId][frameId] = newMask.rleMask;
      } else {
        const key = frameKey(frameId, trackId);

        // Replace mask entry in masks array
        const existingIndex = masks.value.findIndex(
          (item) => item.metadata?.frameId === frameId && item.metadata?.trackId === trackId,
        );

        if (existingIndex !== -1) {
          masks.value.splice(existingIndex, 1, newMask);
        } else {
          masks.value.push(newMask);
        }

        // Replace cached image if already cached
        if (cache.has(key)) {
          const img = new Image();
          img.onload = () => {
            cache.set(key, img);
          };
          img.src = newMask.url;
        }
      }
    });
    if (useRLE.value) {
      const startTime = performance.now();
      preloadRLEMasks(frame.value, rleMasks.value, inFlightWorker, (results) => {
        results.forEach(({ trackId, frameId, mask }) => {
          const key = `${frameId}_${trackId}`;
          rleCache.set(key, mask);
          if (rleCache.size === masks.value.length) {
            const endTime = performance.now();
            if (ENABLE_TIMING_LOGS) {
              console.log(`🧾 RLE Preloading completed in ${endTime - startTime}ms`);
            }
            clearQueue();
          }
          if (loadingFrame.value === key) {
            loadingFrame.value = false;
          }
        });
      });
    }
  }

  rleWorker.onerror = (error) => {
    console.error('Worker error:', error);
  };

  function setFrameRate(newRate: number) {
    frameRate.value = newRate;
  }

  function getFrameWindow(currentFrame: number) {
    const minFrame = Math.max(0, Math.floor(currentFrame - frameRate.value * 0.5)); // 2 seconds behind
    const maxFrame = Math.floor(currentFrame + frameRate.value * 1); // 2 seconds ahead
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
      if (loadingFrame.value === key) {
        loadingFrame.value = false;
      }
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
    if (!useRLE.value) {
      const { minFrame, maxFrame } = getFrameWindow(currentFrame);
      clearOutOfWindow(minFrame, maxFrame);
      masks.value.forEach((mask) => {
        if (
          !mask.metadata
          || mask.metadata.frameId === undefined
          || mask.metadata.trackId === undefined
        ) {
          console.warn(`Mask ${mask.filename} does not have metadata`);
          return;
        }
        const frameId = Number(mask.metadata.frameId);
        const { trackId } = mask.metadata;
        const key = frameKey(frameId, trackId);
        if (
          frameId >= minFrame
          && frameId <= maxFrame
          && !cache.has(key)
          && !inFlightRequests.has(key)
        ) {
          preloadImage(mask, key);
        }
      });
    } else {
      const { minFrame, maxFrame } = getFrameWindow(currentFrame);
      if (cacheWindow.minFrame <= currentFrame && cacheWindow.maxFrame > currentFrame) {
        // If cache is 70% the way through the window, start loading the next window
        const range = cacheWindow.maxFrame - cacheWindow.minFrame;
        if (currentFrame >= cacheWindow.minFrame && currentFrame < cacheWindow.maxFrame - range * 0.3) {
          return; // Still within the cached window
        }
      }
      cacheWindow = { minFrame, maxFrame };
      cachedTracks = [];
      const startTime = performance.now();
      const newCachedTracks: number[] = [];
      const subseMasks: Record<number, Record<number, RLEFrameData>> = {};
      Object.keys(rleMasks.value).forEach((trackIdStr) => {
        const trackId = Number(trackIdStr);
        if (!visibleTracks.value.includes(trackId)) {
          return;
        }
        newCachedTracks.push(trackId);
        Object.keys(rleMasks.value[trackId]).forEach((frameIdStr) => {
          const frameId = Number(frameIdStr);
          if (frameId >= minFrame && frameId <= maxFrame) {
            if (cachedTracks.includes(trackId) && (rleCache.has(frameKey(frameId, trackId)) || inFlightWorker.has(frameKey(frameId, trackId)))) {
              return;
            }
            subseMasks[trackId] = subseMasks[trackId] || {};
            subseMasks[trackId][frameId] = rleMasks.value[trackId][frameId];
          } else if (rleCache.has(frameKey(frameId, trackId))) {
            rleCache.delete(frameKey(frameId, trackId));
          }
        });
      });
      cachedTracks = newCachedTracks;
      if (Object.keys(subseMasks).length === 0) {
        return;
      }
      const subsetSize = Object.keys(subseMasks).reduce((acc, trackId) => acc + Object.keys(subseMasks[Number(trackId)]).length, 0);
      clearQueue();
      inFlightWorker.clear();
      preloadRLEMasks(frame.value, subseMasks, inFlightWorker, (results) => {
        results.forEach(({ trackId, frameId, mask }) => {
          const key = `${frameId}_${trackId}`;
          rleCache.set(key, mask);
          inFlightWorker.delete(key);
          if (rleCache.size === subsetSize) {
            const endTime = performance.now();
            if (ENABLE_TIMING_LOGS) {
              console.log(`🧾 RLE Preloading completed in ${endTime - startTime}ms`);
            }
          }
          if (loadingFrame.value === key) {
            loadingFrame.value = false;
          }
        });
      });
    }
  }

  function getMask(trackId: number, frameId: number): HTMLImageElement | undefined {
    const key = frameKey(frameId, trackId);
    const cacheFound = cache.get(key);
    if (cacheFound) {
      return cacheFound;
    }
    if (useRLE.value) {
      const mask = rleMasks.value[trackId]?.[frameId];
      if (mask && inFlightWorker.has(key)) {
        loadingFrame.value = key;
        return undefined;
      }
    } else {
      const key = frameKey(frameId, trackId);
      if (inFlightRequests.has(key)) {
        loadingFrame.value = key;
        return undefined;
      }
    }
    return undefined;
  }

  watch(frame, (newFrame) => {
    if (typeof newFrame === 'number' && maskModeEnabled.value) {
      preloadWindow(newFrame);
    }
  });

  watch(maskModeEnabled, (newVal) => {
    if (newVal && typeof frame.value === 'number') {
      preloadWindow(frame.value);
    }
  });

  watch(visibleTracks, () => {
    if (maskModeEnabled.value && typeof frame.value === 'number') {
      preloadWindow(frame.value);
    }
  });

  const hasMasks = computed(() => {
    if (useRLE.value) {
      return Object.keys(rleMasks.value).length > 0;
    }
    return masks.value.length > 0;
  });

  const getRLEMask = (trackId: number, frameId: number): RLEFrameData | undefined => rleMasks.value[trackId]?.[frameId];

  const getRLELuminanceMask = (
    trackId: number,
    frameId: number,
  ): { width: number; height: number; data: Uint8Array } | undefined => {
    const key = frameKey(frameId, trackId);
    const cacheFound = rleCache.get(key);
    if (cacheFound) {
      return cacheFound;
    }
    loadingFrame.value = key;
    return undefined;
  };
  return {
    initializeMaskData,
    setFrameRate,
    getMask,
    getFolderRLEMasks,
    getRLEMask,
    getRLELuminanceMask,
    deleteLocalMasks,
    editorOptions: {
      hasMasks,
      toolEnabled,
      brushSize,
      opacity,
      triggerAction,
      maxBrushSize,
      loadingFrame,
      useRLE,
    },
    editorFunctions: {
      updateMaskData,
      setEditorOptions,
      addUpdateMaskFrame,
      deleteMaskFrame,
    },
  };
}
