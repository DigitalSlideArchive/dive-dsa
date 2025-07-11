import { LineChartData } from './useLineChart';

export interface SwimlaneGraph {
  name: string;
  filter: AttributeKeyFilter;
  enabled: boolean;
  default?: boolean;
  displaySettings?: {
    display: 'static' | 'selected';
    trackFilter: string[];
    displayFrameIndicators?: boolean;
    displayTooltip?: boolean;
    renderMode?: 'classic' | 'segments';
    highlightSegments?: boolean;
    editSegments?: boolean;
    minSegmentSize?: number;

  };
  settings?: Record<string, SwimlaneGraphSettings>;
}

export interface SwimlaneGraphSettings {
  displayName: boolean;
}

export interface TimelineGraphSettings {
    type: LineChartData['type'];
    area: boolean;
    areaOpacity: number;
    areaColor: string;
    lineOpacity: number;
    max: boolean;
  }

export interface TimelineGraph {
    name: string;
    filter: AttributeKeyFilter;
    enabled: boolean;
    default?: boolean;
    yRange?: number[];
    ticks?: number;
    displaySettings?: { display: 'static' | 'selected'; trackFilter: string[] };
    settings?: Record<string, TimelineGraphSettings>;
  }

export interface NumericAttributeEditorOptions {
    type: 'combo'| 'slider';
    range?: number[];
    steps?: number;
  }
export interface StringAttributeEditorOptions {
    type: 'locked'| 'freeform';
  }

export interface ButtonShortcut {
    buttonText: string;
    buttonToolTip?: string;
    iconAppend?: string;
    iconPrepend?: string;
    buttonColor?: string; // 'auto' or can be overridden
    displayValue?: boolean;
  }
export interface AttributeShortcut {
    key?: string;
    type: 'set' | 'dialog' | 'remove';
    modifiers?: string[];
    value: number | boolean | string;
    // segment Means that the adding will add two points and that deletion will delete a segment when inside it
    segment?: boolean; // if this shortcut is for a segment
    segmentEditable?: boolean;
    description?: string;
    button?: ButtonShortcut;
  }

export interface AttributeRendering {
    typeFilter: string[];
    selected?: boolean;
    displayName: string;
    displayColor: 'auto' | string;
    displayTextSize: number;
    valueColor: 'auto' | string;
    valueTextSize: number;
    order: number;
    location: 'inside' | 'outside';
    corner?: 'NW' | 'SE' |'SW';
    box: boolean;
    boxColor: 'auto' | string;
    boxThickness: number;
    boxBackground?: string;
    boxOpacity?: number;
    sticky?: boolean;
    layout: 'vertical' | 'horizontal';
    displayWidth: {
      type: 'px' | '%';
      val: number;
    };
    displayHeight: {
      type: 'px' | 'auto' | '%';
      val: number;
    };
  }

export interface Attribute {
    belongs: 'track' | 'detection';
    datatype: 'text' | 'number' | 'boolean';
    values?: string[];
    valueColors?: Record<string, string>;
    staticColor?: boolean;
    valueOrder?: Record<string, number>;
    description?: string;
    displayText?: string;
    name: string;
    key: string;
    color?: string;
    user?: boolean;
    lockedValues?: boolean;
    editor?: NumericAttributeEditorOptions | StringAttributeEditorOptions;
    shortcuts?: AttributeShortcut[];
    render?: AttributeRendering;
    colorKey?: boolean;
    colorKeySettings?: {display: 'static' | 'selected'; trackFilter: string[] };
    noneColor?: false | string;
  }

export type Attributes = Record<string, Attribute>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type ValueOf<T> = T[keyof T];

export interface AttributeNumberFilter {
    type: 'range' | 'top'; // range filters for number values, top will show highest X values
    comp: '>' | '<' | '>=' | '<=';
    value: number; //current value
    active: boolean; // if this filter is active
    // Settings for Number Fitler
    range: [number, number]; // Pairs of number indicating start/stop ranges
    appliedTo: string[];
  }

export type TimeLineFilter =
    AttributeKeyFilter & { settings? : Record<string, TimelineGraphSettings> };

export type SwimlaneFilter =
    AttributeKeyFilter & { settings? : Record<string, SwimlaneGraphSettings> };

export interface AttributeStringFilter {
    comp: '=' | '!=' | 'contains' | 'starts';
    value: string[]; //Compares with array of items
    appliedTo: string[];
    active: boolean; // if this filter is active
  }

export interface AttributeKeyFilter {
    appliedTo: string[];
    active: boolean; // if this filter is active
    value: boolean;
    type: 'key';
  }
export interface AttributeBoolFilter {
    value: boolean;
    type: 'is' | 'not';
    appliedTo: string[];
    active: boolean; // if this filter is active
  }
export interface AttributeFilter {
    dataType: Attribute['datatype'] | 'key';
    belongsTo: 'track' | 'detection';
    filterData:
    AttributeNumberFilter
    | AttributeStringFilter
    | AttributeBoolFilter
    | AttributeKeyFilter;
  }

export interface TimelineAttribute {
    data: LineChartData;
    minFrame: number;
    maxFrame: number;
    minValue?: number;
    maxValue?: number;
    avgValue?: number;
    type: Attribute['datatype'];
  }

export interface SwimlaneData {
    begin: number;
    end: number;
    value: string | boolean | number;
    singleVal?: boolean;
    color?: string;
  }

export interface SwimlaneAttribute{
    type: Attribute['datatype'];
    name: string;
    data: SwimlaneData[];
    color: string;
    backgroundColor?: string | false;
    displayName?: boolean;
    start: number;
    end: number;
    order?: Record<string, number>;

  }
