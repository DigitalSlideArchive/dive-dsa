import { Attribute, AttributeCustomUI, AttributeShortcut } from './AttributeTypes';

export const LONG_VALUE_EXPAND_THRESHOLD = 50;

export interface ResolvedAttributeCustomUI {
  enabled: boolean;
  showWithoutButtons: boolean;
  displayValue: boolean;
  valuePosition: NonNullable<AttributeCustomUI['valuePosition']>;
  longValueMode: NonNullable<AttributeCustomUI['longValueMode']>;
  emptyValueLabel?: string;
  showDescription: boolean;
}

export function hadLegacyDisplayValue(shortcuts?: AttributeShortcut[]): boolean {
  return !!shortcuts?.some((shortcut) => shortcut.button?.displayValue);
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
    valuePosition: customUI?.valuePosition ?? 'below',
    longValueMode: customUI?.longValueMode ?? 'expand',
    emptyValueLabel: customUI?.emptyValueLabel,
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
    valuePosition: resolved.valuePosition,
    longValueMode: resolved.longValueMode,
    showDescription: resolved.showDescription,
  };
  if (resolved.emptyValueLabel) {
    value.emptyValueLabel = resolved.emptyValueLabel;
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
