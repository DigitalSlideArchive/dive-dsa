<script lang="ts">
import {
  defineComponent,
  onMounted,
  PropType,
  ref,
} from 'vue';
import { GirderSlicerTasksIntegrated } from 'vue-girder-slicer-cli-ui';
import { XMLBaseValue } from 'vue-girder-slicer-cli-ui/dist/parser/parserTypes';
import { useStore } from 'platform/web-girder/store/types';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { SlicerTask } from 'vue-girder-slicer-cli-ui/dist/api/girderSlicerApi';
import { GirderJob } from '@girder/components/src';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { all, Status } from '@girder/components/src/components/Job/status';
import {
  runSlicerMetadataTask,
  DIVEMetadataFilter,
} from 'platform/web-girder/api/divemetadata.service';
import {
  cancelJob,
} from 'platform/web-girder/api/admin.service';
import { getRecentSlicerJobs } from 'platform/web-girder/api/girder.service';

const JobStatus = all();
const JobStatusMap = {
  Cancelled: JobStatus.CANCELED,
  Error: JobStatus.ERROR,
  Success: JobStatus.SUCCESS,
  Inactive: JobStatus.INACTIVE,
  Queued: JobStatus.QUEUED,
  Running: JobStatus.RUNNING,
  Cancelling: JobStatus.WORKER_CANCELING,
} as Record<string, Status>;

export default defineComponent({
  name: 'SlicerTaskRunner',
  components: {
    GirderSlicerTasksIntegrated,
  },
  props: {
    metadataRoot: {
      type: String,
      required: true,
    },
    filters: {
      type: Object as PropType<DIVEMetadataFilter>,
      default: {},
    },
  },
  description: 'Metadata Slicer Task Runner',
  emits: ['job-complete'],
  setup(props, { emit }) {
    const girderRest = useGirderRest();
    const store = useStore();
    const helpDialog = ref(false);
    const mainDialog = ref(false);
    const automaticParams = ref(['DIVEVideo', 'DIVEDataset', 'DIVEMetadataRoot', 'DIVEMetadata', 'DIVEDirectory', 'girderApiUrl', 'girderToken']);
    const { prompt } = usePrompt();
    const jobRunning = ref(false);
    const jobProgress = ref(-1);
    const jobCurrent = ref(-1);
    const jobTotal = ref(-1);
    const jobId = ref('');
    let interval: NodeJS.Timeout | null = null;

    const getRunningQueuedJob = async () => {
      const filterStatus = ['Queued', 'Running', 'Cancelling'];
      const statusNums = filterStatus.map(
        (status) => JobStatusMap[status].value,
      ).filter((item) => item !== undefined);
      const results = (await getRecentSlicerJobs(
        0,
        0,
        statusNums,
      )).data;
      const filteredJobs = results.filter((item) => item?.kwargs?.params?.DIVEMetadataRoot === props.metadataRoot);
      if (filteredJobs.length) {
        jobId.value = filteredJobs[0]._id;
        jobRunning.value = true;
        // get Job status on internval until complete
        interval = setInterval(() => checkJobStatus(jobId.value), 2000);
      }
    };
    onMounted(() => getRunningQueuedJob());
    const checkJobStatus = async (id: string) => {
      const resp = await girderRest.get<GirderJob & { progress?: {current: number, total: number}}>(`job/${id}`);
      if (resp.data.progress) {
        jobCurrent.value = resp.data.progress.current;
        jobTotal.value = resp.data.progress.total;
        jobProgress.value = (resp.data.progress.current / resp.data.progress.total) * 100;
      }
      if (resp.data.status === JobStatus.SUCCESS.value) {
        if (interval) {
          clearInterval(interval);
        }
        store.commit('Jobs/setJobState', {
          jobId: resp.data._id,
          value: resp.data.status,
        });
        jobRunning.value = false;
        jobProgress.value = -1;
        // Check the Revision history and see if the latest revision is > than the stored current one
        emit('job-complete');
      }
      if (resp.data.status === JobStatus.ERROR.value) {
        if (interval) {
          clearInterval(interval);
        }
        store.commit('Jobs/setJobState', {
          jobId: resp.data._id,
          value: resp.data.status,
        });
        jobRunning.value = false;
        jobProgress.value = -1;
        await prompt({
          title: 'Job Incomplete',
          text: [`Job: ${resp.data.title}`, 'either failed or was cancelled by the user'],
        });
      }
    };

    const triggerRunTask = async (data: { taskId: string; params: Record<string, XMLBaseValue> }) => {
      mainDialog.value = false;
      const jobData = await runSlicerMetadataTask(
        props.metadataRoot,
        data.taskId,
        props.filters,
        data.params,
      );
      jobRunning.value = true;
      // We can now check the job status:
      store.dispatch('Jobs/updateJobs');
      if (jobData) {
        jobId.value = jobData.data._id;
        // get Job status on internval until complete
        interval = setInterval(() => checkJobStatus(jobId.value), 2000);
      }
    };
    const SlicerFilter = (item: SlicerTask) => (
      item.image.toLocaleLowerCase().includes('dive')
      || item.description.toLocaleLowerCase().includes('dive'));

    const cancelSlicerJob = async () => {
      const result = await prompt({
        title: 'Cancel Job',
        text: ['Do you want to Cance the running job?'],
        confirm: true,
      });
      if (!result) {
        return;
      }
      await cancelJob(jobId.value);
      jobProgress.value = -1;
      jobRunning.value = false;
    };
    return {
      triggerRunTask,
      SlicerFilter,
      helpDialog,
      mainDialog,
      automaticParams,
      jobRunning,
      jobProgress,
      jobCurrent,
      jobTotal,
      cancelSlicerJob,
    };
  },
});
</script>

<template>
  <div>
    <v-btn v-if="!jobRunning" @click="mainDialog = true">
      <v-icon>
        mdi-docker
      </v-icon>
    </v-btn>
    <v-card v-else class="pl-4">
      <v-row dense align="center">
        <v-icon>
          mdi-docker
        </v-icon>
        <v-icon
          color="success"
          class="rotate"
        >
          mdi-autorenew
        </v-icon>
        <span v-if="jobTotal > 0">Task Running: {{ jobCurrent + 1 }} of {{ jobTotal }}</span>
        <v-btn
          class="ma-1 ml-2"
          outlined
          color="warning"
          text
          x-small
          @click="cancelSlicerJob"
        >
          <v-icon
            left
            class="mx-1"
          >
            mdi-cancel
          </v-icon>
          Cancel Job
        </v-btn>

        <v-progress-linear v-if="jobProgress >= 0" color="success" :value="jobProgress" height="15px" striped width="200px" style="min-width: 100px; display: inline;" />
      </v-row>
    </v-card>
    <v-dialog v-model="mainDialog" width="800">
      <v-card>
        <v-card-title>
          <v-row>
            <h3>Run Metadata Slicer CLI Task</h3>
            <v-spacer />
            <v-icon size="30" @click="helpDialog = true">
              mdi-help
            </v-icon>
          </v-row>
        </v-card-title>
        <v-card-text>
          <girder-slicer-tasks-integrated
            :filter="SlicerFilter"
            intercept-run-task
            :skip-validation="automaticParams"
            :disabled-params="automaticParams"
            disabled-reason="Disabled: the parameter is populated automatically"
            @intercept-run-task="triggerRunTask($event)"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
    <v-dialog v-model="helpDialog" width="500">
      <v-card>
        <v-card-title> Girder Slicer CLI UI </v-card-title>
        <v-card-text>
          <p>
            This is a beta version of providing a Slicer CLI task running interface inside of
            DIVE. It will eventually be used inside of other DSA projects like volview and
            histomics. Please underststand that this is a <b>Beta</b> version and will likely
            have some bugs. Any bugs that are found please provide details in an issue
            (including a screenshot if possible) to:
            <a target="_blank" href="https://github.com/DigitalSlideArchive/dive-dsa/issues">
              DIVE-DSA Github Isssue Page
            </a>
          </p>
          <p>
            <a
              href="https://github.com/DigitalSlideArchive/dive-dsa/tree/main/dive-dsa-slicer/example-docker-containers"
              target="_blank"
            >
              Sample DIVE Tasks
            </a>
          </p>
          <p>
            Sample tasks are on the Github Container Registry under the tag:
            <b>ghcr.io/digitalslidearchive/dive-dsa/dive-dsa-slicer-examples:latest</b>
          </p>
          <p>Below are some notes about it's operation</p>
          <ul style="list-style-type: disc; line-height: 2em">
            <li>
              <b>DIVEVideo</b> An input with the ID of "DIVEVideo" will auto populate with a
              reference to the Source Video for this DIVE Dataset
            </li>
            <li>
              <b>DIVEDirectory</b> An input/output with the ID of "DIVEDirectory" will auto
              populate with a reference to the DIVE Dataset Folder.
            </li>
            <li>
              <b>DIVEMetadata</b> An input/output with the ID of "DIVEMetadata" will auto
              populate with a reference to the DIVE Metadata Id.
            </li>
            <li>
              <b>DIVEMetadataRoot</b> An input/output with the ID of "DIVEMetadataRoot" will
              auto populate with a reference to the DIVE Metadata Root.
            </li>
            <li>
              This system will filter out any Slicer Docker Containers that don't have 'DIVE' or
              'dive' in the image name or the description. This was to declutter the list
            </li>
            <li>
              Automatically it will take the first file input and load the video file associated
              with this DIVE dataset
            </li>
            <li>The folder for output will be the current DIVE Dataset Folder</li>
            <li>
              There will be an indcator that the job is running and should automatically reload
              the annotations once complete
            </li>
          </ul>
        </v-card-text>
        <v-card-actions>
          <v-row class="py-3">
            <v-spacer />
            <v-btn color="primary" @click="helpDialog = false">
              Dimiss
            </v-btn>
            <v-spacer />
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.slicer {
  min-height: 100%;
  height: 100%;
}
</style>
