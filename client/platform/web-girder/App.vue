<template>
  <v-app>
    <router-view />
  </v-app>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import {
  DatasetMeta, DatasetMetaMutable, provideApi,
} from 'dive-common/apispec';
import { DiveConfiguration } from 'vue-media-annotator/ConfigurationManager';
import {
  saveMetadata,
  saveAttributes,
  importAnnotationFile,
  loadDetections,
  saveDetections,
  unwrap,
  saveTimelines,
  saveConfiguration,
} from './api';
import { openFromDisk } from './utils';

export default defineComponent({
  name: 'App',
  components: {},
  setup(_, { root }) {
    async function loadMetadata(datasetId: string): Promise<{
      metadata: DatasetMeta & DatasetMetaMutable;
    diveConfig: DiveConfiguration;
    }> {
      return root.$store.dispatch('Dataset/load', datasetId);
    }

    root.$store.dispatch('Location/setLocationFromRoute', root.$route);

    provideApi({
      loadDetections,
      saveDetections: unwrap(saveDetections),
      saveMetadata: unwrap(saveMetadata),
      saveAttributes: unwrap(saveAttributes),
      saveTimelines: unwrap(saveTimelines),
      saveConfiguration: unwrap(saveConfiguration),
      loadMetadata,
      openFromDisk,
      importAnnotationFile,
    });
  },
});
</script>

<style lang="scss">
html {
  overflow-y: auto;
}

.text-xs-center {
  text-align: center !important;
}
</style>
