/// <reference types="jest" />
import { locateSegment } from './listUtils';

describe('locateSegment', () => {
  const ranges = [10, 20, 30, 40, 50, 60];

  it('finds the containing segment, inclusive of both ends', () => {
    expect(locateSegment(ranges, 10).inside).toEqual([10, 20]);
    expect(locateSegment(ranges, 35).inside).toEqual([30, 40]);
    expect(locateSegment(ranges, 60).inside).toEqual([50, 60]);
  });

  it('returns neighbours around a containing segment', () => {
    expect(locateSegment(ranges, 35)).toEqual({ inside: [30, 40], before: [10, 20], after: [50, 60] });
  });

  it('returns the nearest segments on each side of a gap', () => {
    expect(locateSegment(ranges, 25)).toEqual({ inside: null, before: [10, 20], after: [30, 40] });
    expect(locateSegment(ranges, 5)).toEqual({ inside: null, before: null, after: [10, 20] });
    expect(locateSegment(ranges, 61)).toEqual({ inside: null, before: [50, 60], after: null });
  });

  it('handles empty and uneven lists', () => {
    expect(locateSegment([], 5)).toEqual({ inside: null, before: null, after: null });
    // trailing unpaired value is ignored, as the old linear loops did
    expect(locateSegment([10, 20, 30], 35)).toEqual({ inside: null, before: [10, 20], after: null });
  });

  it('matches a linear scan for every frame', () => {
    const many: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      many.push(i * 10, i * 10 + 4);
    }
    for (let frame = -5; frame < 2010; frame += 1) {
      let expected: [number, number] | null = null;
      for (let i = 0; i < many.length; i += 2) {
        if (frame >= many[i] && frame <= many[i + 1]) {
          expected = [many[i], many[i + 1]];
        }
      }
      expect(locateSegment(many, frame).inside).toEqual(expected);
    }
  });
});
