<script lang="ts">
import { computed, defineComponent, ref } from "vue";
import SvgIcon from "@jamescoyle/vue-icon";
import Modal from './FileBrowser/Modal.tw.vue';
import GirderSlicerTaskMenu from "./GirderSlicerTaskMenu.tw.vue";
import RestClient from "../api/girderRest";
import { mdiAlert } from "@mdi/js";
import { PropType } from "vue/types/v3-component-props";
import { SlicerImage } from "../api/girderSlicerApi";
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
  setup(props, { emit }) {
    const modalOpen = ref(false);
    const girderRest = new RestClient({ apiRoot: props.apiUrl });
    const loggedIn = computed(() => girderRest?.token);

    const accept = () => {
        emit('selected', selectedId.value);
        modalOpen.value = false;
    };
    const selectedId = ref('');
    const selectedName = ref('');
    const processSelected = (data: { id: string, name: string }) => {
        selectedId.value = data.id;
        selectedName.value = data.name;
    }
    const selected = ref('');

    const clearSelection = () => {
      selectedId.value = '';
      selectedName.value = '';
      selected.value = '';
    }
    return {
        modalOpen,
        accept,
        processSelected,
        clearSelection,
        selected,
        selectedId,
        selectedName,
        loggedIn,
        mdiAlert,
    };
  },
});
</script>
<template>
<span>
    <button
        class="gsu-btn font-semibold py-2 px-4 rounded inline-flex items-center
        rounded-sm flex items-center min-w-32 border-2 border-solid border-borderColor"
        @click="modalOpen = true"
      >
      <span v-if="!loggedIn" class="pr-1 font-semibold flex-1">
        Log In
        <svg-icon style="display:inline" type="mdi" color="orange" :path="mdiAlert" :size="30" class="pb-1" />
      </span>
      <span v-else-if="!selectedName" class="pr-1 font-semibold flex-1">Choose Task</span>
      <span v-else-if="selectedName" class="pr-1 text-xs font-semibold flex-1">{{ selectedName }}</span>
    </button>
    <Modal 
    :isVisible="modalOpen"
    :disabled-confirm="!selectedName"
    @cancel="modalOpen =false; $emit('cancel')"
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
