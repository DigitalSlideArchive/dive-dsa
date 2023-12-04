<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, computed, watch, Ref,
} from 'vue';
import type { DatasetType } from 'dive-common/apispec';
import FileNameTimeDisplay from 'vue-media-annotator/components/controls/FileNameTimeDisplay.vue';
import {
  Controls,
  injectAggregateController,
  Timeline,
  TimelineKey,
} from 'vue-media-annotator/components';
import { UISettingsKey } from 'vue-media-annotator/ConfigurationManager';
import TimelineCharts from 'vue-media-annotator/components/controls/TimelineCharts.vue';
import TimelineButtons from 'vue-media-annotator/components/controls/TimelineButtons.vue';
import {
  useAttributesFilters, useConfiguration,
} from '../../src/provides';

export default defineComponent({
  components: {
    Controls,
    FileNameTimeDisplay,
    Timeline,
    TimelineKey,
    TimelineButtons,
    TimelineCharts,
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
    datasetType: {
      type: String as PropType<DatasetType>,
      required: true,
    },
    collapsed: {
      type: Boolean,
      default: false,
    },
  },
  setup(_, { emit }) {
    const currentView = ref('Detections');
    const ticks = ref([0.25, 0.5, 0.75, 1.0, 2.0, 4.0, 8.0]);
    const configMan = useConfiguration();
    const getUISetting = (key: UISettingsKey) => (configMan.getUISetting(key));
    const enabledKey = ref(false);
    const dismissedButtons: Ref<string[]> = ref([]); // buttons that have been dismissed from the timelineConfig;
    const dismissedHeights: Ref<{name: string; height: number}[]> = ref([]);
    const {
      attributeSwimlaneData,
    } = useAttributesFilters();

    const timelineHeight = computed(() => {
      if (configMan.configuration.value?.timelineConfigs?.maxHeight) {
        let max = configMan.configuration.value?.timelineConfigs?.maxHeight;
        dismissedHeights.value.forEach((item) => {
          max -= item.height;
        });
        return max;
      }
      return 175;
    });
    const { timelineEnabled, timelineDefault } = useAttributesFilters();
    if (timelineDefault.value !== null) {
      currentView.value = timelineDefault.value;
    }
    watch(timelineDefault, () => {
      if (timelineDefault.value !== null) {
        currentView.value = timelineDefault.value;
      }
    });
    const timelineDisabled = ref(false);
    const isTimelineEnabled = () => {
      if (timelineDefault.value === null && !getUISetting('UIEvents') && !getUISetting('UIDetections')) {
        const entries = Object.entries(timelineEnabled.value);
        let found = false;
        for (let i = 0; i < entries.length; i += 1) {
          const key = entries[i][0];
          if (key) {
            currentView.value = key;
            found = true;
            break;
          }
        }
        if (!found) {
          timelineDisabled.value = true;
        }
      }
    };
    watch(timelineEnabled, () => isTimelineEnabled());

    /**
     * Toggles on and off the individual timeline views
     * Resizing is handled by the Annotator itself.
     */
    function toggleView(type: 'Detections' | 'Events' | 'Groups' | string) {
      currentView.value = type;
      emit('update:collapsed', false);
    }
    watch(timelineEnabled, () => {
      if (!timelineEnabled.value && currentView.value === 'Attributes') {
        toggleView('Events');
      }
    });
    const {
      maxFrame, frame, seek, volume, setVolume, setSpeed, speed,
    } = injectAggregateController().value;

    // Timeline Key Sizing and Refs
    const timelineRef: Ref<typeof Timeline & {$el: HTMLElement; clientHeight: number} | null> = ref(null);
    const controlsRef: Ref<typeof Controls & {$el: HTMLElement} | null> = ref(null);
    const keyHeight = computed(() => ((timelineRef.value !== null) ? timelineRef.value.clientHeight : 0));
    const keyTop = computed(() => ((controlsRef.value !== null) ? controlsRef.value.$el.clientHeight : 0));
    const keyWidth = ref(0);
    watch(() => timelineRef.value && timelineRef.value.$el.clientWidth, () => {
      keyWidth.value = timelineRef.value?.$el.clientWidth || 0;
    });
    const updateSizes = () => {
      keyWidth.value = timelineRef.value?.$el.clientWidth || 0;
    };
    const swimlaneOffset = ref(0);

    const addDismissedButton = ({ name, height }: {name: string; height: number}) => {
      dismissedButtons.value.push(name);
      dismissedHeights.value.push({ name, height });
    };
    const removeDismissedButton = (name: string) => {
      const found = dismissedButtons.value.findIndex((item) => (name === item));
      if (found !== -1) {
        dismissedButtons.value.splice(found, 1);
      }
      const heightIndex = dismissedHeights.value.findIndex((item) => (name === item.name));
      if (heightIndex !== -1) {
        dismissedHeights.value.splice(heightIndex, 1);
      }
    };

    watch(timelineHeight, () => {
      emit('timeline-height', timelineHeight.value);
    });

    return {
      currentView,
      toggleView,
      maxFrame,
      frame,
      seek,
      volume,
      setVolume,
      speed,
      setSpeed,
      ticks,
      getUISetting,
      timelineDisabled,
      // Timeline Ref
      controlsRef,
      timelineRef,
      keyHeight,
      keyTop,
      keyWidth,
      enabledKey,
      updateSizes,
      swimlaneOffset,
      //Timeline Config
      timelineHeight,
      attributeSwimlaneData,
      dismissedButtons,
      addDismissedButton,
      removeDismissedButton,
    };
  },
});
</script>

<template>
  <v-col
    dense
    style="position:absolute; bottom: 0px; padding: 0px; margin:0px;"
  >
    <Controls ref="controlsRef">
      <template
        v-if="!timelineDisabled && getUISetting('UITimeline')"
        slot="timelineControls"
      >
        <div style="min-width: 270px">
          <v-tooltip
            open-delay="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon
                v-mousetrap="{ bind: 'shift+t', handler: () => $emit('update:collapsed', !collapsed) }"
                small
                v-on="on"
                @click="$emit('update:collapsed', !collapsed)"
              >
                {{ collapsed?'mdi-chevron-up-box': 'mdi-chevron-down-box' }}
              </v-icon>
            </template>
            <span>Collapse/Expand Timeline</span>
          </v-tooltip>
          <v-tooltip
            open-delay="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon
                small
                :color="enabledKey ? 'primary' : ''"
                class="ml-2"
                v-on="on"
                @click="enabledKey = !enabledKey"
              >
                mdi-key
              </v-icon>
            </template>
            <span>Show Legend/Key</span>
          </v-tooltip>
          <timeline-buttons
            :dismissed-buttons="dismissedButtons"
            :collapsed="collapsed"
            :current-view="currentView"
            class="ml-2"
            @toggle="toggleView($event)"
            @collapse="collaped = $event"
            @enable="removeDismissedButton($event)"
          />
        </div>
      </template>
      <template #middle>
        <file-name-time-display
          v-if="getUISetting('UIImageNameDisplay') && datasetType === 'image-sequence'"
          class="text-middle px-3"
          display-type="filename"
        />
        <span v-else-if="datasetType === 'video'">
          <span
            v-if="getUISetting('UIAudioControls')"
            class="mr-2"
          >
            <v-menu
              :close-on-content-click="false"
              top
              offset-y
              nudge-left="3"
              open-on-hover
              close-delay="500"
              open-delay="250"
              rounded="pill"
            >
              <template v-slot:activator="{ on }">
                <v-icon
                  @click="(!volume && setVolume(1)) || (volume && setVolume(0))"
                  v-on="on"
                > {{ volume === 0 ? 'mdi-volume-off' :'mdi-volume-medium' }}
                </v-icon>
              </template>
              <v-card style="overflow:hidden; width:30px">
                <v-slider
                  :value="volume"
                  min="0"
                  max="1.0"
                  step="0.05"
                  vertical
                  @change="setVolume"
                />
              </v-card>
            </v-menu>
          </span>
          <span
            v-if="getUISetting('UISpeedControls')"
            class="mr-2"
          >
            <v-menu
              :close-on-content-click="false"
              top
              offset-y
              nudge-left="3"
              open-on-hover
              close-delay="500"
              open-delay="250"
              rounded="lg"
            >
              <template v-slot:activator="{ on }">
                <v-badge
                  :value="speed != 1.0"
                  color="#0277bd88"
                  :content="`${speed}X`"
                  offset-y="5px"
                  overlap
                >
                  <v-icon
                    v-on="on"
                    @click="setSpeed(1)"
                  > mdi-speedometer
                  </v-icon>
                </v-badge>
              </template>
              <v-card style="overflow:hidden; width:90px;">
                <v-slider
                  :value="ticks.indexOf(speed)"
                  min="0"
                  max="6"
                  step="1"
                  :tick-labels="ticks"
                  ticks="always"
                  :tick-size="4"
                  style="font-size:0.75em;"
                  vertical
                  @change="setSpeed(ticks[$event])"
                />

              </v-card>
            </v-menu>
          </span>
          <file-name-time-display
            class="text-middle pl-2"
            display-type="time"
          />
        </span>
      </template>
    </Controls>
    <Timeline
      v-if="(!collapsed) && !timelineDisabled && getUISetting('UITimeline')"
      ref="timelineRef"
      :max-frame="maxFrame"
      :frame="frame"
      :display="!collapsed"
      :timeline-height="timelineHeight"
      @seek="seek"
      @resize="updateSizes"
    >
      <template
        #child="{
          startFrame,
          endFrame,
          maxFrame: childMaxFrame,
          clientWidth,
          clientHeight,
          margin,
        }"
      >
        <timeline-charts
          :line-chart-data="lineChartData"
          :event-chart-data="eventChartData"
          :group-chart-data="groupChartData"
          :current-view="currentView"
          :collapsed="collapsed"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :child-max-frame="childMaxFrame"
          :client-width="clientWidth"
          :client-height="clientHeight"
          :margin="margin"
          :dismissed-buttons="dismissedButtons"
          @select-track="$emit('select-track', $event)"
          @dismiss="addDismissedButton($event)"
        />
      </template>
    </Timeline>
    <timeline-key
      v-if="enabledKey"
      :current-view="currentView"
      :client-height="keyHeight"
      :client-top="keyTop"
      :client-width="keyWidth"
      :offset="swimlaneOffset"
      :dismissed-buttons="dismissedButtons"
      :data="attributeSwimlaneData[currentView]"
    />
  </v-col>
</template>

<style lang="scss" scoped>
.text-middle {
  vertical-align: baseline;
  font-family: monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: bold;
}
.timeline-button {
  border: thin solid transparent;
}
</style>
