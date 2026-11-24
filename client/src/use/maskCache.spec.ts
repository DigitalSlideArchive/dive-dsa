/// <reference types="jest" />
import MaskCache, { MASK_ENTRY_OVERHEAD_BYTES, parseMaskKey } from './maskCache';
import type { CroppedMask } from './rle';

const mask = (bytes: number): CroppedMask => ({
  x: 0, y: 0, width: 1, height: 1, data: new Uint8Array(bytes), color: '#fff', frameWidth: 1, frameHeight: 1,
});

describe('MaskCache', () => {
  it('tracks total bytes across set, replace and delete', () => {
    const cache = new MaskCache();
    cache.set('0_1', mask(100));
    cache.set('1_1', mask(200));
    expect(cache.bytes).toBe(300 + 2 * MASK_ENTRY_OVERHEAD_BYTES);
    cache.set('1_1', mask(50));
    expect(cache.bytes).toBe(150 + 2 * MASK_ENTRY_OVERHEAD_BYTES);
    cache.delete('0_1');
    cache.delete('missing');
    expect(cache.bytes).toBe(50 + MASK_ENTRY_OVERHEAD_BYTES);
    cache.clear();
    expect(cache.bytes).toBe(0);
  });

  it('estimates per track, then across tracks, then the fallback', () => {
    const cache = new MaskCache();
    expect(cache.estimateBytes(1, 999)).toBe(999);
    cache.set('0_1', mask(1000 - MASK_ENTRY_OVERHEAD_BYTES));
    cache.set('1_1', mask(3000 - MASK_ENTRY_OVERHEAD_BYTES));
    expect(cache.estimateBytes(1, 999)).toBe(2000);
    // track 2 has no samples: use the all-track average
    expect(cache.estimateBytes(2, 999)).toBe(2000);
  });

  it('evicts the highest-cost entries until within budget', () => {
    const cache = new MaskCache();
    [0, 5, 10, 20].forEach((frame) => cache.set(`${frame}_1`, mask(1000)));
    const per = 1000 + MASK_ENTRY_OVERHEAD_BYTES;
    const evicted = cache.evictToBudget(per * 2, (key) => Math.abs(parseMaskKey(key).frameId - 6));
    expect(evicted).toBe(2);
    // distances from frame 6: 0->6, 5->1, 10->4, 20->14; the two farthest go
    expect(Array.from(cache.keys()).sort()).toEqual(['10_1', '5_1']);
    expect(cache.evictToBudget(per * 2, () => 0)).toBe(0);
  });
});
