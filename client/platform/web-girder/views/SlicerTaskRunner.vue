<script lang="ts">
import { defineComponent, ref, Ref } from 'vue';
import { GirderSlicerTasksIntegrated } from '@bryonlewis/vue-girder-slicer-cli-ui';
import { XMLParameters } from '@bryonlewis/vue-girder-slicer-cli-ui/dist/parser/parserTypes';
import { cloneDeep } from 'lodash';
import { getTaskDefaults } from 'platform/web-girder/api/dataset.service';
import { useDatasetId } from 'vue-media-annotator/provides';

interface DefaultSlicerParam {
  fileId?: string;
  girderId:string;
  parentId: string;
  inputName: string;
  outputId: string;
}

export default defineComponent({
  name: 'SlicerTaskRunner',
  components: {
    GirderSlicerTasksIntegrated,
  },
  description: 'Slicer Task Runner',

  setup() {
    const datasetId = useDatasetId();
    const defaults: Ref<DefaultSlicerParam> = ref({
      fileId: '',
      girderId: '',
      parentId: '',
      inputName: '',
      name: '',
      outputId: '',
    });
    const getDefaults = async () => {
      const resp = await getTaskDefaults(datasetId.value);
      console.log(resp.data);
      if (resp.data.video) {
        defaults.value = {
          fileId: resp.data.video.fileId,
          parentId: datasetId.value,
          girderId: resp.data.video.id,
          inputName: resp.data.video.filename,
          outputId: datasetId.value,
        };
      }
    };
    getDefaults();
    const defaultFunc = (param: XMLParameters) => {
      if (defaults.value.fileId) {
        const item = cloneDeep(param);
        if (param.type === 'file' && param.channel === 'input') {
        // We want the video ID as an input to the system
          item.fileValue = {
            fileId: defaults.value.fileId,
            girderId: defaults.value.girderId,
            name: defaults.value.inputName,
            parentId: defaults.value.parentId,
            regExp: false,
          };
          return item;
        }
        if (item.channel === 'output' && item.type === 'new-file') {
          item.fileValue = {
            fileId: undefined,
            girderId: defaults.value.girderId,
            name: 'OutputTracks.json',
            parentId: defaults.value.parentId,
            regExp: false,
          };
          return item;
        }
      }
      return null;
    };
    return {
      defaultFunc,
    };
  },
});
</script>

<template>
  <v-container fluid fill-height>
    <girder-slicer-tasks-integrated :defaults="defaultFunc" />
  </v-container>
</template>

<style scoped>
.slicer {
    min-height: 100%;
    height: 100%;
}
</style>
