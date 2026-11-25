import type { CroppedMask } from './rle';

const MB = 1024 * 1024;

/** Rough fixed cost of a cache entry beyond its pixel buffer (objects, key) */
export const MASK_ENTRY_OVERHEAD_BYTES = 256;

/**
 * Memory budget for decoded masks. GPU textures live as long as their cache
 * entry, so this also bounds mask texture memory. Halved on devices that
 * report 4 GB of memory or less.
 */
export function defaultMaskCacheBudgetBytes(): number {
  const deviceMemory = typeof navigator !== 'undefined'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (navigator as any).deviceMemory as number | undefined
    : undefined;
  return deviceMemory !== undefined && deviceMemory <= 4 ? 128 * MB : 256 * MB;
}

export function maskEntryBytes(mask: CroppedMask) {
  return mask.data.byteLength + MASK_ENTRY_OVERHEAD_BYTES;
}

/** Cache keys are `${frameId}_${trackId}` */
export function parseMaskKey(key: string) {
  const [frameId, trackId] = key.split('_').map(Number);
  return { frameId, trackId };
}

type SizeStat = { count: number; average: number };

/**
 * Decoded mask cache that tracks its size in bytes and the average decoded
 * size per track, so the preload window can be sized by memory rather than
 * by a mask count.
 */
export default class MaskCache {
  private entries = new Map<string, CroppedMask>();

  private totalBytes = 0;

  private trackSizes = new Map<number, SizeStat>();

  private allSizes: SizeStat = { count: 0, average: 0 };

  get bytes() {
    return this.totalBytes;
  }

  get size() {
    return this.entries.size;
  }

  get(key: string) {
    return this.entries.get(key);
  }

  has(key: string) {
    return this.entries.has(key);
  }

  keys() {
    return this.entries.keys();
  }

  set(key: string, mask: CroppedMask) {
    const previous = this.entries.get(key);
    if (previous) {
      this.totalBytes -= maskEntryBytes(previous);
    }
    const bytes = maskEntryBytes(mask);
    this.entries.set(key, mask);
    this.totalBytes += bytes;
    const { trackId } = parseMaskKey(key);
    let stat = this.trackSizes.get(trackId);
    if (!stat) {
      stat = { count: 0, average: 0 };
      this.trackSizes.set(trackId, stat);
    }
    MaskCache.addSample(stat, bytes);
    MaskCache.addSample(this.allSizes, bytes);
    return this;
  }

  delete(key: string) {
    const previous = this.entries.get(key);
    if (!previous) {
      return false;
    }
    this.totalBytes -= maskEntryBytes(previous);
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  /**
   * Expected bytes for one of the track's masks: its running average, else
   * the average over all tracks, else `fallback`.
   */
  estimateBytes(trackId: number, fallback: number) {
    const stat = this.trackSizes.get(trackId);
    if (stat && stat.count) return stat.average;
    if (this.allSizes.count) return this.allSizes.average;
    return fallback;
  }

  /**
   * Evict entries with the largest `cost` (e.g. distance from the playhead)
   * until the cache fits in `budgetBytes`. Returns the number evicted.
   */
  evictToBudget(budgetBytes: number, cost: (key: string) => number) {
    if (this.totalBytes <= budgetBytes) return 0;
    const ranked = Array.from(this.entries.keys())
      .map((key) => ({ key, cost: cost(key) }))
      .sort((a, b) => b.cost - a.cost);
    let evicted = 0;
    for (let i = 0; i < ranked.length && this.totalBytes > budgetBytes; i += 1) {
      this.delete(ranked[i].key);
      evicted += 1;
    }
    return evicted;
  }

  /**
   * Running mean that turns into a moving average after 50 samples, so the
   * estimate follows masks that grow or shrink over a track.
   */
  private static addSample(stat: SizeStat, bytes: number) {
    // eslint-disable-next-line no-param-reassign
    stat.count += 1;
    // eslint-disable-next-line no-param-reassign
    stat.average += (bytes - stat.average) / Math.min(stat.count, 50);
  }
}
