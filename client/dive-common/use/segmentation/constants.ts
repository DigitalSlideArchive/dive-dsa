/**
 * Interactive segmentation polygon limits shared by web mask geometry and desktop
 * VIAME `service:*` settings (see `service:max_polygon_points` in
 * `interactive_segmenter_sam2.conf` / `interactive_segmenter_sam3.conf`).
 */

/** Default `service:max_polygon_points` when the config omits it. */
export const SegmentationMaxPolygonPoints = 25;

/** How far the vertex budget may grow past its base while chasing the area error. */
export const SegmentationPolygonPointsGrowthFactor = 4;

/** Maximum vertices for the default base when web point-click masks grow the budget. */
export const SegmentationMaxPolygonPointsLimit = SegmentationMaxPolygonPoints
  * SegmentationPolygonPointsGrowthFactor;

/** Smallest configurable base vertex budget. */
export const SegmentationPolygonPointsSettingMin = 5;

/** Largest configurable base vertex budget; growth can take a ring to 4x this. */
export const SegmentationPolygonPointsSettingMax = 100;

/** Relative ring area error (5%) that triggers doubling the vertex budget. */
export const SegmentationMaxPolygonAreaError = 0.05;

/** Clamp a user-supplied base vertex budget to the supported range. */
export function normalizeSegmentationPolygonPoints(value: number | undefined | null): number {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return SegmentationMaxPolygonPoints;
  }
  return Math.min(
    SegmentationPolygonPointsSettingMax,
    Math.max(SegmentationPolygonPointsSettingMin, Math.round(value)),
  );
}
