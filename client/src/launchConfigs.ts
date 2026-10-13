import { LaunchConfig } from './ConfigurationManager';

export const MAX_INLINE_LAUNCH_BUTTONS = 3;

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
