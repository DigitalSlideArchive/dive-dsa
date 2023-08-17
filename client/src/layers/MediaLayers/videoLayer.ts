import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref, watch } from '@vue/composition-api';
import { TypeStyling } from '../../StyleManager';


interface Transparency {
  rgb: [number, number, number];
  variance?: number;
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

    transparency: Transparency[];

    ctx: CanvasRenderingContext2D | null;

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
      this.transparency = [];
      this.ctx = null;
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
    }

    initialize({ url, opacity, metadata }:
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       {url: string; opacity: number; metadata?: Record<string, any>}) {
      this.metadata = metadata;
      if (this.metadata?.transparency) {
        this.transparency = this.metadata.transparency as Transparency[];
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
      const canvas = this.featureLayer.canvas()[0] as HTMLCanvasElement;
      this.ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
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

    updateSettings(frame: number, opacity: number, colorTransparency: boolean) {
      this.featureLayer.visible(true);
      this.opacity = opacity;
      this.featureLayer.opacity(opacity / 100.0);
      if (colorTransparency) {
        this.featureLayer.map().scheduleAnimationFrame(() => this.replaceColors());
      }
    }

    disable() {
      if (this.featureLayer) {
        this.featureLayer.visible(false);
      }
    }

    replaceColors() {
      if (this.ctx) {
        const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
        const { data } = imageData;
        this.transparency.forEach((transparency) => {
          const targetRed = transparency.rgb[0]; // Replace with the target color's red value
          const targetGreen = transparency.rgb[1]; // Replace with the target color's green value
          const targetBlue = transparency.rgb[2]; // Replace with the target color's blue value

          const targetColorThreshold = transparency?.variance || 0;
          // allow for slight color variations

          for (let i = 0; i < data.length; i += 4) {
            const red = data[i];
            const green = data[i + 1];
            const blue = data[i + 2];

            if (
              Math.abs(red - targetRed) <= targetColorThreshold
        && Math.abs(green - targetGreen) <= targetColorThreshold
        && Math.abs(blue - targetBlue) <= targetColorThreshold
            ) {
              data[i + 3] = 0; // Set alpha (transparency) to 0
            }
          }
        });
        if (this.ctx) {
          this.ctx.putImageData(imageData, 0, 0);
        }
      }
    }
}
