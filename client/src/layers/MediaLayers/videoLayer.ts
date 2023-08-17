import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref, watch } from '@vue/composition-api';
import { TypeStyling } from '../../StyleManager';


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

    initialize({ url, opacity }: {url: string; opacity: number}) {
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

    updateSettings(frame: number, opacity: number) {
      this.featureLayer.visible(true);
      this.opacity = opacity;
      this.featureLayer.opacity(opacity / 100.0);
      this.replaceColor();
    }

    disable() {
      this.featureLayer.visible(false);
    }

    replaceColor() {
      if (this.featureLayer.canvas()) {
        const canvas = this.featureLayer.canvas()[0] as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        const targetRed = 0; // Replace with the target color's red value
        const targetGreen = 0; // Replace with the target color's green value
        const targetBlue = 0; // Replace with the target color's blue value

        const targetColorThreshold = 100; // You can adjust this threshold to
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
        ctx.putImageData(imageData, 0, 0);
      }
    }
}
