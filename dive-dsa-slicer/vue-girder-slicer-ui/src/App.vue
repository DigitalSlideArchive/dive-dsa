<script lang="ts">
import { Ref, defineComponent, ref } from 'vue';
import GirderSlicerTaskButton from './components/GirderSlicerTaskButton.tw.vue';
import GirderSlicerTaskCard from './components/GirderSlicerTaskCard.tw.vue';
import GirderSlicerTaskMenu from './components/GirderSlicerTaskMenu.tw.vue';
import GirderSlicerTaskMenuModal from './components/GlicerSlicerTaskMenuModalButton.tw.vue';
import GirderSlicerTasksIntegrated from './components/GriderSlicerTasksIntegrated.tw.vue'
import DataBrowser from './components/FileBrowser/DataBrowser.tw.vue';
import Modal from './components/FileBrowser/Modal.tw.vue';
import type { GirderModel } from './girderTypes';
import { XMLParameters } from './parser/parserTypes';
import { SlicerTask } from './api/girderSlicerApi';


export default defineComponent({
  name: 'App',
  components: {
    GirderSlicerTaskButton,
    GirderSlicerTaskMenu,
    GirderSlicerTaskCard,
    GirderSlicerTaskMenuModal,
    GirderSlicerTasksIntegrated,
    DataBrowser,
    Modal,
  },
  props: {
    
  },
  setup() {
    const selected: Ref<string | null> = ref(null);

    const select = (id: string) => {
      selected.value = id;
    }
    const showBrowser = ref(false);

    const validate = (e: GirderModel) => {
      if (e.name.includes('jpg')) {
        return  { valid: true}
      } else {
        return {valid: false, msg: 'Item needs to be of type jpg'}
      }
    };

    const chanelDefaults = (item: XMLParameters) => {
      if (item.channel === 'input' && item.type === 'file') {
        item.fileValue = {
          fileId: '6433f9123b271b58c749ddbc',
          girderId: '6433f9123b271b58c749ddbb',
          name: 'SampleVideo.mp4',
          parentId: '6433f9113b271b58c749ddb6',
          regExp: false,
        }
        return item;
      }
      if (item.channel === 'output' && item.type === 'new-file') {
        item.fileValue = {
          fileId: undefined,
          girderId: '6433f9113b271b58c749ddb6',
          name: 'SampleFile.json',
          parentId: '6433f9113b271b58c749ddb6',
          regExp: false,
        }
        return item;
      }

    }

    const filter = (item: SlicerTask) => item.image.includes('dive');
    return {
      selected,
      select,
      showBrowser,
      validate,
      chanelDefaults,
      filter,
    };

  },
});
</script>

<template>
    <div
    class="card"
  >
    <div class="card-body">
      <div class="card-title justify-content-center row g-20"
>

  <div class="col">
    <!-- <girder-slicer-task-card :task-id="selected" />

    <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
    @click="showBrowser = true"
    >
    File Browser
  </button>
    <data-browser
      v-if="showBrowser"
      :validation="validate"
      type="file"
      @close="showBrowser=false"
    /> -->
    <girder-slicer-tasks-integrated :defaults="chanelDefaults" :filter="filter" />
    <!-- <girder-slicer-task-menu /> -->
    <!-- <girder-slicer-task-button @selected="select($event)" /> -->
  </div>
  </div>
  </div>
  </div>
</template>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin-top: 60px;
}
body {
  margin: 0;
  display: flex;
  place-items: center;
  align-content: center;
  min-width: 320px;
  min-height: 100vh;
  background-color: #4a4949;
}

</style>
