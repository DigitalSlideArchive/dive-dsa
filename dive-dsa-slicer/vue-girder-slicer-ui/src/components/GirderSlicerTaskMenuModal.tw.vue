<script lang="ts">
import { defineComponent,  ref } from "vue";
import SvgIcon from "@jamescoyle/vue-icon";
import Modal from './FileBrowser/Modal.tw.vue';
import GirderSlicerTaskMenu from "./GirderSlicerTaskMenu.tw.vue";
import { SlicerImage } from "../api/girderSlicerApi";
import { PropType } from "vue/types/v3-component-props";

export default defineComponent({
  components: {
    SvgIcon,
    Modal,
    GirderSlicerTaskMenu,
  },
  props: {
    apiUrl: {
      type: String,
      default: "api/v1",
    },
    filter: {
      type: Function as PropType<(task: SlicerImage) => boolean>,
      default: (_task: SlicerImage) => true,
    },
  },
  setup(_props, { emit }) {
    const accept = () => {
        emit('selected', selectedId.value);
    };
    const selectedId = ref('');
    const selectedName = ref('');
    const processSelected = (data: { id: string, name: string }) => {
        selectedId.value = data.id;
        selectedName.value = data.name;
    }
    const selected = ref('');
    return {
        accept,
        processSelected,
        selected,
        selectedId,
        selectedName,
    };
  },
});
</script>
<template>
<span>
    <Modal 
    :disabled-confirm="!selectedName"
    @cancel="$emit('cancel')"
    @confirm="accept()"
    >
        <template slot="header">
            <span>Task Selection</span>
        </template>
        <template slot="body">
            <GirderSlicerTaskMenu
            :api-url="apiUrl"
            :filter="filter"
            @selected="processSelected($event)"
            />
            <div v-if="selectedName" class="flex flex-row justify-items-center">
                <div class="ma-auto">
                    <span class="px-2">Selected:</span>
                    <span class="px-2" > {{  selectedName }}</span>
                </div>
            </div>
            </template> 
    </Modal>
</span>
</template>
<style scoped lang="scss">
.dropdown:hover > .dropdown-content {
	display: block;
}

</style>
