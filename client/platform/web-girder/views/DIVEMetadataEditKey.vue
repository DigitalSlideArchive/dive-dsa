<script lang="ts">
import { MetadataFilterKeysItem } from 'platform/web-girder/api/divemetadata.service';
import {
  onMounted,
  defineComponent, ref, PropType,
} from 'vue';

export default defineComponent({
  props: {
    category: {
      type: String as PropType<MetadataFilterKeysItem['category']>,
      required: true,
    },
    value: {
      type: [String, Number, Boolean] as PropType<string | number | boolean | null>,
      default: () => null,
    },
    setValues: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  },
  setup(props, { emit }) {
    const localValue = ref<number | string | boolean | null>(props.value);
    const openDialog = ref(false);
    // Initialize local values
    const initialize = () => {
      // Set initial values based on the category
      if (props.category === 'numerical') {
        localValue.value = 0;
      } else if (props.category === 'search') {
        localValue.value = '';
      } else if (props.category === 'boolean') {
        localValue.value = false;
      }
    };

    onMounted(() => initialize);

    // Function to emit an update
    const emitUpdate = (value: number | string | boolean) => {
      emit('update', value);
      openDialog.value = false;
    };

    // Watch for changes in the local values and call setDiveDatasetMetadataKey
    return {
      localValue,
      emitUpdate,
      openDialog,
    };
  },
});
</script>

<template>
  <div>
    <span v-if="!openDialog"> <v-icon color="warning" class="mx-2" @click="openDialog = true">mdi-pencil</v-icon>{{ localValue }} </span>

    <div v-else-if="openDialog">
      <div v-if="category === 'search'">
        <v-text-field v-model="localValue" label="Value" @change="emitUpdate(key, localValue)" />
      </div>
      <div v-else-if="category === 'numerical'">
        <v-text-field
          v-model.number="localValue"
          label="Value"
          type="number"
          @change="emitUpdate(localValue)"
        />
      </div>
      <div v-else-if="category === 'boolean'">
        <v-switch v-model="localValue" label="Value" @change="emitUpdate(localValue)" />
      </div>
      <div v-else-if="category === 'categorical'">
        <v-combobox
          v-model="localValue"
          label="Value"
          :items="setValues"
          @change="emitUpdate(localValue)"
        />
      </div>
    </div>
  </div>
</template>
