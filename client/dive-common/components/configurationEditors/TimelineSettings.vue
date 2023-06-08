<script lang="ts">
import {
  defineComponent, ref, Ref,
} from '@vue/composition-api';
import { useConfiguration } from 'vue-media-annotator/provides';
import { FilterTimeline } from 'vue-media-annotator/use/useTimelineFilters';
import TimelineFilterSettings from './TimelineFilterSettings.vue';

export default defineComponent({
  name: 'TimelineSettings',
  components: {
    TimelineFilterSettings,
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

    const updateActionList = () => {
      if (configMan.configuration.value?.filterTimelines) {
        const tempList: FilterTimeline[] = [];
        configMan.configuration.value.filterTimelines.forEach((item) => {
          tempList.push(item);
        });
        timelineFilters.value = tempList;
      }
    };
    updateActionList();


    const addTimeline = () => {
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
      updateActionList();
    };
    const updateTimeline = ({ index, data }: {index: number; data: FilterTimeline}) => {
      configMan.updateFilterTimeline(data, index);
      updateActionList();
    };
    const deleteTimeline = (index: number) => {
      configMan.removeFilterTimeline(index);
      updateActionList();
    };

    const saveChanges = () => {
      const id = configMan.configuration.value?.general?.baseConfiguration;
      const config = configMan.configuration;
      if (id && config.value) {
        configMan.saveConfiguration(id, config.value);
        generalDialog.value = false;
      }
    };

    return {
      currentTab,
      timelineFilters,
      updateTimeline,
      deleteTimeline,
      addTimeline,
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
              <p>
                Main Settings will go here!!!
              </p>
            </v-tab-item>
            <v-tab-item>
              <timeline-filter-settings
                :filter-timelines="timelineFilters"
                @update-timeline="updateTimeline($event)"
                @delete-timeline="deleteTimeline($event)"
                @add-timeline="addTimeline()"
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
            @click="saveChanges"
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
