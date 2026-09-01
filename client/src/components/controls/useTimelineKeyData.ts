import { computed, unref, Ref } from 'vue';
import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import {
  useAttributesFilters, useSelectedTrackId, useTimelineFilters,
} from 'vue-media-annotator/provides';
import { SwimlaneAttribute, SwimlaneGraphSettings } from 'vue-media-annotator/use/AttributeTypes';
import { EventChartData } from 'vue-media-annotator/use/useEventChart';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import { SWIMLANE_BAR_HEIGHT } from './timelineLayout';

export interface EventChartDataBundle {
  muted?: boolean;
  values?: EventChartData[];
}

export interface TimelineKeyDataOptions {
  lineChartData: Ref<LineChartData[]> | LineChartData[];
  eventChartData: Ref<EventChartDataBundle> | EventChartDataBundle;
  groupChartData: Ref<EventChartDataBundle> | EventChartDataBundle;
  startFrame: Ref<number> | number;
  endFrame: Ref<number> | number;
}

export function uniqueKeys(data: SwimlaneAttribute['data'], order?: Record<string, number>) {
  const vals: { value: string; color: string; order?: number }[] = [];
  data.forEach((item) => {
    if (vals.findIndex((findItem) => findItem.value === item.value) === -1) {
      if (!order || order[item.value.toString()] !== undefined) {
        vals.push({
          value: item.value.toString(),
          color: item.color || 'white',
          order: order && order[item.value.toString()],
        });
      }
    }
  });
  if (order) {
    vals.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return 0;
    });
  }
  return vals;
}

export function uniqueFilterItems(data: EventChartData[]) {
  const vals: { value: string; color: string }[] = [];
  data.forEach((item) => {
    if (vals.findIndex((findItem) => findItem.value === item.type) === -1) {
      vals.push({ value: item.type.toString(), color: item.color || 'white' });
    }
  });
  return vals;
}

export function getMinMax(data: SwimlaneAttribute['data']) {
  let min = Infinity;
  let max = -Infinity;
  data.forEach((item) => {
    min = Math.min(min, item.value as number);
    max = Math.max(max, item.value as number);
  });
  return `Range from ${min.toFixed(2)} to ${max.toFixed(2)}`;
}

export function isEventTimeline(timeline: TimelineDisplay) {
  return timeline.type === 'event'
    || timeline.name === 'Events'
    || timeline.name === 'events'
    || timeline.name === 'Groups';
}

export function frameRangesIntersect(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  const minEnd = Math.min(endA, endB);
  const maxStart = Math.max(startA, startB);
  return minEnd >= maxStart;
}

export function getKeyRowStyle(color: string) {
  return {
    color,
    border: `2px solid ${color}`,
    height: `${SWIMLANE_BAR_HEIGHT}px`,
  };
}

export function useTimelineKeyData(options: TimelineKeyDataOptions) {
  const {
    attributeTimelineData,
    swimlaneDisplaySettings, swimlaneGraphs, attributeSwimlaneData,
  } = useAttributesFilters();
  const { eventChartDataMap: timelineFilterMap } = useTimelineFilters();
  const selectedTrackIdRef = useSelectedTrackId();

  const lineChartData = computed(() => unref(options.lineChartData));
  const eventChartData = computed(() => unref(options.eventChartData));
  const groupChartData = computed(() => unref(options.groupChartData));
  const startFrame = computed(() => unref(options.startFrame));
  const endFrame = computed(() => unref(options.endFrame));

  const getTimelineByName = (name: string, type: TimelineDisplay['type']) => {
    if (type === 'swimlane' && attributeSwimlaneData.value[name] !== undefined) {
      return attributeSwimlaneData.value[name];
    }
    if (type === 'graph' && attributeTimelineData.value[name] !== undefined) {
      return attributeTimelineData.value[name];
    }
    if (type === 'filter' && timelineFilterMap.value[name] !== undefined) {
      return timelineFilterMap.value[name];
    }
    return false;
  };

  const getSwimlaneSettings = (timelineName: string): Record<string, SwimlaneGraphSettings> => (
    swimlaneGraphs.value[timelineName]?.settings || {}
  );

  const getSwimlaneRowLabel = (
    subKey: string,
    timelineName: string,
    swimlaneData: Record<string, SwimlaneAttribute>,
  ) => {
    const attrs = Object.keys(swimlaneData);
    const displaySettings = swimlaneDisplaySettings.value[timelineName];
    const settings = getSwimlaneSettings(timelineName);
    if (displaySettings?.hideKeyAttributeLabels) {
      return '';
    }
    if (settings?.[subKey]?.displayName === false) {
      return '';
    }
    if (attrs.length === 1) {
      if (!displaySettings?.hideKeyTitle && timelineName !== subKey) {
        return timelineName;
      }
      return subKey;
    }
    return subKey;
  };

  const getSwimlaneTooltipTitle = (
    subKey: string,
    timelineName: string,
    swimlaneData: Record<string, SwimlaneAttribute>,
  ) => {
    const label = getSwimlaneRowLabel(subKey, timelineName, swimlaneData);
    return label || subKey;
  };

  const getGraphAttributeItems = (timelineName: string) => {
    const graphData = getTimelineByName(timelineName, 'graph');
    if (!graphData || typeof graphData !== 'object' || !('data' in graphData)) {
      return [] as { name: string; color: string }[];
    }
    return graphData.data.map((item: { data: LineChartData }) => ({
      name: item.data.name,
      color: item.data.color,
    }));
  };

  const getDetectionTypeItems = computed(() => (
    lineChartData.value
      .filter((item) => item.name !== 'total')
      .map((item) => ({ name: item.name, color: item.color }))
  ));

  const getEventChartValues = (timeline: TimelineDisplay) => {
    if (timeline.name === 'Groups') {
      return groupChartData.value?.values || [];
    }
    return eventChartData.value?.values || [];
  };

  const getFilterTypeItems = (timelineName: string) => {
    const data = getTimelineByName(timelineName, 'filter');
    if (!data || typeof data !== 'object' || !('values' in data)) {
      return [] as { value: string; color: string }[];
    }
    return uniqueFilterItems(data.values as EventChartData[]);
  };

  const getSwimlaneEntries = (timelineName: string) => {
    const data = getTimelineByName(timelineName, 'swimlane');
    if (!data || typeof data !== 'object') {
      return [] as [string, SwimlaneAttribute][];
    }
    return Object.entries(data).filter(([, bar]) => (
      frameRangesIntersect(startFrame.value, endFrame.value, bar.start, bar.end)
    ));
  };

  const getLegacySwimlaneEntries = (legacyView: string) => {
    const data = legacyView ? attributeSwimlaneData.value[legacyView] : undefined;
    if (!data) {
      return [] as [string, SwimlaneAttribute][];
    }
    return Object.entries(data).filter(([, bar]) => (
      frameRangesIntersect(startFrame.value, endFrame.value, bar.start, bar.end)
    ));
  };

  const legacySwimlaneData = (legacyView: string) => (
    legacyView ? attributeSwimlaneData.value[legacyView] : undefined
  );

  return {
    uniqueKeys,
    uniqueFilterItems,
    getMinMax,
    getTimelineByName,
    selectedTrackIdRef,
    attributeSwimlaneData,
    getSwimlaneRowLabel,
    getSwimlaneTooltipTitle,
    getGraphAttributeItems,
    getDetectionTypeItems,
    isEventTimeline,
    getEventChartValues,
    getFilterTypeItems,
    getKeyRowStyle,
    getSwimlaneEntries,
    getLegacySwimlaneEntries,
    legacySwimlaneData,
  };
}
