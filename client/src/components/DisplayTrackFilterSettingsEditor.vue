<script lang="ts">
import {
  computed,
  defineComponent,
  PropType,
} from 'vue';
import { DisplayTrackFilterSettings } from 'vue-media-annotator/use/AttributeTypes';
import { useTrackStyleManager } from '../provides';

export default defineComponent({
  name: 'DisplayTrackFilterSettingsEditor',
  props: {
    value: {
      type: Object as PropType<DisplayTrackFilterSettings>,
      required: true,
    },
    types: {
      type: Array as PropType<string[]>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const typeStylingRef = useTrackStyleManager().typeStyling;

    const displaySettings = computed({
      get: () => props.value,
      set: (val: DisplayTrackFilterSettings) => emit('input', val),
    });

    const deleteChip = (item: string) => {
      const nextFilter = displaySettings.value.trackFilter.filter((data) => data !== item);
      displaySettings.value = {
        ...displaySettings.value,
        trackFilter: nextFilter,
      };
    };

    return {
      displaySettings,
      typeStylingRef,
      deleteChip,
    };
  },
});
</script>

<template>
  <div>
    <v-row dense>
      <v-radio-group
        v-model="displaySettings.display"
        class="pr-2"
      >
        <v-radio
          label="Static"
          value="static"
          hint="Always show using the selected track"
          persistent-hint
        />
        <v-radio
          value="selected"
          label="Selected"
          hint="Only show when the selected track matches filter types"
          persistent-hint
        />
        <v-radio
          value="pinned"
          label="Pinned"
          hint="Always show a specific track, regardless of selection"
          persistent-hint
        />
      </v-radio-group>
      <v-select
        v-if="displaySettings.display === 'selected'"
        v-model="displaySettings.trackFilter"
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
      <v-text-field
        v-if="displaySettings.display === 'pinned'"
        v-model.number="displaySettings.pinnedTrackId"
        label="Pinned track ID"
        type="number"
        hint="Track ID to always display"
        persistent-hint
        class="mx-2"
        style="max-width:250px"
      />
    </v-row>
  </div>
</template>
