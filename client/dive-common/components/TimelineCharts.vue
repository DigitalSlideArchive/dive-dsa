<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, computed, watch, Ref,
} from '@vue/composition-api';
import FileNameTimeDisplay from 'vue-media-annotator/components/controls/FileNameTimeDisplay.vue';
import {
  Controls,
  EventChart,
  LineChart,
  Timeline,
  AttributeSwimlaneGraph,
  TimelineKey,
} from 'vue-media-annotator/components';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import TimelineButtons from './TimelineButtons.vue';
import {
  useAttributesFilters, useSelectedTrackId, useTimelineFilters,
} from '../../src/provides';

export default defineComponent({
  components: {
    Controls,
    EventChart,
    FileNameTimeDisplay,
    LineChart,
    Timeline,
    AttributeSwimlaneGraph,
    TimelineKey,
    TimelineButtons,
  },
  props: {
    lineChartData: {
      type: Array as PropType<unknown[]>,
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
  setup(_, { emit }) {
    const enabledKey = ref(true);
    const {
      timelineEnabled, attributeTimelineData,
      swimlaneEnabled, attributeSwimlaneData,
    } = useAttributesFilters();
    const { eventChartDataMap: timelineFilterMap, enabledTimelines: enabledFilterTimelines } = useTimelineFilters();
    // Format the Attribute data if it is available
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

    const enabledSwimlanes = computed(() => {
      const list: string[] = [];
      Object.entries(swimlaneEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          list.push(key);
        }
      });
      return list;
    });

    const attributeDataTimeline = computed(() => {
      const data: {
        startFrame: number; endFrame: number; data: LineChartData[]; yRange?: number[];
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
          });
        }
      });

      return data;
    });

    return {
      attributeDataTimeline,
      swimlaneEnabled,
      attributeSwimlaneData,
      enabledSwimlanes,
      enabledTimelines,
      // Timeline Ref
      enabledKey,
      enabledFilterTimelines,
      timelineFilterMap,
      selectedTrackIdRef,
    };
  },
});
</script>

<template>
  <span>
    <line-chart
      v-if="currentView==='Detections'"
      :start-frame="startFrame"
      :end-frame="endFrame"
      :max-frame="childMaxFrame"
      :data="lineChartData"
      :client-width="clientWidth"
      :client-height="clientHeight"
      :margin="margin"
    />
    <event-chart
      v-if="currentView==='Events'"
      :start-frame="startFrame"
      :end-frame="endFrame"
      :max-frame="childMaxFrame"
      :data="eventChartData"
      :client-width="clientWidth"
      :margin="margin"
      @select-track="$emit('select-track', $event)"
    />
    <event-chart
      v-if="currentView==='Groups'"
      :start-frame="startFrame"
      :end-frame="endFrame"
      :max-frame="childMaxFrame"
      :data="groupChartData"
      :client-width="clientWidth"
      :margin="margin"
      @select-track="$emit('select-group', $event)"
    />
    <span v-if="attributeSwimlaneData">
      <span
        v-for="(data, key, index) in attributeSwimlaneData"
        :key="`Swimlane_${index}`"
      >
        <attribute-swimlane-graph
          v-if="currentView=== enabledSwimlanes[index] && data"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="data"
          :client-width="clientWidth"
          :margin="margin"
          @scroll-swimlane="swimlaneOffset = $event"
        />
        <v-row v-else-if="currentView=== enabledSwimlanes[index]">
          <v-spacer />
          <h2>
            No Data to Graph
          </h2>
          <v-spacer />
        </v-row>

      </span>
    </span>
    <div v-else-if="enabledTimelines.includes(currentView) && selectedTrackIdRef === null">
      <v-row>
        <v-spacer />
        <h2>
          Track needs to be selected to Graph Attributes
        </h2>
        <v-spacer />
      </v-row>
    </div>
    <span v-if="attributeDataTimeline.length">
      <span
        v-for="(data, index) in attributeDataTimeline"
        :key="`Timeline_${index}`"
      >
        <line-chart
          v-if="currentView=== enabledTimelines[index] && data.data.length"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="data.data"
          :client-width="clientWidth"
          :client-height="clientHeight"
          :y-range="data.yRange"
          :margin="margin"
          :atrributes-chart="true"
        />
        <v-row v-else-if="currentView=== enabledTimelines[index]">
          <v-spacer />
          <h2>
            No Data to Graph
          </h2>
          <v-spacer />
        </v-row>

      </span>
    </span>
    <div v-else-if="enabledTimelines.includes(currentView) && selectedTrackIdRef === null">
      <v-row>
        <v-spacer />
        <h2>
          Track needs to be selected to Graph Attributes
        </h2>
        <v-spacer />
      </v-row>
    </div>
    <span v-if="attributeSwimlaneData">
      <span
        v-for="(item) in enabledFilterTimelines"
        :key="`filter_timeline_${item.name}`"
      >
        <event-chart
          v-if="currentView===item.name && timelineFilterMap[item.name]"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="timelineFilterMap[item.name]"
          :client-width="clientWidth"
          :margin="margin"
          @select-track="$emit('select-group', $event)"
        />
      </span>
    </span>
    <div v-else-if="enabledTimelines.includes(currentView) && selectedTrackIdRef === null">
      <v-row>
        <v-spacer />
        <h2>
          Track needs to be selected to show Swimlane Attributes
        </h2>
        <v-spacer />
      </v-row>
    </div>
  </span>
</template>

<style lang="scss" scoped>
</style>
