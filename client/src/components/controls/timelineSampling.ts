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

function perpendicularDistanceToSegment(
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
  if (lengthSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function screenCoords(
  point: Point,
  x: (frame: number) => number,
  y: (value: number) => number,
): [number, number] {
  return [x(point[0]), y(point[1])];
}

function sameScreenPixel(
  a: [number, number],
  b: [number, number],
): boolean {
  return Math.round(a[0]) === Math.round(b[0]) && Math.round(a[1]) === Math.round(b[1]);
}

/**
 * Remove interior points that do not change the polyline at the current scales:
 * consecutive samples in the same screen pixel, and points collinear with their
 * neighbours on the actual path (not a long chord).
 */
function simplifyLinearScreenSpace(
  points: Point[],
  x: (frame: number) => number,
  y: (value: number) => number,
  epsilon: number,
): Point[] {
  if (points.length <= 2) {
    return points;
  }
  let simplified = points.slice();
  let changed = true;
  while (changed) {
    changed = false;
    if (simplified.length <= 2) {
      break;
    }
    const next: Point[] = [simplified[0]];
    for (let i = 1; i < simplified.length - 1; i += 1) {
      const previous = next[next.length - 1];
      const current = simplified[i];
      const after = simplified[i + 1];
      const [px, py] = screenCoords(current, x, y);
      const [prevX, prevY] = screenCoords(previous, x, y);
      const [afterX, afterY] = screenCoords(after, x, y);
      if (sameScreenPixel([px, py], [prevX, prevY])) {
        changed = true;
        continue;
      }
      const distance = perpendicularDistanceToSegment(px, py, prevX, prevY, afterX, afterY);
      if (distance > epsilon) {
        next.push(current);
      } else {
        changed = true;
      }
    }
    next.push(simplified[simplified.length - 1]);
    simplified = next;
  }
  return simplified;
}

/**
 * Cull frame-ordered samples to the viewport with a neighbour beyond each edge.
 * Linear curves are simplified in screen space only where the polyline is
 * pixel-identical; step and natural curves keep every visible sample.
 */
export default function sampleTimelineValues(
  values: Point[],
  startFrame: number,
  endFrame: number,
  x: (frame: number) => number,
  y: (value: number) => number,
  curveType: LineChartData['type'],
): Point[] {
  if (values.length < 4 || !x) {
    return values;
  }
  const startIndex = Math.max(0, findFrameIndex(values, startFrame) - 1);
  const endIndex = Math.min(values.length - 1, findFrameIndex(values, endFrame) + 1);
  if (endIndex <= startIndex) {
    return values.slice(startIndex, endIndex + 1);
  }
  const visible = values.slice(startIndex, endIndex + 1);
  if (curveType !== 'Linear' || !y) {
    return visible;
  }
  return simplifyLinearScreenSpace(visible, x, y, SCREEN_SIMPLIFY_EPSILON_PX);
}
