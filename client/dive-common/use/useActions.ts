/* eslint-disable max-len */
import { Ref } from '@vue/composition-api';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';

interface Action {
    type: string;
}

type MatchOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'range' | 'in';

interface AttributeMatch {
    op?: MatchOperator;
    val: any; //number, string, array of numbers or strings
}

export interface TrackSelectAction {
    typeFilter?: string[]; // filter for tracks of specific types
    confidenceFilter?: number; // find track wtih confidenceValue > 0
    startTrack?: number;
    startFrame?: number;
    Nth: number; //first: 0, last: -1, nth:

    //Get track which matches attribute values
    attributes?: {
        track?: Record<string, AttributeMatch>;
        detection?: Record<string, AttributeMatch>;
    };
}


interface AttributeSelectAction {
    track?: Record<string, AttributeMatch>;
    detection?: Record<string, AttributeMatch>;
}

interface GoToFrameAction{
    track?: TrackSelectAction; // Go to first frame of track that matches
}


const checkAttributes = (attributeMatch: Record<string, AttributeMatch>, attributes: StringKeyObject) => {
  const results: boolean[] = [];
  Object.entries(attributeMatch).forEach(([key, actionCheck]) => {
    if (attributes[key] !== undefined) {
      if (actionCheck.op) {
        switch (actionCheck.op) {
          case '=': {
            // eslint-disable-next-line eqeqeq
            results.push(attributes[key] == actionCheck.val);
            break;
          }
          case '!=': {
            // eslint-disable-next-line eqeqeq
            results.push(attributes[key] != actionCheck.val);
            break;
          }
          case '>': {
            results.push(attributes[key] as number | string > actionCheck.val);
            break;
          }
          case '<': {
            results.push(attributes[key] as number | string < actionCheck.val);
            break;
          }
          case '<=': {
            results.push(attributes[key] as number | string <= actionCheck.val);
            break;
          }
          case '>=': {
            results.push(attributes[key] as number | string >= actionCheck.val);
            break;
          }
          case 'range': {
            results.push(attributes[key] as number | string >= actionCheck.val[0] && attributes[key] as number | string <= actionCheck.val[1]);
            break;
          }
          case 'in': {
            results.push(actionCheck.val.includes(attributes[key]));
            break;
          }
          default: {
            results.push(attributes[key] !== undefined);
          }
        }
      }
    } else {
      results.push(false);
    }
  });
  return results.filter((item) => item).length === results.length;
};

export {
  checkAttributes,
};
