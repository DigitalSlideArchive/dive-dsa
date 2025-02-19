/* eslint-disable class-methods-use-this */
import geo, { GeoEvent } from 'geojs';
import { boundToGeojson, RectBounds } from 'vue-media-annotator/utils';
import { TypeStyling } from '../../StyleManager';
import BaseLayer, { BaseLayerParams, LayerStyle } from '../BaseLayer';
import { FrameDataTrack } from '../LayerTypes';

export interface TextData {
  selected: boolean;
  editing: boolean | string;
  type: string;
  id: number;
  confidence: number;
  text: string;
  x: number;
  y: number;
  offsetY?: number;
  offsetX?: number;
  styleType: [string, number] | null;
  // currentPair: boolean;
}

interface TimeRectData {
  id: number;
  geojson: GeoJSON.Polygon;
  type: string;
  styleType: [string, number] | null;
  selected: boolean;
  editing: boolean | string;
}

export type FormatTextRow = (
  annotation: FrameDataTrack, index: number, typeStyling?: TypeStyling) => TextData[] | null;

interface TextLayerParams {
  formatter?: FormatTextRow;
}

/**
 * @param track - standard frameDataTrack info
 * @param maxPairs - maximum number of lines to show
 * @param lineHeight - height of each text line
 * @returns value or null.  null indicates that the text should not be displayed.
 */
function defaultFormatter(
  annotation: FrameDataTrack,
  index: number,
  typeStyling?: TypeStyling,
): TextData[] | null {
  if (annotation.features && annotation.features.bounds && annotation.track.meta?.time) {
    const { bounds } = annotation.features;
    let confidencePairs = [annotation.styleType];
    if (annotation.groups.length) {
      const trackType = annotation.track.getType();
      confidencePairs = annotation.groups.map(({ confidencePairs: cp }) => {
        const [_type, _conf] = cp[0];
        return [
          `${trackType[0]}::${_type}`, _conf,
        ];
      });
    }
    const arr: TextData[] = [];

    for (let i = 0; i < confidencePairs.length; i += 1) {
      const [type, confidence] = confidencePairs[i];

      let text = '';
      if (typeStyling) {
        const { showLabel, showConfidence } = typeStyling.labelSettings(type);
        if (showLabel && !showConfidence) {
          text = type;
        } else if (showConfidence && !showLabel) {
          text = `${confidence.toFixed(2)}`;
        } else if (showConfidence && showLabel) {
          text = `${type}: ${confidence.toFixed(2)}`;
        }
      }
      arr.push({
        selected: annotation.selected,
        editing: annotation.editing,
        type: annotation.styleType[0],
        confidence,
        text,
        id: annotation.track.id,
        styleType: annotation.styleType,
        x: bounds[0],
        y: bounds[1],
        offsetY: 10 + (index * 15),
      });
    }
    return arr;
    // .sort((a, b) => (+b.currentPair) - (+a.currentPair)) // sort currentPair=true first
    // .map((v, i) => ({ ...v, y: bounds[1] - (lineHeight * i) })); // calculate y after sort
  }
  return null;
}

export default class TimeLayer extends BaseLayer<TextData> {
  formatter: FormatTextRow;

  formattedRectData: TimeRectData[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rectFeatureLayer: any;

  constructor(params: BaseLayerParams & TextLayerParams) {
    super(params);
    this.formatter = params.formatter || defaultFormatter;
    this.formattedRectData = [];
  }

  initialize() {
    const layer = this.annotator.geoViewerRef.value.createLayer('feature', {
      features: ['text'],
    });
    this.featureLayer = layer
      .createFeature('text')
      .text((data: TextData) => data.text)
      .position((data: TextData) => ({ x: data.x, y: data.y }));

    const rectLayer = this.annotator.geoViewerRef.value.createLayer('feature', {
      features: ['polygon'],
    });

    this.rectFeatureLayer = rectLayer
      .createFeature('polygon', { selectionAPI: true })
      .geoOn(geo.event.feature.mouseclick, (e: GeoEvent) => {
        /**
         * Handle clicking on individual annotations, if DrawingOther is true we use the
         * Rectangle type if only the polygon is visible we use the polygon bounds
         * */
        if (e.mouse.buttonsDown.left) {
          if (!e.data.editing || (e.data.editing && !e.data.selected)) {
            this.bus.$emit('annotation-clicked', e.data.trackId, false);
          }
        } else if (e.mouse.buttonsDown.right) {
          if (!e.data.editing || (e.data.editing && !e.data.selected)) {
            this.bus.$emit('annotation-right-clicked', e.data.trackId, true);
          }
        }
      });
    if (this.rectFeatureLayer && this.rectFeatureLayer.style) {
      this.rectFeatureLayer.style(this.createRectStyle());
    }

    super.initialize();
  }

  formatRectData(data: TextData[], font = 'bold 16px sans-serif') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = font;
    }
    const rectData: TimeRectData[] = [];
    data.forEach((textData) => {
      if (context) {
        const { width } = context.measureText(textData.text);
        const height = 16; // Approximation of text height
        // [x1, y1, x2, y2] as (left, top), (bottom, right)
        const x = textData.x + (textData.offsetX || 0);
        const y = textData.y + (textData.offsetY || 0);
        const bounds = [x, y, x + width, y + height] as RectBounds;
        const upperLeft = (this.annotator.geoViewerRef.value.displayToWorld({ x: bounds[0], y: bounds[1] }));
        const lowerRight = (this.annotator.geoViewerRef.value.displayToWorld({ x: bounds[2], y: bounds[3] }));
        const updatedBounds: [number, number, number, number] = [0, upperLeft.y, lowerRight.x - upperLeft.x, lowerRight.y - upperLeft.y];
        const geoJSON = boundToGeojson(updatedBounds);
        rectData.push({
          id: textData.id,
          geojson: geoJSON,
          type: textData.type,
          styleType: textData.styleType,
          selected: textData.selected,
          editing: textData.editing,
        });
      }
    });
    return rectData;
  }

  formatData(frameData: FrameDataTrack[]) {
    const arr = [] as TextData[];
    const typeStyling = this.typeStyling.value;
    frameData.forEach((track: FrameDataTrack, index) => {
      const formatted = this.formatter(track, index, typeStyling);
      if (formatted !== null) {
        arr.push(...formatted);
      }
    });
    return arr;
  }

  redraw() {
    this.featureLayer.data(this.formattedData).draw();
    this.formattedRectData = this.formatRectData(this.formattedData);
    // if (this.formattedRectData.length) {
    //   this.rectFeatureLayer.data(this.formattedRectData)
    //     .polygon((d: TimeRectData) => d.geojson.coordinates[0])
    //     .draw();
    // }
    return null;
  }

  disable() {
    this.featureLayer.data([]).draw();
  }

  createStyle(): LayerStyle<TextData> {
    const baseStyle = super.createStyle();
    return {
      ...baseStyle,
      textAlign: 'start',
      color: (data) => {
        if (data.editing || data.selected) {
          if (!data.selected) {
            if (this.stateStyling.disabled.color !== 'type') {
              return this.stateStyling.disabled.color;
            }
            return this.typeStyling.value.color(data.type);
          }
          if (data.selected) {
            return this.stateStyling.selected.color;
          }
          return this.typeStyling.value.color(data.type);
        }
        return this.typeStyling.value.color(data.type);
      },
      font: 'bold 16px sans-serif',
      offset: (data) => ({
        x: data.offsetX || 0,
        y: data.offsetY || 0,
      }),
    };
  }

  createRectStyle(): LayerStyle<TimeRectData> {
    return {
      antialiasing: 0,
      uniformPolygon: true,
      stroke: true,
      // Style conversion to get array objects to work in geoJS
      position: (point) => ({ x: point[0], y: point[1] }),
      strokeColor: (_point, _index, data) => {
        if (data.selected) {
          return this.stateStyling.selected.color;
        }
        if (data.styleType) {
          return this.typeStyling.value.color(data.styleType[0]);
        }
        return this.typeStyling.value.color('');
      },
      fill: (data) => {
        if (data.styleType) {
          return this.typeStyling.value.fill(data.styleType[0]);
        }
        return this.stateStyling.standard.fill;
      },
      fillColor: (_point, _index, data) => {
        if (data.styleType) {
          return this.typeStyling.value.color(data.styleType[0]);
        }
        return this.typeStyling.value.color('');
      },
      fillOpacity: (_point, _index, data) => {
        if (data.styleType) {
          return this.typeStyling.value.opacity(data.styleType[0]);
        }
        return this.stateStyling.standard.opacity;
      },
      strokeOpacity: (_point, _index, data) => {
        // Reduce the rectangle opacity if a polygon is also drawn
        if (data.selected) {
          return this.stateStyling.selected.opacity;
        }
        if (data.styleType) {
          return this.typeStyling.value.opacity(data.styleType[0]);
        }

        return this.stateStyling.standard.opacity;
      },
      strokeOffset: (_point, _index, data) => {
        if (data.selected) {
          return this.stateStyling.selected.strokeWidth;
        }
        if (data.styleType) {
          return this.typeStyling.value.strokeWidth(data.styleType[0]);
        }
        return this.stateStyling.standard.strokeWidth;
      },
      strokeWidth: (_point, _index, data) => {
        //Reduce rectangle line thickness if polygon is also drawn
        if (data.selected) {
          return this.stateStyling.selected.strokeWidth;
        }
        if (data.styleType) {
          return this.typeStyling.value.strokeWidth(data.styleType[0]);
        }
        return this.stateStyling.standard.strokeWidth;
      },
    };
  }
}
