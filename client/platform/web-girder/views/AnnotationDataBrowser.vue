<script lang="ts">
import {
  computed, defineComponent, ref, Ref, watch,
} from 'vue';
import {
  GirderFileManager, getLocationType, GirderModel,
} from '@girder/components/src';
import { itemsPerPageOptions } from 'dive-common/constants';
import { clientSettings } from 'dive-common/store/settings';
import { getFolder } from 'platform/web-girder/api/girder.service';
import TooltipButton from 'vue-media-annotator/components/TooltipButton.vue';
import { useStore } from '../store/types';

export default defineComponent({
  props: {
    datasetId: {
      type: String,
      required: true,
    },
  },
  components: {
    GirderFileManager,
    TooltipButton,
  },

  setup(props) {
    const fileManager = ref();
    const store = useStore();
    const locationStore = store.state.Location;
    const { getters } = store;
    const showDialog = ref(false);
    const location: Ref<null | {_modelType: GirderModel['_modelType']; _id: string}> = ref(null);
    const loadLocation = async () => {
      const req = await getFolder(props.datasetId);
      if (req.data.parentId) {
        const parentReq = await getFolder(props.datasetId);
        location.value = { _modelType: parentReq.data._modelType, _id: req.data.parentId };
      } else {
        location.value = { _modelType: 'folder', _id: props.datasetId };
      }
    };
    loadLocation();
    watch(() => props.datasetId, () => loadLocation());
    function setLocation(newlocation: {_modelType: GirderModel['_modelType']; _id: string}) {
      location.value = newlocation;
    }

    function isAnnotationFolder(item: GirderModel) {
      return item._modelType === 'folder' && item.meta.annotate;
    }

    const shouldShowUpload = computed(() => (
      locationStore.location
      && !getters['Location/locationIsViameFolder']
      && getLocationType(locationStore.location) === 'folder'
      && !locationStore.selected.length
    ));

    return {
      fileManager,
      locationStore,
      getters,
      shouldShowUpload,
      clientSettings,
      itemsPerPageOptions,
      showDialog,
      location,
      /* methods */
      isAnnotationFolder,
      setLocation,
    };
  },
});
</script>

<template>
  <span>
    <tooltip-button
      icon="mdi-view-list"
      tooltip-text="Open Data Browser"
      outlined
      tile
      @click="showDialog = true"
    />
    <v-dialog
      v-model="showDialog"
      max-width="800px"
      scrollable
    >
      <v-card style="min-height: 70vh; max-height: 70vh;">
        <v-card-title>
          Data Browser
          <v-spacer />
          <v-btn
            icon
            small
            color="white"
            @click="showDialog = false"
          >
            <v-icon
              small
            >
              mdi-close
            </v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <GirderFileManager
            v-if="location !== null"
            ref="fileManager"
            :location="location"
            :items-per-page.sync="clientSettings.rowsPerPage"
            :items-per-page-options="itemsPerPageOptions"
            @update:location="setLocation($event)"
          >
            <template #headerwidget />
            <template #row="{item}">
              <span>{{ item.name }}</span>
              <v-icon
                v-if="getters['Jobs/datasetRunningState'](item._id)"
                color="warning"
                class="rotate"
              >
                mdi-autorenew
              </v-icon>
              <v-btn
                v-if="isAnnotationFolder(item)"
                class="ml-2"
                x-small
                color="primary"
                depressed
                :to="{ name: 'viewer', params: { id: item._id } }"
              >
                Launch Annotator
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
        </v-card-text>
      </v-card>
    </v-dialog>
  </span>
</template>
