<script lang="ts">
import { PropType, defineComponent, onMounted, ref, } from 'vue';
import type { XMLParameters } from '../parser/parserTypes';
import BaseParameter from './Parameters/BaseParameter.tw.vue';
import BooleanParameter from './Parameters/BooleanParameter.tw.vue';
import EnumerationParameters from './Parameters/EnumerationParameters.tw.vue';
import FileParameter from './Parameters/FileParameter.tw.vue';
import ColorParameter from './Parameters/ColorParameter.tw.vue';
export default defineComponent({
  components: {
    BaseParameter,
    BooleanParameter,
    EnumerationParameters,
    FileParameter,
    ColorParameter
  },
  props: {
    parameters: {
      type: Array as PropType<XMLParameters[]>,
      required: true
    }
  },
  setup(props, { emit }) {
    const baseParameters = ['string', 'number', 'vector', 'string-vector', 'number-vector']
    const paramCopy = ref(props.parameters);
    onMounted(() => {
      paramCopy.value = props.parameters;
    })
    const updateParameter = (data: XMLParameters, index: number) => {
      paramCopy.value.splice(index, 1, data);
      emit('change', paramCopy.value);
    }
    return {
      baseParameters,
      paramCopy,
      updateParameter,
    }
  }
});
</script>
<template>
  <span>
    <div
      v-for="(parameter, index) in paramCopy"
      :key="`${parameter.title}_${index}`"
    >
      <div class="flex flex-wrap">
        <div class="flex-growauto">
          <base-parameter 
            v-if="baseParameters.includes(parameter.type)"
            :data="parameter"
            @change="updateParameter($event, index)"
          />
          <boolean-parameter
            v-else-if="parameter.slicerType === 'boolean'"
            :data="parameter"
            @change="updateParameter($event, index)"
          />
          <enumeration-parameters
            v-else-if="parameter.slicerType === 'number-enumeration' || parameter.slicerType === 'string-enumeration'"
            :data="parameter"
            @change="updateParameter($event, index)"
          />
          <file-parameter
            v-else-if="['file', 'item', 'directory', 'image', 'multi'].includes(parameter.slicerType)"
            :data="parameter"
            @change="updateParameter($event, index)"
            @input-selected="$emit('input-selected', $event)"
          />
          <color-parameter
            v-else-if="parameter.slicerType === 'color'"
            :data="parameter"
            @change="updateParameter($event, index)"
          />
        </div>
      </div>
    </div>
  </span>
</template>
<style scoped>
a {
  color: #42b983;
}
</style>
