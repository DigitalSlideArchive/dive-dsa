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
});
