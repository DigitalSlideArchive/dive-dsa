import type { LineChartData } from '../../use/useLineChart';

type Point = [number, number];

/** Half-pixel tolerance matches screen rounding for a 1px stroke. */
const SCREEN_SIMPLIFY_EPSILON_PX = 0.5;

/** Index of the first point at or after frame. */
function findFrameIndex(values: Point[], frame: number) {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid][0] < frame) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/** Squared distance from p to segment ab; squared to avoid sqrt/hypot in the hot loop. */
function squaredDistanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq !== 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}

/**
 * Min/max per pixel column (M4): keep the first, last, lowest and highest point of
 * every screen column, in source order. The rasterized polyline is unchanged: the
 * vertical extent inside each column and the segment joining neighbouring columns
 * are both preserved. Output is bounded by ~4 points per pixel of chart width, so
 * zoomed-out views of long videos stay cheap without losing narrow spikes.
 * Screen coordinates are computed once per input point and kept only for survivors.
 */
function minMaxPerColumn(
  values: Point[],
  startIndex: number,
  endIndex: number,
  x: (frame: number) => number,
  y: (value: number) => number,
): { points: Point[]; sx: number[]; sy: number[] } {
  const points: Point[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  const emit = (i: number, px: number, py: number) => {
    if (points.length && points[points.length - 1] === values[i]) {
      return;
    }
    points.push(values[i]);
    sx.push(px);
    sy.push(py);
  };
  let firstX = x(values[startIndex][0]);
  let firstY = y(values[startIndex][1]);
  let column = Math.floor(firstX);
  let first = startIndex;
  let min = startIndex;
  let minX = firstX;
  let minY = firstY;
  let max = startIndex;
  let maxX = firstX;
  let maxY = firstY;
  let last = startIndex;
  let lastX = firstX;
  let lastY = firstY;
  const flush = () => {
    // Emit the column's representatives once each, in source order.
    const ids: [number, number, number][] = [
      [first, firstX, firstY], [min, minX, minY], [max, maxX, maxY], [last, lastX, lastY],
    ];
    ids.sort((a, b) => a[0] - b[0]);
    ids.forEach(([i, px, py]) => emit(i, px, py));
  };
  for (let i = startIndex + 1; i <= endIndex; i += 1) {
    const px = x(values[i][0]);
    const py = y(values[i][1]);
    const c = Math.floor(px);
    if (c !== column) {
      flush();
      column = c;
      first = i; firstX = px; firstY = py;
      min = i; minX = px; minY = py;
      max = i; maxX = px; maxY = py;
    } else if (py < minY) {
      min = i; minX = px; minY = py;
    } else if (py > maxY) {
      max = i; maxX = px; maxY = py;
    }
    last = i; lastX = px; lastY = py;
  }
  flush();
  return { points, sx, sy };
}

/**
 * Ramer-Douglas-Peucker in screen space. Every removed point is within epsilon of
 * the final segment that replaces it, so collinear runs collapse without drifting
 * (e.g. a spike's return to baseline is never folded into a long ramp).
 */
function douglasPeucker(points: Point[], sx: number[], sy: number[], epsilon: number): Point[] {
  const last = points.length - 1;
  const keep = new Uint8Array(points.length);
  const epsilonSq = epsilon * epsilon;
  keep[0] = 1;
  keep[last] = 1;
  const stack: number[] = [0, last];
  while (stack.length) {
    const end = stack.pop() as number;
    const start = stack.pop() as number;
    let maxDistance = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = squaredDistanceToSegment(sx[i], sy[i], sx[start], sy[start], sx[end], sy[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDistance > epsilonSq) {
      keep[maxIndex] = 1;
      stack.push(start, maxIndex, maxIndex, end);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Cull frame-ordered samples to the viewport with a neighbour beyond each edge.
 * Linear curves are reduced to each pixel column's first/last/min/max samples and
 * then simplified with a 0.5px Douglas-Peucker tolerance, so the drawn line stays
 * within a pixel of the full data; step and natural curves keep every visible sample.
 * `y` must map values to the screen y the curve is drawn at (e.g. max-mode graphs).
 */
export default function sampleTimelineValues(
  values: Point[],
  startFrame: number,
  endFrame: number,
  x: (frame: number) => number,
  y: (value: number) => number,
  curveType: LineChartData['type'],
): Point[] {
  if (!x) {
    return values;
  }
  const startIndex = Math.max(0, findFrameIndex(values, startFrame) - 1);
  const endIndex = Math.min(values.length - 1, findFrameIndex(values, endFrame) + 1);
  if (endIndex <= startIndex) {
    return values.slice(startIndex, endIndex + 1);
  }
  if (curveType !== 'Linear' || !y) {
    return values.slice(startIndex, endIndex + 1);
  }
  if (endIndex - startIndex < 2) {
    return values.slice(startIndex, endIndex + 1);
  }
  const reduced = minMaxPerColumn(values, startIndex, endIndex, x, y);
  if (reduced.points.length <= 2) {
    return reduced.points;
  }
  return douglasPeucker(reduced.points, reduced.sx, reduced.sy, SCREEN_SIMPLIFY_EPSILON_PX);
}
