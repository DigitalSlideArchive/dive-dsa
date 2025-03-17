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
    const error = computed(() => props.data.error)
    const currentValue: Ref<XMLBaseValue> = ref(0);
    onMounted(() => {
        if (props.data.defaultValue && Array.isArray(props.data.defaultValue)) {
            currentValue.value = props.data.defaultValue.join(',') || props.data.value || '';
        } else {
            currentValue.value = props.data.defaultValue || props.data.value || '';
        }
    })
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
    }
    return {
      error,
      currentValue,
      validate,
    }
  }
});
</script>
<template>
  <div>
    <label for="parameterInput">{{ data.title }} <span
      v-if="error"
      class="text-red"
    > {{ error }}</span></label>
    <select
      :value="data.value"
      @change="validate($event)"
    >
      <option
        v-for="item in data.values"
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
