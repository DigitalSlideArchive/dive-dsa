<script  lang="ts">
import { PropType, Ref, computed, defineComponent, onMounted, ref } from 'vue'
import { XMLParameters } from '../../parser/parserTypes';
import type { XMLBaseValue } from '../../parser/parserTypes';
export default defineComponent({
  props: {
    data: {
      type: Object as PropType<XMLParameters>,
        required: true,
    }
  },
  setup(props, { emit }) {
    const currentValue: Ref<XMLBaseValue> = ref(0);
    onMounted(() => {
        if (props.data.defaultValue && Array.isArray(props.data.defaultValue)) {
            currentValue.value = props.data.defaultValue.join(',') || props.data.value || '';
        } else {
            currentValue.value = props.data.defaultValue || props.data.value || '';
        }
    })
    const error = computed(() => props.data.error)
    const validate = (e: Event) => {
        // Validation Logic for different types
        const update = { ...props.data };
        let value = (e.target as HTMLInputElement).value as XMLBaseValue;
        update.value = value;
        currentValue.value = value;
        emit('change', update);
    }
    return {
      currentValue,
      error,
      validate
    }
  }
});
</script>
<template>
  <div class="mb-4">
    <label for="parameterInput">{{ data.title }} <span
      v-if="error"
      class="text-red"
    > {{ error }}</span></label>
    <input
      id="parameterInput"
      class="block appearance-none w-full py-1 px-2 mb-1 text-base leading-normal bg-white text-black dark:bg-gray-600 dark:text-gray-300 text-grey-darker border border-grey rounded"
      type="color"
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
