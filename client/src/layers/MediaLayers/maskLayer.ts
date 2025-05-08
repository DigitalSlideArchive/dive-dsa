import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref } from 'vue';
import { TypeStyling } from '../../StyleManager';

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

  enableTracks(trackIds: number[]) {
    trackIds.forEach((trackId) => {
      if (!this.featureLayers[trackId]) {
        this.featureLayers[trackId] = this.annotator.geoViewerRef.value.createLayer('feature', {
          features: ['quad.image'],
          autoshareRenderer: false,
        });
        this.featureLayers[trackId].node().css('filter', `url(#mask-filter-${trackId})`);
        this.quads[trackId] = this.featureLayers[trackId].createFeature('quad');
        this.featureLayers[trackId].opacity(this.opacity / 100.0);
      }
    });
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
    });
  }

  setSegmenationImages(data: {trackId: number, image: HTMLImageElement}[]) {
    const [width, height] = this.annotator.frameSize.value;
    this.disable();
    data.forEach((item) => {
      if (!this.featureLayers[item.trackId]) {
        this.featureLayers[item.trackId] = this.annotator.geoViewerRef.value.createLayer('feature', {
          features: ['quad.image'],
          autoshareRenderer: false,
        });
        this.quads[item.trackId] = this.featureLayers[item.trackId].createFeature('quad');
        this.featureLayers[item.trackId].node().css('filter', `url(#mask-filter-${item.trackId})`);
        this.featureLayers[item.trackId].opacity(this.opacity / 100.0);
      }
      if (this.featureLayers[item.trackId] && this.quads[item.trackId]) {
        // HACK to update the texture
        //this.quads[item.trackId]._cleanup();
        this.quads[item.trackId].data([
          {
            ul: { x: 0, y: 0 },
            lr: { x: width, y: height },
            image: item.image,
          },
        ]).draw();
        this.featureLayers[item.trackId].visible(true);
      }
    });
  }

  initialize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  disable() {
    Object.keys(this.featureLayers).forEach((key) => {
      const trackId = parseInt(key, 10);
      const layer = this.featureLayers[trackId];
      if (layer) {
        layer.visible(false);
      }
    });
  }
}
