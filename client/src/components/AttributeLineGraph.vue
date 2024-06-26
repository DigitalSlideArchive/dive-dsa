<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  ref,
  defineComponent,
  Ref,
  PropType,
  del as VueDel,
} from 'vue';
import AttributeKeyFilterVue from 'vue-media-annotator/components/AttributeFilter/AttributeKeyFilter.vue';
import {
  TimeLineFilter,
  TimelineGraph, TimelineGraphSettings,
} from 'vue-media-annotator/use/AttributeTypes';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import {
  useAttributesFilters, useAttributes, useTrackStyleManager, useTrackFilters,
} from '../provides';
import TooltipBtn from './TooltipButton.vue';

/* Magic numbers involved in height calculation */
export default defineComponent({
  name: 'AttributeLineGraph',
  components: {
    TooltipBtn,
    AttributeKeyFilter: AttributeKeyFilterVue,
  },
  props: {
    timelineGraph: {
      type: Object as PropType<TimelineGraph>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const {
      setTimelineEnabled, setTimelineGraph, removeTimelineFilter,
      timelineGraphs,
    } = useAttributesFilters();
    const attributesList = useAttributes();
    const showGraphSettings = ref(false);
    const showRangeSettings = ref(false);
    const showDisplaySettings = ref(false);
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const trackFilterControls = useTrackFilters();
    const types = computed(() => ['all', ...trackFilterControls.allTypes.value]);

    const editTimelineFilter: Ref<TimeLineFilter> = ref(props.timelineGraph.filter);
    const editTimelineSettings: Ref<Record<string, TimelineGraphSettings>> = ref(props.timelineGraph.settings || {});
    const editDisplaySettings: Ref<TimelineGraph['displaySettings']> = ref(props.timelineGraph.displaySettings || { display: 'static' as 'static' | 'selected', trackFilter: ['all'] });
    const editTimelineEnabled = ref(props.timelineGraph.enabled);
    const editTimelineDefault = ref(props.timelineGraph.default || false);
    const originalName = props.timelineGraph.name;
    const originalDefault = props.timelineGraph.default || false;
    const editTimelineName = ref(props.timelineGraph.name || 'default');
    const yRange = ref(props.timelineGraph.yRange || [-1, -1]);
    const ticks = ref(props.timelineGraph.ticks || -1);
    const filterNames = computed(() => {
      const data = ['all'];
      return data.concat(attributesList.value.filter((item) => item.belongs === 'detection' && item.datatype === 'number').map((item) => item.name));
    });

    const editingGraphSettings = ref(false);

    const saveChanges = () => {
      if (editTimelineName.value !== originalName) {
        removeTimelineFilter(originalName);
      }
      let setDefault = false;
      if (editTimelineDefault.value && editTimelineDefault.value !== originalDefault) {
        // Go through the other timelines and make sure only one is set as the default
        setDefault = true;
      }
      const updateObject = {
        name: editTimelineName.value,
        filter: editTimelineFilter.value,
        enabled: editTimelineEnabled.value,
        settings: editTimelineSettings.value,
        displaySettings: editDisplaySettings.value,
        yRange: yRange.value,
        ticks: ticks.value,
        default: setDefault,
      };
      setTimelineGraph(editTimelineName.value, updateObject);
      setTimelineEnabled(editTimelineName.value, editTimelineEnabled.value);
      emit('close');
    };

    const graphTypes = ref(['Linear', 'Step', 'StepAfter', 'StepBefore', 'Natural']);
    const graphArea = ref(false);
    const graphAreaOpacity = ref(0.2);
    const graphType: Ref<LineChartData['type']> = ref('Linear');
    const graphAreaColor = ref('');
    const graphMax = ref(false);
    const graphLineOpacity = ref(1.0);
    const editTimelineKey = ref('');
    const editGraphSettings = (key: string) => {
      // set the defaults:
      editTimelineKey.value = key;
      editingGraphSettings.value = true;
      graphType.value = 'Linear';
      graphMax.value = false;
      graphArea.value = false;
      graphAreaOpacity.value = 0.2;
      graphAreaColor.value = attributesList.value.find((item) => key === item.name)?.color || '';
      graphLineOpacity.value = 1.0;
      if (editTimelineSettings.value[key]) {
        graphType.value = editTimelineSettings.value[key].type || 'Linear';
        graphArea.value = editTimelineSettings.value[key].area || false;
        graphAreaOpacity.value = (editTimelineSettings.value[key].areaOpacity as number);
        graphAreaColor.value = editTimelineSettings.value[key].areaColor || '';
        graphMax.value = editTimelineSettings.value[key].max || false;
        graphLineOpacity.value = editTimelineSettings.value[key].lineOpacity !== undefined
          ? editTimelineSettings.value[key].lineOpacity : 1.0;
        if (graphAreaOpacity.value === undefined) {
          graphAreaOpacity.value = 0.2;
        }
      }
    };

    const saveGraphSettings = () => {
      // Don't set if default values
      if (!graphType.value && graphType.value === 'Linear') {
        if (editTimelineSettings.value && editTimelineSettings.value[editTimelineKey.value]) {
          VueDel(editTimelineSettings.value, editTimelineKey.value);
        }
      } else {
        const data: TimelineGraphSettings = {
          type: graphType.value,
          area: graphArea.value,
          areaOpacity: graphAreaOpacity.value,
          areaColor: graphAreaColor.value,
          max: graphMax.value,
          lineOpacity: graphLineOpacity.value,
        };
        editTimelineSettings.value[editTimelineKey.value] = data;
      }
      editingGraphSettings.value = false;
      showGraphSettings.value = false;
    };

    const deleteChip = (item: string) => {
      if (editDisplaySettings.value) {
        editDisplaySettings.value.trackFilter.splice(editDisplaySettings.value.trackFilter.findIndex((data) => data === item));
      }
    };

    return {
      setTimelineEnabled,
      setTimelineGraph,
      editTimelineDefault,
      editTimelineFilter,
      editTimelineName,
      editTimelineEnabled,
      filterNames,
      saveChanges,
      //Graph Settings
      saveGraphSettings,
      editGraphSettings,
      deleteChip,
      editingGraphSettings,
      editTimelineSettings,
      editDisplaySettings,
      graphType,
      graphTypes,
      graphArea,
      graphMax,
      graphAreaOpacity,
      graphLineOpacity,
      graphAreaColor,
      timelineGraphs,
      showGraphSettings,
      showDisplaySettings,
      editTimelineKey,
      yRange,
      ticks,
      showRangeSettings,
      typeStylingRef,
      types,
    };
  },
});
</script>

<template>
  <v-card>
    <v-card-title> Add Timeline </v-card-title>
    <v-card-text>
      <v-row>
        <v-text-field
          v-model="editTimelineName"
          label="Timeline Name"
        />
      </v-row>
      <v-row>
        <v-switch
          v-model="editTimelineEnabled"
          label="Enabled"
        />
      </v-row>
      <v-row>
        <attribute-key-filter
          :attribute-filter="editTimelineFilter"
          :filter-names="filterNames"
          timeline
          @save-changes="editTimelineFilter = ($event)"
        />
      </v-row>
      <div class="mt-4">
        <h2>
          Display Settings <v-icon @click="showDisplaySettings = !showDisplaySettings">
            {{ showDisplaySettings ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </h2>
        <p> Set graphs to display only on selected track types</p>

        <div
          v-if="showDisplaySettings"
          class="graph-settings-area"
        >
          <v-row
            v-if="editDisplaySettings"
            dense
          >
            <v-radio-group
              v-model="editDisplaySettings.display"
              class="pr-2"
            >
              <v-radio
                label="Static"
                value="static"
                hint="Always display key"
                persistent-hint
              />
              <v-radio
                value="selected"
                label="Selected"
                hint="Only show when track is selected"
                persistent-hint
              />
            </v-radio-group>
            <v-select
              v-model="editDisplaySettings.trackFilter"
              :items="types"
              multiple
              clearable
              deletable-chips
              chips
              label="Filter Types"
              class="mx-2"
              style="max-width:250px"
            >
              <template #selection="{ item }">
                <v-chip
                  close
                  :color="typeStylingRef.color(item)"
                  text-color="gray"
                  @click:close="deleteChip(item)"
                >
                  {{ item }}
                </v-chip>
              </template>
            </v-select>
          </v-row>
        </div>
      </div>
      <div class="mt-4">
        <h2>
          Graph Settings <v-icon @click="showGraphSettings = !showGraphSettings">
            {{ showGraphSettings ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </h2>
        <p> Change the way attributes are graphed</p>
        <div
          v-if="showGraphSettings"
          class="graph-settings-area"
        >
          <v-row
            v-for="key in editTimelineFilter.appliedTo"
            :key="`graph_details_${key}`"
            class="graph-settings-list my-2"
            :class="{ 'selected-setting': key === editTimelineKey }"
          >
            <v-col><b>{{ key }}</b></v-col>
            <v-col
              v-if="editTimelineSettings[key]"
              class="graphsetting"
            >
              <b>Type</b>:{{ editTimelineSettings[key].type }}
            </v-col>

            <v-col
              v-if="editTimelineSettings[key]"
              class="graphsetting"
            >
              <b>Line %</b>:
              {{ (editTimelineSettings[key].lineOpacity
                ? editTimelineSettings[key].lineOpacity : 1).toFixed(2) }}
            </v-col>

            <v-col
              v-if="editTimelineSettings[key]"
              class="graphsetting"
            >
              <b>Max</b>:{{ editTimelineSettings[key].max }}
            </v-col>

            <v-col
              v-if="editTimelineSettings[key]"
              class="graphsetting"
            >
              <b>Area</b>:{{ editTimelineSettings[key].area }}
            </v-col>

            <v-col
              v-if="editTimelineSettings[key]
                && editTimelineSettings[key].area"
              class="graphsetting"
            >
              <b>Area %</b>:{{ editTimelineSettings[key].areaOpacity }}
            </v-col>
            <v-col
              v-if="editTimelineSettings[key]
                && editTimelineSettings[key].areaColor"
              class="graphsetting"
            >
              <b>Area col:</b>:<div
                class="type-color-box"
                :style="{
                  backgroundColor: editTimelineSettings[key].areaColor,
                }"
              />
            </v-col>

            <v-icon
              class="mr-4"
              @click="editGraphSettings(key)"
            >
              mdi-cog
            </v-icon>
          </v-row>
        </div>
      </div>
      <v-card
        v-if="editingGraphSettings"
        class="editGraphCard"
      >
        <v-card-title>
          Editing Graph Line:
          <b class="pl-2"><i> {{ editTimelineKey }}</i></b>
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col>
              <v-select
                v-model="graphType"
                :items="graphTypes"
                label="Graph Type"
              />
              <v-slider
                v-model="graphLineOpacity"
                :label="`Line Opacity ${graphLineOpacity.toFixed(2)}`"
                min="0"
                max="1"
                step="0.01"
              />

              <v-checkbox
                v-model="graphMax"
                label="Max Graph"
                persistent-hint
                hint="Any value other than 0 is the Max value"
              />
              <v-checkbox
                v-model="graphArea"
                label="Graph Area"
                persistent-hint
                hint="Shade the area under the graph"
              />
              <v-slider
                v-if="graphArea"
                v-model="graphAreaOpacity"
                :label="`Area Opacity ${graphAreaOpacity.toFixed(2)}`"
                min="0"
                max="1"
                step="0.01"
              />
              <h3
                v-if="graphArea"
              >
                Area Color
              </h3>
              <v-color-picker
                v-if="graphArea"
                v-model="graphAreaColor"
                hide-inputs
              />
            </v-col>
          </v-row>
          <v-row v-if="editingGraphSettings">
            <v-spacer />
            <v-btn
              color="success"
              @click="saveGraphSettings"
            >
              Save Graph Settings
            </v-btn>
          </v-row>
        </v-card-text>
      </v-card>
      <v-row
        class="pt-2"
      >
        <p>
          One Timeline can be labeled as the Default timeline which will
          automatically be open when loading the dataset
        </p>
        <v-switch
          v-model="editTimelineDefault"
          label="Default Visible Timeline"
          class="pa-0 ma-0"
        />
      </v-row>
      <h3>
        Y-Range Settings <v-icon @click="showRangeSettings = !showRangeSettings">
          {{ showRangeSettings ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
        </v-icon>
      </h3>
      <div
        v-if="showRangeSettings"
      >
        <v-row>
          <v-text-field
            v-model.number="yRange[0]"
            type="number"
            label="Min"
            hint="-1 will auto calculate"
            persistent-hint
          />
          <v-text-field
            v-model.number="yRange[1]"
            type="number"
            label="Max"
            hint="-1 will auto calculate"
            persistent-hint
            class="mx-2"
          />
          <v-text-field
            v-model.number="ticks"
            type="number"
            label="Ticks"
            hint="-1 will auto calculate"
            persistent-hint
          />
        </v-row>
      </div>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn
        depressed
        text
        @click="$emit('close')"
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
</template>

<style scoped lang='scss'>

.border-highlight {
   border-bottom: 1px solid gray;
 }

.type-checkbox {
  max-width: 80%;
  overflow-wrap: anywhere;
}

.hover-show-parent {
  .hover-show-child {
    display: none;
  }

  &:hover {
    .hover-show-child {
      display: inherit;
    }
  }
}
.outlined {
  background-color: gray;
  color: #222;
  font-weight: 600;
  border-radius: 6px;
  padding: 0 5px;
  font-size: 12px;
}

.graph-settings-area {
  padding: 5px;
}

.graph-settings-list{
 border: 1px solid gray;

 .selected-setting {
  background-color: darkgray;
 }
}
.graphsetting {
  font-size:0.75em;
}

.type-color-box {
    margin: 7px;
    margin-top: 4px;
    min-width: 15px;
    max-width: 15px;
    min-height: 15px;
    max-height: 15px;
}

.editGraphCard {
  border: 2px solid gray;
}
</style>
