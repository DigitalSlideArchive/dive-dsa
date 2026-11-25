import sampleTimelineValues from './timelineSampling';

type Point = [number, number];

const pulse: Point[] = [
  [0, 0], [100, 0], [101, 1], [102, 1], [103, 0], [900, 0], [1000, 0],
];

describe('timeline sampling', () => {
  it('keeps a narrow pulse return to baseline when zoomed out', () => {
    const sampled = sampleTimelineValues(pulse, 0, 1000, (frame) => frame / 10, (value) => value, 'Linear');
    const peakIndex = sampled.findIndex((point) => point[1] === 1);
    expect(sampled[peakIndex + 1]).toEqual([103, 0]);
    expect(sampled[peakIndex - 1]).toEqual([100, 0]);
  });

  it('keeps column extrema in source order, including equal-frame points', () => {
    // One pixel column: first, max, min and last span every interior value.
    const values: Point[] = [[0, 2], [1, 5], [1, -1], [2, 3], [3, 2], [4, 2]];
    expect(sampleTimelineValues(values, 0, 4, () => 0, (value) => value, 'Linear'))
      .toEqual([values[0], values[1], values[2], values[5]]);
  });

  it('preserves the entry and exit values of a flat column', () => {
    const values: Point[] = [[0, 2], [1, 2], [2, 2], [3, 2]];
    expect(sampleTimelineValues(values, 0, 3, () => 0, (value) => value, 'Linear'))
      .toEqual([values[0], values[3]]);
  });

  it('drops collinear interior samples when zoomed in', () => {
    // The 1px-tall plateau point [102, 1] is within the half-pixel tolerance.
    expect(sampleTimelineValues(pulse, 0, 1000, (frame) => frame * 2, (value) => value, 'Linear')).toEqual([
      [0, 0], [100, 0], [101, 1], [103, 0], [1000, 0],
    ]);
  });

  it('keeps the extent of oscillations that share a pixel column when zoomed out', () => {
    const values: Point[] = [[0, 0], [1, 10], [2, 0], [3, 10], [4, 0]];
    expect(sampleTimelineValues(values, 0, 4, () => 0, (value) => value, 'Linear'))
      .toEqual([values[0], values[1], values[4]]);
  });

  it('returns to baseline right after a one-frame spike in a dense per-frame series', () => {
    // Long video, value on every frame: hundreds of frames per pixel.
    const frames = 742500;
    const spikes = new Set([290000, 313000, 315000, 350000]);
    const values: Point[] = Array.from({ length: frames }, (_, frame) => [frame, spikes.has(frame) ? 1 : 0]);
    const x = (frame: number) => (frame / frames) * 750;
    const y = (value: number) => 60 - value * 50;
    const sampled = sampleTimelineValues(values, 0, frames - 1, x, y, 'Linear');
    expect(sampled.length).toBeLessThan(40);
    spikes.forEach((frame) => {
      const peak = sampled.findIndex((point) => point[0] === frame);
      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThan(sampled.length - 1);
      expect(sampled[peak][1]).toBe(1);
      // Neighbours are back on the baseline within the same pixel, not a ramp to the next spike.
      [sampled[peak - 1], sampled[peak + 1]].forEach((neighbour) => {
        expect(neighbour[1]).toBe(0);
        expect(Math.abs(x(neighbour[0]) - x(frame))).toBeLessThan(1);
      });
    });
  });

  it('keeps every source point within 1.5px of the drawn polyline', () => {
    // 0.5px Douglas-Peucker tolerance plus up to one pixel column from the min/max pass.
    const values: Point[] = Array.from({ length: 20000 }, (_, frame) => [
      frame,
      frame % 997 === 0 ? 5 : Math.sin(frame / 300),
    ]);
    const x = (frame: number) => frame / 25;
    const y = (value: number) => 100 - value * 10;
    const sampled = sampleTimelineValues(values, 0, 19999, x, y, 'Linear');
    expect(sampled.length).toBeLessThan(values.length / 4);
    const sx = sampled.map((p) => x(p[0]));
    const sy = sampled.map((p) => y(p[1]));
    let segment = 0;
    let worst = 0;
    values.forEach(([frame, value]) => {
      const [px, py] = [x(frame), y(value)];
      while (segment < sampled.length - 2 && sampled[segment + 1][0] < frame) segment += 1;
      let best = Infinity;
      // Nearby segments only: the polyline is frame-ordered and each column holds <= 4 points.
      for (let i = Math.max(0, segment - 8); i <= Math.min(sampled.length - 2, segment + 8); i += 1) {
        const [ax, ay, bx, by] = [sx[i], sy[i], sx[i + 1], sy[i + 1]];
        const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSq)) : 0;
        best = Math.min(best, Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
      }
      worst = Math.max(worst, best);
    });
    expect(worst).toBeLessThanOrEqual(1.5);
  });

  it('simplifies against the y the curve is drawn at (max-mode graphs)', () => {
    // 0.4 on a 0-100 scale is sub-pixel in raw y but full height when max mode draws v ? max : min.
    const values: Point[] = [[0, 0], [10, 0], [11, 0.4], [12, 0], [20, 0], [30, 0]];
    const x = (frame: number) => frame * 20;
    const rawY = (value: number) => 60 - value * 0.6;
    expect(sampleTimelineValues(values, 0, 30, x, rawY, 'Linear')).toEqual([[0, 0], [30, 0]]);
    const maxModeY = (value: number) => rawY(value ? 100 : 0);
    expect(sampleTimelineValues(values, 0, 30, x, maxModeY, 'Linear')).toEqual([
      [0, 0], [10, 0], [11, 0.4], [12, 0], [30, 0],
    ]);
  });

  it('culls short series to the viewport', () => {
    const values: Point[] = [[0, 0], [500, 1], [1000, 0]];
    expect(sampleTimelineValues(values, 900, 1000, (frame) => frame, (value) => value, 'Step'))
      .toEqual([[500, 1], [1000, 0]]);
  });

  it.each(['Step', 'StepBefore', 'StepAfter', 'Natural'] as const)(
    'preserves all visible %s transitions and viewport neighbours',
    (type) => {
      expect(sampleTimelineValues(pulse, 100, 103, () => 0, () => 0, type))
        .toEqual(pulse.slice(0, 6));
    },
  );

  it('preserves the segments crossing both viewport edges', () => {
    expect(sampleTimelineValues(pulse, 102.5, 500, (frame) => frame, (value) => value, 'Linear')).toEqual([
      [102, 1], [103, 0], [1000, 0],
    ]);
  });

  it('still reduces dense collinear linear series', () => {
    const values: Point[] = Array.from({ length: 10000 }, (_, frame) => [frame, frame]);
    const sampled = sampleTimelineValues(values, 0, 9999, (frame) => frame / 100, (value) => value, 'Linear');
    expect(sampled.length).toBe(2);
    expect(sampled[0]).toEqual(values[0]);
    expect(sampled[sampled.length - 1]).toEqual(values[9999]);
  });

  it('accepts empty and short series', () => {
    expect(sampleTimelineValues([], 0, 1000, () => 0, () => 0, 'Linear')).toEqual([]);
    expect(sampleTimelineValues(pulse.slice(0, 2), 0, 1000, () => 0, () => 0, 'Linear'))
      .toEqual(pulse.slice(0, 2));
  });
});
