import { Ref } from 'vue';
import { TypeStyling } from 'vue-media-annotator/StyleManager';
import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { AnnotatorPreferences } from 'vue-media-annotator/types';
import { hexToRgb } from 'vue-media-annotator/utils';
import VideoLayer from './videoLayer';
import { mergeBounds } from '../LayerTypes';

const generateSVGArray = (rgb: number[], variance: number) => {
  const colorVals: number[][] = [];
  for (let i = 0; i < rgb.length; i += 1) {
    const colorArray: number[] = new Array(255).fill(0);
    colorArray[rgb[i]] = 1;
    for (let j = 1; j <= variance; j += 1) {
      if (rgb[i] - j >= 0) {
        colorArray[rgb[i] - j] = 1;
      }
      if (rgb[i] + j < 255) {
        colorArray[rgb[i] + j] = 1;
      }
    }
    colorVals.push(colorArray);
  }
  return colorVals;
};

export default class VideoLayerManager {
  annotator: MediaController;

  typeStyling: Ref<TypeStyling>;

  overlays: VideoLayer[];

  constructor({
    annotator,
    typeStyling,
  }: { annotator: MediaController; typeStyling: Ref<TypeStyling>}) {
    this.annotator = annotator;
    this.typeStyling = typeStyling;
    this.overlays = [];
  }

  addOverlay({ url, opacity, metadata }:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {url: string; opacity: number; metadata?: Record<string, any>}) {
    const videoLayer = new VideoLayer({ annotator: this.annotator, typeStyling: this.typeStyling });

    videoLayer.initialize({
      url,
      opacity: opacity || 1.0,
      metadata,
    });
    this.overlays.push(videoLayer);
  }

  updateSettings(
    frame: number,
    overlaySettings: AnnotatorPreferences['overlays'],
  ) {
    for (let i = 0; i < this.overlays.length; i += 1) {
      if (overlaySettings[i].enabled) {
        this.overlays[i].updateSettings(frame, i, overlaySettings[i].opacity, overlaySettings[i].colorTransparency, overlaySettings[i].colorScale);
      } else {
        this.overlays[i].disable();
      }
    }
    return this.generateFilters(overlaySettings);
  }

  disable() {
    for (let i = 0; i < this.overlays.length; i += 1) {
      this.overlays[i].disable();
    }
  }

  getBounds() {
    let globalBounds = {
      left: 0, top: 0, right: this.annotator.frameSize.value[0], bottom: this.annotator.frameSize.value[1],
    };
    for (let i = 0; i < this.overlays.length; i += 1) {
      globalBounds = mergeBounds(globalBounds, this.overlays[i].getBounds());
    }
    return globalBounds;
  }

  // Gerneate Filter values for each video layer
  generateFilters(overlaySettings: AnnotatorPreferences['overlays']) {
    const results: {
        videoLayerTransparencyVals: number[][][],
        videoLayerColorTransparencyOn: boolean,
        colorScaleOn: boolean,
        colorScaleMatrix: number[],
        id: number;
     }[] = [];
    for (let i = 0; i < this.overlays.length; i += 1) {
      const videoLayer = this.overlays[i];
      const transparencyArray: number[][][] = [];
      if (overlaySettings[i].overrideValue) {
        const rgb = overlaySettings[i].overrideColor
          ? hexToRgb(overlaySettings[i].overrideColor as string) : [0, 0, 0];
        const variance = overlaySettings[i].overrideVariance || 0;
        const colorVals = generateSVGArray(rgb, variance);
        transparencyArray.push(colorVals);
      } else if (videoLayer.overlayMetadata.transparency) {
        videoLayer.overlayMetadata.transparency.forEach((transparencyColor) => {
          const { rgb } = transparencyColor;
          const variance = transparencyColor.variance || 0;
          const colorVals = generateSVGArray(rgb, variance);
          transparencyArray.push(colorVals);
        });
      }
      const videoLayerTransparencyVals = transparencyArray;
      const videoLayerColorTransparencyOn = overlaySettings[i].colorTransparency
            || videoLayer.overlayMetadata.transparency;
      const colorScaleOn = !!(overlaySettings[i].colorScale || (videoLayer.overlayMetadata.colorScale));
      let colorScaleMatrix: number[] = [];
      if (overlaySettings[i].colorScale
                  || (videoLayer.overlayMetadata.colorScale)) {
        let color2 = '#000000';
        let color1 = '#FFFFFF';
        if (overlaySettings[i].colorScale
                    && overlaySettings[i].blackColorScale
                    && overlaySettings[i].whiteColorScale) {
          color2 = overlaySettings[i].blackColorScale as string;
          color1 = overlaySettings[i].whiteColorScale as string;
        } else if (videoLayer.overlayMetadata.colorScale) {
          color2 = videoLayer.overlayMetadata.colorScale.black;
          color1 = videoLayer.overlayMetadata.colorScale.white;
        }
        if (color1 !== undefined && color2 !== undefined) {
          const rgb1 = [
            parseInt(color1.slice(1, 3), 16) / 255.0,
            parseInt(color1.slice(3, 5), 16) / 255.0,
            parseInt(color1.slice(5, 7), 16) / 255.0,
          ];
          const rgb2 = [
            parseInt(color2.slice(1, 3), 16) / 255.0,
            parseInt(color2.slice(3, 5), 16) / 255.0,
            parseInt(color2.slice(5, 7), 16) / 255.0,
          ];
          const scale = 1;
          const shift = 0;
          const matrix = [
            (rgb1[0] - rgb2[0]) * scale, 0, 0, 0, rgb2[0] * scale + shift,
            (rgb1[1] - rgb2[1]) * scale, 0, 0, 0, rgb2[1] * scale + shift,
            (rgb1[2] - rgb2[2]) * scale, 0, 0, 0, rgb2[2] * scale + shift,
            0, 0, 0, 1, 0,
          ];
          colorScaleMatrix = matrix;
        }
      }

      results.push({
        videoLayerTransparencyVals, videoLayerColorTransparencyOn: videoLayerColorTransparencyOn as boolean, colorScaleOn, colorScaleMatrix, id: i,
      });
    }
    return results;
  }
}
