import type { UISettings } from '../../ConfigurationManager';

type LegendControlsSettings = {
  UILegendControls?: boolean;
  UILegendForceOpen?: boolean;
  UILegendHideToggle?: boolean;
};

const LEGEND_SETTING_KEYS: (keyof LegendControlsSettings)[] = [
  'UILegendControls',
  'UILegendForceOpen',
  'UILegendHideToggle',
];

function isSettingsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Move legend UI settings from UIControls into UITimeline when loading legacy configs. */
export default function migrateLegendSettingsUISettings(uiSettings?: UISettings): UISettings | undefined {
  if (!uiSettings) {
    return uiSettings;
  }

  const controls = uiSettings.UIControls;
  if (!isSettingsObject(controls)) {
    return uiSettings;
  }

  const legacyControls = controls as LegendControlsSettings & Record<string, unknown>;
  const hasLegacy = LEGEND_SETTING_KEYS.some((key) => legacyControls[key] !== undefined);
  if (!hasLegacy) {
    return uiSettings;
  }

  const timeline = isSettingsObject(uiSettings.UITimeline)
    ? { ...uiSettings.UITimeline }
    : {};

  LEGEND_SETTING_KEYS.forEach((key) => {
    if (legacyControls[key] !== undefined && timeline[key] === undefined) {
      timeline[key] = legacyControls[key];
    }
  });

  const restControls = { ...legacyControls };
  LEGEND_SETTING_KEYS.forEach((key) => {
    delete restControls[key];
  });

  return {
    ...uiSettings,
    UITimeline: timeline,
    UIControls: restControls,
  };
}
