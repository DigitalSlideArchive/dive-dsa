import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import { SwimlaneGraph, SwimlaneGraphSettings } from 'vue-media-annotator/use/AttributeTypes';

export const SWIMLANE_ROW_HEIGHT = 30;
export const SWIMLANE_BAR_HEIGHT = 20;
export const SWIMLANE_BAR_TOP_OFFSET = 3;
export const TIMELINE_SECTION_HEADER_HEIGHT = 20;
export const TIMELINE_SECTION_GAP = 4;
export const TIMELINE_CHART_BORDER = 1;
/** EventChart.vue applies vertical margin; AttributeSwimlaneGraph does not */
export const EVENT_CHART_MARGIN_Y = 5;
export const EVENT_CHART_ROW_PITCH = 15;
export const EVENT_CHART_BOTTOM_RESERVE = 10;

export function getChartBorderTopOffset(): number {
  return TIMELINE_CHART_BORDER;
}

/** Top offset of drawable chart content relative to the timeline row */
export function getEventChartContentTopOffset(): number {
  return TIMELINE_CHART_BORDER + EVENT_CHART_MARGIN_Y + SWIMLANE_BAR_TOP_OFFSET;
}

export function getSwimlaneChartContentTopOffset(): number {
  return TIMELINE_CHART_BORDER + SWIMLANE_BAR_TOP_OFFSET;
}

/** Height of the inner chart area inside a bordered timeline row */
export function getChartInnerHeight(sectionHeight: number): number {
  return Math.max(0, sectionHeight - (TIMELINE_CHART_BORDER * 2));
}

/** Inner scroll/draw area used by EventChart and AttributeSwimlaneGraph roots */
export function getEventChartDrawHeight(sectionHeight: number): number {
  return Math.max(0, sectionHeight - EVENT_CHART_BOTTOM_RESERVE - (TIMELINE_CHART_BORDER * 2));
}

export const KEY_PANEL_MIN_WIDTH = 80;
export const KEY_PANEL_MAX_WIDTH = 150;
export const KEY_PANEL_CHAR_WIDTH = 8;
export const KEY_PANEL_PADDING = 20;

export interface KeyPanelWidthOptions {
  minWidth?: number;
  maxWidth?: number;
}

export function resolveKeyPanelWidthBounds(options?: KeyPanelWidthOptions): {
  minWidth: number;
  maxWidth: number;
} {
  const minWidth = options?.minWidth ?? KEY_PANEL_MIN_WIDTH;
  const maxWidth = options?.maxWidth ?? KEY_PANEL_MAX_WIDTH;
  return {
    minWidth: Math.min(minWidth, maxWidth),
    maxWidth: Math.max(minWidth, maxWidth),
  };
}

export function getTotalSectionGap(timelineList: TimelineDisplay[]): number {
  return Math.max(0, timelineList.length - 1) * TIMELINE_SECTION_GAP;
}

export function getSectionContentHeight(
  timeline: TimelineDisplay,
  timelineList: TimelineDisplay[],
  clientHeight: number,
  hideSectionTitle = false,
): number {
  const headerDeduction = hideSectionTitle ? 0 : TIMELINE_SECTION_HEADER_HEIGHT;
  const totalGap = getTotalSectionGap(timelineList);
  const availableHeight = clientHeight - totalGap;
  if (timeline.maxHeight === -1 && timelineList.length) {
    let definedHeights = 0;
    let count = 1;
    timelineList.forEach((item) => {
      if (item.name !== timeline.name && item.maxHeight !== -1) {
        definedHeights += item.maxHeight;
      } else if (item.name !== timeline.name) {
        count += 1;
      }
    });
    return ((availableHeight - definedHeights) / count) - headerDeduction;
  }
  return timeline.maxHeight - headerDeduction;
}

export function buildFilteredTimelineList(
  configMan: { getActiveTimelineConfig: () => { timelines?: TimelineDisplay[] } | null },
  checkTimelineEnabled: (timeline: TimelineDisplay) => boolean,
  dismissedButtons: string[],
): TimelineDisplay[] {
  const list: TimelineDisplay[] = [];
  const activeConfig = configMan.getActiveTimelineConfig();
  if (activeConfig?.timelines?.length) {
    activeConfig.timelines.forEach((item) => {
      if (checkTimelineEnabled(item)) {
        list.push(item);
      }
    });
    list.sort((a, b) => (a.order - b.order));
    return list.filter((item) => !dismissedButtons.includes(item.name));
  }
  return [];
}

export function isDetectionsTimeline(timeline: TimelineDisplay): boolean {
  return timeline.type === 'detections' || timeline.name === 'Detections';
}

export function isCustomTimelineType(timeline: TimelineDisplay): boolean {
  return timeline.type === 'swimlane' || timeline.type === 'graph';
}

export function shouldHideTimelineSectionTitle(
  timeline: TimelineDisplay,
  showKey: boolean,
  swimlaneDisplaySettings: Record<string, SwimlaneGraph['displaySettings']>,
): boolean {
  if (showKey) {
    return true;
  }
  if (timeline.type === 'swimlane') {
    return swimlaneDisplaySettings[timeline.name]?.hideTitle === true;
  }
  return false;
}

export function getSwimlaneChartHeight(sectionHeight: number): number {
  return Math.max(0, sectionHeight - 10);
}

/** @deprecated use shouldHideTimelineSectionTitle */
export function shouldHideSwimlaneSectionTitle(
  timeline: TimelineDisplay,
  swimlaneDisplaySettings: Record<string, SwimlaneGraph['displaySettings']>,
): boolean {
  return shouldHideTimelineSectionTitle(timeline, false, swimlaneDisplaySettings);
}

export function shouldShowKeySectionHeader(
  timelineName: string,
  swimlaneData: Record<string, unknown> | false,
  displaySettings?: SwimlaneGraph['displaySettings'],
): boolean {
  if (displaySettings?.hideKeyTitle) {
    return false;
  }
  if (!swimlaneData || typeof swimlaneData !== 'object') {
    return false;
  }
  const attrs = Object.keys(swimlaneData);
  if (attrs.length === 1 && attrs[0] === timelineName) {
    return false;
  }
  return attrs.length > 1;
}

/** @deprecated use shouldShowKeySectionHeader */
export function shouldShowKeyTitle(
  timelineName: string,
  swimlaneData: Record<string, unknown> | false,
  displaySettings?: SwimlaneGraph['displaySettings'],
): boolean {
  return shouldShowKeySectionHeader(timelineName, swimlaneData, displaySettings);
}

export function shouldShowAttributeLabel(
  subKey: string,
  timelineName: string,
  attrs: string[],
  displaySettings?: SwimlaneGraph['displaySettings'],
  settings?: Record<string, SwimlaneGraphSettings>,
): boolean {
  if (displaySettings?.hideKeyAttributeLabels) {
    return false;
  }
  if (settings?.[subKey]?.displayName === false) {
    return false;
  }
  if (attrs.length === 1 && subKey === timelineName && !displaySettings?.hideKeyTitle) {
    return false;
  }
  return true;
}

export function getTimelineChartAreaInsets(
  showKey: boolean,
  keyPanelWidth: number,
  useChartBorder: boolean,
): { leftInset: number; rightInset: number } {
  const leftInset = (showKey ? keyPanelWidth : 0)
    + (useChartBorder ? TIMELINE_CHART_BORDER : 0);
  const rightInset = useChartBorder ? TIMELINE_CHART_BORDER : 0;
  return { leftInset, rightInset };
}

export function computeKeyPanelWidth(
  timelineList: TimelineDisplay[],
  attributeSwimlaneData: Record<string, Record<string, unknown>>,
  swimlaneDisplaySettings: Record<string, SwimlaneGraph['displaySettings']>,
  swimlaneGraphSettings: Record<string, Record<string, SwimlaneGraphSettings>>,
  legacyLabel?: string,
  options?: KeyPanelWidthOptions,
): number {
  const { minWidth, maxWidth } = resolveKeyPanelWidthBounds(options);
  let maxLabelLength = 0;
  if (!timelineList.length && legacyLabel) {
    maxLabelLength = legacyLabel.length;
  }
  timelineList.forEach((timeline) => {
    const displaySettings = swimlaneDisplaySettings[timeline.name];
    const swimlaneData = timeline.type === 'swimlane'
      ? attributeSwimlaneData[timeline.name]
      : undefined;
    if (timeline.type === 'graph' || isDetectionsTimeline(timeline)) {
      maxLabelLength = Math.max(maxLabelLength, timeline.name.length);
    } else if (swimlaneData && shouldShowKeySectionHeader(timeline.name, swimlaneData, displaySettings)) {
      maxLabelLength = Math.max(maxLabelLength, timeline.name.length);
    }
    if (swimlaneData) {
      const attrs = Object.keys(swimlaneData);
      const settings = swimlaneGraphSettings[timeline.name];
      attrs.forEach((subKey) => {
        if (shouldShowAttributeLabel(subKey, timeline.name, attrs, displaySettings, settings)) {
          maxLabelLength = Math.max(maxLabelLength, subKey.length);
        }
      });
    } else {
      maxLabelLength = Math.max(maxLabelLength, timeline.name.length);
    }
  });
  if (maxLabelLength === 0) {
    return minWidth;
  }
  return Math.min(
    maxWidth,
    Math.max(minWidth, maxLabelLength * KEY_PANEL_CHAR_WIDTH + KEY_PANEL_PADDING),
  );
}
