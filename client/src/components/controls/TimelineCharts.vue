<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, computed, watch,
} from '@vue/composition-api';
import TooltipBtn from 'vue-media-annotator/components/TooltipButton.vue';
import {
  EventChart,
  LineChart,
  Timeline,
  AttributeSwimlaneGraph,
} from 'vue-media-annotator/components';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import TimelineButtons from './TimelineButtons.vue';
import {
  useAttributesFilters, useConfiguration, useSelectedTrackId, useTimelineFilters,
} from '../../provides';

export default defineComponent({
  components: {
    EventChart,
    LineChart,
    Timeline,
    AttributeSwimlaneGraph,
    TimelineButtons,
    TooltipBtn,
  },
  props: {
    dismissedButtons: {
      type: Array as PropType<string[]>,
      required: true,
    },
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
  setup(props) {
    const configMan = useConfiguration();
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
    const timelineList = computed(() => {
      const list: TimelineDisplay[] = [];
      if (nudge.value !== null && configMan.configuration.value?.timelineConfigs?.timelines) {
        configMan.configuration.value.timelineConfigs.timelines.forEach((item) => {
          if (checkTimelineEnabled(item)) {
            list.push(item);
          }
        });
      }
      list.sort((a, b) => (a.order - b.order));
      const updatedList = list.filter((item) => !props.dismissedButtons.includes(item.name));
      return updatedList;
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

    const getTimelineHeight = (timeline: TimelineDisplay) => {
      if (timeline.maxHeight === -1 && timelineList.value.length) {
        // We really want the total height minus the defined heights
        let definedHeights = 0;
        let count = 1;
        timelineList.value.forEach((item) => {
          if (item.name !== timeline.name && item.maxHeight !== -1) {
            definedHeights += item.maxHeight;
          } else if (item.name !== timeline.name) {
            count += 1;
          }
        });
        return ((props.clientHeight - definedHeights) / count) - 20;
      }
      return timeline.maxHeight - 20;
    };


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
      timelineList,
      getTimelineHeight,
      checkTimelineEnabled,
    };
  },
});
</script>

<template>
  <span>
    <span v-if="timelineList.length">
      <span
        v-for="timeline in timelineList"
        :key="timeline.name"
      >
        <v-row
          v-if="timelineList.length > 0 && checkTimelineEnabled(timeline)"
          dense
          justify="center"
          style="max-height: 20px;"
        >
          <v-spacer />
          <h4
            class="timeline-header"
          > {{ timeline.name }}</h4>
          <v-spacer />
          <tooltip-btn
            v-if="timeline.dismissable"
            icon="mdi-close"
            tooltip-text="Hide Timeline"
            @click="$emit('dismiss', {name: timeline.name, height: getTimelineHeight(timeline)})"
          />
        </v-row>

        <line-chart
          v-if="timeline.name==='detections'"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="lineChartData"
          :client-width="clientWidth"
          :client-height="getTimelineHeight(timeline)"
          :class="{'timeline-config': timelineList.length}"
          :margin="margin"
        />
        <event-chart
          v-if="timeline.name==='events'"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="eventChartData"
          :client-width="clientWidth"
          :client-height="getTimelineHeight(timeline)"
          :margin="margin"
          :class="{'timeline-config': timelineList.length}"
          @select-track="$emit('select-track', $event)"
        />
        <event-chart
          v-if="timeline.name==='Groups'"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="childMaxFrame"
          :data="groupChartData"
          :client-width="clientWidth"
          :client-height="getTimelineHeight(timeline)"
          :margin="margin"
          :class="{'timeline-config': timelineList.length}"
          @select-track="$emit('select-group', $event)"
        />
        <span v-if="Object.values(attributeSwimlaneData).length">
          <span
            v-for="(data, key, index) in attributeSwimlaneData"
            :key="`Swimlane_${index}`"
          >
            <attribute-swimlane-graph
              v-if="timeline.name=== enabledSwimlanes[index] && data"
              :start-frame="startFrame"
              :end-frame="endFrame"
              :max-frame="childMaxFrame"
              :data="data"
              :client-width="clientWidth"
              :client-height="getTimelineHeight(timeline)"
              :margin="margin"
              :class="{'timeline-config': timelineList.length}"
              @scroll-swimlane="swimlaneOffset = $event"
            />
          </span>
        </span>
        <span v-if="attributeDataTimeline.length">
          <span
            v-for="(data, index) in attributeDataTimeline"
            :key="`Timeline_${index}`"
          >
            <line-chart
              v-if="timeline.name=== enabledTimelines[index] && data.data.length"
              :start-frame="startFrame"
              :end-frame="endFrame"
              :max-frame="childMaxFrame"
              :data="data.data"
              :client-width="clientWidth"
              :client-height="getTimelineHeight(timeline)"
              :y-range="data.yRange"
              :ticks="data.ticks || -1"
              :margin="margin"
              :class="{'timeline-config': timelineList.length}"
              :atrributes-chart="true"
            />
            <v-row v-else-if="timeline.name=== enabledTimelines[index]">
              <v-spacer />
              <h2>
                No Data to Graph
              </h2>
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
              v-if="timeline.name===item.name && timelineFilterMap[item.name]"
              :start-frame="startFrame"
              :end-frame="endFrame"
              :max-frame="childMaxFrame"
              :data="timelineFilterMap[item.name]"
              :client-width="clientWidth"
              :client-height="getTimelineHeight(timeline)"
              :margin="margin"
              :class="{'timeline-config': timelineList.length}"
              @select-track="$emit('select-group', $event)"
            />
          </span>
        </span>
        <div
          v-if=" ['swimlane', 'graph'].includes(timeline.type) && selectedTrackIdRef === null"
          :class="{'timeline-config': timelineList.length}"
          :style="`min-height:${getTimelineHeight(timeline)}px;max-height:${getTimelineHeight(timeline)}px;`"
        >
          <v-row>
            <v-spacer />
            <h3>
              Track needs to be selected to show Attributes
            </h3>
            <v-spacer />
          </v-row>
        </div>
      </span>
    </span>
    <span v-else>
      <line-chart
        v-if="currentView==='detections'"
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
        :client-height="clientHeight / timelineList.length"
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
        :client-height="clientHeight / timelineList.length"
        :margin="margin"
        @select-track="$emit('select-group', $event)"
      />
      <span v-if="Object.values(attributeSwimlaneData).length">
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
            :client-height="clientHeight / timelineList.length"
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
      <div v-else-if="enabledSwimlanes.includes(currentView) && selectedTrackIdRef === null">
        <v-row>
          <v-spacer />
          <h2>
            Track needs to be selected to Show Attributes
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
            :ticks="data.ticks"
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
            :client-height="clientHeight / timelineList.length"
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
  </span>
</template>

<style lang="scss" scoped>
.timeline-config {
  border:1px solid white;
}
.timeline-header {
  display:inline
}

</style>
