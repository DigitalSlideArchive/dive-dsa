<script lang="ts">
import {
  defineComponent, ref, Ref,
} from '@vue/composition-api';
import { useConfiguration } from 'vue-media-annotator/provides';
import { FilterTimeline } from 'vue-media-annotator/use/useTimelineFilters';
import { TimelineConfiguration, TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import { cloneDeep } from 'lodash';
import TimelineFilterSettings from './TimelineFilterSettings.vue';
import TimelineConfigurationVue from './TimelineConfiguration.vue';

export default defineComponent({
  name: 'TimelineSettings',
  components: {
    TimelineFilterSettings,
    TimelineConfigurationVue,
  },
  props: {},
  setup() {
    const configMan = useConfiguration();
    const currentTab = ref('Main');
    const generalDialog = ref(false);

    const launchEditor = () => {
      generalDialog.value = true;
    };
    const timelineFilters: Ref<FilterTimeline[]> = ref([]);
    const timelineConfig: Ref<TimelineConfiguration> = ref({ maxHeight: 300, timelines: [] });

    const updateFilterList = () => {
      if (configMan.configuration.value?.filterTimelines) {
        const tempList: FilterTimeline[] = [];
        configMan.configuration.value.filterTimelines.forEach((item) => {
          tempList.push(item);
        });
        timelineFilters.value = tempList;
      }
    };
    updateFilterList();
    const updateTimelineList = () => {
      if (configMan.configuration.value && configMan.configuration.value.timelineConfigs) {
        timelineConfig.value = cloneDeep(configMan.configuration.value.timelineConfigs);
      }
    };
    updateTimelineList();

    const addTimelineFilter = () => {
      const index = timelineFilters.value.length - 1;
      const newTimeline: FilterTimeline = {
        name: 'default',
        enabled: false,
        typeFilter: [],
        frameRange: [],
        attributes: {},
        confidenceFilter: -1,
        type: 'swimlane',
      };
      configMan.updateFilterTimeline(newTimeline, index);
      updateFilterList();
    };
    const updateTimelineFilter = ({ index, data }: {index: number; data: FilterTimeline}) => {
      configMan.updateFilterTimeline(data, index);
      updateFilterList();
    };
    const deleteTimelineFilter = (index: number) => {
      configMan.removeFilterTimeline(index);
      updateFilterList();
    };

    const addTimelineConfig = ({ name, type }: {name: string; type: TimelineDisplay['type']}) => {
      const index = timelineConfig.value.timelines.length;
      const newConfig: TimelineDisplay = {
        name,
        type,
        maxHeight: 300,
        dismissable: false,
        order: 0,
      };
      configMan.updateTimelineDisplay(newConfig, index);
      updateTimelineList();
    };
    const saveChanges = (leaveOpen = false) => {
      const id = configMan.configuration.value?.general?.baseConfiguration
         || (configMan.hierarchy.value?.length ? configMan.hierarchy.value[0].id : null);
      const config = configMan.configuration;
      if (id && config.value) {
        configMan.saveConfiguration(id, config.value);
        if (!leaveOpen) {
          generalDialog.value = false;
        }
      }
    };

    const updateTimelineConfig = ({ index, data }: {index: number; data: TimelineDisplay}) => {
      configMan.updateTimelineDisplay(data, index);
      updateTimelineList();
    };
    const deleteTimelineConfig = (index: number) => {
      configMan.removeTimelineDisplay(index);
      updateTimelineList();
    };


    const updateTimelineHeight = (height: number) => {
      if (configMan.configuration.value && !configMan.configuration.value?.timelineConfigs) {
        configMan.configuration.value.timelineConfigs = {
          maxHeight: height,
          timelines: [],
        };
      } else if (configMan.configuration.value && configMan.configuration.value.timelineConfigs) {
        configMan.configuration.value.timelineConfigs.maxHeight = height;
      }
      saveChanges(true);
      updateTimelineList();
    };

    return {
      currentTab,
      timelineFilters,
      timelineConfig,
      updateTimelineFilter,
      deleteTimelineFilter,
      addTimelineFilter,
      updateTimelineConfig,
      deleteTimelineConfig,
      addTimelineConfig,
      updateTimelineHeight,
      generalDialog,
      launchEditor,
      saveChanges,
      configMan,

    };
  },
});
</script>

<template>
  <div class="ma-2">
    <v-btn @click="launchEditor">
      <span>
        Timeline Settings
        <br>
      </span>
      <v-icon
        class="ml-2"
      >
        mdi-cog
      </v-icon>
    </v-btn>
    <v-dialog
      v-model="generalDialog"
      max-width="900"
    >
      <v-card>
        <v-card-title>
          Timeline Settings
          <v-spacer />
          <v-btn
            icon
            small
            color="white"
            @click="generalDialog = false"
          >
            <v-icon
              small
            >
              mdi-close
            </v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-card-title class="text-h6">
            <v-tabs v-model="currentTab">
              <v-tab> Main </v-tab>
              <v-tab>
                Filter Timelines
              </v-tab>
            </v-tabs>
          </v-card-title>
          <v-tabs-items v-model="currentTab">
            <v-tab-item>
              <timeline-configuration-vue
                :timeline-config="timelineConfig"
                @update-timeline="updateTimelineConfig($event)"
                @delete-timeline="deleteTimelineConfig($event)"
                @add-timeline="addTimelineConfig($event)"
                @update-height="updateTimelineHeight($event)"
              />
            </v-tab-item>
            <v-tab-item>
              <timeline-filter-settings
                :filter-timelines="timelineFilters"
                @update-timeline="updateTimelineFilter($event)"
                @delete-timeline="deleteTimelineFilter($event)"
                @add-timeline="addTimelineFilter()"
              />
            </v-tab-item>
          </v-tabs-items>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="generalDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="saveChanges()"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
</style>
