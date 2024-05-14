<script lang="ts">
import { defineComponent, ref, Ref } from 'vue';
import { GirderSlicerTasksIntegrated } from '@bryonlewis/vue-girder-slicer-cli-ui';
import { XMLParameters } from '@bryonlewis/vue-girder-slicer-cli-ui/dist/parser/parserTypes';
import { cloneDeep } from 'lodash';
import { getTaskDefaults } from 'platform/web-girder/api/dataset.service';
import { useDatasetId, useHandler } from 'vue-media-annotator/provides';
import { useStore } from 'platform/web-girder/store/types';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { JobResponse } from '@bryonlewis/vue-girder-slicer-cli-ui/dist/api/girderSlicerApi';
import { GirderJob } from '@girder/components/src';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { all } from '@girder/components/src/components/Job/status';

interface DefaultSlicerParam {
  fileId?: string;
  girderId:string;
  parentId: string;
  inputName: string;
  outputId: string;
}

const JobStatus = all();

export default defineComponent({
  name: 'SlicerTaskRunner',
  components: {
    GirderSlicerTasksIntegrated,
  },
  description: 'Slicer Task Runner',

  setup() {
    const datasetId = useDatasetId();
    const girderRest = useGirderRest();
    const handler = useHandler();
    const store = useStore();
    const { prompt } = usePrompt();
    const folderName = ref('');
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
      folderName.value = resp.data.folderName;
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
        if (param.type === 'directory' && param.channel === 'input') {
        // We want the video ID as an input to the system
          item.fileValue = {
            fileId: undefined,
            girderId: datasetId.value,
            name: folderName.value,
            parentId: datasetId.value,
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

    let interval: NodeJS.Timeout | null = null;

    const checkJobStatus = async (id: string) => {
      const resp = await girderRest.get<GirderJob>(`job/${id}`);
      if (resp.data.status === JobStatus.SUCCESS.value) {
        if (interval) {
          clearInterval(interval);
        }
        store.commit('Jobs/setJobState', {
          jobId: resp.data._id, value: resp.data.status,
        });
        const result = await prompt({
          title: 'Job Finished',
          text: [`Job: ${resp.data.title}`,
            'finished running on the current dataset.  Click reload to load the annotations.  The current annotations will be replaced with the Job output.',
          ],
          confirm: true,
          positiveButton: 'Reload',
          negativeButton: '',
        });
        if (result) {
          await handler.reloadAnnotations();
        }
      }
      if (resp.data.status === JobStatus.ERROR.value) {
        if (interval) {
          clearInterval(interval);
        }
        store.commit('Jobs/setJobState', {
          jobId: resp.data._id, value: resp.data.status,
        });
        await prompt({
          title: 'Job Incomplete',
          text: [`Job: ${resp.data.title}`,
            'either failed or was cancelled by the user',
          ],
        });
      }
    };

    const triggerRunTask = async (jobData: false | JobResponse) => {
      // We can now check the job status:
      store.dispatch('Jobs/updateJobs');
      if (jobData) {
        const jobId = jobData._id;
        // get Job status on internval until complete
        interval = setInterval(() => checkJobStatus(jobId), 5000);
      }
    };
    return {
      defaultFunc,
      triggerRunTask,
    };
  },
});
</script>

<template>
  <v-container fluid fill-height>
    <girder-slicer-tasks-integrated :defaults="defaultFunc" @run-task="triggerRunTask($event)" />
  </v-container>
</template>

<style scoped>
.slicer {
    min-height: 100%;
    height: 100%;
}
</style>
