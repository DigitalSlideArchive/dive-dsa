<script lang="ts">
import {
  computed,
  ref,
  defineComponent,
  Ref,
} from '@vue/composition-api';
import { timeline } from 'console';
import { type } from 'os';

import AttributeKeyFilterVue from 'vue-media-annotator/components/AttributeFilter/AttributeKeyFilter.vue';
import { AttributeKeyFilter, TimelineGraph } from 'vue-media-annotator/use/useAttributes';
import { useAttributesFilters, useAttributes } from '../provides';
import TooltipBtn from './TooltipButton.vue';


/* Magic numbers involved in height calculation */
export default defineComponent({
  name: 'AttributeTimeline',

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
  },

  setup() {
    const addEditTimelineDialog = ref(false);
    const defaultTimelineFilter = {
      appliedTo: ['all'],
      active: true, // if this filter is active
      value: true,
      type: 'key' as 'key',
    };
    const editTimelineFilter: Ref<AttributeKeyFilter> = ref({
      appliedTo: ['all'],
      active: true, // if this filter is active
      value: true,
      type: 'key' as 'key',
    });
    const editTimelineEnabled = ref(false);
    let originalName = 'default';
    const editTimelineName = ref('default');
    const {
      setTimelineEnabled, setTimelineFilter, removeTimelineFilter, timelineFilter, timelineEnabled,
    } = useAttributesFilters();
    const attributesList = useAttributes();
    const filterNames = computed(() => {
      const data = ['all'];
      return data.concat(attributesList.value.map((item) => item.name));
    });
    const timelineList = computed(() => {
      const list: Record<string, TimelineGraph> = {};
      Object.entries(timelineFilter.value).forEach(([key, filter]) => {
        list[key] = {
          filter,
          name: key,
          enabled: timelineEnabled.value[key],
        };
      });
      return list;
    });
    const addEditTimeline = (item?: TimelineGraph) => {
      addEditTimelineDialog.value = true;
      editTimelineName.value = item ? item.name : 'default';
      originalName = editTimelineName.value;
      editTimelineFilter.value = item ? item.filter : defaultTimelineFilter;
      editTimelineEnabled.value = item ? item.enabled : false;
    };

    const saveChanges = () => {
      if (editTimelineName.value !== originalName) {
        removeTimelineFilter(originalName);
      }
      setTimelineFilter(editTimelineName.value, editTimelineFilter.value);
      setTimelineEnabled(editTimelineName.value, editTimelineEnabled.value);
      addEditTimelineDialog.value = false;
    };

    const deleteFilter = (item: TimelineGraph) => {
      removeTimelineFilter(item.name);
    };

    return {
      setTimelineEnabled,
      setTimelineFilter,
      addEditTimelineDialog,
      editTimelineFilter,
      editTimelineName,
      editTimelineEnabled,
      filterNames,
      timelineList,
      saveChanges,
      addEditTimeline,
      deleteFilter,
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
          v-for="item in timelineList"
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
      width="650"
    >
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
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="addEditTimelineDialog = false"
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
</style>
