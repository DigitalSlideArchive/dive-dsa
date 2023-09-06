import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref, watch } from '@vue/composition-api';
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
    }

    loadedMetadata() {
      if (this.video) {
        this.video.removeEventListener('loadedmetadata', this.loadedMetadata);
        this.width = this.video.videoWidth;
        this.height = this.video.videoHeight;
        this.featureLayer
          .createFeature('quad')
          .data([
            {
              ul: { x: 0, y: 0 },
              lr: { x: this.width, y: this.height },
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
      opacity: number,
      colorTransparency: boolean,
      colorScale: boolean,
    ) {
      this.featureLayer.visible(true);
      this.opacity = opacity;
      this.featureLayer.opacity(opacity / 100.0);
      if (colorTransparency) {
        this.featureLayer.node().css('filter', 'url(#color-replace)');
      }
      if (colorScale) {
        this.featureLayer.node().css('filter', 'url(#colorScaleFilter)');
      }
    }

    disable() {
      if (this.featureLayer) {
        this.featureLayer.visible(false);
      }
    }
}
