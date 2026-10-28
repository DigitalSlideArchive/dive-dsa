<script lang="ts">
import {
  computed, defineComponent, ref, onBeforeUnmount, watch,
} from 'vue';
import {
  GirderFileManager, getLocationType, GirderModel,
} from '@girder/components/src';
import { itemsPerPageOptions } from 'dive-common/constants';
import { clientSettings } from 'dive-common/store/settings';
import { useStore, LocationType } from '../store/types';
import { useLaunchConfigs } from '../use/useLaunchConfigs';
import Upload from './Upload.vue';
import LaunchButtons from './LaunchButtons.vue';
import eventBus from '../eventBus';

export default defineComponent({
  components: {
    GirderFileManager,
    Upload,
    LaunchButtons,
  },

  setup() {
    const fileManager = ref();
    const store = useStore();
    const uploading = ref(false);
    const uploaderDialog = ref(false);
    const locationStore = store.state.Location;
    const { getters } = store;

    function setLocation(location: LocationType) {
      store.dispatch('Location/setRouteFromLocation', location);
    }

    function handleNotification() {
      fileManager.value.$refs.girderBrowser.refresh();
    }

    function updateUploading(newval: boolean) {
      uploading.value = newval;
      if (!newval) {
        fileManager.value.$refs.girderBrowser.refresh();
        uploaderDialog.value = false;
      }
    }

    function isAnnotationFolder(item: GirderModel) {
      return item._modelType === 'folder' && item.meta.annotate;
    }
    function isMetadataFolder(item: GirderModel) {
      return item._modelType === 'folder' && item.meta.DIVEMetadata;
    }

    function isClonedMetadataFolder(item: GirderModel) {
      if (item._modelType === 'folder' && item.meta.DIVEMetadataClonedFilter && item.meta.DIVEMetadataClonedFilterBase) {
        return { id: item.meta.DIVEMetadataClonedFilterBase, filter: item.meta.DIVEMetadataClonedFilter };
      }
      return false;
    }

    const shouldShowUpload = computed(() => (
      locationStore.location
      && !getters['Location/locationIsViameFolder']
      && getLocationType(locationStore.location) === 'folder'
      && !locationStore.selected.length
    ));

    // Resolve launch configs once per browse location, never per row
    const { launchConfigs, load } = useLaunchConfigs();
    watch(() => locationStore.location, (loc) => {
      const folder = loc && getLocationType(loc) === 'folder' ? (loc as GirderModel)._id : null;
      load(folder);
    }, { immediate: true });

    eventBus.$on('refresh-data-browser', handleNotification);
    onBeforeUnmount(() => {
      eventBus.$off('refresh-data-browser', handleNotification);
    });

    return {
      fileManager,
      locationStore,
      launchConfigs,
      getters,
      shouldShowUpload,
      uploaderDialog,
      uploading,
      clientSettings,
      itemsPerPageOptions,
      /* methods */
      isAnnotationFolder,
      isMetadataFolder,
      isClonedMetadataFolder,
      handleNotification,
      setLocation,
      updateUploading,
    };
  },
});
</script>

<template>
  <GirderFileManager
    ref="fileManager"
    v-model="locationStore.selected"
    :selectable="!getters['Location/locationIsViameFolder']"
    :new-folder-enabled="
      !locationStore.selected.length && !getters['Location/locationIsViameFolder']
    "
    :location="locationStore.location"
    :items-per-page.sync="clientSettings.rowsPerPage"
    :items-per-page-options="itemsPerPageOptions"
    @update:location="setLocation($event)"
  >
    <template #headerwidget>
      <v-dialog
        v-if="shouldShowUpload"
        v-model="uploaderDialog"
        max-width="800px"
        :persistent="uploading"
      >
        <template #activator="{ on }">
          <v-btn
            class="ma-0"
            text
            small
            v-on="on"
          >
            <v-icon
              left
              color="accent"
            >
              mdi-file-upload
            </v-icon>
            Upload
          </v-btn>
        </template>
        <Upload
          :location="locationStore.location"
          @update:uploading="updateUploading"
          @close="uploaderDialog = false"
        />
      </v-dialog>
    </template>
    <template #row="{ item }">
      <span>{{ item.name }}</span>
      <v-icon
        v-if="getters['Jobs/datasetRunningState'](item._id)"
        color="warning"
        class="rotate"
      >
        mdi-autorenew
      </v-icon>
      <launch-buttons
        v-if="isAnnotationFolder(item)"
        :dataset-id="item._id"
        :launch-configs="launchConfigs"
      />
      <v-btn
        v-if="isMetadataFolder(item)"
        class="ml-2"
        x-small
        color="purple"
        depressed
        :to="{ name: 'metadata', params: { id: item._id } }"
      >
        View Metadata
      </v-btn>
      <v-btn
        v-if="isClonedMetadataFolder(item)"
        class="ml-2"
        x-small
        color="info"
        depressed
        :to="{ name: 'metadata', params: { id: isClonedMetadataFolder(item).id }, query: { filter: isClonedMetadataFolder(item).filter } }"
      >
        View Metadata Filter
      </v-btn>

      <v-chip
        v-if="(item.foreign_media_id)"
        color="white"
        x-small
        outlined
        disabled
        class="my-0 mx-3"
      >
        cloned
      </v-chip>
      <v-chip
        v-if="(item.meta && item.meta.published)"
        color="green"
        x-small
        outlined
        disabled
        class="my-0 mx-3"
      >
        published
      </v-chip>
    </template>
  </GirderFileManager>
</template>
