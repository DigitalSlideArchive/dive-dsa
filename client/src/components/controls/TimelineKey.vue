<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, PropType, ref, Ref, watch,
} from 'vue';
import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import {
  useAttributesFilters, useConfiguration, useSelectedTrackId,
  useTimelineFilters,
} from 'vue-media-annotator/provides';
import { SwimlaneAttribute, SwimlaneGraphSettings } from 'vue-media-annotator/use/AttributeTypes';
import { EventChartData } from 'vue-media-annotator/use/useEventChart';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import {
  buildFilteredTimelineList,
  getSectionContentHeight,
  isDetectionsTimeline,
  shouldHideTimelineSectionTitle,
  SWIMLANE_BAR_HEIGHT,
  SWIMLANE_BAR_TOP_OFFSET,
  SWIMLANE_ROW_HEIGHT,
  TIMELINE_SECTION_GAP,
  TIMELINE_SECTION_HEADER_HEIGHT,
} from './timelineLayout';

interface EventChartDataBundle {
  muted?: boolean;
  values?: EventChartData[];
}

export default defineComponent({
  name: 'TimelineKey',
  props: {
    dismissedButtons: {
      type: Array as PropType<string[]>,
      required: true,
    },
    currentView: {
      type: String,
      default: '',
    },
    clientHeight: {
      type: Number,
      default: 0,
    },
    keyPanelWidth: {
      type: Number,
      default: 100,
    },
    offset: {
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
    const configMan = useConfiguration();
    const {
      timelineEnabled, attributeTimelineData,
      swimlaneEnabled, attributeSwimlaneData, swimlaneDisplaySettings, swimlaneGraphs,
    } = useAttributesFilters();
    const { eventChartDataMap: timelineFilterMap, enabledTimelines: enabledFilterTimelines } = useTimelineFilters();
    const selectedTrackIdRef = useSelectedTrackId();
    const showKey = true;

    const enabledTimelines = computed(() => {
      const list: string[] = [];
      Object.entries(timelineEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          list.push(key);
        }
      });
      return list;
    });

    const enabledSwimlanes = computed(() => {
      const list: string[] = [];
      Object.entries(swimlaneEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          list.push(key);
        }
      });
      return list;
    });

    const checkTimelineEnabled = (timeline: TimelineDisplay) => {
      if (timeline.type === 'swimlane') {
        return enabledSwimlanes.value.includes(timeline.name);
      } if (timeline.type === 'graph') {
        return enabledTimelines.value.includes(timeline.name);
      }
      return true;
    };

    const timelineList = computed(() => buildFilteredTimelineList(
      configMan,
      checkTimelineEnabled,
      props.dismissedButtons,
    ));

    const useLegacyKeyLayout = computed(() => timelineList.value.length === 0);

    const uniqueKeys = (data: SwimlaneAttribute['data'], order?: Record<string, number>) => {
      const vals: {value: string; color: string; order?: number}[] = [];
      data.forEach((item) => {
        if (vals.findIndex((findItem) => findItem.value === item.value) === -1) {
          if (!order || (order && order[item.value.toString()] !== undefined)) {
            vals.push({ value: item.value.toString(), color: item.color || 'white', order: order && order[item.value.toString()] });
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

    const keyRef: Ref<HTMLElement | null> = ref(null);
    watch(() => props.offset, () => {
      if (keyRef.value !== null) {
        keyRef.value.scrollTop = props.offset;
      }
    });

    const getTimelineHeight = (timeline: TimelineDisplay) => getSectionContentHeight(
      timeline,
      timelineList.value,
      props.clientHeight,
      shouldHideTimelineSectionTitle(timeline, showKey, swimlaneDisplaySettings.value),
    );

    const getTimelineByName = (name: string, type: TimelineDisplay['type']) => {
      if (type === 'swimlane') {
        if (attributeSwimlaneData.value[name] !== undefined) {
          return attributeSwimlaneData.value[name];
        }
      }
      if (type === 'graph') {
        if (attributeTimelineData.value[name] !== undefined) {
          return attributeTimelineData.value[name];
        }
      }
      if (type === 'filter') {
        if (timelineFilterMap.value[name] !== undefined) {
          return timelineFilterMap.value[name];
        }
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

    const showLegacyDetectionsKey = computed(() => (
      useLegacyKeyLayout.value && props.currentView === 'Detections'
    ));

    const showLegacyEventsKey = computed(() => (
      useLegacyKeyLayout.value && props.currentView === 'Events'
    ));

    const showLegacyGroupsKey = computed(() => (
      useLegacyKeyLayout.value && props.currentView === 'Groups'
    ));

    const showLegacyGraphKey = computed(() => (
      useLegacyKeyLayout.value && enabledTimelines.value.includes(props.currentView)
    ));

    const showLegacySwimlaneKey = computed(() => (
      useLegacyKeyLayout.value && enabledSwimlanes.value.includes(props.currentView)
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

    const sectionHeightStyle = (timeline: TimelineDisplay) => ({
      minHeight: `${getTimelineHeight(timeline)}px`,
      height: `${getTimelineHeight(timeline)}px`,
    });

    const swimlaneSectionStyle = (timeline: TimelineDisplay) => {
      const height = getTimelineHeight(timeline);
      return {
        minHeight: `${height}px`,
        height: `${height}px`,
        paddingTop: `${SWIMLANE_BAR_TOP_OFFSET}px`,
      };
    };

    return {
      uniqueKeys,
      getMinMax,
      uniqueFilterItems,
      getTimelineByName,
      keyRef,
      attributeSwimlaneData,
      attributeTimelineData,
      enabledTimelines,
      enabledFilterTimelines,
      timelineFilterMap,
      timelineList,
      getTimelineHeight,
      selectedTrackIdRef,
      swimlaneDisplaySettings,
      getSwimlaneSettings,
      getSwimlaneRowLabel,
      getSwimlaneTooltipTitle,
      getGraphAttributeItems,
      getDetectionTypeItems,
      showLegacyDetectionsKey,
      showLegacyEventsKey,
      showLegacyGroupsKey,
      showLegacyGraphKey,
      showLegacySwimlaneKey,
      useLegacyKeyLayout,
      enabledSwimlanes,
      isEventTimeline,
      getEventChartValues,
      getFilterTypeItems,
      getKeyRowStyle,
      sectionHeightStyle,
      swimlaneSectionStyle,
      isDetectionsTimeline,
      SWIMLANE_ROW_HEIGHT,
      SWIMLANE_BAR_TOP_OFFSET,
      TIMELINE_SECTION_GAP,
      TIMELINE_SECTION_HEADER_HEIGHT,
    };
  },
});
</script>

<template>
  <div
    ref="keyRef"
    class="key-column"
    :style="{ width: `${keyPanelWidth}px`, maxHeight: `${clientHeight}px` }"
    @wheel.prevent
    @touchmove.prevent
  >
    <div
      v-if="showLegacyDetectionsKey"
      class="key-section-body key-section-centered"
      :style="{ height: `${clientHeight}px` }"
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
      v-else-if="showLegacyEventsKey"
      class="key-section-body key-section-centered"
      :style="{ height: `${clientHeight}px` }"
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
      v-else-if="showLegacyGroupsKey"
      class="key-section-body key-section-centered"
      :style="{ height: `${clientHeight}px` }"
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
      v-else-if="showLegacyGraphKey"
      class="key-section-body key-section-centered"
      :style="{ height: `${clientHeight}px` }"
    >
      <v-tooltip
        v-if="getGraphAttributeItems(currentView).length"
        open-delay="100"
        top
        max-width="220"
        content-class="customTooltip"
      >
        <template #activator="{ on }">
          <span
            class="key-centered-title"
            v-on="on"
          >{{ currentView }}</span>
        </template>
        <div class="key-tooltip-title">
          {{ currentView }}
        </div>
        <v-row
          v-for="item in getGraphAttributeItems(currentView)"
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
          >{{ currentView }}</span>
        </template>
        <span>{{ currentView }}</span>
      </v-tooltip>
    </div>
    <div
      v-else-if="showLegacySwimlaneKey"
      class="key-section-body"
      :class="{
        'key-swimlane-body': selectedTrackIdRef !== null && attributeSwimlaneData[currentView],
        'key-section-centered': !selectedTrackIdRef || !attributeSwimlaneData[currentView],
      }"
      :style="{
        height: `${clientHeight}px`,
        paddingTop: selectedTrackIdRef && attributeSwimlaneData[currentView]
          ? `${SWIMLANE_BAR_TOP_OFFSET}px` : undefined,
      }"
    >
      <template v-if="selectedTrackIdRef !== null && attributeSwimlaneData[currentView]">
        <v-tooltip
          v-for="(subItem, subKey) in attributeSwimlaneData[currentView]"
          :key="`${subItem.name}`"
          open-delay="100"
          top
          max-width="200"
          content-class="customTooltip"
        >
          <template #activator="{ on }">
            <div
              class="key-row"
              :style="{ height: `${SWIMLANE_ROW_HEIGHT}px` }"
              v-on="on"
            >
              <div
                class="key-item"
                :style="getKeyRowStyle(subItem.color)"
              >
                <span
                  v-if="getSwimlaneRowLabel(subKey, currentView, attributeSwimlaneData[currentView])"
                  class="key-text"
                >{{ getSwimlaneRowLabel(subKey, currentView, attributeSwimlaneData[currentView]) }}</span>
              </div>
            </div>
          </template>
          <div class="key-tooltip-title">
            {{ getSwimlaneTooltipTitle(subKey, currentView, attributeSwimlaneData[currentView]) }}
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
          >{{ currentView }}</span>
        </template>
        <span>{{ currentView }}</span>
      </v-tooltip>
    </div>
    <span v-else-if="timelineList.length">
      <span
        v-for="(timeline, timelineIndex) in timelineList"
        :key="timeline.name"
        class="timeline-key-section"
        :class="{ 'timeline-key-section-last': timelineIndex === timelineList.length - 1 }"
      >
        <!-- Detections histogram -->
        <div
          v-if="isDetectionsTimeline(timeline)"
          class="key-section-body key-section-centered"
          :style="sectionHeightStyle(timeline)"
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

        <!-- Attribute number graph -->
        <div
          v-else-if="timeline.type === 'graph'"
          class="key-section-body key-section-centered"
          :style="sectionHeightStyle(timeline)"
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

        <!-- Event timelines (detections by type, events, groups) -->
        <div
          v-else-if="isEventTimeline(timeline)"
          class="key-section-body key-section-centered"
          :style="sectionHeightStyle(timeline)"
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

        <!-- Filter timelines (e.g. artifactModel track-type filters) -->
        <div
          v-else-if="timeline.type === 'filter'"
          class="key-section-body key-section-centered"
          :style="sectionHeightStyle(timeline)"
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

        <!-- Swimlane rows aligned to canvas bars -->
        <div
          v-else-if="timeline.type === 'swimlane'"
          class="key-section-body key-swimlane-body"
          :class="{
            'key-section-centered': !selectedTrackIdRef || !getTimelineByName(timeline.name, 'swimlane'),
          }"
          :style="selectedTrackIdRef && getTimelineByName(timeline.name, 'swimlane')
            ? swimlaneSectionStyle(timeline)
            : sectionHeightStyle(timeline)"
        >
          <template v-if="selectedTrackIdRef !== null && getTimelineByName(timeline.name, 'swimlane')">
            <v-tooltip
              v-for="(subItem, subKey) in getTimelineByName(timeline.name, 'swimlane')"
              :key="`${subItem.name}`"
              open-delay="100"
              top
              max-width="200"
              content-class="customTooltip"
            >
              <template #activator="{ on }">
                <div
                  class="key-row"
                  :style="{ height: `${SWIMLANE_ROW_HEIGHT}px` }"
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
      </span>
    </span>
  </div>
</template>

<style scoped lang="scss">
.key-column {
  flex-shrink: 0;
  align-self: stretch;
  background: black;
  color: white;
  border: 1px solid white;
  border-right: none;
  padding: 0 8px;
  font-size: 13px;
  font-weight: bolder;
  overflow-y: auto;
  overflow-x: hidden;
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.key-section-header,
.key-swimlane-header {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
}

.key-section-title,
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

.timeline-key-section {
  display: block;
  margin-bottom: 4px;
}

.timeline-key-section-last {
  margin-bottom: 0;
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
  overflow: hidden;
}

.key-section-body-scroll {
  overflow-y: auto;
}

.key-row {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex-shrink: 0;
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
