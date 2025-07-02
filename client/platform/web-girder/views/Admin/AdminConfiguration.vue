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
  setup() {
    const diveGirderConfig: Ref<DIVEGirderConfig> = ref({});
    const sam2Config: Ref<SAM2Config> = ref({
      celeryQueue: 'celery',
      models: {},
    });

    const newModelKey = ref('');
    const newModelConfig = ref('');
    const newModelCheckpoint = ref('');
    const sam2MaskTracking = ref(false);
    const forceDownload = ref(false);
    const getConfig = async () => {
      const configResp = await getDIVEGirderConfig();
      diveGirderConfig.value = configResp.data;
      sam2MaskTracking.value = configResp.data.EnabledFeatures?.annotator.sam2MaskTracking || false;
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
      const data: DIVEGirderConfig = { EnabledFeatures: diveGirderConfig.value.EnabledFeatures };
      if (sam2MaskTracking.value) {
        data.EnabledFeatures = { annotator: { sam2MaskTracking: sam2MaskTracking.value } };
      }
      await putDIVEGirderConfig(data);
    };

    const saveSAM2Config = async () => {
      await putSAM2Config(sam2Config.value, false);
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
      newModelKey,
      newModelConfig,
      newModelCheckpoint,
      forceDownload,
    };
  },
});
</script>

<template>
  <v-container>
    <v-card>
      <v-card-title>DIVE Girder Configuration</v-card-title>
      <v-card-text>
        <v-row dense>
          <v-switch v-model="sam2MaskTracking" hide-details label="SAM2 Mask Tracking" />
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-row dense>
          <v-spacer />
          <v-btn
            color="success"
            class="ml-2"
            @click="saveDIVEConfig()"
          >
            Set DIVE Config
          </v-btn>
        </v-row>
      </v-card-actions>
    </v-card>

    <v-card class="mt-6">
      <v-card-title>SAM2 Configuration</v-card-title>
      <v-card-text>
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
          <v-col cols="1" sm="1">
            <v-chip>{{ key }}</v-chip>
          </v-col>

          <v-col cols="12" sm="3">
            <v-text-field
              v-model="model.config"
              :label="`${key} Config`"
              outlined
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model="model.checkpoint"
              :label="`${key} Checkpoint`"
              outlined
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="2">
            <v-btn color="error" @click="delete sam2Config.models[key]">
              Remove
            </v-btn>
          </v-col>
        </v-row>
        <v-row class="my-2">
          <v-col cols="2" sm="2">
            <v-text-field
              v-model="newModelKey"
              label="New Model Key"
              outlined
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model="newModelConfig"
              label="New Model Config Path"
              outlined
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model="newModelCheckpoint"
              label="New Model Checkpoint Path"
              outlined
            />
          </v-col>
          <v-col cols="12" sm="2">
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
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-switch v-model="forceDownload" label="Force Download" />
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
