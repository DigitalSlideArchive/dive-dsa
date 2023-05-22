<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  ref,
  defineComponent,
  Ref,
  PropType,
  del as VueDel,
} from '@vue/composition-api';
import AttributeKeyFilterVue from 'vue-media-annotator/components/AttributeFilter/AttributeKeyFilter.vue';
import {
  SwimlaneGraph,
  SwimlaneFilter,
  SwimlaneGraphSettings,
} from 'vue-media-annotator/use/AttributeTypes';
import { LineChartData } from 'vue-media-annotator/use/useLineChart';
import { useAttributesFilters, useAttributes } from '../provides';
import TooltipBtn from './TooltipButton.vue';


/* Magic numbers involved in height calculation */
export default defineComponent({
  name: 'AttributeSwimlaneGraphGraph',
  props: {
    swimlaneGraph: {
      type: Object as PropType<SwimlaneGraph>,
      required: true,
    },
  },
  components: {
    TooltipBtn,
    AttributeKeyFilter: AttributeKeyFilterVue,
  },
  setup(props, { emit }) {
    const {
      setSwimlaneEnabled, setSwimlaneGraph, removeSwimlaneFilter,
    } = useAttributesFilters();
    const attributesList = useAttributes();
    const showGraphSettings = ref(false);
    const showRangeSettings = ref(false);

    const editSwimlaneFilter: Ref<SwimlaneFilter> = ref(props.swimlaneGraph.filter);
    const editSwimlaneSettings: Ref<Record<string, SwimlaneGraphSettings>> = ref(props.swimlaneGraph.settings || {});
    const editSwimlaneenabled = ref(props.swimlaneGraph.enabled);
    const editSwimlaneDefault = ref(props.swimlaneGraph.default || false);
    const originalName = props.swimlaneGraph.name;
    const originalDefault = props.swimlaneGraph.default || false;
    const editSwimlaneName = ref(props.swimlaneGraph.name || 'default');
    const filterNames = computed(() => {
      const data = ['all'];
      return data.concat(attributesList.value.filter((item) => item.belongs === 'detection' && item.datatype !== 'number').map((item) => item.name));
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
        default: setDefault,
      };
      setSwimlaneGraph(editSwimlaneName.value, updateObject);
      setSwimlaneEnabled(editSwimlaneName.value, editSwimlaneenabled.value);
      emit('close');
    };

    return {
      setSwimlaneEnabled,
      setSwimlaneGraph,
      editSwimlaneDefault,
      editSwimlaneFilter,
      editSwimlaneName,
      editSwimlaneenabled,
      filterNames,
      saveChanges,
      //Graph Settings
      editingGraphSettings,
      editSwimlaneSettings,
      showGraphSettings,
      showRangeSettings,
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
      <v-row
        class="pt-2"
      >
        <p>
          One Timeline can be labeled ad the Default timeline which will
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
