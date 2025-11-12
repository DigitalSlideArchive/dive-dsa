<script lang="ts">
import {
  defineComponent, ref, Ref, computed, watch,
} from 'vue';
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
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const configMan = useConfiguration();
    const currentTab = ref('Main');
    const generalDialog = ref(false);

    const launchEditor = () => {
      generalDialog.value = true;
    };
    const timelineFilters: Ref<FilterTimeline[]> = ref([]);
    const timelineConfig: Ref<TimelineConfiguration> = ref({ maxHeight: 300, timelines: [] });
    const editingConfigName = ref('');

    const timelineConfigsList = computed(() => (configMan.configuration.value?.timelineConfigs || []));

    const selectedConfigIndex = ref(-1); // Local selection, starts with no selection

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
      if (selectedConfigIndex.value >= 0) {
        const selectedConfig = configMan.getTimelineConfigByIndex(selectedConfigIndex.value);
        if (selectedConfig) {
          timelineConfig.value = cloneDeep(selectedConfig);
          editingConfigName.value = selectedConfig.name || '';
        } else {
          // Config was removed, clear selection
          timelineConfig.value = { maxHeight: 300, timelines: [] };
          editingConfigName.value = '';
          selectedConfigIndex.value = -1;
        }
      } else {
        // No timeline selected - clear the editing config
        timelineConfig.value = { maxHeight: 300, timelines: [] };
        editingConfigName.value = '';
      }
    };
    // Don't auto-select on load - start with no selection
    // updateTimelineList();

    // Watch for changes in timeline configs list
    watch(() => configMan.configuration.value?.timelineConfigs, () => {
      // If selected config index is out of bounds, reset selection
      if (selectedConfigIndex.value >= 0 && selectedConfigIndex.value >= (timelineConfigsList.value.length || 0)) {
        selectedConfigIndex.value = -1;
      }
      updateTimelineList();
    }, { deep: true });

    const switchTimelineConfig = (index: number) => {
      // If clicking the same index, deselect it
      if (selectedConfigIndex.value === index) {
        selectedConfigIndex.value = -1;
        updateTimelineList();
        return;
      }
      selectedConfigIndex.value = index;
      updateTimelineList();
    };

    const addNewTimelineConfig = () => {
      const newIndex = configMan.addTimelineConfig();
      // Don't auto-select the new config - let user select it manually
      // But if they want to edit it immediately, we can select it
      selectedConfigIndex.value = newIndex;
      updateTimelineList();
    };

    const removeTimelineConfig = (index: number) => {
      configMan.removeTimelineConfig(index);
      // Adjust selected index if needed
      if (selectedConfigIndex.value === index) {
        // If we removed the selected config, deselect
        selectedConfigIndex.value = -1;
      } else if (selectedConfigIndex.value > index) {
        // If we removed a config before the selected one, adjust index
        selectedConfigIndex.value -= 1;
      }
      updateTimelineList();
    };

    const updateConfigName = (index: number, name: string) => {
      if (index >= 0) {
        configMan.updateTimelineConfigName(index, name);
        if (index === selectedConfigIndex.value) {
          editingConfigName.value = name;
        }
      }
    };

    const moveConfigUp = (index: number) => {
      const configs = configMan.configuration.value?.timelineConfigs;
      if (configs && index > 0) {
        [configs[index - 1], configs[index]] = [configs[index], configs[index - 1]];
        // Update selected index if needed
        if (selectedConfigIndex.value === index) {
          selectedConfigIndex.value = index - 1;
        } else if (selectedConfigIndex.value === index - 1) {
          selectedConfigIndex.value = index;
        }
        updateTimelineList();
      }
    };

    const moveConfigDown = (index: number) => {
      const configs = configMan.configuration.value?.timelineConfigs;
      if (configs && index < configs.length - 1) {
        [configs[index], configs[index + 1]] = [configs[index + 1], configs[index]];
        // Update selected index if needed
        if (selectedConfigIndex.value === index) {
          selectedConfigIndex.value = index + 1;
        } else if (selectedConfigIndex.value === index + 1) {
          selectedConfigIndex.value = index;
        }
        updateTimelineList();
      }
    };

    const editConfigName = (index: number) => {
      const configs = configMan.configuration.value?.timelineConfigs;
      if (configs && configs[index]) {
        const newName = prompt('Enter new name:', configs[index].name || `${index}`);
        if (newName !== null && newName.trim() !== '') {
          updateConfigName(index, newName.trim());
        }
      }
    };

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
      if (selectedConfigIndex.value < 0) {
        return; // Can't add timeline if no config is selected
      }
      const index = timelineConfig.value.timelines.length;
      const newConfig: TimelineDisplay = {
        name,
        type,
        maxHeight: -1,
        dismissable: false,
        order: 0,
      };
      configMan.updateTimelineDisplay(newConfig, index, selectedConfigIndex.value);
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
      if (selectedConfigIndex.value < 0) {
        return; // Can't update timeline if no config is selected
      }
      configMan.updateTimelineDisplay(data, index, selectedConfigIndex.value);
      updateTimelineList();
    };
    const deleteTimelineConfig = (index: number) => {
      if (selectedConfigIndex.value < 0) {
        return; // Can't delete timeline if no config is selected
      }
      configMan.removeTimelineDisplay(index, selectedConfigIndex.value);
      updateTimelineList();
    };

    const updateTimelineHeight = (height: number) => {
      if (selectedConfigIndex.value < 0) {
        return; // Can't update height if no config is selected
      }
      const selectedConfig = configMan.getTimelineConfigByIndex(selectedConfigIndex.value);
      if (selectedConfig) {
        selectedConfig.maxHeight = height;
        const configs = configMan.configuration.value?.timelineConfigs;
        if (configs && selectedConfigIndex.value >= 0 && selectedConfigIndex.value < configs.length) {
          configs[selectedConfigIndex.value] = selectedConfig;
        }
      }
      saveChanges(true);
      updateTimelineList();
    };

    const headers = computed(() => ([
      { text: 'Name', value: 'name', sortable: false },
      { text: 'Timelines', value: 'timelineCount', sortable: false },
      { text: 'Max Height', value: 'maxHeight', sortable: false },
      {
        text: 'Actions',
        value: 'actions',
        sortable: false,
        align: 'end',
      },
    ]));

    const tableTimelineConfigList = computed(() => (timelineConfigsList.value.map((config, index) => ({
      index,
      name: config.name || `${index}`,
      timelineCount: config.timelines?.length || 0,
      maxHeight: config.maxHeight,
      isActive: index === selectedConfigIndex.value,
    }))));

    return {
      currentTab,
      timelineFilters,
      timelineConfig,
      timelineConfigsList,
      selectedConfigIndex,
      editingConfigName,
      updateTimelineFilter,
      deleteTimelineFilter,
      addTimelineFilter,
      updateTimelineConfig,
      deleteTimelineConfig,
      addTimelineConfig,
      updateTimelineHeight,
      switchTimelineConfig,
      addNewTimelineConfig,
      removeTimelineConfig,
      updateConfigName,
      moveConfigUp,
      moveConfigDown,
      editConfigName,
      generalDialog,
      tableTimelineConfigList,
      launchEditor,
      saveChanges,
      configMan,
      headers,

    };
  },
});
</script>

<template>
  <div class="ma-2">
    <v-btn :disabled="disabled" @click="launchEditor">
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
              <div class="mb-4">
                <v-data-table
                  :headers="headers"
                  :items="tableTimelineConfigList"
                  :item-class="(item) => item.isActive ? 'active-timeline-row' : ''"
                  :items-per-page="-1"
                  hide-default-footer
                  class="elevation-1"
                >
                  <template #top>
                    <v-toolbar flat>
                      <v-toolbar-title>Timeline Configurations</v-toolbar-title>
                      <v-spacer />
                      <v-btn
                        color="primary"
                        small
                        @click="addNewTimelineConfig"
                      >
                        <v-icon small class="mr-1">mdi-plus</v-icon>
                        Add Config
                      </v-btn>
                    </v-toolbar>
                  </template>
                  <template #item.name="{ item }">
                    <span
                      :class="{ 'font-weight-bold': item.isActive }"
                      @click="switchTimelineConfig(item.index)"
                      style="cursor: pointer; user-select: none;"
                    >
                      {{ item.name }}
                      <v-icon
                        v-if="item.isActive"
                        x-small
                        class="ml-1"
                        color="primary"
                      >
                        mdi-check-circle
                      </v-icon>
                    </span>
                  </template>
                  <template #item.timelineCount="{ item }">
                    {{ item.timelineCount }}
                  </template>
                  <template #item.maxHeight="{ item }">
                    {{ item.maxHeight }}px
                  </template>
                  <template #item.actions="{ item }">
                    <div class="d-flex align-center">
                      <v-tooltip bottom>
                        <template #activator="{ on, attrs }">
                          <v-btn
                            icon
                            x-small
                            v-bind="attrs"
                            v-on="on"
                            @click="switchTimelineConfig(item.index)"
                            :color="item.isActive ? 'primary' : ''"
                          >
                            <v-icon x-small>mdi-pencil</v-icon>
                          </v-btn>
                        </template>
                        <span>Edit</span>
                      </v-tooltip>
                      <v-tooltip bottom>
                        <template #activator="{ on, attrs }">
                          <v-btn
                            icon
                            x-small
                            v-bind="attrs"
                            v-on="on"
                            @click="editConfigName(item.index)"
                          >
                            <v-icon x-small>mdi-rename-box</v-icon>
                          </v-btn>
                        </template>
                        <span>Rename</span>
                      </v-tooltip>
                      <v-tooltip bottom>
                        <template #activator="{ on, attrs }">
                          <v-btn
                            icon
                            x-small
                            v-bind="attrs"
                            v-on="on"
                            :disabled="item.index === 0"
                            @click="moveConfigUp(item.index)"
                          >
                            <v-icon x-small>mdi-arrow-up</v-icon>
                          </v-btn>
                        </template>
                        <span>Move Up</span>
                      </v-tooltip>
                      <v-tooltip bottom>
                        <template #activator="{ on, attrs }">
                          <v-btn
                            icon
                            x-small
                            v-bind="attrs"
                            v-on="on"
                            :disabled="item.index === timelineConfigsList.length - 1"
                            @click="moveConfigDown(item.index)"
                          >
                            <v-icon x-small>mdi-arrow-down</v-icon>
                          </v-btn>
                        </template>
                        <span>Move Down</span>
                      </v-tooltip>
                      <v-tooltip bottom>
                        <template #activator="{ on, attrs }">
                          <v-btn
                            icon
                            x-small
                            v-bind="attrs"
                            v-on="on"
                            color="error"
                            @click="removeTimelineConfig(item.index)"
                          >
                            <v-icon x-small>mdi-delete</v-icon>
                          </v-btn>
                        </template>
                        <span>Delete</span>
                      </v-tooltip>
                    </div>
                  </template>
                </v-data-table>
              </div>
              <v-alert
                v-if="selectedConfigIndex < 0"
                type="info"
                outlined
                class="mt-4"
              >
                Please select a timeline configuration from the table above to edit.
              </v-alert>
              <div v-else>
                <v-text-field
                  :value="editingConfigName"
                  label="Configuration Name"
                  outlined
                  dense
                  class="mb-4"
                  @input="updateConfigName(selectedConfigIndex, $event)"
                />
                <timeline-configuration-vue
                  :timeline-config="timelineConfig"
                  @update-timeline="updateTimelineConfig($event)"
                  @delete-timeline="deleteTimelineConfig($event)"
                  @add-timeline="addTimelineConfig($event)"
                  @update-height="updateTimelineHeight($event)"
                />
              </div>
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
::v-deep .active-timeline-row {
  background-color: rgba(25, 118, 210, 0.1) !important;
}

::v-deep .active-timeline-row:hover {
  background-color: rgba(25, 118, 210, 0.15) !important;
}
</style>
