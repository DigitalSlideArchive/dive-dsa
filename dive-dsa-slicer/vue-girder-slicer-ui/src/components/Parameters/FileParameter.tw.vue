<script lang="ts">
import { PropType, Ref, computed, defineComponent, onMounted, ref, watch } from 'vue'
import { XMLParameters } from '../../parser/parserTypes';
import { mdiFolderOpen, mdiPlusThick } from '@mdi/js';
import SvgIcon from '@jamescoyle/vue-icon';
import DataBrowser from '../FileBrowser/DataBrowser.tw.vue';
export default defineComponent({
  components: {
    SvgIcon,
    DataBrowser,
  },
  props: {
    data: {
      type: Object as PropType<XMLParameters>,
        required: true,
    }
  },
  setup(props, { emit }) {
    const currentValue: Ref<string |  null> = ref(null);
    const placeHolder = ref('Choose a file...');
    const batchload = ref(false);
    const error = computed(() => props.data.error)
    onMounted(() => {
      if (props.data.slicerType === 'file') {
        placeHolder.value = !props.data.multiple ?  'Choose a file...' : 'Choose multiple files...'
      }
      if (props.data.slicerType === 'multi') {
        placeHolder.value = 'Choose multiple files...'
      }
      if (props.data.slicerType === 'image') {
        placeHolder.value = !props.data.multiple ?  'Choose an image...' : 'Choose multiple images...'
      }
      if (props.data.slicerType === 'directory') {
        placeHolder.value = !props.data.multiple ?  'Choose a folder...' : 'Choose multiple folders...'
      }
      if (['file', 'item', 'image', 'multi'].includes(props.data.slicerType) && !props.data.multiple) {
        batchload.value = true;
      }
      if (props.data.fileValue?.name) {
        currentValue.value = props.data.fileValue.name;
        girderId.value = props.data.fileValue.girderId;
        parentId.value = props.data.fileValue.parentId;
        selectedName.value = props.data.fileValue.name;
      }
    });
    const showBrowser = ref(false);
    const inputChanged = (name: string) => {
      emit('input-selected', name);
    }
    const girderId: Ref<string | undefined> = ref(undefined);
    const parentId: Ref<string | undefined> = ref(undefined);
    const selectedName: Ref<string | undefined> = ref(undefined);
    watch(() => props.data.fileValue, () => {
      if (props.data.fileValue?.name) {
        currentValue.value = props.data.fileValue.name;
        girderId.value = props.data.fileValue.girderId;
        parentId.value = props.data.fileValue.parentId;
        selectedName.value = props.data.fileValue.name;
      }
    });
    const acceptBrowser = ({name, girderId, parentId, regExp, fileId}: {name: string, girderId: string, parentId: string, regExp?: boolean, fileId?: string}) => {
      showBrowser.value = false;
      const update = { ...props.data };
      update.fileValue = { name, girderId, parentId, regExp, fileId };
      currentValue.value = name;
      if (props.data.channel === 'input') {
        inputChanged(name);
      }
      emit('change', update);
    }
    return {
      error,
      currentValue,
      placeHolder,
      showBrowser,
      mdiFolderOpen,
      mdiPlusThick,
      batchload,
      girderId,
      parentId,
      selectedName,
      acceptBrowser,
    } 
  }
});
</script>
<template>
  <div class="pr-4">
    <label for="parameterInput">{{ data.title }} <span
      v-if="error"
      class="text-red"
    > {{ error }}</span></label>
    <div class="relative flex items-stretch w-full">
      <input
        id="parameterInput"
        class="gsu-input block border-colid border-2 border-borderColor appearance-none w-full py-1 px-2 mb-1 text-base leading-normal"
        type="text"
        disabled
        :value="currentValue"
        :placeholder="placeHolder"
      >
      <span class="sm:flex">
        <button
          type="button"
          class="inline-block align-middle text-center select-none border font-normal whitespace-no-wrap py-2 mb-1 px-4 rounded text-base leading-normal no-underline select-btn"
          @click="showBrowser = true"
        >
          <svg-icon
            type="mdi"
            :path="mdiFolderOpen"
            :size="15"
            class="gsu-icon gsu-clickable"
          />
        </button>
        <button
          v-if="!batchload"
          type="button"
          class="flex align-middle items-center text-center select-none border font-normal whitespace-no-wrap py-2 mb-1 px-4 rounded text-base leading-normal no-underline select-btn-multi"
          @click="showBrowser = true"
        >
          <svg-icon
            type="mdi"
            :path="mdiFolderOpen"
            :size="15"
            class="gsu-icon gsu-clickable "
          />
          <svg-icon
            type="mdi"
            :path="mdiPlusThick"
            :size="15"
            class="gsu-icon gsu-clickable"
          />
        </button>
      </span>
    </div>
    <small
      v-if="data.description"
      class="block mt-1 text-grey"
    >{{ data.description }}</small>
    <data-browser
      v-if="showBrowser"
      :type="data.type"
      :output="data.channel === 'output' || data.type === 'new-file'"
      :girder-id="girderId"
      :parent-id="parentId"
      :name="selectedName"
      @close="showBrowser=false"
      @submit="acceptBrowser($event)"
    />
  </div>
</template>
<style scoped>
.icon {
  color: var(--bs-heading-color);
}
.select-btn {
  border: 1px solid gray;
  border-radius: 0px;
}
.select-btn:hover {
  border: 1px solid gray;
  background-color: lightgray;
}
.select-btn-multi {
  border: 1px solid gray;
  border-radius: 0px 4px 4px 0px;
}
.select-btn-multi:hover {
  border: 1px solid gray;
  background-color: lightgray;
}
</style>
