/* eslint-disable no-console */
/**
 * Opt-in instrumentation for mask rendering performance.
 *
 * Disabled by default and near zero-cost when off (one boolean check per
 * call site). Enable from the browser console, then reload:
 *
 *   diveMaskPerf.enable()      // persists in localStorage ('dive.maskPerf')
 *   diveMaskPerf.reset()       // clear samples (e.g. after the first load)
 *   ...play / scrub...
 *   diveMaskPerf.report()      // console.table of p50/p95/p99/max per metric
 *   diveMaskPerf.benchmark({ seconds: 10, fromFrame: 0 })  // scripted playback run
 *   diveMaskPerf.export()      // JSON summary, for comparing runs
 *
 * While enabled each timing is also emitted as a `performance.measure`
 * named `mask:<metric>`, so it shows on the DevTools Performance "Timings" track.
 *
 * Metric names:
 *   rle.fetch              GET rle_mask + JSON parse (once per dataset load)
 *   preload.windowScan     preloadWindow() scan of every track/frame to build the decode set
 *   preload.dispatched     (count) masks sent to decode workers per window
 *   worker.batchRoundTrip  dispatch -> results for one worker batch (queue + decode + transfer)
 *   worker.decodePerMask   decode + luminance conversion inside the worker, per mask
 *   cache.hit / cache.inflight / cache.cold / cache.recolor   (counts) getCroppedMask lookups
 *   cache.megabytes        decoded-mask cache size at each window re-plan
 *   cache.budgetEvictions  (count) masks evicted because the cache exceeded its memory budget
 *   preload.windowFrames   frames in the preload window at each re-plan
 *   budget.lookaheadSeconds  how far ahead the memory budget allows (each resize)
 *   layer.newTextures      (count) mask quads built (each uploads a texture)
 *   layer.updateLayers     whole LayerManager.updateLayers() call
 *   layer.maskCollect      gathering decoded masks for the frame
 *   layer.maskDraw         quad.data().draw() for all mask layers (texture upload)
 *   frame.timeToMask       frame change -> every expected mask drawn for that frame
 *   frame.incomplete       (count) renders that drew fewer masks than the frame has
 *   frame.abandoned        (count) frames left before all their masks were drawn (dropped during playback)
 *   frame.masksDrawn       masks drawn per render (as a sample)
 *   raf.interval           requestAnimationFrame interval while benchmarking (jank)
 */

const STORAGE_KEY = 'dive.maskPerf';
const MAX_SAMPLES = 20000;

type Stat = { samples: number[]; count: number; total: number };

export interface PlaybackHooks {
  play: () => void;
  pause: () => void;
  seek: (frame: number) => void;
  frame: () => number;
}

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const stats = new Map<string, Stat>();
const counters = new Map<string, number>();
let pendingFrame: { frame: number; start: number } | null = null;
let playback: PlaybackHooks | null = null;

export const maskPerf = {
  enabled: typeof window !== 'undefined' && readEnabled(),

  now(): number {
    return this.enabled ? performance.now() : 0;
  },

  /** Record a duration that started at `start` (from maskPerf.now()). */
  end(name: string, start: number) {
    if (!this.enabled) return;
    const endTime = performance.now();
    this.record(name, endTime - start);
    try {
      // Options form (User Timing L3) is missing from this TypeScript version's lib types
      (performance.measure as unknown as (n: string, o: { start: number; end: number }) => void).call(
        performance,
        `mask:${name}`,
        { start, end: endTime },
      );
    } catch {
      // older browsers without the options form; timing is still recorded
    }
  },

  record(name: string, value: number) {
    if (!this.enabled) return;
    let stat = stats.get(name);
    if (!stat) {
      stat = { samples: [], count: 0, total: 0 };
      stats.set(name, stat);
    }
    stat.count += 1;
    stat.total += value;
    if (stat.samples.length < MAX_SAMPLES) {
      stat.samples.push(value);
    } else {
      // reservoir sample so long runs stay representative
      const idx = Math.floor(Math.random() * stat.count);
      if (idx < MAX_SAMPLES) stat.samples[idx] = value;
    }
  },

  count(name: string, n = 1) {
    if (!this.enabled) return;
    counters.set(name, (counters.get(name) ?? 0) + n);
  },

  /** Called when the current frame changes (before the layers redraw). */
  frameChanged(frame: number) {
    if (!this.enabled) return;
    if (pendingFrame && pendingFrame.frame !== frame) {
      // left the previous frame before all of its masks were drawn
      this.count('frame.abandoned');
    }
    pendingFrame = { frame, start: performance.now() };
  },

  /** Called after masks are drawn for `frame`. */
  masksRendered(frame: number, expected: number, drawn: number) {
    if (!this.enabled) return;
    if (expected === 0) {
      if (pendingFrame?.frame === frame) pendingFrame = null;
      return;
    }
    this.record('frame.masksDrawn', drawn);
    if (drawn < expected) {
      this.count('frame.incomplete');
      return;
    }
    if (pendingFrame && pendingFrame.frame === frame) {
      this.end('frame.timeToMask', pendingFrame.start);
      pendingFrame = null;
    }
  },

  setPlaybackHooks(hooks: PlaybackHooks | null) {
    playback = hooks;
  },
};

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summary() {
  const timings: Record<string, Record<string, number>> = {};
  stats.forEach((stat, name) => {
    const sorted = [...stat.samples].sort((a, b) => a - b);
    const round = (v: number) => Math.round(v * 100) / 100;
    timings[name] = {
      count: stat.count,
      mean: round(stat.total / stat.count),
      p50: round(percentile(sorted, 50)),
      p95: round(percentile(sorted, 95)),
      p99: round(percentile(sorted, 99)),
      max: round(sorted[sorted.length - 1] ?? 0),
      total: round(stat.total),
    };
  });
  return { timings, counters: Object.fromEntries(counters) };
}

function reset() {
  stats.clear();
  counters.clear();
  pendingFrame = null;
  try {
    performance.clearMeasures();
  } catch {
    // ignore
  }
}

function report() {
  const { timings, counters: counts } = summary();
  console.log('%cMask perf (ms)', 'font-weight:bold');
  console.table(timings);
  console.table(counts);
  return { timings, counters: counts };
}

function waitMs(ms: number) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function benchmark({ seconds = 10, fromFrame = 0, settleMs = 1500 } = {}) {
  if (!maskPerf.enabled) {
    console.warn('diveMaskPerf is disabled: run diveMaskPerf.enable() and reload first.');
    return null;
  }
  if (!playback) {
    console.warn('No playback hooks registered: open a dataset with masks and enable the Mask layer.');
    return null;
  }
  playback.pause();
  playback.seek(fromFrame);
  await waitMs(settleMs); // let the first window decode
  reset();
  let running = true;
  let last = performance.now();
  const tick = (t: number) => {
    maskPerf.record('raf.interval', t - last);
    last = t;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
  const startFrame = playback.frame();
  const start = performance.now();
  playback.play();
  await waitMs(seconds * 1000);
  playback.pause();
  running = false;
  const elapsed = (performance.now() - start) / 1000;
  const framesAdvanced = playback.frame() - startFrame;
  counters.set('benchmark.framesAdvanced', framesAdvanced);
  counters.set('benchmark.effectiveFps', Math.round((framesAdvanced / elapsed) * 10) / 10);
  return report();
}

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).diveMaskPerf = {
    enable() {
      window.localStorage.setItem(STORAGE_KEY, '1');
      maskPerf.enabled = true;
      console.log('diveMaskPerf enabled. Reload to capture dataset load timings.');
    },
    disable() {
      window.localStorage.removeItem(STORAGE_KEY);
      maskPerf.enabled = false;
    },
    reset,
    report,
    benchmark,
    export: () => JSON.stringify({ userAgent: navigator.userAgent, ...summary() }, null, 2),
  };
}

export default maskPerf;
