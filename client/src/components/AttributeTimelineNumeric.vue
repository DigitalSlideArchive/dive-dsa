<script lang="ts">
import {
  ref,
  defineComponent,
  Ref,
} from '@vue/composition-api';
import AttributeKeyFilterVue from 'vue-media-annotator/components/AttributeFilter/AttributeKeyFilter.vue';
import {
  TimelineGraph,
} from 'vue-media-annotator/use/AttributeTypes';
import AttributeLineGraph from './AttributeLineGraph.vue';
import { useAttributesFilters } from '../provides';
import TooltipBtn from './TooltipButton.vue';


/* Magic numbers involved in height calculation */
export default defineComponent({
  name: 'AttributeTimelineNumeric',

  props: {
    height: {
      type: Number,
      default: 200,
    },
    width: {
      type: Number,
      default: 300,
    },
  },

  components: {
    TooltipBtn,
    AttributeKeyFilter: AttributeKeyFilterVue,
    AttributeLineGraph,
  },

  setup() {
    const {
      setTimelineEnabled, setTimelineGraph, removeTimelineFilter,
      timelineGraphs,
    } = useAttributesFilters();
    const addEditTimelineDialog = ref(false);

    const currentlyEditingTimelineGraph: Ref<undefined | TimelineGraph> = ref();
    const addEditTimeline = (item?: TimelineGraph) => {
      if (item) {
        currentlyEditingTimelineGraph.value = item;
      } else {
        currentlyEditingTimelineGraph.value = {
          name: 'default',
          filter: {
            appliedTo: ['all'],
            active: true, // if this filter is active
            value: true,
            type: 'key' as 'key',
          },
          enabled: false,
        };
      }
      addEditTimelineDialog.value = true;
    };

    const deleteFilter = (item: TimelineGraph) => {
      removeTimelineFilter(item.name);
    };

    const closeTimelineDialog = () => {
      addEditTimelineDialog.value = false;
      currentlyEditingTimelineGraph.value = undefined;
    };

    return {
      setTimelineEnabled,
      setTimelineGraph,
      addEditTimeline,
      deleteFilter,
      timelineGraphs,
      addEditTimelineDialog,
      currentlyEditingTimelineGraph,
      closeTimelineDialog,
    };
  },
});
</script>

<template>
  <div>
    <v-card>
      <ul>
        <li>
          Display the selected attributes numberical values in the timeline
          for the currently selected track.
        </li>
        <li>Click on the Cog wheel to change which attributes to graph.</li>
        <li>
          The attributes graph button will be displayed near the "Detections" and
          "Events" button on the timeline.
        </li>
      </ul>
      <v-card-text>
        <v-row
          v-for="item in timelineGraphs"
          :key="item.name"
          dense
        >
          <v-checkbox
            class="my-0 ml-1 pt-0 mr-2"
            dense
            hide-details
            :input-value="item.enabled"
            @click="setTimelineEnabled(item.name, !item.enabled)"
          />
          <span>{{ item.name }}</span>
          <v-spacer />
          <tooltip-btn
            icon="mdi-cog"
            size="x-small"
            tooltip-text="Edit Settings of Filter"
            @click="addEditTimeline(item)"
          />
          <tooltip-btn
            icon="mdi-delete"
            color="error"
            size="x-small"
            tooltip-text="Delete Filter"
            @click="deleteFilter(item)"
          />
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="success"
          tooltip-text="Add Filter"
          @click="addEditTimeline()"
        >
          Add Timeline
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-dialog
      v-model="addEditTimelineDialog"
      width="800"
    >
      <attribute-line-graph
        v-if="currentlyEditingTimelineGraph !== undefined"
        :timeline-graph="currentlyEditingTimelineGraph"
        @close="closeTimelineDialog()"
      />
    </v-dialog>
  </div>
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
