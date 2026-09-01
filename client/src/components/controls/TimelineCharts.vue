<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, computed, watch,
} from 'vue';
import TooltipBtn from 'vue-media-annotator/components/TooltipButton.vue';
import {
  EventChart,
  LineChart,
  Timeline,
  AttributeSwimlaneGraph,
} from 'vue-media-annotator/components';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import TimelineKeySection from './TimelineKeySection.vue';
import {
  useAttributesFilters, useConfiguration, useSelectedTrackId, useTimelineFilters,
} from '../../provides';
import {
  buildFilteredTimelineList,
  computeKeyPanelWidth,
  getSectionContentHeight,
  getTimelineChartAreaInsets,
  isDetectionsTimeline,
  KeyPanelWidthOptions,
  shouldHideTimelineSectionTitle,
} from './timelineLayout';

export default defineComponent({
  components: {
    EventChart,
    LineChart,
    Timeline,
    AttributeSwimlaneGraph,
    TooltipBtn,
    TimelineKeySection,
  },
  props: {
    dismissedButtons: {
      type: Array as PropType<string[]>,
      required: true,
    },
    lineChartData: {
      type: Array as PropType<LineChartData[]>,
      required: true,
    },
    eventChartData: {
      type: Object as PropType<unknown>,
      required: true,
    },
    groupChartData: {
      type: Object as PropType<unknown>,
      required: true,
    },
    currentView: {
      type: String,
      required: true,
    },
    collapsed: {
      type: Boolean,
      default: false,
    },
    showKey: {
      type: Boolean,
      default: false,
    },
    startFrame: {
      type: Number,
      required: true,
    },
    endFrame: {
      type: Number,
      required: true,
    },
    childMaxFrame: {
      type: Number,
      required: true,
    },
    clientWidth: {
      type: Number,
      required: true,
    },
    clientHeight: {
      type: Number,
      required: true,
    },
    margin: {
      type: Number,
      required: true,
    },
  },
  emits: ['select-track', 'select-group', 'dismiss', 'chart-area-insets'],
  setup(props, { emit }) {
    const configMan = useConfiguration();
    const {
      timelineEnabled, attributeTimelineData,
      swimlaneEnabled, swimlaneDisplaySettings, attributeSwimlaneData, swimlaneGraphs,
    } = useAttributesFilters();
    const { eventChartDataMap: timelineFilterMap, enabledTimelines: enabledFilterTimelines } = useTimelineFilters();
    const selectedTrackIdRef = useSelectedTrackId();

    const enabledTimelines = computed(() => {
      const list: string[] = [];
      Object.entries(timelineEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          list.push(key);
        }
      });
      return list;
    });
    const nudge = ref(-1);

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

    watch(() => configMan.configuration.value?.timelineConfigs, () => {
      nudge.value += 1;
    }, { deep: true });
    watch(() => configMan.activeTimelineConfigIndex.value, () => {
      nudge.value += 1;
    });
    const timelineList = computed(() => {
      // nudge forces recompute when timeline config changes
      if (nudge.value === null) {
        return [];
      }
      return buildFilteredTimelineList(
        configMan,
        checkTimelineEnabled,
        props.dismissedButtons,
      );
    });
    const attributeDataTimeline = computed(() => {
      const data: {
        startFrame: number; endFrame: number; data: LineChartData[]; yRange?: number[]; ticks?: number;
      }[] = [];
      Object.entries(attributeTimelineData.value).forEach(([key, timelineData]) => {
        if (timelineEnabled.value[key]) {
          const startFrame = timelineData.begin;
          const endFrame = timelineData.end;
          const timelineChartData = timelineData.data.map((item) => item.data);
          data.push({
            startFrame,
            endFrame,
            data: timelineChartData,
            yRange: timelineData.yRange,
            ticks: timelineData.ticks,
          });
        }
      });

      return data;
    });

    const swimlaneGraphSettings = computed(() => {
      const settings: Record<string, Record<string, import('vue-media-annotator/use/AttributeTypes').SwimlaneGraphSettings>> = {};
      Object.entries(swimlaneGraphs.value).forEach(([key, graph]) => {
        settings[key] = graph.settings || {};
      });
      return settings;
    });

    const swimlaneScrollOffsets = ref<Record<string, number>>({});

    const keyPanelWidthOptions = computed<KeyPanelWidthOptions>(() => {
      const flatMap = configMan.getFlatUISettingMap();
      const options: KeyPanelWidthOptions = {};
      if (typeof flatMap.UILegendKeyMinWidth === 'number') {
        options.minWidth = flatMap.UILegendKeyMinWidth;
      }
      if (typeof flatMap.UILegendKeyMaxWidth === 'number') {
        options.maxWidth = flatMap.UILegendKeyMaxWidth;
      }
      return options;
    });

    const keyPanelWidth = computed(() => {
      if (!props.showKey) {
        return 0;
      }
      return computeKeyPanelWidth(
        timelineList.value,
        attributeSwimlaneData.value,
        swimlaneDisplaySettings.value,
        swimlaneGraphSettings.value,
        props.currentView,
        keyPanelWidthOptions.value,
      );
    });

    const chartAreaInsets = computed(() => getTimelineChartAreaInsets(
      props.showKey,
      keyPanelWidth.value,
      timelineList.value.length > 0,
    ));

    watch(chartAreaInsets, (insets) => {
      emit('chart-area-insets', insets);
    }, { immediate: true, deep: true });

    watch(() => props.showKey, () => {
      emit('chart-area-insets', chartAreaInsets.value);
    });

    const chartClientWidth = computed(() => (
      props.showKey ? Math.max(0, props.clientWidth - keyPanelWidth.value) : props.clientWidth
    ));

    const getTimelineHeight = (timeline: TimelineDisplay) => getSectionContentHeight(
      timeline,
      timelineList.value,
      props.clientHeight,
      shouldHideTimelineSectionTitle(timeline, props.showKey, swimlaneDisplaySettings.value),
    );

    const shouldShowTimelineHeader = (timeline: TimelineDisplay) => {
      if (!checkTimelineEnabled(timeline)) {
        return false;
      }
      if (shouldHideTimelineSectionTitle(timeline, props.showKey, swimlaneDisplaySettings.value)) {
        return false;
      }
      return true;
    };

    const onSwimlaneScroll = (timelineName: string, scrollTop: number) => {
      swimlaneScrollOffsets.value = {
        ...swimlaneScrollOffsets.value,
        [timelineName]: scrollTop,
      };
    };

    const legacyKeyKind = computed((): 'detections' | 'events' | 'groups' | 'graph' | 'swimlane' | 'filter' | '' => {
      if (timelineList.value.length) {
        return '';
      }
      if (props.currentView === 'Detections') {
        return 'detections';
      }
      if (props.currentView === 'Events') {
        return 'events';
      }
      if (props.currentView === 'Groups') {
        return 'groups';
      }
      if (enabledTimelines.value.includes(props.currentView)) {
        return 'graph';
      }
      if (enabledSwimlanes.value.includes(props.currentView)) {
        return 'swimlane';
      }
      if (enabledFilterTimelines.value.some((item) => item.name === props.currentView)) {
        return 'filter';
      }
      return '';
    });

    return {
      attributeDataTimeline,
      swimlaneEnabled,
      attributeSwimlaneData,
      swimlaneDisplaySettings,
      enabledSwimlanes,
      enabledTimelines,
      enabledFilterTimelines,
      timelineFilterMap,
      selectedTrackIdRef,
      timelineList,
      getTimelineHeight,
      checkTimelineEnabled,
      shouldShowTimelineHeader,
      keyPanelWidth,
      chartClientWidth,
      swimlaneScrollOffsets,
      onSwimlaneScroll,
      legacyKeyKind,
      isDetectionsTimeline,
    };
  },
});
</script>

<template>
  <div class="timeline-charts-root">
    <template v-if="timelineList.length">
      <div
        v-for="(timeline, timelineIndex) in timelineList"
        :key="timeline.name"
        class="timeline-row"
        :class="{ 'timeline-row-last': timelineIndex === timelineList.length - 1 }"
      >
        <timeline-key-section
          v-if="showKey"
          :timeline="timeline"
          :section-height="getTimelineHeight(timeline)"
          :key-panel-width="keyPanelWidth"
          :swimlane-scroll-offset="swimlaneScrollOffsets[timeline.name] || 0"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :line-chart-data="lineChartData"
          :event-chart-data="eventChartData"
          :group-chart-data="groupChartData"
        />
        <div
          class="timeline-chart-cell"
          :style="{ height: `${getTimelineHeight(timeline)}px` }"
        >
          <v-row
            v-if="timelineList.length > 0 && shouldShowTimelineHeader(timeline)"
            dense
            justify="center"
            style="max-height: 20px;"
          >
            <v-spacer />
            <h4 class="timeline-header">
              {{ timeline.name }}
            </h4>
            <v-spacer />
            <tooltip-btn
              v-if="timeline.dismissable"
              icon="mdi-close"
              tooltip-text="Hide Timeline"
              @click="$emit('dismiss', { name: timeline.name, height: getTimelineHeight(timeline) })"
            />
          </v-row>

          <line-chart
            v-if="isDetectionsTimeline(timeline)"
            :start-frame="startFrame"
            :end-frame="endFrame"
            :max-frame="childMaxFrame"
            :data="lineChartData"
            :client-width="chartClientWidth"
            :client-height="getTimelineHeight(timeline)"
            :class="{ 'timeline-config': timelineList.length }"
            :margin="margin"
          />
          <event-chart
            v-if="timeline.name === 'events'"
            :start-frame="startFrame"
            :end-frame="endFrame"
            :max-frame="childMaxFrame"
            :data="eventChartData"
            :client-width="chartClientWidth"
            :client-height="getTimelineHeight(timeline)"
            :margin="margin"
            :class="{ 'timeline-config': timelineList.length }"
            @select-track="$emit('select-track', $event)"
          />
          <event-chart
            v-if="timeline.name === 'Groups'"
            :start-frame="startFrame"
            :end-frame="endFrame"
            :max-frame="childMaxFrame"
            :data="groupChartData"
            :client-width="chartClientWidth"
            :client-height="getTimelineHeight(timeline)"
            :margin="margin"
            :class="{ 'timeline-config': timelineList.length }"
            @select-track="$emit('select-group', $event)"
          />
          <span v-if="Object.values(attributeSwimlaneData).length">
            <span
              v-for="(data, key, index) in attributeSwimlaneData"
              :key="`Swimlane_${index}`"
            >
              <attribute-swimlane-graph
                v-if="timeline.name === enabledSwimlanes[index] && data"
                :start-frame="startFrame"
                :end-frame="endFrame"
                :max-frame="childMaxFrame"
                :data="data"
                :client-width="chartClientWidth"
                :client-height="getTimelineHeight(timeline)"
                :margin="margin"
                :display-settings="swimlaneDisplaySettings[key]"
                :class="{ 'timeline-config': timelineList.length }"
                @scroll-swimlane="onSwimlaneScroll(timeline.name, $event)"
              />
            </span>
          </span>
          <span v-if="attributeDataTimeline.length">
            <span
              v-for="(data, index) in attributeDataTimeline"
              :key="`Timeline_${index}`"
            >
              <line-chart
                v-if="timeline.name === enabledTimelines[index] && data.data.length"
                :start-frame="startFrame"
                :end-frame="endFrame"
                :max-frame="childMaxFrame"
                :data="data.data"
                :client-width="chartClientWidth"
                :client-height="getTimelineHeight(timeline)"
                :y-range="data.yRange"
                :ticks="data.ticks || -1"
                :margin="margin"
                :class="{ 'timeline-config': timelineList.length }"
                :atrributes-chart="true"
              />
              <v-row v-else-if="timeline.name === enabledTimelines[index]">
                <v-spacer />
                <h2>No Data to Graph</h2>
                <v-spacer />
              </v-row>
            </span>
          </span>
          <span v-if="enabledFilterTimelines">
            <span
              v-for="(item) in enabledFilterTimelines"
              :key="`filter_timeline_${item.name}`"
            >
              <event-chart
                v-if="timeline.name === item.name && timelineFilterMap[item.name]"
                :start-frame="startFrame"
                :end-frame="endFrame"
                :max-frame="childMaxFrame"
                :data="timelineFilterMap[item.name]"
                :client-width="chartClientWidth"
                :client-height="getTimelineHeight(timeline)"
                :margin="margin"
                :class="{ 'timeline-config': timelineList.length }"
                @select-track="$emit('select-group', $event)"
              />
            </span>
          </span>
          <div
            v-if=" ['swimlane', 'graph'].includes(timeline.type) && selectedTrackIdRef === null"
            :class="{ 'timeline-config': timelineList.length }"
            :style="{
              minHeight: `${getTimelineHeight(timeline)}px`,
              maxHeight: `${getTimelineHeight(timeline)}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }"
          >
            <v-row>
              <v-spacer />
              <h3>Track needs to be selected to Show Attributes</h3>
              <v-spacer />
            </v-row>
          </div>
        </div>
      </div>
    </template>
    <div
      v-else
      class="timeline-row timeline-row-last"
    >
      <timeline-key-section
        v-if="showKey && legacyKeyKind"
        :legacy-view="currentView"
        :legacy-key-kind="legacyKeyKind"
        :section-height="clientHeight"
        :key-panel-width="keyPanelWidth"
        :swimlane-scroll-offset="swimlaneScrollOffsets[currentView] || 0"
        :start-frame="startFrame"
        :end-frame="endFrame"
        :line-chart-data="lineChartData"
        :event-chart-data="eventChartData"
        :group-chart-data="groupChartData"
      />
      <div
        class="timeline-chart-cell"
        :style="{ height: `${clientHeight}px` }"
      >
        <line-chart
          v-if="currentView === 'Detections'"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="lineChartData"
          :client-width="chartClientWidth"
          :client-height="clientHeight"
          :margin="margin"
        />
        <event-chart
          v-if="currentView === 'Events'"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="eventChartData"
          :client-width="chartClientWidth"
          :client-height="clientHeight"
          :margin="margin"
          @select-track="$emit('select-track', $event)"
        />
        <event-chart
          v-if="currentView === 'Groups'"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="groupChartData"
          :client-width="chartClientWidth"
          :client-height="clientHeight"
          :margin="margin"
          @select-track="$emit('select-group', $event)"
        />
        <span v-if="Object.values(attributeSwimlaneData).length">
          <span
            v-for="(data, key, index) in attributeSwimlaneData"
            :key="`Swimlane_${index}`"
          >
            <attribute-swimlane-graph
              v-if="currentView === key && data"
              :start-frame="startFrame"
              :end-frame="endFrame"
              :max-frame="childMaxFrame"
              :data="data"
              :client-width="chartClientWidth"
              :client-height="clientHeight"
              :display-frame-indicators="swimlaneDisplaySettings[key]?.displayFrameIndicators || false"
              :display-settings="swimlaneDisplaySettings[key]"
              :margin="margin"
              @scroll-swimlane="onSwimlaneScroll(currentView, $event)"
            />
            <v-row v-else-if="currentView === key">
              <v-spacer />
              <h2>No Data to Graph</h2>
              <v-spacer />
            </v-row>
          </span>
        </span>
        <v-row
          v-else-if="enabledSwimlanes.includes(currentView) && selectedTrackIdRef === null"
          class="d-flex align-center justify-center fill-height text-center"
        >
          <h3>Track needs to be selected to Show Attributes</h3>
        </v-row>

        <span v-if="attributeDataTimeline.length">
          <span
            v-for="(data, index) in attributeDataTimeline"
            :key="`Timeline_${index}`"
          >
            <line-chart
              v-if="currentView === enabledTimelines[index] && data.data.length"
              :start-frame="startFrame"
              :end-frame="endFrame"
              :max-frame="childMaxFrame"
              :data="data.data"
              :client-width="chartClientWidth"
              :client-height="clientHeight"
              :y-range="data.yRange"
              :ticks="data.ticks"
              :margin="margin"
              :atrributes-chart="true"
            />
            <v-row v-else-if="currentView === enabledTimelines[index]">
              <v-spacer />
              <h2>No Data to Graph</h2>
              <v-spacer />
            </v-row>
          </span>
        </span>
        <div
          v-else-if="enabledTimelines.includes(currentView) && selectedTrackIdRef === null"
          class="d-flex align-center justify-center fill-height text-center"
        >
          <h3>Track needs to be selected to Graph Attributes</h3>
        </div>
        <span v-if="attributeSwimlaneData">
          <span
            v-for="(item) in enabledFilterTimelines"
            :key="`filter_timeline_${item.name}`"
          >
            <event-chart
              v-if="currentView === item.name && timelineFilterMap[item.name]"
              :start-frame="startFrame"
              :end-frame="endFrame"
              :max-frame="childMaxFrame"
              :data="timelineFilterMap[item.name]"
              :client-width="chartClientWidth"
              :client-height="clientHeight"
              :margin="margin"
              @select-track="$emit('select-group', $event)"
            />
          </span>
        </span>
        <div
          v-else-if="enabledTimelines.includes(currentView) && selectedTrackIdRef === null"
          class="d-flex align-center justify-center fill-height text-center"
        >
          <h3>Track needs to be selected to show Swimlane Attributes</h3>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.timeline-charts-root {
  display: flex;
  flex-direction: column;
  direction: ltr;
  width: 100%;
  height: 100%;
}

.timeline-row {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  margin-bottom: 4px;
}

.timeline-row-last {
  margin-bottom: 0;
}

.timeline-chart-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.timeline-config {
  border: 1px solid white;
  box-sizing: border-box;
}

.timeline-header {
  display:inline;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
</style>
