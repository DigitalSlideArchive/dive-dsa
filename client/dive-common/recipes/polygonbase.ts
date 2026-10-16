import { cloneDeep } from 'lodash';
import Vue, { ref, Ref } from 'vue';

import { removePoint } from 'vue-media-annotator/utils';
import Track from 'vue-media-annotator/track';
import Recipe from 'vue-media-annotator/recipe';
import { EditAnnotationTypes } from 'vue-media-annotator/layers';

const EmptyResponse = { data: {}, union: [], unionWithoutBounds: [] };

export default class PolygonBoundsExpand implements Recipe {
  active: Ref<boolean>;

  name: string;

  icon: Ref<string>;

  toggleable: Ref<boolean>;

  bus: Vue;

  constructor() {
    this.bus = new Vue();
    this.active = ref(false);
    this.name = 'PolygonBase';
    this.toggleable = ref(true);
    this.icon = ref('mdi-vector-polygon');
  }

  update(
    mode: 'in-progress' | 'editing',
    frameNum: number,
    track: Track,
    data: GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Polygon | GeoJSON.Point>[],
    key?: string,
  ) {
    if (data.length === 1 && mode === 'editing' && this.active.value) {
      const poly = data[0].geometry;
      if (poly.type === 'Polygon') {
        // Keep the box around every polygon on the frame (e.g. all segmentation
        // mask components), not just the one being edited.
        const otherPolygons = track.getFeatureGeometry(frameNum, { type: 'Polygon' })
          .filter((feature) => (feature.properties?.key || '') !== (key || ''))
          .map((feature) => feature.geometry as GeoJSON.Polygon);
        return {
          data: {
            [key || '']: data,
          },
          union: otherPolygons,
          done: true,
          unionWithoutBounds: [poly],
        };
      }
    }
    return EmptyResponse;
  }

  // eslint-disable-next-line class-methods-use-this
  delete(frame: number, track: Track, key: string, type: EditAnnotationTypes) {
    if (type === 'Polygon') {
      track.removeFeatureGeometry(frame, { key, type: 'Polygon' });
    }
  }

  // eslint-disable-next-line class-methods-use-this
  deletePoint(frame: number, track: Track, idx: number, key: string, type: EditAnnotationTypes) {
    if (type === 'Polygon') {
      const geoJsonFeatures = track.getFeatureGeometry(frame, {
        type: 'Polygon',
        key,
      });
      if (geoJsonFeatures.length === 0) return;
      const clone = cloneDeep(geoJsonFeatures[0]);
      if (removePoint(clone, idx)) {
        track.setFeature({ frame }, [clone]);
      }
    }
  }

  /** Edit the polygon with the given key ('' is the default polygon). */
  activate(key = '') {
    this.active.value = true;
    this.bus.$emit('activate', {
      editing: 'Polygon' as EditAnnotationTypes,
      key,
      recipeName: this.name,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  deactivate() {
    // no-op
    this.active.value = false;
  }

  // eslint-disable-next-line class-methods-use-this
  mousetrap() {
    return [];
  }
}
