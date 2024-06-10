<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  ref,
  defineComponent,
  Ref,
  PropType,
} from 'vue';
import AttributeKeyFilterVue from 'vue-media-annotator/components/AttributeFilter/AttributeKeyFilter.vue';
import {
  SwimlaneGraph,
  SwimlaneFilter,
  SwimlaneGraphSettings,
} from 'vue-media-annotator/use/AttributeTypes';
import {
  useAttributesFilters, useAttributes,
  useTrackStyleManager, useTrackFilters,
} from '../provides';
import TooltipBtn from './TooltipButton.vue';

/* Magic numbers involved in height calculation */
export default defineComponent({
  name: 'AttributeSwimlaneGraphGraph',
  components: {
    TooltipBtn,
    AttributeKeyFilter: AttributeKeyFilterVue,
  },
  props: {
    swimlaneGraph: {
      type: Object as PropType<SwimlaneGraph>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const {
      setSwimlaneEnabled, setSwimlaneGraph, removeSwimlaneFilter,
    } = useAttributesFilters();
    const attributesList = useAttributes();
    const showGraphSettings = ref(false);
    const showRangeSettings = ref(false);
    const showDisplaySettings = ref(false);
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const trackFilterControls = useTrackFilters();
    const types = computed(() => ['all', ...trackFilterControls.allTypes.value]);

    const editSwimlaneFilter: Ref<SwimlaneFilter> = ref(props.swimlaneGraph.filter);
    const editSwimlaneSettings: Ref<Record<string, SwimlaneGraphSettings>> = ref(props.swimlaneGraph.settings || {});
    const editSwimlaneenabled = ref(props.swimlaneGraph.enabled);
    const editSwimlaneDefault = ref(props.swimlaneGraph.default || false);
    const editSwimlaneDisplay: Ref<SwimlaneGraph['displaySettings']> = ref(props.swimlaneGraph.displaySettings || { display: 'static' as 'static' | 'selected', trackFilter: ['all'] });

    const originalName = props.swimlaneGraph.name;
    const originalDefault = props.swimlaneGraph.default || false;
    const editSwimlaneName = ref(props.swimlaneGraph.name || 'default');
    const filterNames = computed(() => {
      const data = ['all'];
      return data.concat(attributesList.value.filter((item) => item.belongs === 'detection').map((item) => item.name));
    });

    const editingGraphSettings = ref(false);

    const saveChanges = () => {
      if (editSwimlaneName.value !== originalName) {
        removeSwimlaneFilter(originalName);
      }
      let setDefault = false;
      if (editSwimlaneDefault.value && editSwimlaneDefault.value !== originalDefault) {
        // Go through the other timelines and make sure only one is set as the default
        setDefault = true;
      }
      const updateObject = {
        name: editSwimlaneName.value,
        filter: editSwimlaneFilter.value,
        enabled: editSwimlaneenabled.value,
        settings: editSwimlaneSettings.value,
        displaySettings: editSwimlaneDisplay.value,
        default: setDefault,
      };
      setSwimlaneGraph(editSwimlaneName.value, updateObject);
      setSwimlaneEnabled(editSwimlaneName.value, editSwimlaneenabled.value);
      emit('close');
    };

    const deleteChip = (item: string) => {
      if (editSwimlaneDisplay.value) {
        editSwimlaneDisplay.value.trackFilter.splice(editSwimlaneDisplay.value.trackFilter.findIndex((data) => data === item));
      }
    };

    return {
      setSwimlaneEnabled,
      setSwimlaneGraph,
      editSwimlaneDefault,
      editSwimlaneFilter,
      editSwimlaneName,
      editSwimlaneenabled,
      editSwimlaneDisplay,
      filterNames,
      saveChanges,
      deleteChip,
      typeStylingRef,
      types,
      //Graph Settings
      editingGraphSettings,
      editSwimlaneSettings,
      showGraphSettings,
      showRangeSettings,
      showDisplaySettings,
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
          v-model="editSwimlaneName"
          label="Timeline Name"
        />
      </v-row>
      <v-row>
        <v-switch
          v-model="editSwimlaneenabled"
          label="Enabled"
        />
      </v-row>
      <v-row>
        <attribute-key-filter
          :attribute-filter="editSwimlaneFilter"
          :filter-names="filterNames"
          timeline
          @save-changes="editSwimlaneFilter = ($event)"
        />
      </v-row>
      <div class="mt-4 pt-4">
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
            v-if="editSwimlaneDisplay"
            dense
          >
            <v-radio-group
              v-model="editSwimlaneDisplay.display"
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
              v-model="editSwimlaneDisplay.trackFilter"
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
      <v-row
        class="pt-2"
      >
        <p>
          One Timeline can be labeled and the Default timeline which will
          automatically be open when loading the dataset
        </p>
        <v-switch
          v-model="editSwimlaneDefault"
          label="Default Visible Timeline"
          class="pa-0 ma-0"
        />
      </v-row>
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
