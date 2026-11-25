/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { RLEFrameData } from 'platform/web-girder/api/annotation.service';
import maskPerf from './maskPerf';
import type { CroppedMask } from './rle';

export interface WorkerPoolOptions {
  batchSize: number;
  maxWorkers?: number; // defaults to half of CPU cores
  enableTimingLogs?: boolean;
}

export type CroppedMaskCallback = (
  results: {
    trackId: number;
    frameId: number;
    mask: CroppedMask;
    /** The RLE entry that was decoded, so callers can drop stale results */
    source?: RLEFrameData;
  }[]
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
    batch: {
      trackId: number; frameId: number; rleWrapper: RLEFrameData; color: string;
    }[];
    callback: CroppedMaskCallback;
    // Caller's in-flight map; keys are released if the batch is dropped
    inFlight: Map<string, boolean>;
    // On-demand work (a mask needed now): survives window re-plans
    priority: boolean;
  };
  const pendingBatches: PendingBatch[] = [];

  /** A batch that will never report results: let its masks be queued again. */
  function releaseBatch(pending: PendingBatch | undefined) {
    pending?.batch.forEach(({ trackId, frameId }) => {
      pending.inFlight.delete(`${frameId}_${trackId}`);
    });
  }

  /** Drop queued window batches, keeping priority (on-demand) ones. */
  function dropWindowBatches() {
    const kept = pendingBatches.filter((pending) => pending.priority);
    pendingBatches.filter((pending) => !pending.priority).forEach(releaseBatch);
    pendingBatches.length = 0;
    pendingBatches.push(...kept);
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
      const { croppedMasks, status, decodeMs } = event.data;
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
      if (maskPerf.enabled && Array.isArray(croppedMasks) && croppedMasks.length) {
        maskPerf.end('worker.batchRoundTrip', (worker as any)._dispatchedAt);
        if (typeof decodeMs === 'number') {
          maskPerf.record('worker.decodePerMask', decodeMs / croppedMasks.length);
        }
      }
      const callback: CroppedMaskCallback | undefined = (worker as any)._currentCallback;
      // eslint-disable-next-line no-param-reassign
      delete (worker as any)._currentCallback;

      if (enableTimingLogs) {
        const end = performance.now();
        console.log(`🧾 Worker ${index} finished batch in ${end - lastTime}ms`);
        lastTime = end;
      }

      if (callback && Array.isArray(croppedMasks)) {
        // The worker returns results in batch order
        const results = croppedMasks.map((rle: any, i: number) => ({
          trackId: rle.trackId,
          frameId: rle.frameId,
          source: currentBatch?.batch[i]?.rleWrapper,
          mask: {
            x: rle.x,
            y: rle.y,
            width: rle.width,
            height: rle.height,
            data: rle.data as Uint8Array,
            color: rle.color,
            frameWidth: rle.frameWidth,
            frameHeight: rle.frameHeight,
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
      // The batch will never report back: let its masks be queued again
      releaseBatch((worker as any)._currentBatch);
      // eslint-disable-next-line no-param-reassign
      delete (worker as any)._currentBatch;
      // eslint-disable-next-line no-param-reassign
      delete (worker as any)._currentCallback;
      tryDispatchWork();
    };
  });

  /**
   * Preload RLE masks in parallel.
   * @param currentFrame Frame ID used to prioritize which masks to process first
   * @param rleMasks Map of trackId → frameId → RLEFrameData
   * @param inFlightWorker Map to track which frames are already being processed
   * @param callback Function that receives cropped mask results as they arrive
   * @param colorFor Display color baked into each track's masks
   * @param priority Queue ahead of pending work instead of replacing it
   */
  function preloadRLEMasks(
    currentFrame: number,
    rleMasks: Record<number, Record<number, RLEFrameData>>,
    inFlightWorker: Map<string, boolean>,
    callback: CroppedMaskCallback,
    colorFor: (trackId: number) => string = () => '#ffffff',
    priority = false,
  ) {
    const sortedFlattenedMaskEntries: PendingBatch['batch'] = [];

    // Collect tasks not already cached or in-flight
    Object.keys(rleMasks).forEach((trackIdStr) => {
      const trackId = Number(trackIdStr);
      const color = colorFor(trackId);
      Object.keys(rleMasks[trackId]).forEach((frameIdStr) => {
        const frameId = Number(frameIdStr);
        const key = `${frameId}_${trackId}`;

        if (!inFlightWorker.has(key)) {
          sortedFlattenedMaskEntries.push({
            trackId,
            frameId,
            rleWrapper: rleMasks[trackId][frameId],
            color,
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

    // Break into batches. Unless this is priority work, not-yet-dispatched
    // window batches from an earlier call are replaced (their keys released
    // so a later call can queue them again); priority batches stay queued.
    const batches: PendingBatch[] = [];
    for (let i = 0; i < sortedFlattenedMaskEntries.length; i += batchSize) {
      batches.push({
        batch: sortedFlattenedMaskEntries.slice(i, i + batchSize),
        callback,
        inFlight: inFlightWorker,
        priority,
      });
    }
    if (priority) {
      pendingBatches.unshift(...batches);
    } else {
      dropWindowBatches();
      pendingBatches.push(...batches);
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
   * Drop window batches that have not been sent to a worker yet and release
   * their keys from the caller's in-flight map. Priority batches stay queued
   * (a mask is waiting on them) and batches already in a worker finish.
   */
  function cancelPending() {
    dropWindowBatches();
  }

  /**
   * Drop pending batches and ask running workers to stop. Workers stay busy
   * until they reply ('stopped' or their results), so a new batch is never
   * sent to a worker whose previous batch is still running.
   */
  function clearQueue() {
    pendingBatches.forEach(releaseBatch);
    pendingBatches.length = 0;
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
