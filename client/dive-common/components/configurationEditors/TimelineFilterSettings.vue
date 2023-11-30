<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, Ref, computed,
} from 'vue';
import { useTrackFilters, useTrackStyleManager } from 'vue-media-annotator/provides';
import { FilterTimeline } from 'vue-media-annotator/use/useTimelineFilters';
import AttributeFilter from '../ActionEditors/AttributeFilter.vue';

export default defineComponent({
  name: 'FilterTimelines',
  components: {
    AttributeFilter,
  },
  props: {
    filterTimelines: {
      type: Array as PropType<FilterTimeline[]>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const trackFilterControls = useTrackFilters();
    const types = computed(() => trackFilterControls.allTypes.value);

    const editingTimeline = ref(false);
    const currentEditIndex = ref(-1);
    const currentEditName = ref('');
    const currentEditEnabled = ref(false);
    const currentEditTypeFilter: Ref<string[]> = ref([]);
    const currentEditFrameRange: Ref<number[]> = ref([]);
    const currentEditConfidenceFilter: Ref<number> = ref(-1);
    const currentEditType: Ref<FilterTimeline['type']> = ref('swimlane');
    const currentEditAttributes: Ref<FilterTimeline['attributes']> = ref({});

    const editTimeline = (index: number) => {
      editingTimeline.value = true;
      if (index !== -1) {
        currentEditIndex.value = index;
        currentEditName.value = props.filterTimelines[index].name;
        currentEditEnabled.value = props.filterTimelines[index].enabled || false;
        currentEditTypeFilter.value = props.filterTimelines[index].typeFilter || [];
        currentEditFrameRange.value = props.filterTimelines[index].frameRange || [];
        currentEditConfidenceFilter.value = props.filterTimelines[index].confidenceFilter || -1;
        currentEditType.value = props.filterTimelines[index].type;
        currentEditAttributes.value = props.filterTimelines[index].attributes || {};
      } else {
        currentEditIndex.value = 0;
      }
    };
    const deleteChip = (item: string) => {
      currentEditTypeFilter.value.splice(currentEditTypeFilter.value.findIndex((data) => data === item));
    };

    const cancel = () => {
      editingTimeline.value = false;
      currentEditIndex.value = -1;
    };

    const save = () => {
      // Emit up the saved value to make sure it is set as a new option.
      const updateData: FilterTimeline = {
        name: currentEditName.value,
        enabled: currentEditEnabled.value,
        typeFilter: currentEditTypeFilter.value,
        frameRange: currentEditFrameRange.value,
        attributes: currentEditAttributes.value,
        confidenceFilter: currentEditConfidenceFilter.value,
        type: 'swimlane',
      };
      emit('update-timeline', { index: currentEditIndex.value, data: updateData });
      editingTimeline.value = false;
      currentEditIndex.value = -1;
    };

    const deleteTimeline = (index: number) => {
      emit('delete-timeline', index);
    };

    return {
      currentEditIndex,
      currentEditConfidenceFilter,
      currentEditName,
      currentEditEnabled,
      currentEditTypeFilter,
      currentEditFrameRange,
      currentEditType,
      currentEditAttributes,
      editingTimeline,
      editTimeline,
      typeStylingRef,
      deleteChip,
      types,
      save,
      cancel,
      deleteTimeline,
    };
  },
});
</script>

<template>
  <v-card>
    <h2>Filter Timelines</h2>
    <v-btn
      @click="$emit('add-timeline')"
    >
      Add Timeline
    </v-btn>
    <v-row
      v-for="(timeline, index) in filterTimelines"
      :key="timeline.name"
      dense
    >
      <v-col>
        {{ timeline.name }}
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
      <v-card
        class="pa-3"
        style="border: 2px solid white"
      >
        <v-row dense>
          <v-text-field
            v-model="currentEditName"
            label="Name"
          />
          <v-switch
            v-model="currentEditEnabled"
            label="Enabled"
          />
        </v-row>
        <v-row dense>
          <v-text-field
            v-model.number="currentEditConfidenceFilter"
            label="Confidence Filter"
          />
        </v-row>
        <v-row dense>
          <v-col class="mx-3">
            <v-select
              v-model="currentEditTypeFilter"
              :items="types"
              multiple
              clearable
              deletable-chips
              chips
              label="Filter Types"
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
          </v-col>
        </v-row>
        <v-row
          v-if="currentEditAttributes"
          dense
        >
          <attribute-filter
            :data="currentEditAttributes"
            @update="currentEditAttributes = $event"
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
