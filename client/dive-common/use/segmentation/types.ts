/**
 * Interactive (point-prompt) segmentation types shared by the SAM runtime,
 * the point-click recipe and the mode manager.
 */
export type Point = [number, number];

export interface SegmentationPredictRequest {
  /** Point coordinates as [x, y] pairs in image pixels */
  points: Point[];
  /** Point labels: 1 for foreground, 0 for background */
  pointLabels: number[];
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
}
