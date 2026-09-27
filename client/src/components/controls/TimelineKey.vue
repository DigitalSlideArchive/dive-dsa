<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, PropType, ref, Ref, watch,
} from 'vue';
import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import {
  useAttributesFilters, useConfiguration, useTimelineFilters,
} from 'vue-media-annotator/provides';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import TimelineKeySection from './TimelineKeySection.vue';
import {
  buildFilteredTimelineList,
  getSectionContentHeight,
  shouldHideTimelineSectionTitle,
} from './timelineLayout';
import { EventChartDataBundle } from './useTimelineKeyData';

export default defineComponent({
  name: 'TimelineKey',
  components: {
    TimelineKeySection,
  },
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
    startFrame: {
      type: Number,
      default: 0,
    },
    endFrame: {
      type: Number,
      default: Number.MAX_SAFE_INTEGER,
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
    const { timelineEnabled, swimlaneEnabled, swimlaneDisplaySettings } = useAttributesFilters();
    const { enabledTimelines: enabledFilterTimelines } = useTimelineFilters();
    const showKey = true;
    const keyRef: Ref<HTMLElement | null> = ref(null);

    watch(() => props.offset, () => {
      if (keyRef.value !== null) {
        keyRef.value.scrollTop = props.offset;
      }
    });

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

    const getTimelineHeight = (timeline: TimelineDisplay) => getSectionContentHeight(
      timeline,
      timelineList.value,
      props.clientHeight,
      shouldHideTimelineSectionTitle(timeline, showKey, swimlaneDisplaySettings.value),
    );

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
      keyRef,
      timelineList,
      getTimelineHeight,
      legacyKeyKind,
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
    <template v-if="timelineList.length">
      <div
        v-for="(timeline, timelineIndex) in timelineList"
        :key="timeline.name"
        class="timeline-key-section"
        :class="{ 'timeline-key-section-last': timelineIndex === timelineList.length - 1 }"
      >
        <timeline-key-section
          :timeline="timeline"
          :section-height="getTimelineHeight(timeline)"
          :key-panel-width="keyPanelWidth"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :line-chart-data="lineChartData"
          :event-chart-data="eventChartData"
          :group-chart-data="groupChartData"
        />
      </div>
    </template>
    <timeline-key-section
      v-else-if="legacyKeyKind"
      :legacy-view="currentView"
      :legacy-key-kind="legacyKeyKind"
      :section-height="clientHeight"
      :key-panel-width="keyPanelWidth"
      :start-frame="startFrame"
      :end-frame="endFrame"
      :line-chart-data="lineChartData"
      :event-chart-data="eventChartData"
      :group-chart-data="groupChartData"
    />
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

.timeline-key-section {
  display: block;
  margin-bottom: 4px;
}

.timeline-key-section-last {
  margin-bottom: 0;
}
</style>
