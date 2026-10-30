/**
 * Writing point-click segmentation results onto a track, and undoing them.
 *
 * Predictions are written as soon as they arrive so the user sees them; a
 * snapshot taken before the first one lets Reset/Escape put the detection
 * back exactly as it was.
 */
import { cloneDeep } from 'lodash';
import type Track from 'vue-media-annotator/track';
import type { Feature, TrackSupportedFeature } from 'vue-media-annotator/track';
import type { RectBounds } from 'vue-media-annotator/utils';
import {
  componentsBounds, segmentationPolygonFeatures,
} from 'dive-common/recipes/segmentationPolygons';
import type { SegmentationPolygon } from './types';

/** The keyframe on a frame before segmentation touched it. */
export interface SegmentationSnapshot {
  /** null when there was no keyframe on this frame */
  feature: Feature | null;
}

export function snapshotFeature(track: Track, frameNum: number): SegmentationSnapshot {
  const [real] = track.getFeature(frameNum);
  // An interpolated feature is not stored on the track; restoring means deleting.
  return { feature: real && real.keyframe ? cloneDeep(real) : null };
}

export function restoreFeature(track: Track, frameNum: number, snapshot: SegmentationSnapshot) {
  const [real] = track.getFeature(frameNum);
  if (real && real.keyframe) {
    track.deleteFeature(frameNum);
  }
  if (snapshot.feature) {
    const { geometry, ...feature } = cloneDeep(snapshot.feature);
    track.setFeature(feature, geometry?.features ?? []);
  }
}

/**
 * Key base for mask components after the first. The first (largest) component
 * is stored under the default polygon key, so it edits like any drawn polygon.
 */
export const SegmentationPolygonKey = 'SegmentationPolygon';
export const SegmentationPrimaryPolygonKey = '';

/**
 * Write a segmentation result as the detection's keyframe on this frame:
 * every earlier polygon on the frame (e.g. a previous preview) is replaced by
 * `polygons`, and the box becomes `bounds`. Head/tail points and attributes
 * are kept.
 */
function writeSegmentationFeature(
  track: Track,
  frameNum: number,
  bounds: RectBounds,
  polygons: GeoJSON.Feature<TrackSupportedFeature>[] = [],
) {
  const [real] = track.getFeature(frameNum);
  if (real && real.keyframe) {
    const existing = track.getFeatureGeometry(frameNum, { type: 'Polygon' }).length;
    for (let i = 0; i < existing; i += 1) track.removeFeatureGeometry(frameNum, { type: 'Polygon' });
  }
  const { interpolate } = track.canInterpolate(frameNum);
  track.setFeature({
    frame: frameNum,
    keyframe: true,
    bounds,
    interpolate,
  }, polygons);
}

/**
 * Make the mask the detection's shape on this frame: its components become
 * keyed polygons and the box becomes the mask bounds.
 */
export function applySegmentation(
  track: Track,
  frameNum: number,
  polygons: SegmentationPolygon[],
  bounds?: RectBounds | null,
) {
  if (!polygons.length) return;
  writeSegmentationFeature(
    track,
    frameNum,
    bounds || componentsBounds(polygons),
    segmentationPolygonFeatures(polygons, SegmentationPolygonKey, SegmentationPrimaryPolygonKey) as GeoJSON.Feature<TrackSupportedFeature>[],
  );
}

/**
 * Preview a mask result on this frame without storing anything: the box
 * becomes the mask bounds, but no polygon is written and the frame is not
 * flagged `hasMask` (the binary mask is rendered directly by the preview
 * layer, and is only stored on confirm).
 */
export function applySegmentationMaskPreview(
  track: Track,
  frameNum: number,
  bounds?: RectBounds | null,
) {
  if (bounds) writeSegmentationFeature(track, frameNum, bounds);
}

/**
 * Make the mask the detection's shape on this frame without storing any
 * polygon: the frame is flagged as having a mask (whose pixels are stored
 * separately, see useMasks) and the box becomes the mask bounds.
 */
export function applySegmentationMask(
  track: Track,
  frameNum: number,
  bounds?: RectBounds | null,
) {
  if (!bounds) return;
  writeSegmentationFeature(track, frameNum, bounds);
  track.setHasMask(frameNum, true);
}
