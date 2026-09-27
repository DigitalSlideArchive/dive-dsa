import { omit } from 'lodash';

import { DisplayTrackFilterSettings } from './AttributeTypes';

export function parsePinnedTrackId(pinned?: number | string | null): number | null {
  if (pinned == null || pinned === '') {
    return null;
  }
  const pinnedNum = typeof pinned === 'number' ? pinned : Number(pinned);
  if (Number.isNaN(pinnedNum) || pinnedNum < 0) {
    return null;
  }
  return pinnedNum;
}

/** Normalize legacy configs that set pinnedTrackId without display: 'pinned'. */
export function normalizeDisplaySettings(
  settings?: DisplayTrackFilterSettings,
): DisplayTrackFilterSettings | undefined {
  if (!settings) {
    return settings;
  }
  const pinnedTrackId = parsePinnedTrackId(settings.pinnedTrackId);
  if (pinnedTrackId !== null && settings.display !== 'pinned') {
    return { ...settings, display: 'pinned', pinnedTrackId };
  }
  if (settings.display === 'pinned') {
    return { ...settings, pinnedTrackId: pinnedTrackId ?? settings.pinnedTrackId };
  }
  return omit(settings, 'pinnedTrackId') as DisplayTrackFilterSettings;
}

export function sanitizeDisplaySettings(
  settings: DisplayTrackFilterSettings,
): DisplayTrackFilterSettings {
  const normalized = normalizeDisplaySettings(settings) || settings;
  if (normalized.display !== 'pinned') {
    return omit(normalized, 'pinnedTrackId') as DisplayTrackFilterSettings;
  }
  return normalized;
}

export function defaultDisplayTrackFilterSettings(): DisplayTrackFilterSettings {
  return {
    display: 'static',
    trackFilter: ['all'],
  };
}

export function requiresSelectedTrack(settings?: DisplayTrackFilterSettings): boolean {
  const normalized = normalizeDisplaySettings(settings);
  return normalized?.display !== 'pinned';
}
