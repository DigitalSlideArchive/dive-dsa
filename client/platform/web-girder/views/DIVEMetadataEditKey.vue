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
      type: [String, Number, Boolean] as PropType<string | number | boolean>,
      required: true,
    },
    setValues: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  },
  setup(props, { emit }) {
    const localValue = ref<number | string | boolean>(props.value);

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
    };

    // Watch for changes in the local values and call setDiveDatasetMetadataKey
    return {
      localValue,
      emitUpdate,
    };
  },
});
</script>

<template>
  <div>
    <div v-if="category === 'search'">
      <v-text-field v-model="localValue" label="Value" @change="emitUpdate(key, localValue)" />
    </div>
    <div v-else-if="metadataItem.category === 'numerical'">
      <v-text-field
        v-model.number="localValue"
        label="Value"
        type="number"
        @change="emitUpdate(key, localValue)"
      />
    </div>
    <div v-else-if="metadataItem.category === 'boolean'">
      <v-switch v-model="localValue" label="Value" @change="emitUpdate(key, localValue)" />
    </div>
    <div v-else-if="metadataItem.category === 'categorical'">
      <v-combobox
        v-model="localValue"
        label="Value"
        :items="setValues"
        @change="emitUpdate(key, localValue)"
      />
    </div>
  </div>
</template>
