import { contours, polygonArea } from 'd3';
import { componentsBounds } from 'dive-common/recipes/segmentationPolygons';
import type { Point, SegmentationPolygon, SegmentationPredictResponse } from './types';
import {
  normalizeSegmentationPolygonPoints,
  SegmentationMaxPolygonAreaError,
  SegmentationMaxPolygonPoints,
  SegmentationPolygonPointsGrowthFactor,
} from './constants';

function nearest(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Douglas-Peucker split vertices, most significant first. Past a closed
 * ring's first four points, only deviations over half a pixel count. */
function splitOrder(points: Point[], limit: number): number[] {
  const farthest = (start: number, end: number) => {
    let index = -1; let distance = 0;
    for (let i = start + 1; i < end; i += 1) {
      const q = nearest(points[i], points[start], points[end]);
      const d = (q[0] - points[i][0]) ** 2 + (q[1] - points[i][1]) ** 2;
      if (d > distance) { distance = d; index = i; }
    }
    return {
      start, end, index, distance,
    };
  };
  const pending = [farthest(0, points.length - 1)];
  const order: number[] = [];
  while (order.length < limit) {
    let next = -1;
    pending.forEach((segment, i) => {
      if (segment.index >= 0 && (next < 0 || segment.distance > pending[next].distance)) next = i;
    });
    if (next < 0 || (order.length >= 2 && pending[next].distance <= 0.25)) break;
    const { start, end, index } = pending[next];
    order.push(index);
    pending.splice(next, 1, farthest(start, index), farthest(index, end));
  }
  return order;
}

/** Reduce a closed contour ring to a base budget of `baseBudget` points. That
 * budget doubles, up to SegmentationPolygonPointsGrowthFactor times the base,
 * while the area cut off or added exceeds SegmentationMaxPolygonAreaError of
 * the ring's area. */
function simplify(points: Point[], baseBudget: number = SegmentationMaxPolygonPoints): Point[] {
  const base = normalizeSegmentationPolygonPoints(baseBudget);
  const maxBudget = base * SegmentationPolygonPointsGrowthFactor;
  const order = splitOrder(points, maxBudget - 2);
  const area = Math.abs(polygonArea(points));
  const ring = (budget: number) => [0, ...order.slice(0, budget - 2).sort((a, b) => a - b), points.length - 1];
  const error = (kept: number[]) => kept.slice(1).reduce((sum, index, i) => sum
    + Math.abs(polygonArea(points.slice(kept[i], index + 1))), 0);
  let budget = base;
  while (budget < maxBudget && budget - 2 < order.length
    && error(ring(budget)) > SegmentationMaxPolygonAreaError * area) {
    budget = Math.min(budget * 2, maxBudget);
  }
  const kept = ring(budget);
  return kept.length >= 4 ? kept.map((i) => points[i]) : points;
}

/** Total mask area, including disjoint components and subtracting holes. */
export function maskArea(polygons: SegmentationPolygon[]): number {
  return polygons.reduce((sum, p) => sum + Math.max(0, Math.abs(polygonArea(p.exterior))
    - p.holes.reduce((area, hole) => area + Math.abs(polygonArea(hole)), 0)), 0);
}

/**
 * Trace every component and hole of a binary mask (row-major, width * height)
 * as simplified polygons in image coordinates, largest component first.
 * @param basePolygonPoints base vertex budget per ring; it may grow to
 *   SegmentationPolygonPointsGrowthFactor times this for complex outlines
 * @param minComponentFraction drop components smaller than this fraction of
 *   the largest one (speckles the model sometimes returns)
 */
export function maskGeometry(
  mask: Uint8Array,
  width: number,
  height: number,
  basePolygonPoints: number = SegmentationMaxPolygonPoints,
  minComponentFraction = 0,
): SegmentationPredictResponse {
  if (mask.length !== width * height) throw new Error('Invalid mask dimensions.');
  const geometry = contours().size([width, height]).thresholds([0.5])(mask as unknown as number[])[0];
  const traced = geometry.coordinates.map((rings) => {
    const scaled = rings.map((ring) => simplify(ring.map(([x, y]): Point => [
      Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y)),
    ]), basePolygonPoints));
    const polygon = { exterior: scaled[0], holes: scaled.slice(1) };
    return { polygon, area: maskArea([polygon]) };
  }).sort((a, b) => b.area - a.area);
  const largest = traced.length ? traced[0].area : 0;
  const polygons = traced
    .filter(({ area }) => area > 0 && area >= minComponentFraction * largest)
    .map(({ polygon }) => polygon);
  if (!polygons.length) return { success: false, error: 'No object found for these prompts.' };
  return {
    success: true,
    polygons,
    polygon: polygons[0].exterior,
    bounds: componentsBounds(polygons),
  };
}
