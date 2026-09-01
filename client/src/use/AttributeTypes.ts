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
    renderMode?: 'classic' | 'segments' | 'discrete';
    highlightSegments?: boolean;
    editSegments?: boolean;
    minSegmentSize?: number;
    hideTitle?: boolean;
    hideKeyTitle?: boolean;
    hideKeyAttributeLabels?: boolean;
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
    /** @deprecated Use attribute customUI.displayValue. Kept for legacy configs. */
    displayValue?: boolean;
  }

export interface AttributeCustomUIStickyIndicator {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** Font color for inherited values. Use 'auto' for the attribute color. */
    highlightColor?: string;
    /** Multiplier for font size when value is inherited (1 = same size). */
    fontSizeScale?: number;
    /** Opacity when value is inherited (0–1). */
    opacity?: number;
  }

export interface AttributeCustomUI {
    enabled?: boolean;
    /** Show this attribute in Custom UI even when it has no button shortcuts. */
    showWithoutButtons?: boolean;
    displayValue?: boolean;
    /** Carry forward the last non-empty value from previous keyframes. */
    stickyValue?: boolean;
    stickyValueIndicator?: AttributeCustomUIStickyIndicator;
    valuePosition?: 'below' | 'above' | 'header';
    longValueMode?: 'truncate' | 'expand' | 'scroll';
    emptyValueLabel?: string;
    /** When valuePosition is header, separator appended after the section title. */
    headerValueSeparator?: ':' | '-';
    /** Horizontal space (px) between the separator and the displayed value in header mode. */
    headerValueOffset?: number;
    /** Text shown before the displayed attribute value. */
    valuePrepend?: string;
    /** Text shown after the displayed attribute value. */
    valueAppend?: string;
    /** Show the attribute name heading in the Custom UI panel. */
    showHeader?: boolean;
    /** Font size multiplier for the displayed attribute value (1 = default). */
    valueFontSizeScale?: number;
    /** Horizontal alignment for the displayed attribute value. */
    valueAlign?: 'left' | 'center' | 'right';
    /** Value text color. Use 'auto' for the attribute value color mapping. */
    valueColor?: 'auto' | string;
    showDescription?: boolean;
  }
export interface AttributeShortcut {
    key?: string;
    type: 'set' | 'dialog' | 'remove';
    modifiers?: string[];
    value: number | boolean | string;
    // segment Means that the adding will add two points and that deletion will delete a segment when inside it
    segment?: boolean; // if this shortcut is for a segment
    segmentEditable?: boolean;
    segmentSize?: number; // size of segment to add
    segmentSizeType?: 'frames' | 'seconds' | 'percent';
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

/**
 * When the attribute is a number and `useConditionals` is true.
 * `min` / `max` compare the new value to the current linked metadata value for this dataset;
 * `greater_than` / `less_than` compare to `threshold`.
 */
export interface MetadataLinkNumberConditions {
    mode: 'min' | 'max' | 'greater_than' | 'less_than';
    threshold?: number;
}

/** When the attribute is text and `useConditionals` is true. */
export interface MetadataLinkStringConditions {
    mode: 'contains';
    substring: string;
}

/**
 * When `updateValue` is true, detection attribute edits sync to linked DIVEMetadata.
 * `key` is the DIVEMetadata field name to update — it may differ from the attribute's
 * internal `key` (`{belongs}_{name}`).
 */
export interface MetadataLinkOptions {
    key: string;
    updateValue: boolean;
    /** If false/undefined, metadata updates on every attribute change. If true, use number/string rules. */
    useConditionals?: boolean;
    numberConditions?: MetadataLinkNumberConditions;
    stringConditions?: MetadataLinkStringConditions;
    /**
     * When true, the DIVEMetadata field name is taken from the current value of another detection
     * attribute (see `dynamicKeyAttributeKey`), not from `key`.
     */
    useDynamicKeyFromAttribute?: boolean;
    /** Other attribute's `key` whose string value names the DIVEMetadata field to update. */
    dynamicKeyAttributeKey?: string;
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
    customUI?: AttributeCustomUI;
    render?: AttributeRendering;
    colorKey?: boolean;
    colorKeySettings?: {display: 'static' | 'selected'; trackFilter: string[] };
    noneColor?: false | string;
    metadataLink?: MetadataLinkOptions;
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
