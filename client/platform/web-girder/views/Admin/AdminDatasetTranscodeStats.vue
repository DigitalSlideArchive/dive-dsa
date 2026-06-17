<script lang="ts">
import {
  computed,
  defineComponent,
  ref,
  Ref,
} from 'vue';
import { GirderFileManager, GirderModelType } from '@girder/components/src';
import {
  getDatasetTranscodeStats,
  DatasetTranscodeStats,
} from 'platform/web-girder/api/configuration.service';
import useRequest from 'dive-common/use/useRequest';
import { RootlessLocationType } from 'platform/web-girder/store/types';
import { useGirderRest } from 'platform/web-girder/plugins/girder';

export default defineComponent({
  name: 'AdminDatasetTranscodeStats',
  components: { GirderFileManager },
  setup() {
    const girderRest = useGirderRest();
    const open = ref(false);
    const location: Ref<RootlessLocationType> = ref({
      _modelType: ('user' as GirderModelType),
      _id: girderRest.user._id,
    });
    const transcodeStats: Ref<DatasetTranscodeStats | null> = ref(null);
    const locationIsAnalyzable = computed(() => (
      location.value._modelType === 'folder' || location.value._modelType === 'collection'
    ));
    const transcodedPercent = computed(() => {
      if (!transcodeStats.value || transcodeStats.value.totalCount === 0) {
        return 0;
      }
      return Math.round(
        (transcodeStats.value.transcodedCount / transcodeStats.value.totalCount) * 100,
      );
    });
    const preventTranscodingPercent = computed(() => {
      if (!transcodeStats.value || transcodeStats.value.totalCount === 0) {
        return 0;
      }
      return Math.round(
        (transcodeStats.value.preventTranscodingCount / transcodeStats.value.totalCount) * 100,
      );
    });

    function resetDialog() {
      transcodeStats.value = null;
      location.value = {
        _modelType: ('user' as GirderModelType),
        _id: girderRest.user._id,
      };
    }

    function openDialog() {
      resetDialog();
      open.value = true;
    }

    function setLocation(newLoc: RootlessLocationType) {
      location.value = newLoc;
      transcodeStats.value = null;
    }

    const {
      request: analyzeTranscodeStats,
      error: transcodeStatsError,
      loading: transcodeStatsLoading,
    } = useRequest();
    const fetchTranscodeStats = () => analyzeTranscodeStats(async () => {
      if (!locationIsAnalyzable.value) {
        return;
      }
      const modelType = location.value._modelType;
      if (modelType !== 'folder' && modelType !== 'collection') {
        return;
      }
      const response = await getDatasetTranscodeStats(location.value._id, modelType);
      transcodeStats.value = response.data;
    });

    return {
      open,
      location,
      locationIsAnalyzable,
      setLocation,
      transcodeStats,
      transcodeStatsError,
      transcodeStatsLoading,
      fetchTranscodeStats,
      transcodedPercent,
      preventTranscodingPercent,
      openDialog,
    };
  },
});
</script>

<template>
  <div>
    <v-btn
      color="primary"
      outlined
      @click="openDialog"
    >
      Dataset Transcoding Stats
    </v-btn>

    <v-dialog
      v-model="open"
      :max-width="800"
      :overlay-opacity="0.95"
    >
      <v-card>
      <v-card-title>Dataset Transcoding Stats</v-card-title>
      <v-card-text>
        <span class="text-caption text--secondary">
          Select a folder or collection to count DIVE datasets and how many are marked
          PreventTranscoding (non-transcoded) versus transcoded.
        </span>
        <v-alert
          v-if="transcodeStatsError"
          type="error"
          dismissible
          class="mt-4"
        >
          {{ transcodeStatsError }}
        </v-alert>
        <v-card
          outlined
          flat
          class="mt-4"
        >
          <GirderFileManager
            new-folder-enabled
            no-access-control
            :location="location"
            @update:location="setLocation"
          >
            <template #row="{ item }">
              <span>{{ item.name }}</span>
              <v-chip
                v-if="(item.meta && item.meta.annotate)"
                color="white"
                x-small
                outlined
                class="mx-3"
              >
                dataset
              </v-chip>
            </template>
          </GirderFileManager>
        </v-card>
        <v-btn
          depressed
          block
          color="primary"
          class="mt-4"
          :loading="transcodeStatsLoading"
          :disabled="!locationIsAnalyzable || transcodeStatsLoading"
          @click="fetchTranscodeStats"
        >
          <span v-if="!locationIsAnalyzable">
            Choose a folder or collection to analyze...
          </span>
          <span v-else-if="'name' in location">
            Analyze {{ location.name }}
          </span>
          <span v-else>
            Something went wrong
          </span>
        </v-btn>
        <v-card
          v-if="transcodeStats"
          outlined
          flat
          class="mt-4"
        >
          <v-card-text>
            <div class="text-subtitle-1 mb-2">
              Results for {{ transcodeStats.resourceName }}
            </div>
            <v-row dense>
              <v-col cols="12" sm="4">
                <div class="text-caption text--secondary">
                  Total video folders
                </div>
                <div class="text-h6">
                  {{ transcodeStats.totalCount }}
                </div>
              </v-col>
              <v-col cols="12" sm="4">
                <div class="text-caption text--secondary">
                  DIVE datasets (transcoded)
                </div>
                <div class="text-h6">
                  {{ transcodeStats.transcodedCount }} ({{ transcodedPercent }}%)
                </div>
              </v-col>
              <v-col cols="12" sm="4">
                <div class="text-caption text--secondary">
                  PreventTranscoding
                </div>
                <div class="text-h6">
                  {{ transcodeStats.preventTranscodingCount }} ({{ preventTranscodingPercent }}%)
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text @click="open = false">
          Close
        </v-btn>
      </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
