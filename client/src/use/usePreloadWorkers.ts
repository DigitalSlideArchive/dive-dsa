/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { RLEFrameData } from 'platform/web-girder/api/annotation.service';
import maskPerf from './maskPerf';

export interface LuminanceMask {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface WorkerPoolOptions {
  batchSize: number;
  maxWorkers?: number; // defaults to half of CPU cores
  enableTimingLogs?: boolean;
}

export type LuminanceMaskCallback = (
  results: { trackId: number; frameId: number; mask: LuminanceMask }[]
) => void;

/**
 * Create a reusable RLE worker pool preloader.
 * It spawns multiple workers and processes mask batches in parallel.
 */
export function createRLEPreloader(
  RLEWorkerFactory: () => Worker,
  options: WorkerPoolOptions,
) {
  const {
    batchSize,
    maxWorkers = navigator.hardwareConcurrency
      ? Math.max(1, Math.floor(navigator.hardwareConcurrency / 4))
      : 4,
    enableTimingLogs = false,
  } = options;

  const workers = Array.from({ length: maxWorkers }, () => RLEWorkerFactory());
  const workerBusy = new Array(maxWorkers).fill(false);
  let lastTime = 0;

  type PendingBatch = {
    batch: { trackId: number; frameId: number; rleWrapper: RLEFrameData }[];
    callback: LuminanceMaskCallback;
    // Caller's in-flight map; keys are released if the batch is dropped
    inFlight: Map<string, boolean>;
  };
  const pendingBatches: PendingBatch[] = [];

  /** A batch that will never report results: let its masks be queued again. */
  function releaseBatch(pending: PendingBatch | undefined) {
    pending?.batch.forEach(({ trackId, frameId }) => {
      pending.inFlight.delete(`${frameId}_${trackId}`);
    });
  }

  function tryDispatchWork() {
    for (let i = 0; i < maxWorkers && pendingBatches.length > 0; i += 1) {
    // Find first free worker
      const workerIndex = workerBusy.findIndex((busy) => !busy);
      if (workerIndex === -1) {
        break; // no free workers
      }

      const next = pendingBatches.shift()!;
      const worker = workers[workerIndex];
      workerBusy[workerIndex] = true;

      if (enableTimingLogs) {
        console.log(`🧾 Dispatching batch of size ${next.batch.length} to worker ${workerIndex}`);
      }

      worker.postMessage({ rleMasks: next.batch });
      (worker as any)._currentCallback = next.callback;
      (worker as any)._currentBatch = next;
      (worker as any)._dispatchedAt = maskPerf.now();
    }
  }

  // Setup event handlers for each worker
  workers.forEach((worker, index) => {
    // eslint-disable-next-line no-param-reassign
    worker.onmessage = (event) => {
      workerBusy[index] = false;
      const { rleLuminanceMasks, status, decodeMs } = event.data;
      const currentBatch: PendingBatch | undefined = (worker as any)._currentBatch;
      // eslint-disable-next-line no-param-reassign
      delete (worker as any)._currentBatch;
      if (status === 'stopped') {
        releaseBatch(currentBatch);
        // eslint-disable-next-line no-param-reassign
        delete (worker as any)._currentCallback;
        tryDispatchWork();
        return;
      }
      if (maskPerf.enabled && Array.isArray(rleLuminanceMasks) && rleLuminanceMasks.length) {
        maskPerf.end('worker.batchRoundTrip', (worker as any)._dispatchedAt);
        if (typeof decodeMs === 'number') {
          maskPerf.record('worker.decodePerMask', decodeMs / rleLuminanceMasks.length);
        }
      }
      const callback: LuminanceMaskCallback | undefined = (worker as any)._currentCallback;
      // eslint-disable-next-line no-param-reassign
      delete (worker as any)._currentCallback;

      if (enableTimingLogs) {
        const end = performance.now();
        console.log(`🧾 Worker ${index} finished batch in ${end - lastTime}ms`);
        lastTime = end;
      }

      if (callback && Array.isArray(rleLuminanceMasks)) {
        const results = rleLuminanceMasks.map((rle: any) => ({
          trackId: rle.trackId,
          frameId: rle.frameId,
          mask: {
            width: rle.width,
            height: rle.height,
            data: rle.data as Uint8Array,
          },
        }));
        callback(results);
      }

      // Whenever a worker finishes, try to dispatch more work
      tryDispatchWork();
    };
    // eslint-disable-next-line no-param-reassign
    worker.onerror = (err) => {
      workerBusy[index] = false;
      console.error(`Worker ${index} error:`, err);
    };
  });

  /**
   * Preload RLE masks in parallel.
   * @param currentFrame Frame ID used to prioritize which masks to process first
   * @param rleMasks Map of trackId → frameId → RLEFrameData
   * @param inFlightWorker Map to track which frames are already being processed
   * @param callback Function that receives luminance mask results as they arrive
   */
  function preloadRLEMasks(
    currentFrame: number,
    rleMasks: Record<number, Record<number, RLEFrameData>>,
    inFlightWorker: Map<string, boolean>,
    callback: LuminanceMaskCallback,
  ) {
    const sortedFlattenedMaskEntries: {
      trackId: number;
      frameId: number;
      rleWrapper: RLEFrameData;
    }[] = [];

    // Collect tasks not already cached or in-flight
    Object.keys(rleMasks).forEach((trackIdStr) => {
      const trackId = Number(trackIdStr);
      Object.keys(rleMasks[trackId]).forEach((frameIdStr) => {
        const frameId = Number(frameIdStr);
        const key = `${frameId}_${trackId}`;

        if (!inFlightWorker.has(key)) {
          sortedFlattenedMaskEntries.push({
            trackId,
            frameId,
            rleWrapper: rleMasks[trackId][frameId],
          });
          inFlightWorker.set(key, true);
        }
      });
    });

    // Sort by distance to currentFrame
    sortedFlattenedMaskEntries.sort((a, b) => {
      const distA = Math.abs(a.frameId - currentFrame);
      const distB = Math.abs(b.frameId - currentFrame);
      return distA - distB;
    });

    if (sortedFlattenedMaskEntries.length === 0) {
      return;
    }

    // Break into batches. Not-yet-dispatched batches from an earlier call are
    // replaced; release their keys so a later call can queue them again.
    pendingBatches.forEach(releaseBatch);
    pendingBatches.length = 0;
    for (let i = 0; i < sortedFlattenedMaskEntries.length; i += batchSize) {
      pendingBatches.push({
        batch: sortedFlattenedMaskEntries.slice(i, i + batchSize),
        callback,
        inFlight: inFlightWorker,
      });
    }

    if (enableTimingLogs) {
      lastTime = performance.now();
      console.log(`🧾 Worker Start: ${lastTime}`);
    }

    // Launch initial workers
    tryDispatchWork(); // fill as many workers as possible initially
  }

  /**
   * Terminate all workers (optional cleanup)
   */
  function terminate() {
    workers.forEach((w) => w.terminate());
    workerBusy.fill(false);
    pendingBatches.length = 0;
  }

  /**
   * Drop batches that have not been sent to a worker yet and release their
   * keys from the caller's in-flight map. Batches already in a worker finish.
   */
  function cancelPending() {
    pendingBatches.forEach(releaseBatch);
    pendingBatches.length = 0;
  }

  function clearQueue() {
    pendingBatches.forEach(releaseBatch);
    pendingBatches.length = 0;
    workerBusy.fill(false);
    workers.forEach((worker) => {
      worker.postMessage({ command: 'stop' });
    });
  }

  return {
    preloadRLEMasks,
    terminate,
    clearQueue,
    cancelPending,
  };
}
