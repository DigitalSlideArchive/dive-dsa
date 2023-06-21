<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, PropType, ref, Ref, watch,
} from '@vue/composition-api';
import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import { useAttributesFilters, useConfiguration, useTimelineFilters } from 'vue-media-annotator/provides';
import { SwimlaneAttribute } from 'vue-media-annotator/use/AttributeTypes';
import { EventChartData } from 'vue-media-annotator/use/useEventChart';

export default defineComponent({
  name: 'TimelineKey',
  props: {
    dismissedButtons: {
      type: Array as PropType<string[]>,
      required: true,
    },
    hoveredButtons: {
      type: Array as PropType<string[]>,
      required: false,
    },
    clientHeight: {
      type: Number,
      default: 0,
    },
    clientTop: {
      type: Number,
      default: 0,
    },
    clientWidth: {
      type: Number,
      default: 0,
    },
    offset: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    const configMan = useConfiguration();
    const {
      timelineEnabled, attributeTimelineData,
      swimlaneEnabled, attributeSwimlaneData,
    } = useAttributesFilters();
    const { eventChartDataMap: timelineFilterMap, enabledTimelines: enabledFilterTimelines } = useTimelineFilters();
    // Format the Attribute data if it is available

    const enabledTimelines = computed(() => {
      const list: string[] = [];
      Object.entries(timelineEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          list.push(key);
        }
      });
      return list;
    });

    const timelineList = computed(() => {
      const list: TimelineDisplay[] = [];
      if (configMan.configuration.value?.timelineConfigs?.timelines) {
        configMan.configuration.value.timelineConfigs.timelines.forEach((item) => {
          list.push(item);
        });
      }
      list.sort((a, b) => (a.order - b.order));
      const updatedList = list.filter((item) => !props.dismissedButtons.includes(item.name));
      return updatedList;
    });
    const uniqueKeys = (data: SwimlaneAttribute['data']) => {
      const vals: {value: string; color: string}[] = [];
      data.forEach((item) => {
        if (vals.findIndex((findItem) => findItem.value === item.value) === -1) {
          vals.push({ value: item.value.toString(), color: item.color || 'white' });
        }
      });
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
    const enabledSwimlanes = computed(() => {
      const list: string[] = [];
      Object.entries(swimlaneEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          list.push(key);
        }
      });
      return list;
    });

    const keyRef: Ref<HTMLElement | null> = ref(null);
    watch(() => props.offset, () => {
      if (keyRef.value !== null) {
        keyRef.value.scrollTop = props.offset;
      }
    });
    const getTimelineHeight = (timeline: TimelineDisplay) => {
      if (timeline.maxHeight === -1 && timelineList.value.length) {
        return (props.clientHeight / timelineList.value.length) - 20;
      }
      return timeline.maxHeight - 20;
    };

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


    return {
      uniqueKeys,
      uniqueFilterItems,
      getTimelineByName,
      keyRef,
      attributeSwimlaneData,
      attributeTimelineData,
      enabledTimelines,
      enabledFilterTimelines,
      enabledSwimlanes,
      timelineFilterMap,
      timelineList,
      getTimelineHeight,
    };
  },
});
</script>

<template>
  <div
    ref="keyRef"
    class="key mb-5"
    :style="{top: `${clientTop}px`, height: `${clientHeight-10}px`, maxHeight: `${clientHeight-10}px`, right: `${clientWidth}px`}"
    @wheel.prevent
    @touchmove.prevent
    @scroll.prevent
  >
    <span>
      <span v-if="timelineList.length">
        <span
          v-for="timeline in timelineList"
          :key="timeline.name"
        >
          <v-row
            v-if="timelineList.length > 0"
            dense
            justify="center"
            style="max-height: 20px;"
          >
            <h4> {{ timeline.name }}</h4>
          </v-row>
          <div
            v-if="timeline.name === 'Events'"
            :style="`height:${getTimelineHeight(timeline)}px`"
          >
            This is the Event timeline area
          </div>
          <div
            v-if="timeline.name === 'Groups'"
            :style="`height:${getTimelineHeight(timeline)}px`"
          >
            This is the Groups timeline area
          </div>
          <div
            v-if="timeline.name === 'Detections'"
            :style="`height:${getTimelineHeight(timeline)}px`"
          >
            This is the Groups timeline area
          </div>
          <span v-if="attributeSwimlaneData">
            <v-row
              v-if="getTimelineByName(timeline.name, 'swimlane')"
              :style="`height:${getTimelineHeight(timeline)}px`"
              justify="center"
              dense
            >
              <span
                v-if="getTimelineByName(timeline.name, 'swimlane')"
              >
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
                      class="key-item"
                      :style="{color: subItem.color, border: `2px solid ${subItem.color}`, height:'20px', marginTop: '6px'}"
                      v-on="on"
                    >
                      <span
                        class="key-text"
                      > {{ subKey }}</span>
                    </div>
                  </template>
                  <div>
                    <v-row
                      v-for="subData in uniqueKeys(subItem.data)"
                      :key="subData.value"
                      justify="center"
                      dense
                    >
                      <span
                        class="key-subitem"
                        :style="{color: subData.color, border: `1px solid ${subData.color}`, height:'20px'}"
                      >
                        {{ subData.value }}</span>
                    </v-row>
                  </div>
                </v-tooltip>
              </span>
            </v-row>

          </span>
          <span v-if="attributeTimelineData">
            <v-row
              v-if="getTimelineByName(timeline.name, 'graph')"
              justify="center"
              :style="`height:${getTimelineHeight(timeline)}px`"

              dense
            >
              <span
                v-if="getTimelineByName(timeline.name, 'graph')"
              >
                <span
                  v-for="(subItem) in getTimelineByName(timeline.name, 'graph').data"
                  :key="`${subItem.data.name}`"
                >
                  <div
                    class="key-item"
                    :style="{color: subItem.data.color, border: `2px solid ${subItem.data.color}`, height:'20px', marginTop: '6px'}"
                  >
                    <span
                      class="key-text"
                    > {{ subItem.data.name }}</span>
                  </div>
                </span>

              </span>
            </v-row></span>
          <span v-if="timelineFilterMap">
            <v-row
              v-if="getTimelineByName(timeline.name, 'filter')"
              :style="`height:${getTimelineHeight(timeline)}px`"
              justify="center"
              dense
            >
              <span
                v-if="getTimelineByName(timeline.name, 'filter')"
              >
                <span
                  v-for="(subItem) in uniqueFilterItems(getTimelineByName(timeline.name, 'filter').values)"
                  :key="`${subItem.value}`"
                >
                  <div
                    class="key-item"
                    :style="{color: subItem.color, border: `2px solid ${subItem.color}`, height:'20px', marginTop: '6px'}"
                  >
                    <span
                      class="key-text"
                    > {{ subItem.value }}</span>
                  </div>
                </span>
              </span>

            </v-row>
          </span>

        </span>

      </span>
    </span>
  </div>
</template>

<style scoped lang="scss">
.border-radius {
  border: 1px solid #888888;
  padding: 2px 5px;
  border-radius: 5px;
}
.key-item {
    padding: 0px 3px;
    width: 100%;
    text-align: center;
    &:hover {
        cursor: pointer;
    }
}
.key-text {
    width: 100%;
    height:100%;
    padding-bottom: 5px;
}
.customTooltip {
    background: black;
    border: 1px solid white;
}

.key-subitem {
    width: 100%;
    padding: 0px 3px;
    text-align: center;
}
.key {
    position: absolute;
    background: black;
    border: 1px solid white;
    padding: 0px 10px;
    font-size: 15px;
    font-weight: bolder;
    z-index: 2;
    overflow-y:hidden;
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */

  }
.key::-webkit-scrollbar{
  display:none
}

</style>
