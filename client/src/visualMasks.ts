/* eslint-disable max-classes-per-file */
import { computed, ref, Ref } from 'vue';
import type { Feature, TrackSupportedFeature } from './track';
import type { RectBounds } from './utils';
import { geojsonToBound } from './utils';
import { listInsert, listRemove } from './listUtils';
import StyleManager, { CustomStyle } from './StyleManager';
import type {
  VisualMaskConfiguration,
  VisualMaskGeometryType,
} from './ConfigurationManager';

const DEFAULT_VISUAL_MASK_STYLE: CustomStyle = {
  color: '#000000',
  fill: true,
  opacity: 0.35,
  strokeWidth: 3,
};

function getVisualMaskStyleKey(id: number) {
  return `visual-mask-${id}`;
}

function normalizeStyle(style?: CustomStyle): CustomStyle {
  return {
    ...DEFAULT_VISUAL_MASK_STYLE,
    ...style,
  };
}

export class VisualMask {
  id: number;

  name: string;

  enabled: boolean;

  type: VisualMaskGeometryType;

  features: Feature[];

  featureIndex: number[];

  style: CustomStyle;

  constructor({
    id,
    name,
    enabled = true,
    type,
    frames,
    style,
  }: VisualMaskConfiguration) {
    this.id = id;
    this.name = name;
    this.enabled = enabled;
    this.type = type;
    this.features = [];
    this.featureIndex = [];
    this.style = normalizeStyle(style);
    (frames || []).forEach((frame) => {
      this.setFeature(frame, frame.geometry?.features || [], false);
    });
  }

  get styleKey() {
    return getVisualMaskStyleKey(this.id);
  }

  getKeyframes() {
    return [...this.featureIndex];
  }

  getExactFeature(frame: number) {
    return this.features[frame] || null;
  }

  getFeature(frame: number) {
    const exact = this.getExactFeature(frame);
    if (exact) {
      return exact;
    }
    if (!this.featureIndex.length) {
      return null;
    }
    const previousFrames = this.featureIndex.filter((item) => item <= frame);
    const sourceFrame = previousFrames.length
      ? previousFrames[previousFrames.length - 1]
      : this.featureIndex[0];
    const source = this.features[sourceFrame];
    if (!source) {
      return null;
    }
    return {
      ...source,
      frame,
      keyframe: false,
    };
  }

  getNextKeyframe(frame: number) {
    return this.featureIndex.find((item) => item > frame);
  }

  getPreviousKeyframe(frame: number) {
    const previousFrames = this.featureIndex.filter((item) => item < frame);
    if (!previousFrames.length) {
      return undefined;
    }
    return previousFrames[previousFrames.length - 1];
  }

  setFeature(
    feature: Feature,
    geometry: GeoJSON.Feature<TrackSupportedFeature>[] = [],
    ensureKeyframe = true,
  ) {
    const { frame } = feature;
    const current = this.features[frame] || { frame };
    const next: Feature = {
      ...current,
      ...feature,
      keyframe: ensureKeyframe ? true : feature.keyframe,
    };
    if (next.bounds) {
      next.bounds = [
        Math.round(next.bounds[0]),
        Math.round(next.bounds[1]),
        Math.round(next.bounds[2]),
        Math.round(next.bounds[3]),
      ];
    }
    const collection = next.geometry || { type: 'FeatureCollection', features: [] };
    geometry.forEach((geo) => {
      const i = collection.features.findIndex((item) => item.geometry.type === geo.geometry.type);
      if (i >= 0) {
        collection.features.splice(i, 1, geo);
      } else {
        collection.features.push(geo);
      }
    });
    if (collection.features.length) {
      next.geometry = collection;
    }
    this.features[frame] = next;
    if (next.keyframe) {
      listInsert(this.featureIndex, frame);
    }
    return next;
  }

  deleteFeature(frame: number) {
    listRemove(this.featureIndex, frame);
    delete this.features[frame];
  }

  serialize(): VisualMaskConfiguration {
    const frames: Feature[] = [];
    this.featureIndex.forEach((frame) => {
      if (this.features[frame]) {
        frames.push({
          ...this.features[frame],
          frame,
          keyframe: true,
        });
      }
    });
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      type: this.type,
      frames,
      style: this.style,
    };
  }
}

export default class VisualMaskManager {
  private styleManager: StyleManager;

  private markChangesPending: () => void;

  private syncConfiguration: (visualMasks: Record<string, VisualMaskConfiguration[]>) => void;

  masksByCamera: Ref<Record<string, VisualMask[]>>;

  selectedMaskId: Ref<number | null>;

  editingMaskId: Ref<number | null>;

  editingMode: Ref<VisualMaskGeometryType | false>;

  revisionCounter: Ref<number>;

  hasMasks: Ref<boolean>;

  constructor(
    {
      markChangesPending,
      syncConfiguration,
      styleManager,
    }: {
      markChangesPending: () => void;
      syncConfiguration: (visualMasks: Record<string, VisualMaskConfiguration[]>) => void;
      styleManager: StyleManager;
    },
  ) {
    this.styleManager = styleManager;
    this.markChangesPending = markChangesPending;
    this.syncConfiguration = syncConfiguration;
    this.masksByCamera = ref({});
    this.selectedMaskId = ref(null);
    this.editingMaskId = ref(null);
    this.editingMode = ref(false);
    this.revisionCounter = ref(0);
    this.hasMasks = computed(() => Object.values(this.masksByCamera.value)
      .some((cameraMasks) => cameraMasks.length > 0));
  }

  private ensureCamera(camera: string) {
    if (!this.masksByCamera.value[camera]) {
      this.masksByCamera.value = {
        ...this.masksByCamera.value,
        [camera]: [],
      };
    }
    return this.masksByCamera.value[camera];
  }

  private syncStyleManager() {
    const styles: Record<string, CustomStyle> = {};
    Object.values(this.masksByCamera.value).forEach((cameraMasks) => {
      cameraMasks.forEach((mask) => {
        styles[mask.styleKey] = normalizeStyle(mask.style);
      });
    });
    this.styleManager.populateTypeStyles(styles);
  }

  private commit(markPending = true) {
    this.syncStyleManager();
    this.syncConfiguration(this.serialize());
    this.revisionCounter.value += 1;
    if (markPending) {
      this.markChangesPending();
    }
  }

  load(visualMasks?: Record<string, VisualMaskConfiguration[]>) {
    const nextMasks: Record<string, VisualMask[]> = {};
    Object.entries(visualMasks || {}).forEach(([camera, masks]) => {
      nextMasks[camera] = masks.map((mask) => new VisualMask(mask));
    });
    this.masksByCamera.value = nextMasks;
    this.selectedMaskId.value = null;
    this.editingMaskId.value = null;
    this.editingMode.value = false;
    this.commit(false);
  }

  serialize() {
    const serialized: Record<string, VisualMaskConfiguration[]> = {};
    Object.entries(this.masksByCamera.value).forEach(([camera, masks]) => {
      if (masks.length) {
        serialized[camera] = masks.map((mask) => mask.serialize());
      }
    });
    return serialized;
  }

  getMasks(camera: string) {
    return this.masksByCamera.value[camera] || [];
  }

  getMask(camera: string, id: number) {
    return this.getMasks(camera).find((mask) => mask.id === id);
  }

  getSelectedMask(camera: string) {
    if (this.selectedMaskId.value === null) {
      return undefined;
    }
    return this.getMask(camera, this.selectedMaskId.value);
  }

  getEditingMask(camera: string) {
    if (this.editingMaskId.value === null) {
      return undefined;
    }
    return this.getMask(camera, this.editingMaskId.value);
  }

  selectMask(id: number | null) {
    this.selectedMaskId.value = id;
    if (id === null) {
      this.stopEditing();
    }
  }

  clearSelection() {
    this.selectedMaskId.value = null;
    this.stopEditing();
  }

  startEditing(camera: string, id: number) {
    const mask = this.getMask(camera, id);
    if (!mask) {
      return;
    }
    this.selectedMaskId.value = id;
    this.editingMaskId.value = id;
    this.editingMode.value = mask.type;
    this.revisionCounter.value += 1;
  }

  stopEditing() {
    this.editingMaskId.value = null;
    this.editingMode.value = false;
    this.revisionCounter.value += 1;
  }

  private getNextId() {
    const ids = Object.values(this.masksByCamera.value)
      .flatMap((masks) => masks.map((mask) => mask.id));
    if (!ids.length) {
      return 0;
    }
    return Math.max(...ids) + 1;
  }

  addMask(camera: string, type: VisualMaskGeometryType) {
    const id = this.getNextId();
    const masks = this.ensureCamera(camera);
    masks.push(new VisualMask({
      id,
      name: `Mask ${id + 1}`,
      type,
      enabled: true,
      frames: [],
      style: DEFAULT_VISUAL_MASK_STYLE,
    }));
    this.selectedMaskId.value = id;
    this.editingMaskId.value = id;
    this.editingMode.value = type;
    this.commit();
    return id;
  }

  removeMask(camera: string, id: number) {
    const masks = this.getMasks(camera);
    const nextMasks = masks.filter((mask) => mask.id !== id);
    this.masksByCamera.value = {
      ...this.masksByCamera.value,
      [camera]: nextMasks,
    };
    if (this.selectedMaskId.value === id) {
      this.selectedMaskId.value = null;
    }
    if (this.editingMaskId.value === id) {
      this.stopEditing();
    }
    this.commit();
  }

  renameMask(camera: string, id: number, name: string) {
    const mask = this.getMask(camera, id);
    if (!mask) {
      return;
    }
    mask.name = name;
    this.commit();
  }

  setMaskEnabled(camera: string, id: number, enabled: boolean) {
    const mask = this.getMask(camera, id);
    if (!mask) {
      return;
    }
    mask.enabled = enabled;
    this.commit();
  }

  setMaskStyle(camera: string, id: number, style: CustomStyle) {
    const mask = this.getMask(camera, id);
    if (!mask) {
      return;
    }
    mask.style = normalizeStyle({
      ...mask.style,
      ...style,
    });
    this.commit();
  }

  isExactKeyframe(camera: string, id: number, frame: number) {
    return !!this.getMask(camera, id)?.getExactFeature(frame);
  }

  removeFrameChange(camera: string, id: number, frame: number) {
    const mask = this.getMask(camera, id);
    if (!mask) {
      return;
    }
    if (!mask.getExactFeature(frame)) {
      return;
    }
    mask.deleteFeature(frame);
    this.commit();
  }

  updateRectBounds(camera: string, frame: number, bounds: RectBounds, id = this.editingMaskId.value) {
    if (id === null) {
      return;
    }
    const mask = this.getMask(camera, id);
    if (!mask) {
      return;
    }
    mask.type = 'rectangle';
    mask.setFeature({
      frame,
      bounds,
      keyframe: true,
    });
    this.commit();
  }

  updateGeoJSON(
    camera: string,
    frame: number,
    data: GeoJSON.Feature<GeoJSON.Polygon>,
    id = this.editingMaskId.value,
  ) {
    if (id === null) {
      return;
    }
    const mask = this.getMask(camera, id);
    if (!mask) {
      return;
    }
    mask.type = 'Polygon';
    mask.setFeature({
      frame,
      bounds: geojsonToBound(data),
      keyframe: true,
    }, [{
      type: 'Feature',
      geometry: data.geometry,
      properties: {},
    }]);
    this.commit();
  }
}

export {
  DEFAULT_VISUAL_MASK_STYLE,
  getVisualMaskStyleKey,
  normalizeStyle,
};
