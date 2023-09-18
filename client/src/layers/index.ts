import LineLayer from './AnnotationLayers/LineLayer';
import PointLayer from './AnnotationLayers/PointLayer';
import PolygonLayer from './AnnotationLayers/PolygonLayer';
import RectangleLayer from './AnnotationLayers/RectangleLayer';
import TextLayer from './AnnotationLayers/TextLayer';

import ToolTipWidget from './UILayers/ToolTipWidget.vue';
import ToolTipLayer from './UILayers/ToolTipLayer';
import AttributeColorKey from './UILayers/AttributeColorKey.vue';
import * as UILayerTypes from './UILayers/UILayerTypes';

import EditAnnotationLayer from './EditAnnotationLayer';
import type { EditAnnotationTypes } from './EditAnnotationLayer';

type VisibleAnnotationTypes = EditAnnotationTypes | 'text' | 'tooltip' | 'TrackTail' | 'overlays' | 'attributeKey';

export {
  /* AnnotationLayers */
  LineLayer,
  PointLayer,
  PolygonLayer,
  RectangleLayer,
  TextLayer,
  /* UILayers */
  AttributeColorKey,
  ToolTipWidget,
  ToolTipLayer,
  UILayerTypes,
  /* Other */
  VisibleAnnotationTypes,
  EditAnnotationLayer,
  EditAnnotationTypes,
};
