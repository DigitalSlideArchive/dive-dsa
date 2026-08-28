import { Attribute, AttributeCustomUI, AttributeCustomUIStickyIndicator, AttributeShortcut } from './AttributeTypes';

export const LONG_VALUE_EXPAND_THRESHOLD = 50;

export interface ResolvedAttributeCustomUIStickyIndicator {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlightColor?: string;
  fontSizeScale: number;
  opacity: number;
}

export interface ResolvedAttributeCustomUI {
  enabled: boolean;
  showWithoutButtons: boolean;
  displayValue: boolean;
  stickyValue: boolean;
  stickyValueIndicator: ResolvedAttributeCustomUIStickyIndicator;
  valuePosition: NonNullable<AttributeCustomUI['valuePosition']>;
  longValueMode: NonNullable<AttributeCustomUI['longValueMode']>;
  emptyValueLabel?: string;
  valuePrepend?: string;
  valueAppend?: string;
  showHeader: boolean;
  valueFontSizeScale: number;
  valueAlign: NonNullable<AttributeCustomUI['valueAlign']>;
  valueColor?: 'auto' | string;
  showDescription: boolean;
}

export interface AttributeDisplayValueInfo {
  value: unknown;
  inherited: boolean;
}

interface StickyValueTrack {
  getFeature(frame: number): unknown[];
  getPreviousKeyframe(frame: number): number | undefined;
}

export function hadLegacyDisplayValue(shortcuts?: AttributeShortcut[]): boolean {
  return !!shortcuts?.some((shortcut) => shortcut.button?.displayValue);
}

function resolveStickyValueIndicator(
  indicator?: AttributeCustomUIStickyIndicator,
): ResolvedAttributeCustomUIStickyIndicator {
  return {
    bold: indicator?.bold ?? true,
    italic: indicator?.italic ?? false,
    underline: indicator?.underline ?? false,
    highlightColor: indicator?.highlightColor,
    fontSizeScale: indicator?.fontSizeScale ?? 1,
    opacity: indicator?.opacity ?? 1,
  };
}

export function resolveAttributeCustomUI(
  attribute: Pick<Attribute, 'customUI' | 'shortcuts'>,
): ResolvedAttributeCustomUI {
  const legacyDisplayValue = hadLegacyDisplayValue(attribute.shortcuts);
  const { customUI } = attribute;
  return {
    enabled: customUI?.enabled ?? true,
    showWithoutButtons: customUI?.showWithoutButtons ?? false,
    displayValue: customUI?.displayValue ?? legacyDisplayValue ?? false,
    stickyValue: customUI?.stickyValue ?? false,
    stickyValueIndicator: resolveStickyValueIndicator(customUI?.stickyValueIndicator),
    valuePosition: customUI?.valuePosition ?? 'below',
    longValueMode: customUI?.longValueMode ?? 'expand',
    emptyValueLabel: customUI?.emptyValueLabel,
    valuePrepend: customUI?.valuePrepend,
    valueAppend: customUI?.valueAppend,
    showHeader: customUI?.showHeader ?? true,
    valueFontSizeScale: customUI?.valueFontSizeScale ?? 1,
    valueAlign: customUI?.valueAlign ?? 'left',
    valueColor: customUI?.valueColor,
    showDescription: customUI?.showDescription ?? true,
  };
}

export function resolvedCustomUIToEditorValue(
  resolved: ResolvedAttributeCustomUI,
): AttributeCustomUI {
  const value: AttributeCustomUI = {
    enabled: resolved.enabled,
    showWithoutButtons: resolved.showWithoutButtons,
    displayValue: resolved.displayValue,
    stickyValue: resolved.stickyValue,
    valuePosition: resolved.valuePosition,
    longValueMode: resolved.longValueMode,
    showHeader: resolved.showHeader,
    valueFontSizeScale: resolved.valueFontSizeScale,
    showDescription: resolved.showDescription,
  };
  if (resolved.valueAlign !== 'left') {
    value.valueAlign = resolved.valueAlign;
  }
  if (resolved.valueColor) {
    value.valueColor = resolved.valueColor;
  }
  if (resolved.emptyValueLabel) {
    value.emptyValueLabel = resolved.emptyValueLabel;
  }
  if (resolved.valuePrepend) {
    value.valuePrepend = resolved.valuePrepend;
  }
  if (resolved.valueAppend) {
    value.valueAppend = resolved.valueAppend;
  }
  if (resolved.valueFontSizeScale !== 1) {
    value.valueFontSizeScale = resolved.valueFontSizeScale;
  }
  if (resolved.showHeader === false) {
    value.showHeader = false;
  }
  if (resolved.stickyValue) {
    value.stickyValueIndicator = { ...resolved.stickyValueIndicator };
  }
  return value;
}

export function shouldShowAttributeInCustomUI(
  attribute: Pick<Attribute, 'shortcuts' | 'customUI'>,
  buttonCount: number,
): boolean {
  const customUI = resolveAttributeCustomUI(attribute);
  if (!customUI.enabled) {
    return false;
  }
  return buttonCount > 0 || customUI.showWithoutButtons;
}

function stickyIndicatorDiffersFromDefault(
  indicator: AttributeCustomUIStickyIndicator,
): boolean {
  return !!(
    indicator.bold === false
    || indicator.italic
    || indicator.underline
    || indicator.highlightColor
    || (indicator.fontSizeScale !== undefined && indicator.fontSizeScale !== 1)
    || (indicator.opacity !== undefined && indicator.opacity !== 1)
  );
}

export function buildCustomUIPayload(
  customUI: AttributeCustomUI,
): AttributeCustomUI | undefined {
  const payload: AttributeCustomUI = {};
  if (customUI.enabled === false) {
    payload.enabled = false;
  }
  if (customUI.showWithoutButtons) {
    payload.showWithoutButtons = true;
  }
  if (customUI.displayValue) {
    payload.displayValue = true;
    if (customUI.stickyValue) {
      payload.stickyValue = true;
      if (customUI.stickyValueIndicator && stickyIndicatorDiffersFromDefault(customUI.stickyValueIndicator)) {
        payload.stickyValueIndicator = { ...customUI.stickyValueIndicator };
      }
    }
    if (customUI.valuePosition && customUI.valuePosition !== 'below') {
      payload.valuePosition = customUI.valuePosition;
    }
    if (customUI.longValueMode && customUI.longValueMode !== 'expand') {
      payload.longValueMode = customUI.longValueMode;
    }
    if (customUI.emptyValueLabel?.length) {
      payload.emptyValueLabel = customUI.emptyValueLabel;
    }
    if (customUI.valuePrepend?.length) {
      payload.valuePrepend = customUI.valuePrepend;
    }
    if (customUI.valueAppend?.length) {
      payload.valueAppend = customUI.valueAppend;
    }
    if (customUI.valueFontSizeScale !== undefined && customUI.valueFontSizeScale !== 1) {
      payload.valueFontSizeScale = customUI.valueFontSizeScale;
    }
    if (customUI.valueAlign && customUI.valueAlign !== 'left') {
      payload.valueAlign = customUI.valueAlign;
    }
    if (customUI.valueColor) {
      payload.valueColor = customUI.valueColor;
    }
  }
  if (customUI.showHeader === false) {
    payload.showHeader = false;
  }
  if (customUI.showDescription === false) {
    payload.showDescription = false;
  }
  return Object.keys(payload).length ? payload : undefined;
}

export function stripLegacyDisplayValueFromShortcuts(
  shortcuts: AttributeShortcut[] | undefined,
): AttributeShortcut[] | undefined {
  if (!shortcuts?.length) {
    return shortcuts;
  }
  let changed = false;
  const cleaned = shortcuts.map((shortcut) => {
    if (shortcut.button?.displayValue === undefined) {
      return shortcut;
    }
    changed = true;
    const { displayValue, ...button } = shortcut.button;
    return { ...shortcut, button };
  });
  return changed ? cleaned : shortcuts;
}

export function isEmptyAttributeValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function formatAttributeDisplayValue(
  value: unknown,
  emptyValueLabel?: string,
): string {
  if (isEmptyAttributeValue(value)) {
    return emptyValueLabel ?? '';
  }
  return String(value);
}

export function readAttributeFromFeatureAttributes(
  attributes: {
    userAttributes?: Record<string, Record<string, unknown>>;
    [key: string]: unknown;
  } | undefined,
  attribute: Pick<Attribute, 'name' | 'user'>,
  userLogin: string | null,
): unknown {
  if (!attributes) {
    return undefined;
  }
  if (attribute.user && userLogin && attributes.userAttributes?.[userLogin]) {
    return attributes.userAttributes[userLogin][attribute.name];
  }
  return attributes[attribute.name];
}

export function resolveStickyAttributeValue(
  attribute: Attribute,
  options: {
    frame: number | undefined;
    track: StickyValueTrack | null;
    userLogin: string | null;
    stickyValue: boolean;
    currentValue: unknown;
  },
): AttributeDisplayValueInfo {
  if (!options.stickyValue || !isEmptyAttributeValue(options.currentValue)) {
    return { value: options.currentValue, inherited: false };
  }
  if (attribute.belongs !== 'detection' || !options.track || options.frame === undefined) {
    return { value: options.currentValue, inherited: false };
  }
  let previousFrame = options.frame;
  while (previousFrame >= 0) {
    const previousKeyframe = options.track.getPreviousKeyframe(previousFrame);
    if (previousKeyframe === undefined) {
      break;
    }
    const [feature] = options.track.getFeature(previousKeyframe) as [{
      attributes?: {
        userAttributes?: Record<string, Record<string, unknown>>;
        [key: string]: unknown;
      };
    } | null | undefined];
    const value = readAttributeFromFeatureAttributes(feature?.attributes ?? undefined, attribute, options.userLogin);
    if (!isEmptyAttributeValue(value)) {
      return { value, inherited: true };
    }
    previousFrame = previousKeyframe - 1;
  }
  return { value: options.currentValue, inherited: false };
}

export function resolveCustomUIDisplayValueColor(
  configuredColor: 'auto' | string | undefined,
  rawValue: unknown,
  attribute: Attribute,
  getAttributeValueColor: (attr: Attribute, val?: string | number | boolean) => string,
): string | undefined {
  if (!configuredColor) {
    return undefined;
  }
  if (configuredColor === 'auto') {
    if (isEmptyAttributeValue(rawValue)) {
      return getAttributeValueColor(attribute);
    }
    return getAttributeValueColor(attribute, rawValue as string | number | boolean);
  }
  return configuredColor;
}

export function getCustomUIDisplayValueColorStyle(
  color?: string,
): Record<string, string> {
  if (!color) {
    return {};
  }
  return { color };
}

export function getCustomUIDisplayValueStyle(
  fontSizeScale: number,
  valueAlign: NonNullable<AttributeCustomUI['valueAlign']>,
): Record<string, string> {
  const style: Record<string, string> = {
    textAlign: valueAlign,
  };
  if (fontSizeScale !== 1) {
    style.fontSize = `${Math.round(fontSizeScale * 100)}%`;
  }
  return style;
}

export function getCustomUIDisplayValueFontSizeStyle(
  fontSizeScale: number,
): Record<string, string> {
  return getCustomUIDisplayValueStyle(fontSizeScale, 'left');
}

export function getStickyValueIndicatorStyle(
  indicator: ResolvedAttributeCustomUIStickyIndicator,
  inherited: boolean,
  attributeColor?: string,
): Record<string, string> {
  if (!inherited) {
    return {};
  }
  const style: Record<string, string> = {};
  if (indicator.bold) {
    style.fontWeight = 'bold';
  }
  if (indicator.italic) {
    style.fontStyle = 'italic';
  }
  if (indicator.underline) {
    style.textDecoration = 'underline';
  }
  if (indicator.highlightColor) {
    style.color = indicator.highlightColor === 'auto'
      ? attributeColor || '#F57C00'
      : indicator.highlightColor;
  }
  if (indicator.fontSizeScale !== 1) {
    style.fontSize = `${Math.round(indicator.fontSizeScale * 100)}%`;
  }
  if (indicator.opacity !== 1) {
    style.opacity = String(indicator.opacity);
  }
  return style;
}

export function getStickyValueTooltip(inherited: boolean, value: string): string {
  if (!inherited) {
    return value;
  }
  return value ? `${value} (inherited from previous keyframe)` : 'Inherited from previous keyframe';
}

export function getTruncatedCustomUIDisplayValue(
  value: string,
  rawLength: number,
  longValueMode: ResolvedAttributeCustomUI['longValueMode'],
): string {
  if (longValueMode === 'truncate' && rawLength >= LONG_VALUE_EXPAND_THRESHOLD) {
    return `${value.slice(0, LONG_VALUE_EXPAND_THRESHOLD)}...`;
  }
  return value;
}

export function shouldUseCustomUIValueExpansion(
  rawLength: number,
  longValueMode: ResolvedAttributeCustomUI['longValueMode'],
): boolean {
  return longValueMode === 'expand' && rawLength >= LONG_VALUE_EXPAND_THRESHOLD;
}
