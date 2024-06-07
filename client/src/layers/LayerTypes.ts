import Group from '../Group';
import Track, { Feature } from '../track';

export interface FrameDataTrack {
  /* Current annotation selection state */
  selected: boolean;

  /* Current annotation editing state */
  editing: boolean | string;

  /* A reference to the track */
  track: Track;

  /* Any groups that this annotation is a member of */
  groups: Group[];

  /* The feature for the current frame */
  features: Feature | null;

  /* The exact pair to base the style on  */
  styleType: [string, number];

  /* All types related to the current annotation */
  // confidencePairs: [string, number][] | null;

}

export type DimensionBounds = { left: number; top: number; right: number; bottom: number };

export function mergeBounds(bounds1: DimensionBounds, bounds2: DimensionBounds): DimensionBounds {
  return {
    left: Math.min(bounds1.left, bounds2.left),
    top: Math.min(bounds1.top, bounds2.top),
    right: Math.max(bounds1.right, bounds2.right),
    bottom: Math.max(bounds1.bottom, bounds2.bottom),
  };
}

export function geoJSONPolygonToBounds(polygon: GeoJSON.Polygon): DimensionBounds {
  if (polygon.type !== 'Polygon') {
    throw new Error('Invalid GeoJSON object: not a Polygon');
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  // Assuming coordinates[0] contains the outer ring of the polygon
  const outerRing = polygon.coordinates[0];

  // eslint-disable-next-line no-restricted-syntax
  for (const coordinate of outerRing) {
    const [lng, lat] = coordinate;
    if (lng < left) left = lng;
    if (lat < top) top = lat;
    if (lng > right) right = lng;
    if (lat > bottom) bottom = lat;
  }

  return {
    left, top, right, bottom,
  };
}
