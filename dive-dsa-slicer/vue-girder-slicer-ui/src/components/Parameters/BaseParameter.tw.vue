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
    const numberVectors = ref(['integer-vector', 'float-vector', 'double-vector', 'string-vector']);
    const numbers = ref(['integer', 'float', 'double']);
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
        let value = (e.target as HTMLInputElement).value as XMLBaseValue;
        if (numberVectors.value.includes(props.data.slicerType)) {
            value = (value as string).split(',').map(parseFloat);
        } else if (props.data.slicerType === 'string-vector') {
            value = (value as string).split(',');
        }
        update.value = value;
        currentValue.value = value;
        emit('change', update);
    }
    return {
      error,
      numberVectors,
      numbers,
      currentValue,
      validate
    }
  }
})
</script>
<template>
  <div>
    <label for="parameterInput">{{ data.title }} <span
      v-if="error"
      class="text-red"
    > {{ error }}</span></label>
    <input
      v-if="numbers.includes(data.slicerType) || data.slicerType === 'string'"
      id="parameterInput"
      class="gsu-input block appearance-none w-full py-1 px-2 mb-1 text-base leading-normal"
      :type="numbers.includes(data.slicerType) ? 'number' : 'text'"
      :value="currentValue"
      @change="validate($event)"
    >
    <input
      v-else-if="(numberVectors.includes(data.slicerType) || data.slicerType === 'string-vector')"
      id="parameterInput"
      class="gsu-input block appearance-none w-full py-1 px-2 mb-1 text-base leading-normal"
      type="text"
      :value="currentValue"
      @change="validate($event)"
    >
    <small
      v-if="data.description"
      class="block mt-1 text-grey"
    >{{ data.description }}</small>
  </div>
</template>
<style scoped>
</style>
