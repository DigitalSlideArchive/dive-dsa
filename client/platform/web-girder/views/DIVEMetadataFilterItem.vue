<script lang="ts">
import { MetadataFilterKeysItem } from 'platform/web-girder/api/divemetadata.service';
import {
  defineComponent, ref, PropType, watch,
} from 'vue';

export default defineComponent({
  name: 'DIVEMetadataFilterItem',
  props: {
    filterItem: {
      type: Object as PropType<MetadataFilterKeysItem>,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
  },
  setup(props, { emit }) {
    const set = ref(props.filterItem.set);
    const value = ref(undefined);
    const rangeFilterEnabled = ref(false);

    watch(value, () => {
      emit('update-value', value.value);
    });

    return {
      set,
      value,
      rangeFilterEnabled,
    };
  },
});
</script>

<template>
  <div class="mx-2">
    <div v-if="filterItem.category === 'categorical' && filterItem.count < 50 && set">
      <v-select
        v-model="value"
        :items="set"
        multiple
        chips
        clearable
        deletable-chips
        :label="label"
      />
    </div>
    <div v-else-if="filterItem.category === 'search' || (filterItem.category === 'categorical' && filterItem.count >= 50)">
      <v-text-field v-model="value" :label="label" />
    </div>
    <div v-else-if="filterItem.category === 'boolean'">
      <v-checkbox v-model="value" :label="label" />
    </div>
    <div v-else-if="filterItem.category === 'numerical' && filterItem.range">
      <v-slider v-model="value" :min="filterItem.range.min" :max="filterItem.range.max" :label="label" style="min-width: 250px;" />
    </div>
  </div>
</template>

<style scoped lang="scss">
</style>
