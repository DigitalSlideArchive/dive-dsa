/**
 * Interactive (point-prompt) segmentation types shared by the SAM runtime,
 * the point-click recipe and the mode manager.
 */
export type Point = [number, number];

/** What confirming a segmentation creates: an editable polygon, or a mask. */
export type SegmentationOutputMode = 'polygon' | 'mask';

export function isSegmentationOutputMode(value: unknown): value is SegmentationOutputMode {
  return value === 'polygon' || value === 'mask';
}

/** A binary mask (1 = object) in row-major order, `width * height` long. */
export interface SegmentationMask {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface SegmentationPredictRequest {
  /** Point coordinates as [x, y] pairs in image pixels */
  points: Point[];
  /** Point labels: 1 for foreground, 0 for background */
  pointLabels: number[];
  /**
   * Base polygon vertex budget per outline ring (default 25). The budget may
   * grow to 4x this while simplifying a complex outline.
   */
  polygonPoints?: number;
  /**
   * Create a mask instead of a polygon (default 'polygon'). In mask mode the
   * response also carries the binary mask, which is previewed as a mask
   * before it is confirmed; the traced polygons are still returned for
   * polygon mode and as a fallback if the mask cannot be stored.
   */
  outputMode?: SegmentationOutputMode;
}

export interface SegmentationPolygon {
  exterior: Point[];
  holes: Point[][];
}

export interface SegmentationPredictResponse {
  /** Whether the prediction succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Exterior of the first mask component */
  polygon?: Point[];
  /** All components of one mask, including interior holes. */
  polygons?: SegmentationPolygon[];
  /** Bounding box [x_min, y_min, x_max, y_max] */
  bounds?: [number, number, number, number];
  /** Predicted IoU of the chosen mask */
  score?: number;
  /** The binary mask, present when the request asked for mask output. */
  mask?: SegmentationMask;
}
