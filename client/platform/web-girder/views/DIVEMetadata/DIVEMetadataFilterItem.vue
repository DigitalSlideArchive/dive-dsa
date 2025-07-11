<script lang="ts">
import { MetadataFilterKeysItem } from 'platform/web-girder/api/divemetadata.service';
import {
  defineComponent, ref, PropType, watch, Ref,
} from 'vue';

function getPrecision(num: number): number {
  if (!Number.isFinite(num)) return 0;
  const s = num.toString();
  if (s.includes('e-')) {
    const parts = s.split('e-');
    return parseInt(parts[1], 10);
  } if (s.includes('.')) {
    return s.split('.')[1].length;
  }
  return 0;
}

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
    regExValue: {
      type: Boolean,
      default: undefined,
    },
  },
  setup(props, { emit }) {
    const set = ref(props.filterItem.set);
    const value: Ref<undefined | boolean | number | string | string[] | number[]> = ref(props.defaultValue);
    const regEx: Ref<boolean | undefined> = ref(props.regExValue);
    const rangeFilterEnabled = ref(false);
    const enabled = ref(props.defaultEnabled); // numerical enabled filter
    const calculateInitialStepSize = (): number => {
      const precisions: number[] = [];

      const { range } = props.filterItem;
      if (range) {
        precisions.push(getPrecision(range.min));
        precisions.push(getPrecision(range.max));
      }

      if (Array.isArray(props.defaultValue)) {
        props.defaultValue.forEach((val) => {
          if (typeof val === 'number') {
            precisions.push(getPrecision(val));
          }
        });
      }

      const maxPrecision = Math.max(...precisions, 0);
      return 10 ** -maxPrecision;
    };
    const stepSize = ref(calculateInitialStepSize());
    const useTextInput = ref(false);

    watch(() => props.defaultEnabled, () => {
      enabled.value = props.defaultEnabled;
    });
    watch([value, enabled, regEx], () => {
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
      if (props.filterItem.range) {
        return; // skip emitting the value if it's a range filter so we can throttle by @end
      }
      emit('update-value', update);
    });
    const toggleRegex = () => {
      if (regEx.value) {
        regEx.value = undefined;
      } else {
        regEx.value = true;
      }
    };

    const sliderEmitValue = () => {
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
    };

    const updateSliderValue = (min: number, max: number) => {
      value.value = [min, max];
    };

    return {
      set,
      value,
      rangeFilterEnabled,
      enabled,
      toggleRegex,
      regEx,
      stepSize,
      useTextInput,
      updateSliderValue,
      sliderEmitValue,
    };
  },
});
</script>

<template>
  <div class="mx-4">
    <div v-if="filterItem.category === 'categorical' && filterItem.unique || 0 < categoricalLimit && set?.length">
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
      <v-row dense align="center" class="mt-2">
        <v-menu
          open-on-hover
          location="bottom"
          open-delay="250"
          nudge-bottom="30"
        >
          <template #activator="{ on }">
            <v-checkbox
              v-model="enabled"
              hide-details
            />
            <v-btn class="mt-5" v-on="on">
              {{ label }}
            </v-btn>
          </template>
          <v-card>
            <v-list>
              <v-list-item-title>Step Size</v-list-item-title>
              <v-list-item
                v-for="step in [1, 0.1, 0.01, 0.001]"
                :key="step"
                @click="stepSize = step"
              >
                <v-list-item-title>
                  {{ step }}
                  <v-icon v-if="stepSize === step" class="ml-2" color="primary">
                    mdi-check
                  </v-icon>
                </v-list-item-title>
              </v-list-item>
              <v-divider />
              <v-list-item @click="useTextInput = !useTextInput">
                <v-list-item-title>
                  {{ useTextInput ? 'Use Slider Input' : 'Use Text Input' }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>

        <template v-if="!useTextInput && enabled">
          <v-range-slider
            v-model="value"
            :min="filterItem.range.min"
            :max="filterItem.range.max"
            :step="stepSize"
            :disabled="!enabled"
            style="min-width: 250px;"
            thumb-label="always"
            class="pt-7 pl-2"
            hide-details
            @end="sliderEmitValue"
          />
        </template>
        <template v-else-if="enabled && Array.isArray(value) && value.length === 2">
          <v-text-field
            v-model.number="value[0]"
            :disabled="!enabled"
            label="Min"
            type="number"
            hide-details
            class="mx-2"
            style="width: 100px"
          />
          <v-text-field
            v-model.number="value[1]"
            :disabled="!enabled"
            label="Max"
            type="number"
            hide-details
            class="mx-2"
            style="width: 100px"
          />
        </template>
      </v-row>
    </div>
  </div>
</template>

<style scoped lang="scss">
</style>
