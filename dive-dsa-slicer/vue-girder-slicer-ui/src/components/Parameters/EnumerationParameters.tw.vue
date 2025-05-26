<script lang="ts">
import { PropType, Ref, computed, defineComponent, onMounted, ref } from 'vue'
import type { XMLBaseValue } from '../../parser/parserTypes';
import { XMLParameters } from '../../parser/parserTypes';
export default defineComponent({
  props: {
    data: {
      type: Object as PropType<XMLParameters>,
        required: true,
    }
  },
  setup(props, { emit }) {
    const error = computed(() => props.data.error);
    const disabledReason  = computed(() => props.data.disabled && props.data.disabledReason);
    const currentValue: Ref<XMLBaseValue> = ref(0);
    onMounted(() => {
        if (props.data.defaultValue && Array.isArray(props.data.defaultValue)) {
            currentValue.value = props.data.defaultValue.join(',') || props.data.value || '';
        } else {
            currentValue.value = props.data.defaultValue || props.data.value || '';
        }
    });
    const validate = (e: Event) => {
        // Validation Logic for different types
        const update = { ...props.data };
        let value = (e.target as HTMLSelectElement).value as XMLBaseValue;
        if (props.data.slicerType === 'number-enumeration') {
            value = parseFloat(value as string);
        }
        update.value = value;
        currentValue.value = value;
        emit('change', update);
    };
    const values = computed(() => {
      if (props.data.values && Array.isArray(props.data.values)) {
        if (props.data.value && typeof (props.data.value) === 'string' && !props.data.values.includes(props.data.value) ) {
          props.data.values.unshift(props.data.value);
        }
        return props.data.values;
      }
      return [];
    });
    return {
      error,
      values,
      currentValue,
      validate,
      disabledReason,
    }
  }
});
</script>
<template>
  <div>
    <label for="parameterInput">{{ data.title }} <span
      v-if="error"
      class="error-msg"
    > {{ error }}</span></label>
    <label for="parameterInput">{{ data.title }} <span
      v-if="disabledReason"
      class="warning-msg"
    > {{ disabledReason }}</span></label>
    <select
      :value="data.value"
      :disabled="!!disabledReason"
      @change="validate($event)"
      class="gsu-selection w-full py-1 px-2 mb-1 text-base leading-normal"
    >
      <option
        v-for="item in values"
        :key="`${data.title}_${item}`"
        :value="item"
      >
        {{ item }}
      </option>
    </select>
    <small
      v-if="data.description"
      class="block mt-1 text-grey"
    >{{ data.description }}</small>
  </div>
</template>
<style scoped>
</style>
