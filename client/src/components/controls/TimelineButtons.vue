<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent,
  ref,
  computed,
  PropType,
} from 'vue';
import { TimelineDisplay, UISettingsKey } from 'vue-media-annotator/ConfigurationManager';
import {
  useAttributesFilters,
  useCameraStore,
  useConfiguration,
  useSelectedCamera,
  useTimelineFilters,
} from '../../provides';

export default defineComponent({
  components: {},
  props: {
    dismissedButtons: {
      type: Array as PropType<string[]>,
      required: true,
    },
    collapsed: {
      type: Boolean,
      default: false,
    },
    currentView: {
      type: String,
      required: true,
    },
  },
  setup(props, { emit }) {
    const configMan = useConfiguration();
    const getUISetting = (key: UISettingsKey) => configMan.getUISetting(key);
    const cameraStore = useCameraStore();
    const multiCam = ref(cameraStore.camMap.value.size > 1);
    const selectedCamera = useSelectedCamera();
    const hasGroups = computed(() => (!!cameraStore.camMap.value.get(selectedCamera.value)?.groupStore.sorted.value.length));
    const { timelineEnabled, swimlaneEnabled } = useAttributesFilters();
    const { enabledTimelines: enabledFilterTimelines } = useTimelineFilters();

    const timelineConfigsList = computed(() => (configMan.configuration.value?.timelineConfigs || []));

    const activeConfigIndex = computed(() => configMan.activeTimelineConfigIndex.value);

    const activeTimelineConfig = computed(() => configMan.getActiveTimelineConfig());

    const hasTimelineConfig = computed(() => (timelineConfigsList.value.length && timelineConfigsList.value[activeConfigIndex.value]?.timelines?.length > 0));

    const timelineListBtns = computed(() => {
      const list: { name: string; type: TimelineDisplay['type']; dismissed: boolean }[] = [];
      const config = activeTimelineConfig.value;
      if (config?.timelines) {
        config.timelines.forEach((item) => {
          list.push({
            name: item.name,
            type: item.type,
            dismissed: props.dismissedButtons.includes(item.name),
          });
        });
      }
      return list;
    });

    const switchTimelineConfig = (index: number) => {
      configMan.setActiveTimelineConfigIndex(index);
    };
    const timelineBtns = computed(() => {
      const timelines: { name: string; type: TimelineDisplay['type'] }[] = [];
      if (getUISetting('UIDetections')) {
        timelines.push({ name: 'Detections', type: 'detections' });
      }
      if (getUISetting('UIEvents')) {
        timelines.push({ name: 'Events', type: 'event' });
      }
      if (!multiCam.value && hasGroups.value) {
        timelines.push({ name: 'Groups', type: 'event' });
      }
      Object.entries(timelineEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          timelines.push({ name: key, type: 'graph' });
        }
      });
      Object.entries(swimlaneEnabled.value).forEach(([key, enabled]) => {
        if (enabled) {
          timelines.push({ name: key, type: 'swimlane' });
        }
      });
      enabledFilterTimelines.value.forEach((item) => {
        timelines.push({ name: item.name, type: 'filter' });
      });

      return timelines;
    });
    /**
     * Toggles on and off the individual timeline views
     * Resizing is handled by the Annotator itself.
     */
    function toggleView(type: 'Detections' | 'Events' | 'Groups' | string) {
      emit('toggle', type);
      emit('collapsed', false);
    }

    const iconMap = ref({
      filter: 'mdi-filter',
      graph: 'mdi-chart-timeline-variant',
      swimlane: 'mdi-chart-timeline',
      event: '',
      detections: '',
    });

    const currentViewType = computed(() => {
      const found = timelineBtns.value.find((item) => item.name === props.currentView);
      if (found) {
        return found.type;
      }
      return 'event';
    });

    // Timeline Key Sizing and Refs
    return {
      toggleView,
      multiCam,
      hasGroups,
      getUISetting,
      swimlaneEnabled,
      //filter Timelines
      enabledFilterTimelines,
      timelineBtns,
      iconMap,
      currentViewType,
      timelineConfigsList,
      activeConfigIndex,
      activeTimelineConfig,
      switchTimelineConfig,
      timelineListBtns,
      hasTimelineConfig,
    };
  },
});
</script>

<template>
  <span v-if="!collapsed">
    <!-- Timeline Config Selector - Single button with conditional dropdown -->
    <span v-if="hasTimelineConfig && timelineConfigsList.length > 0">
      <!-- Multiple timeline configs - show dropdown -->
      <v-menu
        v-if="timelineConfigsList.length > 1"
        :close-on-content-click="true"
        top
        offset-y
        nudge-left="3"
        open-on-hover
        close-delay="500"
        open-delay="250"
        rounded="lg"
      >
        <template #activator="{ on }">
          <v-btn depressed x-small outlined class="mr-1" v-on="on">
            {{ activeTimelineConfig?.name || `${activeConfigIndex}` }}
            <v-icon class="pa-0 pl-2" x-small>mdi-chevron-down-box</v-icon>
          </v-btn>
        </template>
        <v-card outlined>
          <v-list dense>
            <v-list-item
              v-for="(config, index) in timelineConfigsList"
              :key="index"
              :class="{ 'v-list-item--active': index === activeConfigIndex }"
              @click="switchTimelineConfig(index)"
            >
              <v-list-item-content>
                <v-list-item-title>
                  {{ config.name || `${index}` }}
                </v-list-item-title>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>
      <!-- Single timeline config - show name only, no dropdown -->
      <v-btn v-else depressed x-small outlined class="mr-1">
        {{ activeTimelineConfig?.name || "Timeline" }}
      </v-btn>
    </span>
    <!-- No timeline configs - show default timeline dropdown behavior -->
    <template v-else>
      <span v-if="timelineListBtns.length > 3">
        <v-menu
          :close-on-content-click="true"
          top
          offset-y
          nudge-left="3"
          open-on-hover
          close-delay="500"
          open-delay="250"
          rounded="lg"
        >
          <template #activator="{ on }">
            <v-btn depressed x-small outlined class="mr-1" v-on="on">
              Timelines
              <v-icon class="pa-0 pl-2" x-small>mdi-chevron-down-box</v-icon>
            </v-btn>
          </template>
          <v-card outlined>
            <v-list dense>
              <v-list-item
                v-for="item in timelineListBtns"
                :key="item.name"
                style="align-items: center"
                @click="toggleView(item.name)"
              >
                <v-list-item-content>
                  <v-list-item-title>
                    <v-icon v-if="iconMap[item.type]" x-small class="mr-1">
                      {{ iconMap[item.type] }} </v-icon
                    >{{ item.name }}
                    <v-btn
                      v-if="item.dismissed"
                      small
                      color="success"
                      class="mx-2"
                      @click="$emit('enable', item.name)"
                    >
                      Enable</v-btn
                    >
                  </v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>
      </span>
      <span v-else-if="timelineBtns.length <= 3">
        <v-btn
          v-for="item in timelineBtns"
          :key="item.name"
          class="ml-1"
          :class="{ 'timeline-button': currentView !== item.name || collapsed }"
          depressed
          :outlined="currentView === item.name && !collapsed"
          x-small
          tab-index="-1"
          @click="toggleView(item.name)"
        >
          <v-icon v-if="iconMap[item.type]" x-small>
            {{ iconMap[item.type] }} </v-icon
          >{{ item.name }}
        </v-btn>
      </span>
      <span v-else-if="timelineBtns.length > 3">
        <v-menu
          :close-on-content-click="true"
          top
          offset-y
          nudge-left="3"
          open-on-hover
          close-delay="500"
          open-delay="250"
          rounded="lg"
        >
          <template #activator="{ on }">
            <v-btn
              depressed
              x-small
              :outlined="timelineBtns.map((item) => item.name).includes(currentView)"
              class="mr-1"
              v-on="on"
            >
              <v-icon v-if="iconMap[currentViewType]" x-small>{{
                iconMap[currentViewType]
              }}</v-icon>
              {{ currentView }}
              <v-icon class="pa-0 pl-2" x-small>mdi-chevron-down-box</v-icon>
            </v-btn>
          </template>
          <v-card outlined>
            <v-list dense>
              <v-list-item
                v-for="item in timelineBtns"
                :key="item.name"
                style="align-items: center"
                @click="toggleView(item.name)"
              >
                <v-list-item-content>
                  <v-list-item-title>
                    <v-icon v-if="iconMap[item.type]" x-small class="mr-1">
                      {{ iconMap[item.type] }} </v-icon
                    >{{ item.name }}
                  </v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>
      </span>
    </template>
  </span>
</template>

<style lang="scss" scoped>
.timeline-button {
  border: thin solid transparent;
}
</style>
