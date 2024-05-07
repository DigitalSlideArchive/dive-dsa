/* eslint-disable prefer-destructuring */
/* eslint-disable max-len */
import type { Attribute } from 'vue-media-annotator/use/AttributeTypes';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import { RectBounds } from 'vue-media-annotator/utils';
import * as d3 from 'd3';
import { TypeStyling } from '../../StyleManager';
import BaseLayer, { BaseLayerParams, LayerStyle } from '../BaseLayer';
import { FrameDataTrack } from '../LayerTypes';

export interface AttributeTextData {
  selected: boolean;
  editing: boolean | string;
  color: string;
  fontSize: string | undefined;
  text: string;
  textAlign: string;
  x: number;
  y: number;
  offsetY?: number;
  offsetX?: number;
  // currentPair: boolean;
}

export type FormatTextRow = (
  annotation: FrameDataTrack,
  renderAttr: Attribute[],
  user: string,
  typeStyling: TypeStyling,
  autoColorIndex: ((data: string | number | boolean) => string)[],
  frame: number,
  ) => AttributeTextData[] | null;

interface AttributeLayerParams {
  formatter?: FormatTextRow;
}

const lineHeight = 15;
// function to calculate x,y as well as bounds based on render settings
export function calculateAttributeArea(baseBounds: RectBounds, renderSettings: Attribute['render'], renderIndex: number, renderAttrLength: number) {
  // Calculate X Position
  if (renderSettings && renderSettings.layout === 'vertical') {
    const trackWidth = baseBounds[2] - baseBounds[0];
    const widthType = renderSettings.displayWidth.type;
    let width = renderSettings.displayWidth.val; //px is the type so the width is this
    if (widthType === '%') {
      width = trackWidth * 0.01 * renderSettings.displayWidth.val;
    }
    // calculate center position for point
    const displayX = baseBounds[2] + 0.5 * width;
    const valueX = displayX;
    // Calcualte Y Position
    const trackHeight = baseBounds[3] - baseBounds[1];
    const heightType = renderSettings.displayHeight.type;
    let height = renderSettings.displayHeight.val; // px is the height
    if (heightType === 'auto') { //The height is auto calculated based on length of attributes being rendered
      height = (trackHeight / renderAttrLength);
    }
    if (heightType === '%') {
      height = trackHeight * 0.01 * renderSettings.displayHeight.val;
    }
    // So I think we want to set Display/Value
    const displayHeight = baseBounds[1] + (height * renderIndex) + height * (1 / 3);
    const valueHeight = baseBounds[1] + (height * renderIndex) + height * (2 / 3);

    // [x1, y1, x2, y2] as (left, top), (bottom, right)
    const newBounds: RectBounds = [baseBounds[2], baseBounds[1] + (height * renderIndex), baseBounds[2] + width, baseBounds[1] + (height * renderIndex) + height];

    return {
      displayX, displayHeight, valueX, valueHeight, newBounds,
    };
  }
  if (renderSettings && renderSettings.layout === 'horizontal') {
    // So now we have DisplayName: DisplayValue in a corner either inside or outside the box
    // The height it determined by the number of attributes in the list
    const anchor = [baseBounds[2], baseBounds[3]]; //SE corner
    if (renderSettings.corner === 'SW') {
      anchor[0] = baseBounds[0];
    }
    if (renderSettings.corner === 'NW') {
      anchor[0] = baseBounds[0];
      anchor[1] = baseBounds[1];
    }

    const displayX = anchor[0];
    const valueX = anchor[0];
    const displayHeight = anchor[1];
    const valueHeight = displayHeight;
    const offsetY = (lineHeight * (renderIndex));
    return {
      displayX, displayHeight, valueX, valueHeight, offsetY, newBounds: [0, 0, 0, 0] as RectBounds,
    };
  }
  return {
    displayX: 0, displayHeight: 0, valueX: 0, valueHeight: 0, offsetY: 0, newBounds: [0, 0, 0, 0] as RectBounds,
  };
}

/**
 * @param track - standard frameDataTrack info
 * @param maxPairs - maximum number of lines to show
 * @param lineHeight - height of each text line
 * @returns value or null.  null indicates that the text should not be displayed.
 */
function defaultFormatter(
  annotation: FrameDataTrack,
  renderAttr: Attribute[],
  user: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  typeStyling: TypeStyling,
  autoColorIndex: ((data: string | number | boolean) => string)[],
  frame: number,
): AttributeTextData[] | null {
  if (annotation.features && annotation.features.bounds) {
    const { bounds } = annotation.features;
    const arr: AttributeTextData[] = [];
    // figure out the attributes we are displaying:
    const renderFiltered = renderAttr.filter((item) => {
      if (item.render) {
        if (!item.render.typeFilter.includes('all')) {
          return item.render.typeFilter.includes(annotation.styleType[0]);
        }
        if (item.render.selected && !annotation.selected) {
          return false;
        }
        if (item.render.typeFilter.includes('all')) {
          return true;
        }
      }
      return false;
    });

    for (let i = 0; i < renderFiltered.length; i += 1) {
      const currentRender = renderFiltered[i].render;
      const { name } = renderFiltered[i];
      if (currentRender !== undefined) {
        const { displayName } = currentRender;
        const type = renderFiltered[i].belongs;
        // Calculate Value
        let value: string | number | boolean = '';
        if (type === 'detection') {
          if (annotation.features && annotation.features.attributes) {
            const { attributes } = annotation.features;
            if (renderFiltered[i].user && user && attributes.userAttributes && attributes.userAttributes[user]) {
              value = (attributes.userAttributes[user] as StringKeyObject)[name] as string | boolean | number;
            } else {
              value = attributes[name] as string | boolean | number;
            }
          }
        }
        if (type === 'track') {
          const { attributes } = annotation.track;
          if (attributes) {
            if (renderAttr[i].user && user && attributes.userAttributes && attributes.userAttributes[user]) {
              value = (attributes.userAttributes[user] as StringKeyObject)[name] as string | boolean | number;
            } else {
              value = attributes[name] as string | boolean | number;
            }
          }
        }
        if (currentRender.sticky && (value === undefined || value === '') && type === 'detection') {
          let newVal: undefined | string | boolean | number;
          let prevFrame = frame;
          while (prevFrame > 0 && newVal === undefined) {
            // We need to get the previous frames attributes
            const previous = annotation.track.getPreviousKeyframe(prevFrame);
            if (previous !== undefined) {
              const prevFeatures = annotation.track.getFeature(previous);
              if (prevFeatures[0]) {
                const currentAttribs = prevFeatures[0].attributes;
                if (currentAttribs) {
                  if (renderFiltered[i].user && user && currentAttribs.userAttributes && currentAttribs.userAttributes[user]) {
                    newVal = (currentAttribs.userAttributes[user] as StringKeyObject)[name] as string | boolean | number;
                  } else {
                    newVal = currentAttribs[name] as string | boolean | number;
                  }
                }
                if (newVal === '' || newVal === undefined) {
                  newVal = undefined;
                  prevFrame -= 1;
                  // eslint-disable-next-line no-continue
                  continue;
                }
              }
              prevFrame = previous;
            } else {
              break;
            }
          }
          if (newVal !== undefined) {
            value = newVal;
          }
        }
        const {
          displayX, displayHeight, valueX, valueHeight, offsetY,
        } = calculateAttributeArea(bounds, currentRender, i, renderFiltered.length);

        const displayColor = currentRender.displayColor === 'auto' ? renderAttr[i].color : currentRender.displayColor;
        const { displayTextSize } = currentRender;
        if (currentRender.selected && !annotation.selected) {
          // eslint-disable-next-line no-continue
          continue;
        }
        if (!currentRender.typeFilter.includes('all') && !currentRender.typeFilter.includes(annotation.track.getType()[0])) {
          // eslint-disable-next-line no-continue
          continue;
        }
        arr.push({
          selected: annotation.selected,
          editing: annotation.editing,
          color: displayColor || 'white',
          text: displayHeight === valueHeight ? `${displayName} : ` : displayName,
          fontSize: displayTextSize === -1 ? undefined : `${displayTextSize}px`,
          x: displayX,
          y: displayHeight,
          textAlign: displayHeight === valueHeight ? 'end' : 'center',
          offsetY,
          offsetX: displayHeight === valueHeight ? 20 : 0,
        });

        const valueColor = autoColorIndex[i](value);
        const { valueTextSize } = currentRender;
        if (value === undefined) {
          value = '';
        }
        arr.push({
          selected: annotation.selected,
          editing: annotation.editing,
          color: valueColor || 'white',
          text: value.toString(),
          fontSize: valueTextSize === -1 ? undefined : `${valueTextSize}px`,
          x: valueX,
          y: valueHeight,
          textAlign: displayHeight === valueHeight ? 'start' : 'center',
          offsetX: displayHeight === valueHeight ? 20 : 0,
          offsetY,
        });
      }
    }
    return arr;
    // .sort((a, b) => (+b.currentPair) - (+a.currentPair)) // sort currentPair=true first
    // .map((v, i) => ({ ...v, y: bounds[1] - (lineHeight * i) })); // calculate y after sort
  }
  return null;
}

export default class AttributeLayer extends BaseLayer<AttributeTextData> {
  formatter: FormatTextRow;

  renderAttributes: Attribute[];

  user: string;

  autoColorIndex: ((data: string | number | boolean) => string)[];

  frame: number;

  constructor(params: BaseLayerParams & AttributeLayerParams) {
    super(params);
    this.frame = 0;
    this.formatter = defaultFormatter;
    this.renderAttributes = [];
    this.autoColorIndex = [];
    this.user = '';
  }

  initialize() {
    const layer = this.annotator.geoViewerRef.value.createLayer('feature', {
      features: ['text'],
    });
    this.featureLayer = layer
      .createFeature('text')
      .text((data: AttributeTextData) => data.text)
      .position((data: AttributeTextData) => ({ x: data.x, y: data.y }));
    super.initialize();
  }

  setFrame(val:number) {
    this.frame = val;
  }

  updateRenderAttributes(attributes: Attribute[], user: string) {
    this.renderAttributes = attributes;
    this.user = user;
    this.autoColorIndex = [];
    // We create the color formatter for the render attributesW
    this.renderAttributes.forEach((item) => {
      if (item.datatype === 'text') {
        this.autoColorIndex.push((data: string | number | boolean) => {
          if (item.valueColors && Object.keys(item.valueColors).length) {
            return item.valueColors[data as string] || item.color || 'white';
          }
          return item.color || 'white';
        });
      } else if (item.datatype === 'number') {
        this.autoColorIndex.push((data: string | number | boolean) => {
          if (item.valueColors && Object.keys(item.valueColors).length) {
            const colorArr = Object.entries(item.valueColors as Record<string, string>)
              .map(([key, val]) => ({ key: parseFloat(key), val }));
            colorArr.sort((a, b) => a.key - b.key);

            const colorNums = colorArr.map((map) => map.key);
            const colorVals = colorArr.map((map) => map.val);
            const colorScale = d3.scaleLinear()
              .domain(colorNums)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .range(colorVals as any);
            return (data !== undefined && colorScale(data as number)?.toString()) || item.color || 'white';
          }
          return item.color || 'white';
        });
      }
    });
  }

  formatData(frameData: FrameDataTrack[]) {
    const arr = [] as AttributeTextData[];
    const typeStyling = this.typeStyling.value;
    frameData.forEach((track: FrameDataTrack) => {
      const formatted = this.formatter(track, this.renderAttributes, this.user, typeStyling, this.autoColorIndex, this.frame);
      if (formatted !== null) {
        arr.push(...formatted);
      }
    });
    return arr;
  }

  redraw() {
    this.featureLayer.data(this.formattedData).draw();
    return null;
  }

  disable() {
    this.featureLayer.data([]).draw();
  }

  createStyle(): LayerStyle<AttributeTextData> {
    const baseStyle = super.createStyle();
    return {
      ...baseStyle,
      offset: (data) => ({
        x: data.offsetX || 0,
        y: data.offsetY || 0,
      }),
      textAlign: (data) => data.textAlign,
      color: (data) => data.color,
      fontSize: (data) => data.fontSize,
      textBaseLine: 'top',
      textScaled: (data) => (data.fontSize ? 0 : undefined),
    };
  }
}