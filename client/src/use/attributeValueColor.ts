import StyleManager from '../StyleManager';
import { Attribute } from './AttributeTypes';

function getMissingValueColor(attribute?: Attribute) {
  return attribute?.valueColors?.[''];
}

export default function createGetAttributeValueColor(trackStyleManager: StyleManager) {
  return (attribute: Attribute, val?: string | number | boolean) => {
    if (val === undefined || val === null || val === '') {
      if (attribute.noneColor) {
        return attribute.noneColor;
      }
      return getMissingValueColor(attribute)
        || attribute.color
        || trackStyleManager.typeStyling.value.color(attribute.name);
    }
    if (attribute.datatype === 'text') {
      if (attribute.staticColor) {
        if (attribute.color) {
          return attribute.color;
        }
        return trackStyleManager.typeStyling.value.color(attribute.name);
      }
      const strVal = val.toString();
      if (attribute.valueColors && attribute.valueColors[strVal]) {
        return attribute.valueColors[strVal];
      }
    }
    return trackStyleManager.typeStyling.value.color(val.toString());
  };
}
