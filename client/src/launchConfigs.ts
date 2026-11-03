import { LaunchConfig } from './ConfigurationManager';
import { isHexColorCode } from './utils';

export const MAX_INLINE_LAUNCH_BUTTONS = 3;

/** Default Vuetify primary blue as hex when no color / theme name is set */
export const DEFAULT_LAUNCH_COLOR = '#1976D2';

export type LaunchConfigRow = LaunchConfig & { error?: string; folderName?: string };

/** Normalize stored theme names (primary, etc.) to a hex for the color picker */
export function normalizeLaunchColor(color?: string): string {
  if (!color) {
    return DEFAULT_LAUNCH_COLOR;
  }
  // Accept #RGB, #RRGGBB, or #RRGGBBAA from the picker; drop alpha for button colors
  if (/^#([0-9A-Fa-f]{8})$/.test(color)) {
    return color.slice(0, 7);
  }
  if (isHexColorCode(color)) {
    return color;
  }
  return DEFAULT_LAUNCH_COLOR;
}

/** Drop invalid entries and sort by order (stable) */
export function normalizeLaunchConfigs(raw: unknown): LaunchConfig[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((c): c is LaunchConfig => !!c && typeof c.configurationFolderId === 'string' && !!c.configurationFolderId)
    .map((c, index) => ({ c, index }))
    .sort((a, b) => ((a.c.order ?? 0) - (b.c.order ?? 0)) || (a.index - b.index))
    .map(({ c }) => c);
}

/** Split into inline buttons and overflow-menu entries */
export function splitLaunchConfigs(configs: LaunchConfig[], maxInline = MAX_INLINE_LAUNCH_BUTTONS) {
  return { inline: configs.slice(0, maxInline), overflow: configs.slice(maxInline) };
}
