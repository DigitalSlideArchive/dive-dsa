import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref } from 'vue';
import { maskToLuminanceAlpha } from 'vue-media-annotator/use/rle';
import { TypeStyling } from '../../StyleManager';

/**
 * Opacity (%) for the unconfirmed magic-wand mask preview. Deliberately
 * higher than the stored-mask default (50%, user-adjustable) so the
 * preview reads as a solid mask rather than a faint overlay.
 */
export const SegmentationPreviewOpacity = 75;

/**
 * A track's layer (and its WebGL context) is deleted after this many mask
 * renders in which the track had no mask, so live contexts stay bounded to
 * roughly the tracks on screen (~10s of playback at 30fps).
 */
export const MaskLayerIdleRenders = 300;

type QuadSource = HTMLImageElement | Uint8Array;

export default class MaskLayer {
  annotator: MediaController;

  typeStyling: Ref<TypeStyling>;

  opacity: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  featureLayers: Record<number, any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quads: Record<number, any>;

  width: number;

  height: number;

  /** Filter type currently applied to each track's layer */
  private layerFilter: Record<number, string> = {};

  /** What each track's quad currently holds, to skip identical redraws */
  private lastDrawn: Record<number, { source: QuadSource; frameSize: string }> = {};

  /** Tracks whose layer is currently visible */
  private visibleTracks = new Set<number>();

  /** Render counter and the render each track last had a mask in */
  private renderCount = 0;

  private lastUsed: Record<number, number> = {};

  constructor({
    annotator,
    typeStyling,
  }: { annotator: MediaController; typeStyling: Ref<TypeStyling>}) {
    this.annotator = annotator;
    this.typeStyling = typeStyling;
    this.opacity = 50;
    this.featureLayers = {};
    this.quads = {};
    this.width = 0;
    this.height = 0;
  }

  /** Create the track's layer if needed and point its filter at `filterType`. */
  private ensureLayer(trackId: number, filterType: string) {
    if (!this.featureLayers[trackId]) {
      this.featureLayers[trackId] = this.annotator.geoViewerRef.value.createLayer('feature', {
        features: ['quad.image'],
        autoshareRenderer: false,
      });
      this.quads[trackId] = this.featureLayers[trackId].createFeature('quad');
      this.featureLayers[trackId].opacity(this.opacity / 100.0);
      delete this.layerFilter[trackId];
      delete this.lastDrawn[trackId];
      this.visibleTracks.add(trackId); // new layers start visible
    }
    if (this.layerFilter[trackId] !== filterType) {
      this.featureLayers[trackId].node().css('filter', `url(#mask-filter-${filterType})`);
      this.layerFilter[trackId] = filterType;
    }
  }

  enableTracks(tracks: {id: number, type: string}[]) {
    tracks.forEach((track) => this.ensureLayer(track.id, track.type));
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    Object.keys(this.featureLayers).forEach((key) => {
      const trackId = parseInt(key, 10);
      const layer = this.featureLayers[trackId];
      if (layer) {
        layer.opacity(this.opacity / 100.0);
      }
    });
  }

  disableTracks(trackIds: number[]) {
    trackIds.forEach((trackId) => {
      const layer = this.featureLayers[trackId];
      if (layer) {
        this.annotator.geoViewerRef.value.deleteLayer(layer);
        delete this.featureLayers[trackId];
        delete this.quads[trackId];
      }
      delete this.layerFilter[trackId];
      delete this.lastDrawn[trackId];
      delete this.lastUsed[trackId];
      this.visibleTracks.delete(trackId);
    });
  }

  private setLayerVisible(trackId: number, visible: boolean) {
    if (this.visibleTracks.has(trackId) === visible) return;
    this.featureLayers[trackId]?.visible(visible);
    if (visible) {
      this.visibleTracks.add(trackId);
    } else {
      this.visibleTracks.delete(trackId);
    }
  }

  /**
   * Show exactly `items`: hide only the layers not in this set, redraw a quad
   * only when its source buffer/image changed, and delete long-idle layers.
   */
  private render(
    items: { trackId: number; filterType: string; source: QuadSource; quad: () => object }[],
  ) {
    this.renderCount += 1;
    const [frameWidth, frameHeight] = this.annotator.frameSize.value;
    const frameSize = `${frameWidth}x${frameHeight}`;
    const current = new Set(items.map((item) => item.trackId));
    Array.from(this.visibleTracks).forEach((trackId) => {
      if (!current.has(trackId)) this.setLayerVisible(trackId, false);
    });
    items.forEach((item) => {
      this.ensureLayer(item.trackId, item.filterType);
      this.lastUsed[item.trackId] = this.renderCount;
      const last = this.lastDrawn[item.trackId];
      if (!last || last.source !== item.source || last.frameSize !== frameSize) {
        this.quads[item.trackId].data([item.quad()]).draw();
        this.lastDrawn[item.trackId] = { source: item.source, frameSize };
      }
      this.setLayerVisible(item.trackId, true);
    });
    this.pruneIdle();
  }

  private pruneIdle() {
    const idle = Object.keys(this.featureLayers)
      .map((key) => parseInt(key, 10))
      .filter((trackId) => (
        !this.visibleTracks.has(trackId)
        && this.renderCount - (this.lastUsed[trackId] ?? 0) > MaskLayerIdleRenders
      ));
    if (idle.length) {
      this.disableTracks(idle);
    }
  }

  setSegmenationImages(data: {trackId: number, image: HTMLImageElement, type: string}[]) {
    const [width, height] = this.annotator.frameSize.value;
    this.render(data.map((item) => ({
      trackId: item.trackId,
      filterType: item.type,
      source: item.image,
      quad: () => ({
        ul: { x: 0, y: 0 },
        lr: { x: width, y: height },
        image: item.image,
      }),
    })));
  }

  setSegmenationLuminanceRLE(data: {trackId: number, type: string, mask: Uint8Array, width: number, height: number}[]) {
    const [frameWidth, frameHeight] = this.annotator.frameSize.value;
    this.render(data.map((item) => ({
      trackId: item.trackId,
      filterType: item.type,
      source: item.mask,
      quad: () => ({
        ul: { x: 0, y: 0 },
        lr: { x: frameWidth, y: frameHeight },
        texture: {
          width: item.width,
          height: item.height,
          data: item.mask,
          type: 'LuminanceAlpha',
        },
      }),
    })));
  }

  setSegmenationRLE(data: {trackId: number, type: string, mask: Uint8Array, width: number, height: number}[]) {
    const [frameWidth, frameHeight] = this.annotator.frameSize.value;
    this.render(data.map((item) => ({
      trackId: item.trackId,
      filterType: item.type,
      source: item.mask,
      quad: () => ({
        ul: { x: 0, y: 0 },
        lr: { x: frameWidth, y: frameHeight },
        texture: {
          width: item.width,
          height: item.height,
          data: maskToLuminanceAlpha(item.mask, item.width, item.height),
          type: 'LuminanceAlpha',
        },
      }),
    })));
  }

  initialize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  disable() {
    this.render([]);
  }
}
