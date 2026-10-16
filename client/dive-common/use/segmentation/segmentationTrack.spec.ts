/// <reference types="jest" />
import Track from 'vue-media-annotator/track';
import TrackStore from 'vue-media-annotator/TrackStore';
import {
  applySegmentation, restoreFeature, SegmentationPolygonKey, snapshotFeature,
} from './segmentationTrack';
import type { SegmentationPolygon } from './types';

const square = (x0: number, size: number): [number, number][] => [[x0, 0], [x0 + size, 0], [x0 + size, size], [x0, size]];
const mask: SegmentationPolygon[] = [
  { exterior: square(0, 10), holes: [square(2, 2)] },
  { exterior: square(20, 5), holes: [] },
];

function trackWithBox() {
  const track = new Track(1, { begin: 0, end: 0 });
  track.setFeature({
    frame: 0, keyframe: true, bounds: [100, 100, 200, 200], attributes: { note: 'keep' },
  }, [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[100, 100], [200, 100], [200, 200], [100, 100]]] }, properties: { key: '' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [150, 150] }, properties: { key: 'head' } },
  ]);
  return track;
}

it('stores the largest component as the default polygon and the rest under segmentation keys', () => {
  const track = new Track(1, { begin: 0, end: 0 });
  applySegmentation(track, 0, mask, [0, 0, 25, 10]);
  const [feature] = track.getFeature(0);
  expect(feature?.bounds).toEqual([0, 0, 25, 10]);
  const polygons = track.getFeatureGeometry(0, { type: 'Polygon' });
  expect(polygons.map((p) => p.properties?.key)).toEqual(['', `${SegmentationPolygonKey}-1`]);
  // Rings are closed and holes are kept.
  expect((polygons[0].geometry as GeoJSON.Polygon).coordinates).toHaveLength(2);
  expect((polygons[0].geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5);
});

it('replaces earlier polygons and keeps points and attributes', () => {
  const track = trackWithBox();
  applySegmentation(track, 0, mask);
  const [feature] = track.getFeature(0);
  expect(feature?.bounds).toEqual([0, 0, 25, 10]);
  expect(feature?.attributes).toEqual({ note: 'keep' });
  expect(track.getFeatureGeometry(0, { type: 'Polygon' })).toHaveLength(2);
  expect(track.getFeatureGeometry(0, { type: 'Point', key: 'head' })).toHaveLength(1);
  // A later prediction with fewer components drops the stale one.
  applySegmentation(track, 0, [mask[0]]);
  expect(track.getFeatureGeometry(0, { type: 'Polygon' }).map((p) => p.properties?.key)).toEqual(['']);
});

it('restores an existing keyframe exactly', () => {
  const track = trackWithBox();
  const before = JSON.parse(JSON.stringify(track.getFeature(0)[0]));
  const snapshot = snapshotFeature(track, 0);
  applySegmentation(track, 0, mask);
  restoreFeature(track, 0, snapshot);
  expect(JSON.parse(JSON.stringify(track.getFeature(0)[0]))).toEqual(before);
});

it('restores a frame that had no keyframe by removing the preview', () => {
  const track = trackWithBox();
  track.setFeature({ frame: 10, keyframe: true, bounds: [0, 0, 1, 1] });
  const snapshot = snapshotFeature(track, 5);
  expect(snapshot.feature).toBeNull();
  applySegmentation(track, 5, mask);
  expect(track.getFeature(5)[0]?.keyframe).toBe(true);
  restoreFeature(track, 5, snapshot);
  expect(track.featureIndex).toEqual([0, 10]);
});

it('ignores an empty mask', () => {
  const track = trackWithBox();
  applySegmentation(track, 0, []);
  expect(track.getFeature(0)[0]?.bounds).toEqual([100, 100, 200, 200]);
});

it.each([[0, [0]], [5, [5]], [0, [0, 5]], [0, [5, 0]]])(
  'leaves a new detection (created on %i) removable after restoring frames %j',
  (createdOn, frames) => {
    const store = new TrackStore({ markChangesPending: () => null, cameraName: 'singleCam' });
    const track = store.add(createdOn, 'fish', undefined, 0);
    const snapshots = frames.map((frame) => [frame, snapshotFeature(track, frame)] as const);
    frames.forEach((frame) => applySegmentation(track, frame, mask));
    snapshots.forEach(([frame, snapshot]) => restoreFeature(track, frame, snapshot));
    expect(track.featureIndex).toEqual([]);
    expect(() => store.remove(track.id)).not.toThrow();
    expect(store.getPossible(track.id)).toBeUndefined();
  },
);
