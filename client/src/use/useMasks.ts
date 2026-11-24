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
import { AnnotationId } from 'vue-media-annotator/BaseAnnotation';
import { RectBounds } from 'vue-media-annotator/utils';
import { Handler } from 'vue-media-annotator/provides';
import { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { debounce } from 'lodash';
import {
  binaryMaskToImage, binaryMaskToPngBlob, imageToRLEObject, encode, DataArray,
  CroppedMask, decodeRLECropped, binaryMaskToCropped, recolorCropped,
} from './rle';
import { createRLEPreloader, CroppedMaskCallback } from './usePreloadWorkers';
import createRLEWorker from './rleWorkerFactory';
import maskPerf from './maskPerf';
import MaskCache, { defaultMaskCacheBudgetBytes, parseMaskKey } from './maskCache';

const rleWorker = createRLEWorker();

const ENABLE_TIMING_LOGS = false;
/** Decoded-mask memory budget (bytes); sizes the preload window */
const MASK_CACHE_BUDGET_BYTES = defaultMaskCacheBudgetBytes();
/**
 * Share of the budget the window is sized to; the rest absorbs estimate error
 * (masks larger than their track's average) before budget eviction kicks in.
 */
const WINDOW_BUDGET_FRACTION = 0.9;
/** Furthest the preload window may reach ahead */
const MAX_LOOKAHEAD_SECONDS = 10;
/** Below this much look-ahead, warn that masks do not fit the budget */
const MIN_USEFUL_LOOKAHEAD_SECONDS = 0.25;
/**
 * Kept behind the playhead while paused or scrubbing (the user may step
 * back). While playing nothing behind the playhead is kept or prefetched:
 * the whole window and budget go to the frames about to be shown.
 */
const BEHIND_SECONDS_PAUSED = 0.5;
/** Size guess for a track with nothing decoded yet: a box 10% of the frame */
const FALLBACK_MASK_AREA_FRACTION = 0.1;
const { preloadRLEMasks, cancelPending } = createRLEPreloader(createRLEWorker, {
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

export type MaskSAM2UpdateItem = MaskItem & { rleMask: RLEFrameData };

export type MaskTriggerActions = null | 'save' | 'delete';
export interface UseMaskInterface {
  getMask: (trackId: number, frameId: number) => HTMLImageElement | undefined;
  getRLEMask: (trackId: number, frameId: number) => RLEFrameData | undefined;
  /**
   * The decoded (bounding-box cropped, colored) mask for a track/frame, or
   * undefined while it is decoding. A cached mask of another color is
   * recolored to `color`.
   */
  getCroppedMask: (
    trackId: number,
    frameId: number,
    color: string,
  ) => CroppedMask | undefined;
  /** How to pick the color baked into a track's decoded masks */
  setMaskColorResolver: (resolver: (trackId: number) => string) => void;
  editorOptions: {
    toolEnabled: Ref<MaskEditingTools>;
    brushSize: Ref<number>;
    maxBrushSize: Ref<number>;
    hasMasks: Ref<boolean>;
    opacity: Ref<number>;
    maskCacheSeconds: Ref<number>;
    maskMaxCacheSeconds: Ref<number>;
    tooManyMasks: Ref<boolean>;
    maskLoadingPercent?: Ref<number>;
    pauseOnLoading: Ref<boolean>;
    triggerAction: Ref<null | 'save' | 'delete'>; // Used to communicate with the MaskEditorLayer
    loadingFrame: Ref<string | false>;
    maskWarningMessage: Ref<string | null>;
    useRLE: Ref<boolean>;
  };
  editorFunctions: {
    setEditorOptions: (data: {
      toolEnabled?: MaskEditingTools;
      brushSize?: number;
      maxBrushSize?: number;
      opacity?: number;
      maskCacheSeconds?: number;
      pauseOnLoading?: boolean;
      triggerAction?: MaskTriggerActions;
    }) => void;
    addUpdateMaskFrame: (trackId: number, Image: HTMLImageElement) => Promise<void>;
    /**
     * Store a binary mask (1 = object, row-major) as the mask for a track on
     * an arbitrary frame, e.g. a confirmed SAM segmentation. Uploads the mask
     * and updates the local RLE cache; flagging the feature (`hasMask`) and
     * its bounds is the caller's job. Rejects — after rolling back the
     * optimistic local registration — when nothing was persisted (empty
     * mask, encoding or upload failure), so callers must only flag `hasMask`
     * after this resolves.
     */
    createMaskFromBinary: (
      trackId: number,
      frameId: number,
      mask: { data: Uint8Array; width: number; height: number },
    ) => Promise<void>;
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
  visibleMaskIds: Ref<number[]>,
  aggregateController: Ref<AggregateMediaController>,
  selectedTrackId?: Readonly<Ref<AnnotationId | null>>,
) {
  const frameRate = ref(60);
  const masks = ref<MaskItem[]>([]);
  const cache = new Map<string, HTMLImageElement>();
  const rleCache = new MaskCache();
  let maskColorFor: (trackId: number) => string = () => '#ffffff';
  function setMaskColorResolver(resolver: (trackId: number) => string) {
    maskColorFor = resolver;
  }
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
  const maskCacheSeconds = ref(1);
  // What the user asked for; maskCacheSeconds is this capped by the budget
  let preferredCacheSeconds = maskCacheSeconds.value;
  const maskMaxCacheSeconds = ref(10);
  const tooManyMasks = ref(false);
  const maskLoadingPercent = ref(0);
  const pauseOnLoading = ref(false);
  const maxBrushSize = ref(50);
  const loadingFrame: Ref<string | false> = ref(false);
  const maskWarningMessage = ref<string | null>(null);
  // Frame range currently decoded/queued, and the visible tracks it was built for
  let cacheWindow = { minFrame: 0, maxFrame: 0 };
  let cachedTracksKey = '';

  function tracksHaveMasksConfigured() {
    return visibleMaskIds.value.length > 0;
  }

  function setMaskWarning(message: string) {
    if (!tracksHaveMasksConfigured()) {
      return;
    }
    maskWarningMessage.value = message;
    loadingFrame.value = false;
  }

  function clearMaskWarning() {
    maskWarningMessage.value = null;
  }

  function setEditorOptions(data: {
    toolEnabled?: MaskEditingTools;
    brushSize?: number;
    opacity?: number;
    maskCacheSeconds?: number;
    triggerAction?: MaskTriggerActions;
    maxBrushSize?: number;
    pauseOnLoading?: boolean;
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
    if (data.opacity !== undefined) {
      opacity.value = data.opacity;
    }
    if (data.maskCacheSeconds !== undefined) {
      preferredCacheSeconds = data.maskCacheSeconds;
      maskCacheSeconds.value = data.maskCacheSeconds;
    }
    if (data.triggerAction !== undefined) {
      triggerAction.value = data.triggerAction;
    }
    if (data.pauseOnLoading !== undefined) {
      pauseOnLoading.value = data.pauseOnLoading;
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
      rleCache.set(frameKey(frame.value, trackId), decodeRLECropped(rleObject, maskColorFor(trackId)));
      loadingFrame.value = false;
    }
    if (selectedTrackId?.value === trackId) {
      handler.trackSelect(trackId, false);
    }
    handler.save();
  }

  async function createMaskFromBinary(
    trackId: number,
    frameId: number,
    mask: { data: Uint8Array; width: number; height: number },
  ) {
    const key = frameKey(frameId, trackId);
    // A mask already stored for this frame; a failed save puts it back.
    const previousRLE = rleMasks.value[trackId]?.[frameId];
    const previousDecoded = rleCache.get(key);
    const previousImage = cache.get(key);
    // Reject rather than silently succeed: callers flag the feature
    // `hasMask` once this resolves, so resolving without storing anything
    // would leave the track pointing at a mask that does not exist.
    if (!mask.data.some((value) => value)) {
      throw new Error('Could not save the segmentation mask: the mask is empty.');
    }
    if (useRLE.value) {
      // Register the mask locally before any await (image encoding, upload).
      // Confirming flags the feature `hasMask` and enables the Mask layer
      // synchronously, so the next render looks the mask up immediately:
      // registering only after the upload returned made that render warn
      // "Missing RLE mask" and, since nothing redrew afterwards, the mask
      // did not appear until some unrelated update. The binary mask is
      // row-major; COCO RLE is column-major.
      const cocoMask = new Uint8Array(mask.width * mask.height);
      for (let row = 0; row < mask.height; row += 1) {
        for (let col = 0; col < mask.width; col += 1) {
          if (mask.data[row * mask.width + col]) cocoMask[col * mask.height + row] = 1;
        }
      }
      const [rleObject] = encode(new DataArray(cocoMask, [mask.height, mask.width, 1]));
      const rleData: RLEFrameData = {
        rle: rleObject,
        file_name: `${trackId}_${frameId}.png`,
      };
      // Reassign (not nested mutation) so Vue notices the new track/frame.
      rleMasks.value = {
        ...rleMasks.value,
        [trackId]: { ...(rleMasks.value[trackId] || {}), [frameId]: rleData },
      };
      // Crop the row-major mask directly (same result as decoding `rleObject`).
      rleCache.set(key, binaryMaskToCropped(mask.data, mask.width, mask.height, maskColorFor(trackId)));
      clearMaskWarning();
    }
    // LayerManager redraws when loadingFrame clears; marking the frame lets
    // completion trigger a redraw even if the first render raced ahead.
    loadingFrame.value = key;
    try {
      // Encode the upload straight from the mask: no image round trip or
      // bounds scan (the caller already has the prediction's bounds).
      const blob = await binaryMaskToPngBlob(mask.data, mask.width, mask.height);
      if (!useRLE.value) {
        cache.set(key, await binaryMaskToImage(mask.data, mask.width, mask.height));
      }
      await uploadMask(datasetId.value, trackId, frameId, blob);
    } catch (error) {
      // Roll back the optimistic registration so a mask that was not
      // persisted does not keep displaying (the caller reports the error).
      // A mask the frame already had is restored, not dropped: the caller
      // restores the feature's `hasMask` flag, which must still find it.
      if (useRLE.value) {
        if (previousRLE) {
          rleMasks.value = {
            ...rleMasks.value,
            [trackId]: { ...(rleMasks.value[trackId] || {}), [frameId]: previousRLE },
          };
          if (previousDecoded) {
            rleCache.set(key, previousDecoded);
          } else {
            rleCache.delete(key);
          }
        } else {
          await deleteLocalMasks(trackId, [frameId]);
        }
      } else if (previousImage) {
        cache.set(key, previousImage);
      } else {
        cache.delete(key);
      }
      throw error;
    } finally {
      if (loadingFrame.value === key) {
        loadingFrame.value = false;
      }
    }
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
    const perfStart = maskPerf.now();
    rleMasks.value = (await getRLEMaskData(folderId)).data;
    if (maskPerf.enabled) {
      maskPerf.end('rle.fetch', perfStart);
      maskPerf.count('rle.totalMasks', Object.values(rleMasks.value)
        .reduce((acc, frames) => acc + Object.keys(frames).length, 0));
    }
    if (tracksHaveMasksConfigured() && Object.keys(rleMasks.value).length === 0) {
      setMaskWarning('Mask metadata is enabled, but rlemasks.json is empty or missing data.');
    } else {
      clearMaskWarning();
    }
  }

  function initializeMaskData(maskData: { masks: Readonly<MaskItem[]> }) {
    masks.value = [...maskData.masks];
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
      // Drop decoded copies of the replaced masks, then re-plan the current
      // window (budgeted) instead of decoding the whole dataset. A decode of
      // the old data that is still in a worker is discarded as stale.
      newMaskData.forEach((newMask) => {
        const frameId = newMask.metadata?.frameId;
        const trackId = newMask.metadata?.trackId;
        if (frameId !== undefined && trackId !== undefined && newMask.rleMask) {
          rleCache.delete(frameKey(frameId, trackId));
        }
      });
      if (typeof frame.value === 'number') {
        preloadWindow(frame.value, true);
      }
    }
  }

  rleWorker.onerror = (error) => {
    console.error('Worker error:', error);
  };

  function setFrameRate(newRate: number) {
    frameRate.value = newRate;
  }

  function isPlaying() {
    return Boolean(aggregateController.value?.playing?.value);
  }

  /** Frames kept behind the playhead: none while playing, 0.5s when paused */
  function behindFrames() {
    return isPlaying() ? 0 : Math.floor(frameRate.value * BEHIND_SECONDS_PAUSED);
  }

  function getFrameWindow(currentFrame: number) {
    const minFrame = Math.max(0, currentFrame - behindFrames());
    const maxFrame = Math.floor(currentFrame + frameRate.value * maskCacheSeconds.value);
    return { minFrame, maxFrame };
  }

  /**
   * Eviction order when over budget: farthest from the playhead first, and
   * while playing, frames behind the playhead before frames ahead.
   */
  function evictionCost(key: string) {
    const { frameId } = parseMaskKey(key);
    const current = frame.value;
    // Masks outside the preload window go before any mask inside it, so the
    // window is not evicted only to be queued and decoded again.
    const outside = frameId < cacheWindow.minFrame || frameId > cacheWindow.maxFrame
      ? Number.MAX_SAFE_INTEGER / 2 : 0;
    if (frameId < current) {
      return outside + (current - frameId) * (isPlaying() ? 4 : 1);
    }
    return outside + frameId - current;
  }

  function enforceBudget() {
    const evicted = rleCache.evictToBudget(MASK_CACHE_BUDGET_BYTES, evictionCost);
    if (evicted) {
      maskPerf.count('cache.budgetEvictions', evicted);
    }
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

  // Progress of the most recent window plan; results from superseded plans
  // still get cached but no longer drive the loading percent.
  let activeWindowPending: Set<string> | null = null;

  /**
   * Store decoded worker results: drop stale ones (the RLE was replaced while
   * decoding) and ones outside the window, then enforce the budget once.
   */
  const storeDecoded: CroppedMaskCallback = (results) => {
    results.forEach(({
      trackId, frameId, mask, source,
    }) => {
      const key = frameKey(frameId, trackId);
      inFlightWorker.delete(key);
      const current = rleMasks.value[trackId]?.[frameId];
      const stale = source !== undefined && source !== current;
      if (!stale && frameId >= cacheWindow.minFrame && frameId <= cacheWindow.maxFrame) {
        rleCache.set(key, mask);
        clearMaskWarning();
      }
      if (loadingFrame.value === key) {
        loadingFrame.value = false;
      }
    });
    enforceBudget();
  };

  function preloadWindow(currentFrame: number, force = false) {
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
      const tracksKey = [...visibleMaskIds.value].sort((x, y) => x - y).join(',');
      if (!force && tracksKey === cachedTracksKey
        && cacheWindow.minFrame <= currentFrame && cacheWindow.maxFrame > currentFrame) {
        // If cache is 70% the way through the window, start loading the next window
        const range = cacheWindow.maxFrame - cacheWindow.minFrame;
        if (currentFrame < cacheWindow.maxFrame - range * 0.3) {
          return; // Still within the cached window
        }
      }
      cacheWindow = { minFrame, maxFrame };
      cachedTracksKey = tracksKey;
      // Queued (not yet decoding) work is re-planned against the new window
      // below, closest-to-playhead first; in-flight batches keep running.
      cancelPending();
      const startTime = performance.now();
      const perfScanStart = maskPerf.now();
      // Evict decoded masks that fell out of the window (bounded by cache size,
      // not by the number of masks in the dataset).
      Array.from(rleCache.keys()).forEach((key) => {
        const frameId = Number(key.split('_')[0]);
        if (frameId < minFrame || frameId > maxFrame) {
          rleCache.delete(key);
        }
      });
      // Queue only masks in the window that are neither decoded nor already
      // queued/decoding; work from the previous window is kept, not redone.
      const subseMasks: Record<number, Record<number, RLEFrameData>> = {};
      let subsetSize = 0;
      visibleMaskIds.value.forEach((trackId) => {
        const trackMasks = rleMasks.value[trackId];
        if (!trackMasks) {
          return;
        }
        for (let frameId = minFrame; frameId <= maxFrame; frameId += 1) {
          const rle = trackMasks[frameId];
          const key = frameKey(frameId, trackId);
          if (rle && !rleCache.has(key) && !inFlightWorker.has(key)) {
            subseMasks[trackId] = subseMasks[trackId] || {};
            subseMasks[trackId][frameId] = rle;
            subsetSize += 1;
          }
        }
      });
      maskPerf.end('preload.windowScan', perfScanStart);
      if (maskPerf.enabled) {
        maskPerf.record('cache.megabytes', rleCache.bytes / (1024 * 1024));
        maskPerf.record('preload.windowFrames', maxFrame - minFrame + 1);
      }
      if (subsetSize === 0) {
        return;
      }
      maskPerf.record('preload.dispatched', subsetSize);
      const windowPending = new Set<string>();
      Object.keys(subseMasks).forEach((trackId) => {
        Object.keys(subseMasks[Number(trackId)]).forEach((frameId) => {
          windowPending.add(frameKey(Number(frameId), Number(trackId)));
        });
      });
      activeWindowPending = windowPending;
      maskLoadingPercent.value = 0;
      // Batches already in a worker finish and are cached if still in the window.
      preloadRLEMasks(frame.value, subseMasks, inFlightWorker, (results) => {
        storeDecoded(results);
        if (activeWindowPending !== windowPending) {
          return; // A newer plan replaced this one
        }
        results.forEach(({ trackId, frameId }) => {
          windowPending.delete(frameKey(frameId, trackId));
        });
        maskLoadingPercent.value = (1 - (windowPending.size / subsetSize)) * 100;
        if (windowPending.size === 0) {
          activeWindowPending = null;
          // Real decoded sizes are known now: re-size the window from them
          // (the first sizing may have used the cautious fallback guess).
          calculateMaxCacheSeconds();
          if (ENABLE_TIMING_LOGS) {
            console.log(`🧾 RLE Preloading completed in ${performance.now() - startTime}ms`);
          }
        }
      }, (trackId) => maskColorFor(trackId));
    }
  }

  /** Bytes for a mask covering FALLBACK_MASK_AREA_FRACTION of its frame */
  function fallbackMaskBytes() {
    const anyTrack = visibleMaskIds.value.find((trackId) => rleMasks.value[trackId]);
    const trackMasks = anyTrack !== undefined ? rleMasks.value[anyTrack] : undefined;
    const first = trackMasks ? Object.values(trackMasks)[0] : undefined;
    const [h, w] = first?.rle.size ?? [1080, 1920];
    return h * w * 4 * FALLBACK_MASK_AREA_FRACTION;
  }

  /**
   * Set maskMaxCacheSeconds to how far ahead the visible tracks' masks fit in
   * the memory budget (after reserving the frames kept behind the playhead),
   * using each track's measured average decoded size.
   */
  function calculateMaxCacheSeconds() {
    const fallback = fallbackMaskBytes();
    const tracks = visibleMaskIds.value
      .filter((trackId) => rleMasks.value[trackId])
      .map((trackId) => ({
        masks: rleMasks.value[trackId],
        bytes: rleCache.estimateBytes(trackId, fallback),
      }));
    const frameBytes = (f: number) => tracks.reduce(
      (acc, track) => (track.masks[f] ? acc + track.bytes : acc),
      0,
    );
    const current = frame.value;
    let budget = MASK_CACHE_BUDGET_BYTES * WINDOW_BUDGET_FRACTION;
    for (let f = Math.max(0, current - behindFrames()); f < current; f += 1) {
      budget -= frameBytes(f);
    }
    const lastFrame = current + Math.round(MAX_LOOKAHEAD_SECONDS * frameRate.value);
    let used = 0;
    let fitsUntil = lastFrame;
    for (let f = current; f <= lastFrame; f += 1) {
      used += frameBytes(f);
      if (used > budget) {
        fitsUntil = f - 1;
        break;
      }
    }
    const maxSeconds = Math.max(0, (fitsUntil - current) / frameRate.value);
    maskPerf.record('budget.lookaheadSeconds', maxSeconds);
    // Slider steps are 0.1s, minimum 0.1s
    maskMaxCacheSeconds.value = Math.max(0.1, Math.floor(maxSeconds * 10) / 10);
    // Follow the user's choice back up when the budget allows it again
    maskCacheSeconds.value = Math.min(preferredCacheSeconds, maskMaxCacheSeconds.value);
    tooManyMasks.value = maxSeconds < MIN_USEFUL_LOOKAHEAD_SECONDS;
  }

  function getMask(trackId: number, frameId: number): HTMLImageElement | undefined {
    const key = frameKey(frameId, trackId);
    const cacheFound = cache.get(key);
    if (cacheFound) {
      clearMaskWarning();
      return cacheFound;
    }
    if (useRLE.value) {
      const mask = rleMasks.value[trackId]?.[frameId];
      if (mask && inFlightWorker.has(key)) {
        loadingFrame.value = key;
        return undefined;
      }
      if (!mask) {
        setMaskWarning(`Missing RLE mask for track ${trackId}, frame ${frameId}. Check rlemasks.json mapping.`);
      }
    } else {
      const key = frameKey(frameId, trackId);
      if (inFlightRequests.has(key)) {
        loadingFrame.value = key;
        return undefined;
      }
      const hasMaskFile = masks.value.some((item) => (
        item.metadata?.trackId === trackId && Number(item.metadata?.frameId) === frameId
      ));
      if (!hasMaskFile) {
        setMaskWarning(`Missing mask file for track ${trackId}, frame ${frameId}.`);
      }
    }
    return undefined;
  }

  const debouncedPreloadWindow = debounce((newFrame: number) => {
    // The cache-seconds limit depends on how many masks follow the current
    // frame, so refresh it once the playhead settles (not on every frame).
    calculateMaxCacheSeconds();
    preloadWindow(newFrame);
  }, 300);

  watch(frame, (newFrame) => {
    maskPerf.frameChanged(newFrame);
    if (typeof newFrame === 'number' && maskModeEnabled.value && aggregateController.value.playing.value) {
      preloadWindow(newFrame);
    } else if (typeof newFrame === 'number' && maskModeEnabled.value && !aggregateController.value.playing.value) {
      // Wait until frame is settled for 300ms before preloading
      debouncedPreloadWindow(newFrame);
    }
  });

  watch(maskModeEnabled, (newVal) => {
    if (newVal && typeof frame.value === 'number') {
      preloadWindow(frame.value);
    }
  });

  // Playing keeps nothing behind the playhead; pausing keeps 0.5s behind
  // (the user may step back). Reshape the window when that changes.
  watch(() => isPlaying(), () => {
    if (visibleMaskIds.value.length > 0) {
      calculateMaxCacheSeconds();
    }
    if (maskModeEnabled.value && typeof frame.value === 'number') {
      preloadWindow(frame.value, true);
    }
  });

  watch(visibleMaskIds, () => {
    if (!tracksHaveMasksConfigured()) {
      clearMaskWarning();
    }
    if (visibleMaskIds.value.length > 0) {
      calculateMaxCacheSeconds();
    }
    if (maskModeEnabled.value && typeof frame.value === 'number') {
      preloadWindow(frame.value);
    }
  }, { immediate: true });

  watch(maskCacheSeconds, () => {
    calculateMaxCacheSeconds();
    if (maskModeEnabled.value && typeof frame.value === 'number') {
      preloadWindow(frame.value, true);
    }
  });

  // New mask data (dataset load, a saved segmentation): refresh the limit and
  // queue anything in the current window that is not decoded yet.
  watch(rleMasks, () => {
    if (visibleMaskIds.value.length > 0) {
      calculateMaxCacheSeconds();
    }
    if (maskModeEnabled.value && typeof frame.value === 'number') {
      preloadWindow(frame.value, true);
    }
  });

  if (maskPerf.enabled) {
    maskPerf.setPlaybackHooks({
      play: () => aggregateController.value.play(),
      pause: () => aggregateController.value.pause(),
      seek: (f: number) => aggregateController.value.seek(f),
      frame: () => frame.value,
    });
  }

  const hasMasks = computed(() => {
    if (useRLE.value) {
      return Object.keys(rleMasks.value).length > 0;
    }
    return masks.value.length > 0;
  });

  let mediaWasPlaying = false;
  watch(maskLoadingPercent, (newVal) => {
    if (newVal === 0 && aggregateController.value.playing.value && pauseOnLoading.value) {
      mediaWasPlaying = true;
      aggregateController.value.pause();
    }
    if (newVal === 100 && mediaWasPlaying && pauseOnLoading.value) {
      aggregateController.value.play();
      mediaWasPlaying = false;
    }
  });

  const getRLEMask = (trackId: number, frameId: number): RLEFrameData | undefined => rleMasks.value[trackId]?.[frameId];

  const getCroppedMask = (
    trackId: number,
    frameId: number,
    color: string,
  ): CroppedMask | undefined => {
    const key = frameKey(frameId, trackId);
    let cacheFound = rleCache.get(key);
    if (cacheFound) {
      maskPerf.count('cache.hit');
      if (cacheFound.color !== color) {
        // Track type/color changed since decoding: recolor in place (cheap
        // for a cropped mask) rather than decoding again.
        maskPerf.count('cache.recolor');
        cacheFound = recolorCropped(cacheFound, color);
        rleCache.set(key, cacheFound);
      }
      clearMaskWarning();
      return cacheFound;
    }
    if (inFlightWorker.has(key)) {
      maskPerf.count('cache.inflight');
      loadingFrame.value = key;
      return undefined;
    }
    maskPerf.count('cache.cold');
    const hasRLEMask = Boolean(rleMasks.value[trackId]?.[frameId]);
    if (!hasRLEMask) {
      setMaskWarning(`Missing RLE mask for track ${trackId}, frame ${frameId}. Check rlemasks.json mapping.`);
      return undefined;
    }
    // Re-plan only if the window moved or the visible tracks changed (a
    // cheap check); then decode just this mask, ahead of the queued window.
    preloadWindow(frame.value);
    if (!inFlightWorker.has(key) && !rleCache.has(key)) {
      preloadRLEMasks(
        frameId,
        { [trackId]: { [frameId]: rleMasks.value[trackId][frameId] } },
        inFlightWorker,
        storeDecoded,
        (id) => maskColorFor(id),
        true,
      );
    }
    if (inFlightWorker.has(key)) {
      loadingFrame.value = key;
    } else if (!rleCache.has(key)) {
      setMaskWarning(`Unable to load RLE mask for track ${trackId}, frame ${frameId}.`);
    }
    return undefined;
  };
  return {
    initializeMaskData,
    setFrameRate,
    getMask,
    getFolderRLEMasks,
    getRLEMask,
    getCroppedMask,
    setMaskColorResolver,
    deleteLocalMasks,
    editorOptions: {
      hasMasks,
      toolEnabled,
      brushSize,
      opacity,
      triggerAction,
      maskCacheSeconds,
      maskMaxCacheSeconds,
      tooManyMasks,
      maxBrushSize,
      loadingFrame,
      maskWarningMessage,
      useRLE,
      maskLoadingPercent,
      pauseOnLoading,
    },
    editorFunctions: {
      updateMaskData,
      setEditorOptions,
      addUpdateMaskFrame,
      createMaskFromBinary,
      deleteMaskFrame,
    },
  };
}
