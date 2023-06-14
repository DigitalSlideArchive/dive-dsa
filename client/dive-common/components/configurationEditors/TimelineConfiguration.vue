<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, Ref, computed,
} from '@vue/composition-api';
import { TimelineConfiguration, TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import { useTimelineFilters, useAttributesFilters } from 'vue-media-annotator/provides';
import { FilterTimeline } from 'vue-media-annotator/use/useTimelineFilters';

export default defineComponent({
  name: 'TimelineConfiguration',
  components: {
  },
  props: {
    timelineConfig: {
      type: Object as PropType<TimelineConfiguration>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const baseHeight = ref(props.timelineConfig.maxHeight || 300);
    const editingTimeline = ref(false);
    const currentEditIndex = ref(-1);
    const currentEditName = ref('');
    const currentEditOrder = ref(0);
    const currentEditMaxHeight = ref(300);
    const currentEditDismissable = ref(false);
    const currentEditType: Ref<TimelineDisplay['type']> = ref('event');
    const timelineFilters = useTimelineFilters();
    const { timelineGraphs, swimlaneGraphs } = useAttributesFilters();

    const availableTimelines = computed(() => {
      const base: {name: string; type: TimelineDisplay['type']}[] = [{ name: 'event', type: 'event' }, { name: 'detections', type: 'detections' }];
      timelineFilters.timelines.value.forEach((timeline) => {
        base.push({ name: timeline.name, type: 'filter' });
      });
      Object.entries(timelineGraphs.value).forEach(([name, _val]) => {
        base.push({ name, type: 'graph' });
      });
      Object.entries(swimlaneGraphs.value).forEach(([name, _val]) => {
        base.push({ name, type: 'swimlane' });
      });
      const filtered = base.filter((item) => (props.timelineConfig.timelines.findIndex((timeline) => (timeline.name === item.name)) === -1));
      return filtered;
    });

    const editTimeline = (index: number) => {
      editingTimeline.value = true;
      if (index !== -1) {
        currentEditIndex.value = index;
        currentEditName.value = props.timelineConfig.timelines[index].name;
        currentEditMaxHeight.value = props.timelineConfig.timelines[index].maxHeight || 300;
        currentEditDismissable.value = props.timelineConfig.timelines[index].dismissable;
        currentEditOrder.value = props.timelineConfig.timelines[index].order;
      } else {
        currentEditIndex.value = 0;
      }
    };

    const cancel = () => {
      editingTimeline.value = false;
      currentEditIndex.value = -1;
    };

    const save = () => {
      // Emit up the saved value to make sure it is set as a new option.
      const updateData: TimelineDisplay = {
        name: currentEditName.value,
        order: currentEditOrder.value,
        dismissable: currentEditDismissable.value,
        type: currentEditType.value,
        maxHeight: currentEditMaxHeight.value,
      };
      emit('update-timeline', { index: currentEditIndex.value, data: updateData });
      editingTimeline.value = false;
      currentEditIndex.value = -1;
    };

    const deleteTimeline = (index: number) => {
      emit('delete-timeline', index);
    };

    const addTimeline: Ref<{name: string; type: TimelineDisplay['type']} | null> = ref(null);

    return {
      currentEditIndex,
      currentEditName,
      currentEditType,
      editingTimeline,
      currentEditDismissable,
      currentEditMaxHeight,
      currentEditOrder,
      editTimeline,
      save,
      cancel,
      deleteTimeline,
      availableTimelines,
      addTimeline,
      baseHeight,
    };
  },
});
</script>

<template>
  <v-card>
    <h2>Filter Timelines</h2>
    <v-row dense>
      <v-select
        v-model="addTimeline"
        :items="availableTimelines"
        item-text="name"
        label="Timeline"
      >
        <template v-slot:item="{ item }">
          <span>Name: {{ item.name }} Type: {{ item.type }} </span>
        </template>
      </v-select>
      <v-btn
        @click="$emit('add-timeline', addTimeline)"
      >
        Add Timeline
      </v-btn>
    </v-row>
    <v-row dense>
      <v-text-field
        v-model.number="baseHeight"
        label="Max Timeline Area Height"
      />
    </v-row>
    <v-row
      v-for="(timeline, index) in timelineConfig.timelines"
      :key="timeline.name"
      dense
    >
      <v-col>
        {{ timeline.name }}
      </v-col>
      <v-col>
        <span>Height:</span>
        {{ timeline.maxHeight }}
      </v-col>
      <v-spacer />
      <v-col>
        <v-icon @click="editTimeline(index)">
          mdi-pencil
        </v-icon>
        <v-icon
          color="error"
          @click="deleteTimeline(index)"
        >
          mdi-delete
        </v-icon>
      </v-col>
    </v-row>
    <div v-if="editingTimeline">
      <v-card>
        <v-row dense>
          <span> Name: {{ currentEditName }}</span>
          <span> Type: {{ currentEditType }}</span>
        </v-row>
        <v-row dense>
          <v-text-field
            v-model.number="currentEditMaxHeight"
            label="Max Height"
          />
          <v-text-field
            v-model.number="currentEditOrder"
            label="Order"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="currentEditDismissable"
            label="Dismissable"
          />
        </v-row>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="cancel()"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="save()"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </v-card>
</template>

<style lang="scss">
</style>
