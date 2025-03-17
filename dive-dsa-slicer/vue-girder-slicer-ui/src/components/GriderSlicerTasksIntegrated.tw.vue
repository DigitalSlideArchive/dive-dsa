<script lang="ts">
import { Ref, defineComponent, ref, PropType } from 'vue';
import GirderSlicerTaskMenuModalButton from './GlicerSlicerTaskMenuModalButton.tw.vue';
import GirderSlicerTaskCard from './GirderSlicerTaskCard.tw.vue';
import type { XMLParameters } from '../parser/parserTypes';
import { SlicerImage } from '../api/girderSlicerApi';


export default defineComponent({
  name: 'GirderSlicerTasksIntegrated',
  components: {
    GirderSlicerTaskCard,
    GirderSlicerTaskMenuModalButton,
  },
  props: {
    apiUrl: {
      type: String,
      default: 'api/v1',
    },
    filter: {
      type: Function as PropType<(task: SlicerImage) => boolean>,
      default: (_task: SlicerImage) => true,
    },
    defaults: {
        type: Function as PropType<(item: XMLParameters) => undefined | null | XMLParameters>,
        default: (_item: XMLParameters) => undefined,
    }
  },
  setup() {
    const selected: Ref<string | null> = ref(null);
    const menuModelButton: Ref<typeof GirderSlicerTaskMenuModalButton | null> = ref(null);
    const select = (id: string) => {
      selected.value = id;
    }
    const cancel = () => {
      if (menuModelButton.value) {
        menuModelButton.value.clearSelection();
      }
      selected.value = null;
    }
    return {
      selected,
      select,
      cancel,
      menuModelButton,
    };

  },
});
</script>

<template>
    <div
    class="card"
    >
        <div class="card-body">
            <div class="card-title justify-content-center row g-20">
                <div class="col">
                    <girder-slicer-task-menu-modal-button
                        ref="menuModelButton"
                        :filter="filter"
                        @selected="select($event)"
                    />
                    <girder-slicer-task-card :task-id="selected" :defaults="defaults" @cancel="cancel()" @run-task="$emit('run-task', $event)" />
                </div>
            </div>
        </div>
  </div>
</template>

<style>

</style>
