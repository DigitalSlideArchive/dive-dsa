<script lang="ts">
import { defineComponent, ref, Ref } from 'vue';
import { GirderSlicerTasksIntegrated } from 'vue-girder-slicer-cli-ui';
import { XMLParameters } from 'vue-girder-slicer-cli-ui/dist/parser/parserTypes';
import { cloneDeep } from 'lodash';
import { getTaskDefaults } from 'platform/web-girder/api/dataset.service';
import {
  useDatasetId, useHandler, useLatestRevisionId,
} from 'vue-media-annotator/provides';
import { useStore } from 'platform/web-girder/store/types';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { JobResponse, SlicerTask } from 'vue-girder-slicer-cli-ui/dist/api/girderSlicerApi';
import { GirderJob } from '@girder/components/src';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { all } from '@girder/components/src/components/Job/status';
import { getLatestRevision } from 'platform/web-girder/api/annotation.service';

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
    const latestRevisionId = useLatestRevisionId();
    const handler = useHandler();
    const store = useStore();
    const { prompt } = usePrompt();
    const folderName = ref('');
    const dialog = ref(false);
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
        if (param.type === 'file' && param.channel === 'input' && param.id === 'DIVEVideo') {
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
        if (param.type === 'directory' && param.id === 'DIVEDirectory') {
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
        // Check the Revision history and see if the latest revision is > than the stored current one
        const revisions = (await getLatestRevision(datasetId.value)).data;
        if (revisions.length > 0) {
          if (latestRevisionId.value < revisions[0].revision) {
            const result = await prompt({
              title: 'Job Finished',
              text: [`Job: ${resp.data.title}`,
                'finished running on the current dataset.',
                '',
                'New Annotations were found',
                'Click reload to load the annotations.  The current annotations will be replaced with the Job output.',
              ],
              confirm: true,
              positiveButton: 'Reload',
              negativeButton: 'Cancel',
            });
            if (result) {
              await handler.reloadAnnotations();
            }
          }
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
    const filter = (item: SlicerTask) => item.image.toLocaleLowerCase().includes('dive') || item.description.toLocaleLowerCase().includes('dive');

    return {
      defaultFunc,
      triggerRunTask,
      filter,
      dialog,
    };
  },
});
</script>

<template>
  <v-container fluid fill-height>
    <v-row>
      <v-spacer />
      <v-icon size="30" @click="dialog = true">
        mdi-help
      </v-icon>
    </v-row>
    <girder-slicer-tasks-integrated :filter="filter" :defaults="defaultFunc" @run-task="triggerRunTask($event)" />
    <v-dialog v-model="dialog" width="500">
      <v-card>
        <v-card-title>
          Girder Slicer CLI UI
        </v-card-title>
        <v-card-text>
          <p>
            This is a beta version of providing a Slicer CLI task running interface inside of DIVE.  It will eventually be used inside of other DSA projects like volview and histomics.  Please underststand that this is a <b>Beta</b> version and will likely have some bugs.
            Any bugs that are found please provide details in an issue (including a screenshot if possible) to: <a target="_blank" href="https://github.com/BryonLewis/dive-dsa-slicer/issues"> DIVE-DSA Github Isssue Page </a>
          </p>
          <p><a href="https://github.com/BryonLewis/dive-dsa-slicer/tree/main/small-docker" target="_blank">Sample DIVE Tasks</a></p>
          <p>Sample tasks are on the Github Container Registry under the tag: <b>ghcr.io/bryonlewis/dive-dsa-slicer/dive-dsa-slicer:latest</b></p>
          <p>Below are some notes about it's operation</p>
          <ul style="list-style-type:disc;line-height: 2em;">
            <li><b>DIVEVideo</b> An  input with the ID of "DIVEVideo" will auto populate with a reference to the Source Video for this DIVE Dataset </li>
            <li><b>DIVEDirectory</b> An  input/output with the ID of "DIVEDirectory" will auto populate with a reference to the DIVE Dataset Folder.</li>
            <li>This system will filter out any Slicer Docker Containers that don't have 'DIVE' or 'dive' in the image name or the description.  This was to declutter the list</li>
            <li>Automatically it will take the first file input and load the video file associated with this DIVE dataset</li>
            <li>The folder for output will be the current DIVE Dataset Folder</li>
            <li>There will be an indcator that the job is running and should automatically reload the annotations once complete</li>
          </ul>
        </v-card-text>
        <v-card-actions>
          <v-row class="py-3">
            <v-spacer />
            <v-btn color="primary" @click="dialog = false">
              Dimiss
            </v-btn>
            <v-spacer />
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.slicer {
    min-height: 100%;
    height: 100%;
}
</style>
