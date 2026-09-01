<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, PropType, ref, Ref, watch,
} from 'vue';
import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import {
  useAttributesFilters, useSelectedTrackId,
  useTimelineFilters,
} from 'vue-media-annotator/provides';
import { SwimlaneAttribute, SwimlaneGraphSettings } from 'vue-media-annotator/use/AttributeTypes';
import { EventChartData } from 'vue-media-annotator/use/useEventChart';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import {
  getChartInnerHeight,
  getEventChartDrawHeight,
  getSwimlaneChartContentTopOffset,
  isDetectionsTimeline,
  SWIMLANE_BAR_HEIGHT,
  SWIMLANE_BAR_TOP_OFFSET,
  SWIMLANE_ROW_HEIGHT,
  TIMELINE_CHART_BORDER,
  EVENT_CHART_MARGIN_Y,
} from './timelineLayout';

interface EventChartDataBundle {
  muted?: boolean;
  values?: EventChartData[];
}

export default defineComponent({
  name: 'TimelineKeySection',
  props: {
    timeline: {
      type: Object as PropType<TimelineDisplay | null>,
      default: null,
    },
    legacyView: {
      type: String,
      default: '',
    },
    legacyKeyKind: {
      type: String as PropType<'detections' | 'events' | 'groups' | 'graph' | 'swimlane' | 'filter' | ''>,
      default: '',
    },
    sectionHeight: {
      type: Number,
      required: true,
    },
    keyPanelWidth: {
      type: Number,
      required: true,
    },
    swimlaneScrollOffset: {
      type: Number,
      default: 0,
    },
    startFrame: {
      type: Number,
      default: 0,
    },
    endFrame: {
      type: Number,
      default: 0,
    },
    lineChartData: {
      type: Array as PropType<LineChartData[]>,
      default: () => [],
    },
    eventChartData: {
      type: Object as PropType<EventChartDataBundle>,
      default: () => ({ values: [] }),
    },
    groupChartData: {
      type: Object as PropType<EventChartDataBundle>,
      default: () => ({ values: [] }),
    },
  },
  setup(props) {
    const {
      attributeTimelineData,
      swimlaneDisplaySettings, swimlaneGraphs, attributeSwimlaneData,
    } = useAttributesFilters();
    const { eventChartDataMap: timelineFilterMap } = useTimelineFilters();
    const selectedTrackIdRef = useSelectedTrackId();
    const keyRef: Ref<HTMLElement | null> = ref(null);

    watch(() => props.swimlaneScrollOffset, (offset) => {
      if (keyRef.value !== null) {
        keyRef.value.scrollTop = offset;
      }
    });

    const uniqueKeys = (data: SwimlaneAttribute['data'], order?: Record<string, number>) => {
      const vals: {value: string; color: string; order?: number}[] = [];
      data.forEach((item) => {
        if (vals.findIndex((findItem) => findItem.value === item.value) === -1) {
          if (!order || (order && order[item.value.toString()] !== undefined)) {
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
    };

    const uniqueFilterItems = (data: EventChartData[]) => {
      const vals: {value: string; color: string}[] = [];
      data.forEach((item) => {
        if (vals.findIndex((findItem) => findItem.value === item.type) === -1) {
          vals.push({ value: item.type.toString(), color: item.color || 'white' });
        }
      });
      return vals;
    };

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

    const getMinMax = (data: SwimlaneAttribute['data']) => {
      let min = Infinity;
      let max = -Infinity;
      data.forEach((item) => {
        min = Math.min(min, item.value as number);
        max = Math.max(max, item.value as number);
      });
      return `Range from ${min.toFixed(2)} to ${max.toFixed(2)}`;
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
      props.lineChartData
        .filter((item) => item.name !== 'total')
        .map((item) => ({ name: item.name, color: item.color }))
    ));

    const isEventTimeline = (timeline: TimelineDisplay) => (
      timeline.type === 'event'
      || timeline.name === 'Events'
      || timeline.name === 'events'
      || timeline.name === 'Groups'
    );

    const getEventChartValues = (timeline: TimelineDisplay) => {
      if (timeline.name === 'Groups') {
        return props.groupChartData?.values || [];
      }
      return props.eventChartData?.values || [];
    };

    const getFilterTypeItems = (timelineName: string) => {
      const data = getTimelineByName(timelineName, 'filter');
      if (!data || typeof data !== 'object' || !('values' in data)) {
        return [] as { value: string; color: string }[];
      }
      return uniqueFilterItems(data.values as EventChartData[]);
    };

    const getKeyRowStyle = (color: string) => ({
      color,
      border: `2px solid ${color}`,
      height: `${SWIMLANE_BAR_HEIGHT}px`,
    });

    const frameRangesIntersect = (startA: number, endA: number, startB: number, endB: number) => {
      const minEnd = Math.min(endA, endB);
      const maxStart = Math.max(startA, startB);
      return minEnd >= maxStart;
    };

    const getSwimlaneEntries = (timelineName: string) => {
      const data = getTimelineByName(timelineName, 'swimlane');
      if (!data || typeof data !== 'object') {
        return [] as [string, SwimlaneAttribute][];
      }
      return Object.entries(data).filter(([, bar]) => (
        frameRangesIntersect(props.startFrame, props.endFrame, bar.start, bar.end)
      ));
    };

    const legacySwimlaneData = computed(() => (
      props.legacyView ? attributeSwimlaneData.value[props.legacyView] : undefined
    ));

    const getLegacySwimlaneEntries = () => {
      if (!legacySwimlaneData.value) {
        return [] as [string, SwimlaneAttribute][];
      }
      return Object.entries(legacySwimlaneData.value).filter(([, bar]) => (
        frameRangesIntersect(props.startFrame, props.endFrame, bar.start, bar.end)
      ));
    };

    const sectionStyle = computed(() => ({
      width: '100%',
      minHeight: `${props.sectionHeight}px`,
      height: `${props.sectionHeight}px`,
    }));

    /** Matches LineChart / full-height chart draw area inside the bordered row */
    const lineChartKeyStyle = computed(() => ({
      ...sectionStyle.value,
      paddingTop: `${TIMELINE_CHART_BORDER}px`,
      height: `${props.sectionHeight}px`,
    }));

    /** Matches EventChart inner block (margin + height clientHeight-10) */
    const eventChartKeyStyle = computed(() => ({
      ...sectionStyle.value,
      paddingTop: `${TIMELINE_CHART_BORDER + EVENT_CHART_MARGIN_Y}px`,
      height: `${getEventChartDrawHeight(props.sectionHeight) + EVENT_CHART_MARGIN_Y}px`,
    }));

    const swimlaneBodyStyle = computed(() => ({
      ...sectionStyle.value,
      paddingTop: `${getSwimlaneChartContentTopOffset()}px`,
    }));

    const legacyLabel = computed(() => props.legacyView);

    return {
      uniqueKeys,
      getMinMax,
      getTimelineByName,
      keyRef,
      selectedTrackIdRef,
      getSwimlaneRowLabel,
      getSwimlaneTooltipTitle,
      getGraphAttributeItems,
      getDetectionTypeItems,
      isEventTimeline,
      getEventChartValues,
      getFilterTypeItems,
      getKeyRowStyle,
      sectionStyle,
      lineChartKeyStyle,
      eventChartKeyStyle,
      swimlaneBodyStyle,
      getSwimlaneEntries,
      getLegacySwimlaneEntries,
      isDetectionsTimeline,
      legacyLabel,
      legacySwimlaneData,
      SWIMLANE_ROW_HEIGHT,
      SWIMLANE_BAR_TOP_OFFSET,
      getChartInnerHeight,
    };
  },
});
</script>

<template>
  <div
    class="timeline-key-cell"
    :style="{ width: `${keyPanelWidth}px` }"
  >
    <!-- Config-mode section keyed to a timeline entry -->
    <template v-if="timeline">
      <div
        v-if="isDetectionsTimeline(timeline)"
        class="key-section-body key-section-centered"
        :style="lineChartKeyStyle"
      >
        <v-tooltip
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title-row"
              v-on="on"
            >
              <span>{{ timeline.name }}</span>
              <v-icon
                small
                class="ml-1 key-info-icon"
              >mdi-information-outline</v-icon>
            </span>
          </template>
          <div class="key-tooltip-title">
            {{ timeline.name }}
          </div>
          <v-row
            v-for="item in getDetectionTypeItems"
            :key="item.name"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.name }}</span>
          </v-row>
        </v-tooltip>
      </div>

      <div
        v-else-if="timeline.type === 'graph'"
        class="key-section-body key-section-centered"
        :style="lineChartKeyStyle"
      >
        <v-tooltip
          v-if="getGraphAttributeItems(timeline.name).length"
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title-row"
              v-on="on"
            >
              <span>{{ timeline.name }}</span>
              <v-icon
                small
                class="ml-1 key-info-icon"
              >mdi-information-outline</v-icon>
            </span>
          </template>
          <div class="key-tooltip-title">
            {{ timeline.name }}
          </div>
          <v-row
            v-for="item in getGraphAttributeItems(timeline.name)"
            :key="item.name"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.name }}</span>
          </v-row>
        </v-tooltip>
        <v-tooltip
          v-else
          open-delay="100"
          top
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >{{ timeline.name }}</span>
          </template>
          <span>{{ timeline.name }}</span>
        </v-tooltip>
      </div>

      <div
        v-else-if="isEventTimeline(timeline)"
        class="key-section-body key-section-centered"
        :style="eventChartKeyStyle"
      >
        <v-tooltip
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >{{ timeline.name }}</span>
          </template>
          <div class="key-tooltip-title">
            {{ timeline.name }}
          </div>
          <v-row
            v-for="item in uniqueFilterItems(getEventChartValues(timeline))"
            :key="item.value"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.value }}</span>
          </v-row>
        </v-tooltip>
      </div>

      <div
        v-else-if="timeline.type === 'filter'"
        class="key-section-body key-section-centered"
        :style="eventChartKeyStyle"
      >
        <v-tooltip
          v-if="getFilterTypeItems(timeline.name).length"
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title-row"
              v-on="on"
            >
              <span>{{ timeline.name }}</span>
              <v-icon
                small
                class="ml-1 key-info-icon"
              >mdi-information-outline</v-icon>
            </span>
          </template>
          <div class="key-tooltip-title">
            {{ timeline.name }}
          </div>
          <v-row
            v-for="item in getFilterTypeItems(timeline.name)"
            :key="item.value"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.value }}</span>
          </v-row>
        </v-tooltip>
        <v-tooltip
          v-else
          open-delay="100"
          top
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >{{ timeline.name }}</span>
          </template>
          <span>{{ timeline.name }}</span>
        </v-tooltip>
      </div>

      <div
        v-else-if="timeline.type === 'swimlane'"
        ref="keyRef"
        class="key-section-body key-swimlane-body"
        :class="{
          'key-section-centered': !selectedTrackIdRef || !getSwimlaneEntries(timeline.name).length,
        }"
        :style="selectedTrackIdRef && getSwimlaneEntries(timeline.name).length
          ? swimlaneBodyStyle
          : lineChartKeyStyle"
        @wheel.prevent
        @touchmove.prevent
      >
        <template v-if="selectedTrackIdRef !== null && getSwimlaneEntries(timeline.name).length">
          <v-tooltip
            v-for="([subKey, subItem]) in getSwimlaneEntries(timeline.name)"
            :key="`${subItem.name}`"
            open-delay="100"
            top
            max-width="200"
            content-class="customTooltip"
          >
            <template #activator="{ on }">
              <div
                class="key-row key-swimlane-row"
                v-on="on"
              >
                <div
                  class="key-item"
                  :style="getKeyRowStyle(subItem.color)"
                >
                  <span
                    v-if="getSwimlaneRowLabel(subKey, timeline.name, getTimelineByName(timeline.name, 'swimlane'))"
                    class="key-text"
                  >{{ getSwimlaneRowLabel(subKey, timeline.name, getTimelineByName(timeline.name, 'swimlane')) }}</span>
                </div>
              </div>
            </template>
            <div class="key-tooltip-title">
              {{ getSwimlaneTooltipTitle(subKey, timeline.name, getTimelineByName(timeline.name, 'swimlane')) }}
            </div>
            <div v-if="subItem.type === 'text'">
              <v-row
                v-for="subData in uniqueKeys(subItem.data, subItem.order)"
                :key="subData.value"
                justify="center"
                dense
              >
                <span
                  class="key-subitem"
                  :style="{ color: subData.color, border: `1px solid ${subData.color}`, height: '20px' }"
                >
                  {{ subData.value }}</span>
              </v-row>
            </div>
            <div v-else>
              {{ getMinMax(subItem.data) }}
            </div>
          </v-tooltip>
        </template>
        <v-tooltip
          v-else
          open-delay="100"
          top
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >{{ timeline.name }}</span>
          </template>
          <span>{{ timeline.name }}</span>
        </v-tooltip>
      </div>
    </template>

    <!-- Legacy single-view key -->
    <template v-else-if="legacyView">
      <div
        v-if="legacyKeyKind === 'detections'"
        class="key-section-body key-section-centered"
        :style="lineChartKeyStyle"
      >
        <v-tooltip
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >Detections</span>
          </template>
          <div class="key-tooltip-title">
            Detections
          </div>
          <v-row
            v-for="item in getDetectionTypeItems"
            :key="item.name"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.name }}</span>
          </v-row>
        </v-tooltip>
      </div>
      <div
        v-else-if="legacyKeyKind === 'events'"
        class="key-section-body key-section-centered"
        :style="eventChartKeyStyle"
      >
        <v-tooltip
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >Events</span>
          </template>
          <div class="key-tooltip-title">
            Events
          </div>
          <v-row
            v-for="item in uniqueFilterItems(eventChartData.values || [])"
            :key="item.value"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.value }}</span>
          </v-row>
        </v-tooltip>
      </div>
      <div
        v-else-if="legacyKeyKind === 'groups'"
        class="key-section-body key-section-centered"
        :style="eventChartKeyStyle"
      >
        <v-tooltip
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >Groups</span>
          </template>
          <div class="key-tooltip-title">
            Groups
          </div>
          <v-row
            v-for="item in uniqueFilterItems(groupChartData.values || [])"
            :key="item.value"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.value }}</span>
          </v-row>
        </v-tooltip>
      </div>
      <div
        v-else-if="legacyKeyKind === 'graph'"
        class="key-section-body key-section-centered"
        :style="lineChartKeyStyle"
      >
        <v-tooltip
          v-if="getGraphAttributeItems(legacyView).length"
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title-row"
              v-on="on"
            >
              <span>{{ legacyView }}</span>
              <v-icon
                small
                class="ml-1 key-info-icon"
              >mdi-information-outline</v-icon>
            </span>
          </template>
          <div class="key-tooltip-title">
            {{ legacyView }}
          </div>
          <v-row
            v-for="item in getGraphAttributeItems(legacyView)"
            :key="item.name"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.name }}</span>
          </v-row>
        </v-tooltip>
        <v-tooltip
          v-else
          open-delay="100"
          top
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >{{ legacyView }}</span>
          </template>
          <span>{{ legacyView }}</span>
        </v-tooltip>
      </div>
      <div
        v-else-if="legacyKeyKind === 'filter'"
        class="key-section-body key-section-centered"
        :style="eventChartKeyStyle"
      >
        <v-tooltip
          v-if="getFilterTypeItems(legacyView).length"
          open-delay="100"
          top
          max-width="220"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title-row"
              v-on="on"
            >
              <span>{{ legacyView }}</span>
              <v-icon
                small
                class="ml-1 key-info-icon"
              >mdi-information-outline</v-icon>
            </span>
          </template>
          <div class="key-tooltip-title">
            {{ legacyView }}
          </div>
          <v-row
            v-for="item in getFilterTypeItems(legacyView)"
            :key="item.value"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{ color: item.color, border: `1px solid ${item.color}` }"
            >{{ item.value }}</span>
          </v-row>
        </v-tooltip>
        <v-tooltip
          v-else
          open-delay="100"
          top
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >{{ legacyView }}</span>
          </template>
          <span>{{ legacyView }}</span>
        </v-tooltip>
      </div>
      <div
        v-else-if="legacyKeyKind === 'swimlane'"
        ref="keyRef"
        class="key-section-body key-swimlane-body"
        :class="{
          'key-section-centered': !selectedTrackIdRef || !getLegacySwimlaneEntries().length,
        }"
        :style="selectedTrackIdRef && getLegacySwimlaneEntries().length
          ? swimlaneBodyStyle
          : lineChartKeyStyle"
        @wheel.prevent
        @touchmove.prevent
      >
        <template v-if="selectedTrackIdRef !== null && getLegacySwimlaneEntries().length">
          <v-tooltip
            v-for="([subKey, subItem]) in getLegacySwimlaneEntries()"
            :key="`${subItem.name}`"
            open-delay="100"
            top
            max-width="200"
            content-class="customTooltip"
          >
            <template #activator="{ on }">
              <div
                class="key-row key-swimlane-row"
                v-on="on"
              >
                <div
                  class="key-item"
                  :style="getKeyRowStyle(subItem.color)"
                >
                  <span
                    v-if="getSwimlaneRowLabel(subKey, legacyView, legacySwimlaneData)"
                    class="key-text"
                  >{{ getSwimlaneRowLabel(subKey, legacyView, legacySwimlaneData) }}</span>
                </div>
              </div>
            </template>
            <div class="key-tooltip-title">
              {{ getSwimlaneTooltipTitle(subKey, legacyView, legacySwimlaneData) }}
            </div>
            <div v-if="subItem.type === 'text'">
              <v-row
                v-for="subData in uniqueKeys(subItem.data, subItem.order)"
                :key="subData.value"
                justify="center"
                dense
              >
                <span
                  class="key-subitem"
                  :style="{ color: subData.color, border: `1px solid ${subData.color}`, height: '20px' }"
                >
                  {{ subData.value }}</span>
              </v-row>
            </div>
            <div v-else>
              {{ getMinMax(subItem.data) }}
            </div>
          </v-tooltip>
        </template>
        <v-tooltip
          v-else
          open-delay="100"
          top
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <span
              class="key-centered-title"
              v-on="on"
            >{{ legacyView }}</span>
          </template>
          <span>{{ legacyView }}</span>
        </v-tooltip>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.timeline-key-cell {
  flex-shrink: 0;
  background: black;
  color: white;
  border: 1px solid white;
  border-right: none;
  padding: 0 8px;
  font-size: 13px;
  font-weight: bolder;
  box-sizing: border-box;
}

.key-centered-title,
.key-centered-title-row {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  white-space: nowrap;
}

.key-centered-title-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  cursor: pointer;
}

.key-info-icon {
  flex-shrink: 0;
  opacity: 0.85;
}

.key-section-body {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.key-section-centered {
  align-items: center;
  justify-content: center;
}

.key-swimlane-body {
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.key-row {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex-shrink: 0;
}

.key-swimlane-row {
  height: 30px;
  align-items: flex-start;
  justify-content: center;
}

.key-item {
  padding: 0 3px;
  width: 100%;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;

  &:hover {
    cursor: pointer;
  }
}

.key-text {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.customTooltip {
  background: black;
  border: 1px solid white;
  padding: 6px 8px 10px;
}

.key-tooltip-title {
  text-align: center;
  font-weight: bolder;
  margin-bottom: 4px;
  white-space: nowrap;
}

.key-subitem {
  width: 100%;
  padding: 0 3px;
  text-align: center;
}
</style>
