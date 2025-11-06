/* eslint-disable max-len */
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import { EditAnnotationTypes } from 'vue-media-annotator/layers';
import { ButtonShortcut } from 'vue-media-annotator/use/AttributeTypes';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Action {
    type: string;

}

export type MatchOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'range' | 'in';

export interface AttributeMatch {
    op?: MatchOperator;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    val: any; //number, string, array of numbers or strings
}

export interface AttributeSelectAction {
  track?: Record<string, AttributeMatch>;
  detection?: Record<string, AttributeMatch>;
}

export interface TrackSelectAction {
    typeFilter?: string[]; // filter for tracks of specific types
    confidenceFilter?: number; // find track wtih confidenceValue > 0
    startTrack?: number;
    startFrame?: number;
    Nth?: number; //first: 0, last: -1, nth:

    //Get track which matches attribute values
    attributes?: AttributeSelectAction;
    type: 'TrackSelection';
    direction?: 'next' | 'previous';
}

export type ActionTypes = 'GoToFrame' | 'SelectTrack' | 'Wait' | 'Popup' | 'CreateTrack' | 'CreateFullFrameTrack';

export interface GoToFrameAction{
    track?: TrackSelectAction; // Go to first frame of track that matches conditions
    frame?: number; // Jump to X frame
    type: 'GoToFrame';
}

export interface CreateTrackAction {
  type: 'CreateTrackAction'; // trackType
  trackType?: string;
  geometryType: EditAnnotationTypes;
  editableType: boolean;
  editableTypeList?: string[];
  editableTitle?: string;
  editableText?: string;
  selectTrackAfter: boolean;
}

export interface CreateFullFrameTrackAction {
  type: 'CreateFullFrameTrackAction';
  useExisting: boolean;
  trackType: string;
  geometryType: 'rectangle' | 'Time';
  selectTrackAfter: boolean;
}

export interface DIVEMetadataAction {
    type: 'Metadata';
    key: string;
    value?: string | number | boolean;
    actionType: 'set' | 'dialog' | 'remove';
    dataType: 'string' | 'number' | 'boolean';
    visibility: 'always' | 'connected';
}

export interface DIVEAction {
  action: GoToFrameAction | TrackSelectAction | CreateTrackAction | CreateFullFrameTrackAction | DIVEMetadataAction;
}

export interface DIVEActionShortcut {
    shortcut: {
      key: string;
      modifiers?: string[];
    };
    description?: string;
    actions: DIVEAction[];
    button?: ButtonShortcut;
}

// Either immediately executed action or a keyboard shortcut
export interface UIDIVEAction {
  shortcut?: {
    key: string;
    modifiers?: string[];
  }
  description?: string;
  applyConfig?: boolean; //Add to the system configuration the shortcut/action
  actions: DIVEAction[];
}

const checkAttributes = (attributeMatch: Record<string, AttributeMatch>, baseAttributes: StringKeyObject, user?: string) => {
  const results: boolean[] = [];
  Object.entries(attributeMatch).forEach(([key, actionCheck]) => {
    let attributes = baseAttributes;
    if (user && baseAttributes.userAttributes && (baseAttributes.userAttributes as StringKeyObject)[user]) {
      attributes = (baseAttributes.userAttributes as StringKeyObject)[user] as StringKeyObject;
    }
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
