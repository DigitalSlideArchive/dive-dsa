/// <reference types="jest" />
import { createRLEPreloader } from './usePreloadWorkers';

class FakeWorker {
  posted: unknown[] = [];

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onerror: ((err: unknown) => void) | null = null;

  postMessage(msg: unknown) { this.posted.push(msg); }

  terminate() { this.posted = []; }
}

const rle = { rle: { size: [1, 1], counts: '' } } as never;

describe('createRLEPreloader', () => {
  it('releases keys of queued batches that are cancelled or replaced', () => {
    const workers: FakeWorker[] = [];
    const { preloadRLEMasks, cancelPending } = createRLEPreloader(
      () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; },
      { batchSize: 1, maxWorkers: 1 },
    );
    const inFlight = new Map<string, boolean>();
    preloadRLEMasks(0, { 1: { 0: rle, 1: rle, 2: rle } }, inFlight, jest.fn());
    // frame 0 dispatched to the only worker, frames 1 and 2 queued
    expect(workers[0].posted).toHaveLength(1);
    expect([...inFlight.keys()].sort()).toEqual(['0_1', '1_1', '2_1']);
    cancelPending();
    expect([...inFlight.keys()]).toEqual(['0_1']);
  });

  it('releases a dispatched batch when the worker reports it stopped', () => {
    const workers: FakeWorker[] = [];
    const { preloadRLEMasks } = createRLEPreloader(
      () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; },
      { batchSize: 5, maxWorkers: 1 },
    );
    const inFlight = new Map<string, boolean>();
    const callback = jest.fn();
    preloadRLEMasks(0, { 1: { 0: rle } }, inFlight, callback);
    workers[0].onmessage?.({ data: { status: 'stopped' } });
    expect(inFlight.size).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps a stopped worker busy until it replies', () => {
    const workers: FakeWorker[] = [];
    const { preloadRLEMasks, clearQueue } = createRLEPreloader(
      () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; },
      { batchSize: 1, maxWorkers: 1 },
    );
    const inFlight = new Map<string, boolean>();
    preloadRLEMasks(0, { 1: { 0: rle } }, inFlight, jest.fn());
    clearQueue();
    preloadRLEMasks(0, { 2: { 0: rle } }, inFlight, jest.fn());
    // batch, stop; the new batch waits for the worker's reply
    expect(workers[0].posted).toHaveLength(2);
    workers[0].onmessage?.({ data: { status: 'stopped' } });
    expect(workers[0].posted).toHaveLength(3);
    expect([...inFlight.keys()]).toEqual(['0_2']);
  });

  it('queues priority work ahead of pending batches without dropping them', () => {
    const workers: FakeWorker[] = [];
    const { preloadRLEMasks } = createRLEPreloader(
      () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; },
      { batchSize: 1, maxWorkers: 1 },
    );
    const inFlight = new Map<string, boolean>();
    preloadRLEMasks(0, { 1: { 0: rle, 1: rle } }, inFlight, jest.fn());
    const priorityCallback = jest.fn();
    preloadRLEMasks(5, { 1: { 5: rle } }, inFlight, priorityCallback, undefined, true);
    expect([...inFlight.keys()].sort()).toEqual(['0_1', '1_1', '5_1']);
    // Worker finishes frame 0; the priority mask is dispatched next
    workers[0].onmessage?.({ data: { croppedMasks: [] } });
    expect(workers[0].posted[1]).toMatchObject({ rleMasks: [{ frameId: 5 }] });
    // Results carry the decoded RLE so callers can detect stale results
    workers[0].onmessage?.({ data: { croppedMasks: [{ trackId: 1, frameId: 5 }] } });
    expect(priorityCallback.mock.calls[0][0][0].source).toBe(rle);
  });

  it('releases the batch of a worker that errors', () => {
    const workers: FakeWorker[] = [];
    const { preloadRLEMasks } = createRLEPreloader(
      () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; },
      { batchSize: 5, maxWorkers: 1 },
    );
    const inFlight = new Map<string, boolean>();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    preloadRLEMasks(0, { 1: { 0: rle } }, inFlight, jest.fn());
    workers[0].onerror?.(new Error('boom'));
    expect(inFlight.size).toBe(0);
  });
});
