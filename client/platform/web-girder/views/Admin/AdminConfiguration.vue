<script lang="ts">
import {
  defineComponent,
  onMounted,
  ref,
  Ref,
} from 'vue';
import {
  getDIVEGirderConfig,
  putDIVEGirderConfig,
  putSAM2Config,
  SAM2Config,
  DIVEGirderConfig,
  getSAM2Config,
} from 'platform/web-girder/api/configuration.service';
import { cloneDeep } from 'lodash';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { useStore } from 'platform/web-girder/store/types';
import AdminDatasetTranscodeStats from './AdminDatasetTranscodeStats.vue';

const defaultSAM2Config: SAM2Config = {
  celeryQueue: 'celery',
  models: {
    Tiny: {
      config: 'https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_t.yaml',
      checkpoint: 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt',
    },
    Small: {
      config: 'https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_s.yaml',
      checkpoint: 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt',
    },
    Base: {
      config: 'https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_b+.yaml',
      checkpoint: 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt',
    },
    Large: {
      config: 'https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_l.yaml',
      checkpoint: 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt',
    },
  },
};

export default defineComponent({
  name: 'AdminConfiguration',
  components: { AdminDatasetTranscodeStats },
  setup() {
    const diveGirderConfig: Ref<DIVEGirderConfig> = ref({});
    const sam2Config: Ref<SAM2Config> = ref({
      celeryQueue: 'celery',
      models: {},
    });
    const { prompt } = usePrompt();
    const store = useStore();

    const newModelKey = ref('');
    const newModelConfig = ref('');
    const newModelCheckpoint = ref('');
    const sam2MaskTracking = ref(false);
    const preventAssetstoreTranscoding = ref(false);
    const forceDownload = ref(false);

    // Download restrictions — default: media only prevented
    const preventAllDownloads = ref(false);
    const preventMediaDownloads = ref(true);
    const preventTrackDownloads = ref(false);
    const preventConfigDownloads = ref(false);

    const divePanels = ref([]);
    const sam2Panels = ref([]);

    const getConfig = async () => {
      const configResp = await getDIVEGirderConfig();
      diveGirderConfig.value = configResp.data;
      sam2MaskTracking.value = configResp.data.EnabledFeatures?.annotator.sam2MaskTracking || false;
      preventAssetstoreTranscoding.value = configResp.data.AssetstoreImportSettings?.preventTranscoding || false;
      const downloadSettings = configResp.data.DownloadRestrictionSettings;
      preventAllDownloads.value = downloadSettings?.preventAllDownloads ?? false;
      // Default true when unset so new installs block media downloads
      preventMediaDownloads.value = downloadSettings?.preventMediaDownloads ?? true;
      preventTrackDownloads.value = downloadSettings?.preventTrackDownloads ?? false;
      preventConfigDownloads.value = downloadSettings?.preventConfigDownloads ?? false;
      if (configResp.data.SAM2Config) {
        sam2Config.value.celeryQueue = configResp.data.SAM2Config.queues?.[0] || 'celery';
      }
      const samConfig = await getSAM2Config();
      if (samConfig.data) {
        sam2Config.value = samConfig.data;
      } else {
        sam2Config.value = defaultSAM2Config;
      }
    };

    const saveDIVEConfig = async () => {
      const data: DIVEGirderConfig = {
        EnabledFeatures: {
          annotator: { sam2MaskTracking: sam2MaskTracking.value },
        },
        AssetstoreImportSettings: {
          preventTranscoding: preventAssetstoreTranscoding.value,
        },
        DownloadRestrictionSettings: {
          preventAllDownloads: preventAllDownloads.value,
          preventMediaDownloads: preventMediaDownloads.value,
          preventTrackDownloads: preventTrackDownloads.value,
          preventConfigDownloads: preventConfigDownloads.value,
        },
      };
      await putDIVEGirderConfig(data);
      await store.dispatch('GirderConfig/loadDIVEGirderConfig');
    };

    const saveSAM2Config = async () => {
      await putSAM2Config(sam2Config.value, forceDownload.value);
      prompt({
        title: 'Running Sam Download',
        text: 'Running a task to download SAM2 Config, please do not hit this button again until the task is complete',
      });
    };

    const removeModel = (key: string) => {
      const copyModels = cloneDeep(sam2Config.value);
      delete copyModels.models[key];
      sam2Config.value = copyModels;
    };

    const loadDefault = () => {
      sam2Config.value = defaultSAM2Config;
    };

    onMounted(() => {
      getConfig();
    });

    return {
      diveGirderConfig,
      saveDIVEConfig,
      sam2Config,
      saveSAM2Config,
      sam2MaskTracking,
      preventAssetstoreTranscoding,
      preventAllDownloads,
      preventMediaDownloads,
      preventTrackDownloads,
      preventConfigDownloads,
      divePanels,
      sam2Panels,
      newModelKey,
      newModelConfig,
      newModelCheckpoint,
      forceDownload,
      removeModel,
      loadDefault,
    };
  },
});
</script>

<template>
  <v-container>
    <v-card>
      <v-card-title>DIVE Girder Configuration</v-card-title>
      <v-card-text>
        <v-expansion-panels
          v-model="divePanels"
          multiple
        >
          <v-expansion-panel>
            <v-expansion-panel-header>
              Enabled Features
            </v-expansion-panel-header>
            <v-expansion-panel-content>
              <v-row dense>
                <v-switch
                  v-model="sam2MaskTracking"
                  hide-details
                  label="SAM2 Mask Tracking"
                />
              </v-row>
            </v-expansion-panel-content>
          </v-expansion-panel>

          <v-expansion-panel>
            <v-expansion-panel-header>
              Assetstore Import
            </v-expansion-panel-header>
            <v-expansion-panel-content>
              <v-row dense>
                <v-switch
                  v-model="preventAssetstoreTranscoding"
                  hide-details
                  label="Prevent Assetstore Import Transcoding"
                />
              </v-row>
              <v-row dense>
                <span class="text-caption text--secondary">
                  When enabled, assetstore imports will not transcode videos. Compatible h264 mp4 files
                  will still become DIVE datasets. Incompatible videos are marked PreventTranscoding and
                  are not post-processed into datasets.
                </span>
              </v-row>
              <v-row
                dense
                class="mt-2"
              >
                <AdminDatasetTranscodeStats />
              </v-row>
            </v-expansion-panel-content>
          </v-expansion-panel>

          <v-expansion-panel>
            <v-expansion-panel-header>
              Download Restrictions
            </v-expansion-panel-header>
            <v-expansion-panel-content>
              <v-row dense>
                <span class="text-caption text--secondary mb-2">
                  Globally control what users can download from the Export / Download menu.
                  By default, media downloads (including media in zip exports) are disabled.
                </span>
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="preventAllDownloads"
                  hide-details
                  label="Prevent all downloads"
                />
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="preventMediaDownloads"
                  hide-details
                  :disabled="preventAllDownloads"
                  label="Prevent media downloads"
                />
              </v-row>
              <v-row dense>
                <span class="text-caption text--secondary ml-8 mb-2">
                  Blocks video/image downloads and media included in zip exports (Everything / media-only).
                </span>
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="preventTrackDownloads"
                  hide-details
                  :disabled="preventAllDownloads"
                  label="Prevent track / annotation downloads"
                />
              </v-row>
              <v-row dense>
                <span class="text-caption text--secondary ml-8 mb-2">
                  Blocks annotation CSV/JSON and mask exports, and annotations inside zip exports.
                </span>
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="preventConfigDownloads"
                  hide-details
                  :disabled="preventAllDownloads"
                  label="Prevent configuration downloads"
                />
              </v-row>
              <v-row dense>
                <span class="text-caption text--secondary ml-8">
                  Blocks standalone configuration export and strips config fields
                  (attributes, styles, filters, timelines, etc.) from zip meta.json.
                </span>
              </v-row>
            </v-expansion-panel-content>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="success"
          class="ml-2"
          @click="saveDIVEConfig()"
        >
          Set DIVE Config
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card class="mt-6">
      <v-card-title>SAM2 Configuration</v-card-title>
      <v-card-text>
        <v-expansion-panels
          v-model="sam2Panels"
          multiple
        >
          <v-expansion-panel>
            <v-expansion-panel-header>
              Models &amp; Queue
            </v-expansion-panel-header>
            <v-expansion-panel-content>
              <v-row>
                <v-text-field
                  v-model="sam2Config.celeryQueue"
                  label="Celery Queue"
                  outlined
                />
              </v-row>
              <v-row
                v-for="(model, key) in sam2Config.models"
                :key="key"
                class="my-2"
                align="center"
              >
                <v-col
                  cols="1"
                  sm="1"
                >
                  <v-chip>{{ key }}</v-chip>
                </v-col>

                <v-col
                  cols="12"
                  sm="3"
                >
                  <v-text-field
                    v-model="model.config"
                    :label="`${key} Config`"
                    outlined
                    hide-details
                  />
                </v-col>
                <v-col
                  cols="12"
                  sm="3"
                >
                  <v-text-field
                    v-model="model.checkpoint"
                    :label="`${key} Checkpoint`"
                    outlined
                    hide-details
                  />
                </v-col>
                <v-col
                  cols="12"
                  sm="2"
                >
                  <v-btn
                    color="error"
                    @click="removeModel(key)"
                  >
                    Remove
                  </v-btn>
                </v-col>
              </v-row>
              <v-row class="my-2">
                <v-col
                  cols="2"
                  sm="2"
                >
                  <v-text-field
                    v-model="newModelKey"
                    label="New Model Key"
                    outlined
                  />
                </v-col>
                <v-col
                  cols="12"
                  sm="3"
                >
                  <v-text-field
                    v-model="newModelConfig"
                    label="New Model Config Path"
                    outlined
                  />
                </v-col>
                <v-col
                  cols="12"
                  sm="3"
                >
                  <v-text-field
                    v-model="newModelCheckpoint"
                    label="New Model Checkpoint Path"
                    outlined
                  />
                </v-col>
                <v-col
                  cols="12"
                  sm="2"
                >
                  <v-btn
                    color="primary"
                    @click="
                      sam2Config.models[newModelKey] = {
                        config: newModelConfig,
                        checkpoint: newModelCheckpoint,
                      };
                      newModelKey = '';
                      newModelConfig = '';
                      newModelCheckpoint = '';
                    "
                  >
                    Add Model
                  </v-btn>
                </v-col>
              </v-row>
            </v-expansion-panel-content>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          class="ml-2"
          @click="loadDefault"
        >
          Load Default Config
        </v-btn>

        <v-spacer />
        <v-switch
          v-model="forceDownload"
          label="Force Download"
        />
        <v-btn
          color="success"
          class="ml-2"
          @click="saveSAM2Config"
        >
          Download SAM2 Configs
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>
