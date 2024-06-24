import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref, watch } from 'vue';
import { TypeStyling } from '../../StyleManager';

interface Transparency {
  rgb: [number, number, number];
  variance?: number;
}

interface OverlayMetadata {
  transparency?: Transparency[];
  colorScale?: {
    black: string;
    white: string;
  };
  positioning?: { x: number, y: number, type?: 'px' | '%'}
  scaling?: { x: number, y: number}
}
export default class VideoLayer {
  annotator: MediaController;

  typeStyling: Ref<TypeStyling>;

  url: string | null;

  opacity: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  featureLayer: any;

  video: HTMLVideoElement | null;

  width: number;

  height: number;

  positioning: {x: number, y: number};

  positionType: 'px' | '%';

  scaling: {x: number, y: number};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;

  overlayMetadata: OverlayMetadata;

  constructor({
    annotator,
    typeStyling,
  }: { annotator: MediaController; typeStyling: Ref<TypeStyling>}) {
    this.annotator = annotator;
    this.typeStyling = typeStyling;
    this.opacity = 0;
    this.url = null;
    this.featureLayer = null;
    this.video = null;
    this.width = 0;
    this.height = 0;
    this.overlayMetadata = {};
    this.positioning = { x: 0, y: 0 };
    this.positionType = 'px';
    this.scaling = { x: 1, y: 1 };
  }

  calculateDimensions() {
    if (this.positionType === 'px') {
      const dimensions = {
        ul: { x: this.positioning.x, y: this.positioning.y },
        lr: { x: this.positioning.x + (this.width * this.scaling.x), y: this.positioning.y + (this.height * this.scaling.y) },
      };
      return dimensions;
    }
    if (this.positionType === '%') {
      const x = (this.width * this.scaling.x) * this.positioning.x;
      const y = (this.height * this.scaling.y) * this.positioning.y;
      const width = x + (this.width * this.scaling.x);
      const height = y + (this.height * this.scaling.y);
      const dimensions = {
        ul: { x, y },
        lr: { x: width, y: height },
      };
      return dimensions;
    }
    throw Error(`PositionType: ${this.positionType} wasn't of type 'px' or '%`);
  }

  loadedMetadata() {
    if (this.video) {
      this.video.removeEventListener('loadedmetadata', this.loadedMetadata);
      this.width = this.video.videoWidth;
      this.height = this.video.videoHeight;
      const dimensions = this.calculateDimensions();
      this.featureLayer
        .createFeature('quad')
        .data([
          {
            ...dimensions,
            video: this.video,
          },
        ])
        .draw();
    }
    this.featureLayer.node().css('filter', 'url(#color-replace)');
  }

  initialize({ url, opacity, metadata }:
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       {url: string; opacity: number; metadata?: Record<string, any>}) {
    this.metadata = metadata;
    if (this.metadata) {
      this.overlayMetadata = this.metadata as OverlayMetadata;
      if (this.overlayMetadata.positioning) {
        this.positioning = this.overlayMetadata.positioning;
        if (this.overlayMetadata.positioning.type) {
          this.positionType = this.overlayMetadata.positioning.type;
        }
      }
      if (this.overlayMetadata.scaling) {
        this.scaling = this.overlayMetadata.scaling;
      }
    }
    this.featureLayer = this.annotator.geoViewerRef.value.createLayer('feature', {
      features: ['quad.video'],
      autoshareRenderer: false,
    });
    // Create the URL for the video:
    this.video = document.createElement('video');
    this.video.preload = 'auto';
    this.video.src = url;
    this.video.addEventListener('loadedmetadata', () => this.loadedMetadata());
    this.opacity = opacity;
    this.featureLayer.opacity(this.opacity / 100.0);
    watch(this.annotator.playing, () => {
      if (this.video !== null) {
        if (this.annotator.playing.value && this.video.paused) {
          this.video.currentTime = this.annotator.currentTime.value;
          this.video.play();
        } else if (!this.annotator.playing.value && !this.video.paused) {
          this.video.pause();
          this.video.currentTime = this.annotator.currentTime.value;
        }
      }
    });

    watch(this.annotator.frame, () => {
      if (!this.annotator.playing.value && this.video !== null) {
        this.video.currentTime = this.annotator.currentTime.value;
      }
    });
  }

  updateSettings(
    frame: number,
    index: number,
    opacity: number,
    colorTransparency: boolean,
    colorScale: boolean,
  ) {
    this.featureLayer.visible(true);
    this.opacity = opacity;
    this.featureLayer.opacity(opacity / 100.0);
    if (colorTransparency) {
      this.featureLayer.node().css('filter', `url(#color-replace-${index})`);
    }
    if (colorScale) {
      this.featureLayer.node().css('filter', `url(#colorScaleFilter-${index})`);
    }
  }

  disable() {
    if (this.featureLayer) {
      this.featureLayer.visible(false);
    }
  }

  getBounds() {
    const dimensions = this.calculateDimensions();
    return {
      left: dimensions.ul.x,
      right: dimensions.lr.x,
      top: dimensions.ul.y,
      bottom: dimensions.lr.y,
    };
  }
}
