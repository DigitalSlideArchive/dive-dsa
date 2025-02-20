<script lang="ts">
import { MetadataFilterKeysItem } from 'platform/web-girder/api/divemetadata.service';
import {
  defineComponent, ref, PropType, watch, Ref,
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
    defaultValue: {
      type: [String, Number, Array, Boolean] as PropType<boolean | string | number | string[] | number[]>,
      default: undefined,
    },
    defaultEnabled: {
      type: Boolean,
      default: false,
    },
    categoricalLimit: {
      type: Number,
      default: 50,
    },
  },
  setup(props, { emit }) {
    const set = ref(props.filterItem.set);
    const value: Ref<undefined | boolean | number | string | string[] | number[]> = ref(props.defaultValue);
    const regEx: Ref<boolean | undefined> = ref();
    const rangeFilterEnabled = ref(false);
    const enabled = ref(props.defaultEnabled); // numerical enabled filter
    watch([value, enabled], () => {
      if (enabled.value) {
        if (value.value === undefined && props.filterItem.category === 'numerical' && props.filterItem.range) {
          value.value = [props.filterItem.range.min, props.filterItem.range.max];
        }
      }

      const update = {
        value: value.value,
        category: props.filterItem.category,
        regEx: regEx.value,
      };
      if (props.filterItem.category === 'categorical' && props.filterItem.unique > props.categoricalLimit) {
        update.category = 'search';
      }
      if (props.filterItem.category === 'numerical' && !enabled.value) {
        emit('clear-filter');
        return; // skip emitting the value unless the checkbox is enabled
      }
      console.log(update);
      emit('update-value', update);
    });
    if (enabled.value) {
      if (value.value === undefined && props.filterItem.category === 'numerical' && props.filterItem.range) {
        value.value = [props.filterItem.range.min, props.filterItem.range.max];
      }
      const update = {
        value: value.value,
        category: props.filterItem.category,
      };
      emit('update-value', update);
    }
    const toggleRegex = () => {
      if (regEx.value) {
        regEx.value = undefined;
      } else {
        regEx.value = true;
      }
    };
    return {
      set,
      value,
      rangeFilterEnabled,
      enabled,
      toggleRegex,
      regEx,
    };
  },
});
</script>

<template>
  <div class="mx-4">
    <div v-if="filterItem.category === 'categorical' && filterItem.unique || 0 < categoricalLimit && set">
      <v-row dense>
        <v-select
          v-model="value"
          :items="set"
          multiple
          chips
          clearable
          deletable-chips
          :label="label"
          hide-details
        />
      </v-row>
    </div>
    <div v-else-if="filterItem.category === 'search' || (filterItem.category === 'categorical' && filterItem.unique >= categoricalLimit)">
      <v-row dense class="pt-3">
        <v-text-field v-model="value" :label="label" hide-details />
        <v-tooltip
          open-delay="100"
          bottom
        >
          <template #activator="{ on }">
            <v-btn variant="plain" :ripple="false" icon :color="regEx ? 'blue' : ''" v-on="on" @click="toggleRegex()">
              <v-icon>
                mdi-regex
              </v-icon>
            </v-btn>
          </template>
          <span>Enable/Disable Regular Expressions</span>
        </v-tooltip>
      </v-row>
    </div>
    <div v-else-if="filterItem.category === 'boolean'">
      <v-checkbox v-model="value" :label="label" />
    </div>
    <div v-else-if="filterItem.category === 'numerical' && filterItem.range">
      <v-row dense align="center">
        <v-checkbox v-model="enabled" hide-details="" />
        <v-range-slider
          v-model="value"
          :min="filterItem.range.min"
          :max="filterItem.range.max"
          :disabled="!enabled"
          :label="label"
          style="min-width: 250px;"
          thumb-label="always"
          class="pt-7"
          hide-details=""
        />
      </v-row>
    </div>
  </div>
</template>

<style scoped lang="scss">
</style>
