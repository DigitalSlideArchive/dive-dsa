/// <reference types="jest" />
import type { SegmentationPredictResponse } from './types';
import {
  SegmentationMaxPolygonAreaError,
  SegmentationMaxPolygonPoints,
  SegmentationMaxPolygonPointsLimit,
} from './constants';
import { maskArea, maskGeometry } from './maskGeometry';

/** Contours trace pixel edges and cut corners diagonally, so allow half a pixel. */
function expectBounds(result: SegmentationPredictResponse, expected: number[]) {
  result.bounds!.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(0.5));
}

it('keeps disjoint components and holes, largest first', () => {
  const mask = new Uint8Array(30 * 20);
  for (let y = 2; y < 18; y += 1) {
    for (let x = 2; x < 28; x += 1) {
      // Left block (with a hole) is larger than the right block.
      if ((x < 15 || x > 20) && !(x > 5 && x < 10 && y > 5 && y < 12)) mask[y * 30 + x] = 1;
    }
  }
  const result = maskGeometry(mask, 30, 20);
  expect(result.success).toBe(true);
  expect(result.polygons).toHaveLength(2);
  expect(result.polygons![0].holes).toHaveLength(1);
  expect(result.polygons![1].holes).toHaveLength(0);
  expect(maskArea([result.polygons![0]])).toBeGreaterThan(maskArea([result.polygons![1]]));
  expect(result.polygon).toEqual(result.polygons![0].exterior);
  expectBounds(result, [2, 2, 28, 18]);
});

it('drops speckle components smaller than the requested fraction of the largest', () => {
  const mask = new Uint8Array(40 * 40);
  for (let y = 5; y < 35; y += 1) for (let x = 5; x < 30; x += 1) mask[y * 40 + x] = 1;
  mask[2 * 40 + 37] = 1; // one-pixel speckle
  expect(maskGeometry(mask, 40, 40).polygons).toHaveLength(2);
  const filtered = maskGeometry(mask, 40, 40, false, 0.01);
  expect(filtered.polygons).toHaveLength(1);
  expectBounds(filtered, [5, 5, 30, 35]);
});

describe('polygon vertex budget', () => {
  const size = 400;
  const draw = (inside: (x: number, y: number) => boolean) => {
    const mask = new Uint8Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) if (inside(x - size / 2, y - size / 2)) mask[y * size + x] = 1;
    }
    return mask;
  };
  const disk = draw((x, y) => Math.hypot(x, y) < 150);
  const star = draw((x, y) => Math.hypot(x, y) < 110 + 70 * Math.cos(16 * Math.atan2(y, x)));
  const ring = draw((x, y) => Math.hypot(x, y) < 150 && Math.hypot(x, y) > 60);

  it('keeps every ring within the default maximum', () => {
    [disk, star, ring].forEach((mask) => {
      const { polygons } = maskGeometry(mask, size, size);
      polygons!.flatMap((p) => [p.exterior, ...p.holes]).forEach((points) => {
        expect(points.length).toBeLessThanOrEqual(SegmentationMaxPolygonPoints);
        expect(points.length).toBeGreaterThanOrEqual(4);
        expect(points[0]).toEqual(points[points.length - 1]);
      });
    });
    expect(maskGeometry(ring, size, size).polygons![0].holes).toHaveLength(1);
  });

  it('keeps the area of a simple outline', () => {
    const area = maskArea(maskGeometry(disk, size, size).polygons!);
    expect(Math.abs(area - Math.PI * 150 ** 2) / (Math.PI * 150 ** 2)).toBeLessThan(
      SegmentationMaxPolygonAreaError,
    );
  });

  it('grows the budget for an outline too complex for it, up to the limit', () => {
    expect(maskGeometry(disk, size, size, true).polygons![0].exterior.length).toBeLessThanOrEqual(
      SegmentationMaxPolygonPoints,
    );
    const points = maskGeometry(star, size, size, true).polygons![0].exterior;
    expect(points.length).toBeGreaterThan(SegmentationMaxPolygonPoints);
    expect(points.length).toBeLessThanOrEqual(SegmentationMaxPolygonPointsLimit);
  });
});

it('returns a failure for an empty mask rather than an infinite bounding box', () => {
  expect(maskGeometry(new Uint8Array(100), 10, 10)).toEqual({
    success: false, error: 'No object found for these prompts.',
  });
});

it('rejects a mask that does not match its dimensions', () => {
  expect(() => maskGeometry(new Uint8Array(10), 4, 4)).toThrow('Invalid mask dimensions');
});

it('measures mask area including disjoint components and subtracting holes', () => {
  const square = (x0: number, size: number): [number, number][] => [[x0, 0], [x0 + size, 0], [x0 + size, size], [x0, size], [x0, 0]];
  expect(maskArea([
    { exterior: square(0, 20), holes: [square(5, 10)] },
    { exterior: square(30, 10), holes: [] },
  ])).toBe(400 - 100 + 100);
});
