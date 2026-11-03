/// <reference types="jest" />
import Track from 'vue-media-annotator/track';
import PolygonBase from './polygonbase';

const polygon = (x0: number): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[x0, 0], [x0 + 10, 0], [x0 + 10, 10], [x0, 10], [x0, 0]]] },
  properties: {},
});

function trackWithTwoPolygons() {
  const track = new Track(1, { begin: 0, end: 0 });
  track.setFeature({ frame: 0, keyframe: true, bounds: [0, 0, 60, 10] }, [
    { ...polygon(0), properties: { key: '' } },
    { ...polygon(50), properties: { key: 'SegmentationPolygon-1' } },
  ]);
  return track;
}

it('activates for a given polygon key, defaulting to the main polygon', () => {
  const recipe = new PolygonBase();
  const activations: unknown[] = [];
  recipe.bus.$on('activate', (args: unknown) => activations.push(args));
  recipe.activate();
  recipe.activate('SegmentationPolygon-1');
  expect(activations).toEqual([
    { editing: 'Polygon', key: '', recipeName: 'PolygonBase' },
    { editing: 'Polygon', key: 'SegmentationPolygon-1', recipeName: 'PolygonBase' },
  ]);
});

it('keeps the box around the other polygons on the frame while one is edited', () => {
  const recipe = new PolygonBase();
  recipe.activate();
  const track = trackWithTwoPolygons();
  const response = recipe.update('editing', 0, track, [polygon(5)], '');
  expect(response.unionWithoutBounds).toEqual([polygon(5).geometry]);
  expect(response.union).toEqual([polygon(50).geometry]);
});

it('deletes and edits vertices of keyed polygons', () => {
  const recipe = new PolygonBase();
  const track = trackWithTwoPolygons();
  recipe.deletePoint(0, track, 0, 'SegmentationPolygon-1', 'Polygon');
  const [edited] = track.getFeatureGeometry(0, { type: 'Polygon', key: 'SegmentationPolygon-1' });
  expect((edited.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(4);
  recipe.delete(0, track, 'SegmentationPolygon-1', 'Polygon');
  expect(track.getFeatureGeometry(0, { type: 'Polygon' }).map((p) => p.properties?.key)).toEqual(['']);
});
