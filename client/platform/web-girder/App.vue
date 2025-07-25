<template>
  <v-app>
    <router-view />
  </v-app>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import {
  DatasetMeta, DatasetMetaMutable, provideApi,
} from 'dive-common/apispec';
import { DiveConfiguration } from 'vue-media-annotator/ConfigurationManager';
import { useStore } from 'platform/web-girder/store/types';
import { useRoute } from 'vue-router/composables';
import {
  saveMetadata,
  saveAttributes,
  saveStyling,
  importAnnotationFile,
  loadDetections,
  saveDetections,
  unwrap,
  saveTimelines,
  saveSwimlanes,
  saveFilters,
  saveConfiguration,
  transferConfiguration,
} from './api';
import { openFromDisk } from './utils';

export default defineComponent({
  name: 'App',
  components: {},
  setup() {
    const store = useStore();
    const route = useRoute();
    async function loadMetadata(datasetId: string): Promise<{
      metadata: DatasetMeta & DatasetMetaMutable;
    diveConfig: DiveConfiguration;
    }> {
      return store.dispatch('Dataset/load', datasetId);
    }

    store.dispatch('Location/setLocationFromRoute', route);

    provideApi({
      loadDetections,
      saveDetections: unwrap(saveDetections),
      saveMetadata: unwrap(saveMetadata),
      saveAttributes: unwrap(saveAttributes),
      saveTimelines: unwrap(saveTimelines),
      saveSwimlanes: unwrap(saveSwimlanes),
      saveStyling: unwrap(saveStyling),
      saveFilters: unwrap(saveFilters),
      saveConfiguration: unwrap(saveConfiguration),
      transferConfiguration: unwrap(transferConfiguration),
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
  transform-style: preserve-3d;
}

.text-xs-center {
  text-align: center !important;
}
</style>
