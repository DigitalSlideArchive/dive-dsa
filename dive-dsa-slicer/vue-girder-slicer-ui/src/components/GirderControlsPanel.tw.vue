<script lang="ts">
import { PropType, defineComponent, ref } from 'vue'
import { mdiChevronDown, mdiChevronUp } from '@mdi/js' ;
import SvgIcon from '@jamescoyle/vue-icon';
import type { XMLPanel, XMLParameters } from '../parser/parserTypes';
import GirderSlicerParameter from './GirderSlicerParameter.tw.vue';
export default defineComponent({
  components: {
    GirderSlicerParameter,
    SvgIcon,
  },
  props: {
    panel: {
    type: Object as PropType<XMLPanel>,
    required: true,
    },
    collapseOverride: {
      type: Boolean,
      required: false,
    }
  },
  setup(props, { emit }) {
  const collapsed = ref(props.panel.advanced)
  const updateParams = (e: XMLParameters[]) =>{
    emit('change', e);
  };
  return {
    collapsed,
    updateParams,
    mdiChevronDown,
    mdiChevronUp,
  }
}
});
</script>
<template>
  <div class="gsu-card relative flex flex-col min-w-0 rounded break-words">
    <div
      v-if="panel.groups.length === 1"
      class="mb-3 mb-0"
    >
      <div
        class="flex flex-wrap justify-content-left g-0"
        @click="collapsed = !collapsed"
      >
        <div class=":flex-growauto">
          <svg-icon
            type="mdi"
            :path="collapsed ? mdiChevronUp : mdiChevronDown"
            :size="30"
            class="pb-2 icon"
          />
        </div>
        <div class=":flex-growauto">
          <h5>
            {{ panel.groups[0].label }}
          </h5>
        </div>
      </div>
      <div
        v-if="!collapsed"
        class="flex flex-wrap pad-left"
      >
        <girder-slicer-parameter
          :parameters="panel.groups[0].parameters"
          @change="updateParams($event)"
          @input-selected="$emit('input-selected', $event)"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.icon:hover {
  cursor: pointer;
}
.collapse-enter-active {
  animation: collapsing reverse 500ms ease;
}
.collapse-leave-active {
  animation: collapsing 500ms ease;
}
.pad-left {
  padding-left: 15px;
}
@keyframes collapsing {
  from {
    max-height: 1000px;
  }
  to {
    max-height: 0px;
  }
}
</style>
