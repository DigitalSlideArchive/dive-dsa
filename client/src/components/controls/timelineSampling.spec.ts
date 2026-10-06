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

  it('keeps non-collinear extrema in source order, including equal-frame points', () => {
    const values: Point[] = [[0, 2], [1, 5], [1, -1], [2, 3], [3, 2], [4, 2]];
    expect(sampleTimelineValues(values, 0, 4, () => 0, (value) => value, 'Linear'))
      .toEqual([values[0], values[1], values[2], values[3], values[5]]);
  });

  it('preserves the entry and exit values of a flat column', () => {
    const values: Point[] = [[0, 2], [1, 2], [2, 2], [3, 2]];
    expect(sampleTimelineValues(values, 0, 3, () => 0, (value) => value, 'Linear'))
      .toEqual([values[0], values[3]]);
  });

  it('drops collinear interior samples when zoomed in', () => {
    expect(sampleTimelineValues(pulse, 0, 1000, (frame) => frame * 2, (value) => value, 'Linear')).toEqual([
      [0, 0], [100, 0], [102, 1], [103, 0], [1000, 0],
    ]);
  });

  it('keeps oscillations that share a pixel column when zoomed out', () => {
    const values: Point[] = [[0, 0], [1, 10], [2, 0], [3, 10], [4, 0]];
    expect(sampleTimelineValues(values, 0, 4, () => 0, (value) => value, 'Linear'))
      .toEqual(values);
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
