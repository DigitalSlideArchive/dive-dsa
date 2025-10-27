<script lang="ts">
import { maskTracking } from 'platform/web-girder/api/rpc.service';
import { cancelJob } from 'platform/web-girder/api/admin.service';
import { useStore } from 'platform/web-girder/store/types';
import {
  computed, defineComponent, Ref, ref,
} from 'vue';
import {
  useDatasetId, usePendingSaveCount, useSelectedTrackId, useTime, useMasks,
  useCameraStore,
  useHandler,
} from 'vue-media-annotator/provides';
import type { GirderJob } from '@girder/components/src';
import girderRest from 'platform/web-girder/plugins/girder';
import { all } from '@girder/components/src/components/Job/status';
import Track from 'vue-media-annotator/track';
import { MaskSAM2UpdateItem } from 'vue-media-annotator/use/useMasks';

const JobStatus = all();
const NonRunningStates = [
  JobStatus.CANCELED.value,
  JobStatus.ERROR.value,
  JobStatus.SUCCESS.value,
];

export interface MaskUpdate {
    datasetId: string;
    trackId: number;
    currentFrame: number;
    trackFeatures: Track['features'];
    masks: MaskSAM2UpdateItem[];
}

export default defineComponent({
  name: 'MaskTracking',
  components: {
  },
  props: {
    buttonOptions: {
      type: Object,
      default: () => ({}),
    },
    menuOptions: {
      type: Object,
      default: () => ({}),
    },
    readOnlyMode: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const selectedTrackId = useSelectedTrackId();
    const handler = useHandler();
    const pendingSaveCount = usePendingSaveCount();
    const cameraStore = useCameraStore();
    const masks = useMasks();
    const datasetId = useDatasetId();
    const { frame } = useTime();
    const store = useStore();
    const maskTrackingEnabled = computed(() => store.state.GirderConfig.girderState.EnabledFeatures?.annotator.sam2MaskTracking);
    const models = computed(() => store.state.GirderConfig.girderState.SAM2Config?.models);
    const queues = computed(() => store.state.GirderConfig.girderState.SAM2Config?.queues);
    const menuOpen = ref(false);

    const selectedModel = ref(models.value?.length ? models.value[0] : 'Tiny');
    const selectedQueue = ref(queues.value?.length ? queues.value[0] : 'celery');
    const frameCount = ref(100);
    const batchSize = ref(300);
    const batchSizeOptions = ref([10, 100, 300, 500, 1000]);
    const notifyPercent = ref(0.1);
    const followUpdates = ref(true);

    const trackingJob: Ref<null | GirderJob> = ref(null);
    const cancelling = ref(false);

    const currentProgress = ref(0);
    const updateProgress = (job: GirderJob & {current?: number, total?: number, title?: string; resource: { _id: string }}) => {
      if (job.resource._id === trackingJob.value?._id) {
        currentProgress.value = job.current !== undefined && job.total !== undefined ? (job.current / job.total) * 100 : 0;
        if (currentProgress.value >= 100 || job.state === 'success') {
          currentProgress.value = 0;
          trackingJob.value = null;
          cancelling.value = false;
        }
      }
    };

    const jobTracker = ({ data: job }: { data: GirderJob & {current?: number, total?: number, title?: string; resource: { _id: string }}}) => {
      updateProgress(job);
    };

    const maskUpdateProcessor = (maskUpdate: MaskUpdate) => {
      // We update the masks using new masks items and we update the tracks
      if (maskUpdate.datasetId === datasetId.value) {
        masks.editorFunctions.updateMaskData(maskUpdate.masks);
        const { trackId } = maskUpdate;
        const track = cameraStore.getAnyPossibleTrack(trackId);
        if (track) {
          maskUpdate.trackFeatures.forEach((feature) => {
            if (track) {
              track.setFeature(feature);
            }
          });
        }
      }
      if (followUpdates.value) {
        handler.seekFrame(maskUpdate.currentFrame);
      }
    };

    girderRest.$on('message:progress', jobTracker);
    girderRest.$on('message:mask_update', ({ data: maskUpdate }: { data: MaskUpdate }) => maskUpdateProcessor(maskUpdate));
    girderRest.$on('message:job_status', ({ data: job }: { data: GirderJob }) => {
      if (job._id === trackingJob.value?._id) {
        if (NonRunningStates.includes(job.status)) {
          currentProgress.value = 0;
          trackingJob.value = null;
          cancelling.value = false;
        } else if (job.status === JobStatus.WORKER_CANCELING.value) {
          cancelling.value = true;
        }
      }
    });
    const startTracking = async () => {
      if (selectedTrackId.value !== null) {
        const result = await maskTracking(datasetId.value, selectedQueue.value, selectedTrackId.value, frame.value, frameCount.value, selectedModel.value, batchSize.value, notifyPercent.value);
        trackingJob.value = result;
      }
    };

    const cancelTrackingJob = async () => {
      if (trackingJob.value) {
        cancelJob(trackingJob.value._id);
      }
    };

    const disabledReason = computed(() => {
      if (selectedTrackId.value === null) {
        return 'Track needs to be selected';
      }
      if (pendingSaveCount.value > 0) {
        return 'Save before running Tracking';
      }
      return false;
    });

    return {
      menuOpen,
      selectedTrackId,
      selectedQueue,
      maskTrackingEnabled,
      models,
      queues,
      selectedModel,
      frameCount,
      trackingJob,
      currentProgress,
      cancelling,
      disabledReason,
      batchSize,
      batchSizeOptions,
      notifyPercent,
      followUpdates,
      // functions
      startTracking,
      cancelTrackingJob,
    };
  },
});
</script>

<template>
  <v-menu
    v-if="maskTrackingEnabled"
    v-model="menuOpen"
    :close-on-content-click="false"
    :nudge-width="120"
    v-bind="menuOptions"
    max-width="280"
  >
    <template #activator="{ on: menuOn }">
      <v-tooltip bottom>
        <template #activator="{ on: tooltipOn }">
          <v-btn
            class="ma-0"
            :color="trackingJob ? 'warning' : ''"
            v-bind="buttonOptions"
            v-on="{ ...tooltipOn, ...menuOn }"
          >
            <div>
              <v-icon>
                mdi-radar
              </v-icon>
              <span
                v-show="buttonOptions.block"
                class="pl-1"
              >
                Mask Tracking
              </span>
            </div>
          </v-btn>
        </template>
        <span> {{ trackingJob ? 'Running Tracking Job' : 'Using SAM2 for Segment Tracking' }}</span>
      </v-tooltip>
    </template>
    <template>
      <v-card v-if="!trackingJob">
        <v-card-title>SAM2 Mask Tracking</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-select
              v-model="selectedModel"
              :items="models"
              label="Model"
            />
          </v-row>
          <v-row dense>
            <v-select
              v-model="selectedQueue"
              :items="queues"
              label="Queue"
            />
          </v-row>
          <v-row dense class="mt-6">
            <v-slider
              v-model="frameCount"
              label="Track Frames"
              thumb-label="always"
              min="1"
              max="5000"
              step="1"
            />
          </v-row>
          <v-row>
            <v-expansion-panels>
              <v-expansion-panel class="border">
                <v-expansion-panel-header>Advanced</v-expansion-panel-header>
                <v-expansion-panel-content>
                  <v-row dense>
                    <v-select v-model="batchSize" :items="batchSizeOptions" label="Batch Size" style="max-width:150px" />
                    <v-tooltip
                      open-delay="100"
                      bottom
                    >
                      <template #activator="{ on }">
                        <v-icon
                          class="ml-2"
                          v-on="on"
                        >
                          mdi-information
                        </v-icon>
                      </template>
                      <span>Limits frame loading to X subframes to prevent running out of GPU Memory</span>
                    </v-tooltip>
                  </v-row>
                  <v-row dense align="center">
                    <v-slider v-model="notifyPercent" label="Notify %" min="0.01" max="0.5" step="0.01" hide-details /><span class="ml-2"> {{ (notifyPercent * 100).toFixed(0) }}</span>
                    <v-tooltip
                      open-delay="100"
                      bottom
                    >
                      <template #activator="{ on }">
                        <v-icon
                          class="ml-2"
                          v-on="on"
                        >
                          mdi-information
                        </v-icon>
                      </template>
                      <span>Updates for every X% of the frame complete</span>
                    </v-tooltip>
                  </v-row>
                </v-expansion-panel-content>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-row>
          <v-row dense class="mt-5">
            <v-btn
              color="success"
              :disabled="!!disabledReason"
              @click="startTracking()"
            >
              Start Tracking
            </v-btn>
          </v-row>
          <v-row v-if="disabledReason" dense>
            <div style="font-size: 0.85em; color: red">
              {{ disabledReason }}
            </div>
          </v-row>
        </v-card-text>
      </v-card>
      <v-card v-else-if="cancelling">
        <v-card-text>Tracking Status</v-card-text>
        <v-card-text>
          <v-progress-linear
            color="warning"
            indeterminate
            height="15"
          />

          <h3>Cancelling</h3>
        </v-card-text>
      </v-card>
      <v-card v-else>
        <v-card-title>Tracking Status</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-progress-linear
              v-if="!cancelling && currentProgress > 0"
              color="primary"
              :value="currentProgress"
              height="15"
            />
            <v-progress-linear
              v-else-if="!cancelling"
              color="secondary"
              indeterminate
              height="15"
            />
            <v-progress-linear
              v-else
              color="warning"
              indeterminate
              height="15"
            />
          </v-row>
          <v-row v-if="cancelling" dense>
            <h3>Cancelling</h3>
          </v-row>
          <v-row v-else-if="!cancelling && currentProgress === 0" dense>
            <h3>Loading Frames</h3>
          </v-row>
          <v-row v-else dense>
            <v-switch v-model="followUpdates" label="Follow Updates" />
            <v-tooltip
              open-delay="100"
              bottom
            >
              <template #activator="{ on }">
                <v-icon
                  class="ml-2"
                  v-on="on"
                >
                  mdi-information
                </v-icon>
              </template>
              <span>When updates occur it will jump to the last updated fra,e</span>
            </v-tooltip>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-btn
            color="warning"
            :disabled="cancelling"
            @click="cancelTrackingJob"
          >
            Cancel Tracking
          </v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-menu>
</template>
