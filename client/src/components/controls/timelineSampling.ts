import type { LineChartData } from '../../use/useLineChart';

type Point = [number, number];

/** Index of the first point at or after frame, clamped to the last point. */
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

/**
 * Cull frame-ordered samples to the viewport with a neighbour beyond each edge.
 * Only simplify linear curves: retain each pixel column's endpoints and extrema
 * in source order so a narrow pulse cannot connect to a distant baseline sample.
 * Step curves need their transitions; Natural curves need interior control points.
 */
export default function sampleTimelineValues(
  values: Point[],
  startFrame: number,
  endFrame: number,
  x: (frame: number) => number,
  curveType: LineChartData['type'],
): Point[] {
  if (values.length < 4 || !x) {
    return values;
  }
  const startIndex = Math.max(0, findFrameIndex(values, startFrame) - 1);
  const endIndex = Math.min(values.length - 1, findFrameIndex(values, endFrame) + 1);
  if (endIndex <= startIndex || curveType !== 'Linear') {
    return values.slice(startIndex, endIndex + 1);
  }

  const sampled: Point[] = [];
  let first = startIndex;
  let lowest = startIndex;
  let highest = startIndex;
  let column = Math.round(x(values[startIndex][0]));
  const flushColumn = (last: number) => {
    // Sort indices rather than frames to retain source order for equal-frame points.
    const indices = [first, lowest, highest, last].sort((a, b) => a - b);
    indices.forEach((index, position) => {
      if (position === 0 || index !== indices[position - 1]) {
        sampled.push(values[index]);
      }
    });
  };
  for (let i = startIndex + 1; i <= endIndex; i += 1) {
    const pixel = Math.round(x(values[i][0]));
    if (pixel !== column) {
      flushColumn(i - 1);
      column = pixel;
      first = i;
      lowest = i;
      highest = i;
    } else {
      if (values[i][1] < values[lowest][1]) {
        lowest = i;
      }
      if (values[i][1] > values[highest][1]) {
        highest = i;
      }
    }
  }
  flushColumn(endIndex);
  return sampled;
}
