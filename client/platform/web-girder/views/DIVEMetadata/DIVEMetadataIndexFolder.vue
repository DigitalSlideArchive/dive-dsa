<script lang="ts">
import {
  computed, defineComponent, Ref, ref,
} from 'vue';
import { GirderFileManager, GirderModelType } from '@girder/components/src';
import useRequest from 'dive-common/use/useRequest';
import { RootlessLocationType } from 'platform/web-girder/store/types';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { indexDiveMetadataFromFolder } from 'platform/web-girder/api/divemetadata.service';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';

export default defineComponent({
  name: 'DIVEMetadataIndexFolder',
  components: { GirderFileManager },

  props: {
    metadataRoot: {
      type: String,
      required: true,
    },
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

  emits: ['updated'],

  setup(props, { emit }) {
    const girderRest = useGirderRest();
    const { prompt } = usePrompt();
    const open = ref(false);
    const replaceMetadata = ref(false);
    const location: Ref<RootlessLocationType> = ref({
      _modelType: ('user' as GirderModelType),
      _id: girderRest.user._id,
    });
    const locationIsFolder = computed(() => location.value._modelType === 'folder');

    function setLocation(newLoc: RootlessLocationType) {
      if (!('meta' in newLoc && newLoc.meta.annotate)) {
        location.value = newLoc;
      }
    }

    const { request: runIndex, error: indexError, loading: indexLoading } = useRequest();
    const doIndex = () => runIndex(async () => {
      if (!locationIsFolder.value) {
        throw new Error('Choose a folder to index');
      }
      const { data } = await indexDiveMetadataFromFolder(
        props.metadataRoot,
        location.value._id,
        replaceMetadata.value,
      );
      open.value = false;
      emit('updated');
      await prompt({
        title: 'Folder indexed',
        text: [data.results],
        positiveButton: 'OK',
      });
    });

    return {
      open,
      replaceMetadata,
      location,
      locationIsFolder,
      indexLoading,
      indexError,
      setLocation,
      doIndex,
    };
  },
});
</script>

<template>
  <v-dialog
    v-model="open"
    :max-width="720"
    :overlay-opacity="0.95"
  >
    <template #activator="{ on: dialogOn, attrs }">
      <v-tooltip bottom>
        <template #activator="{ on: tooltipOn }">
          <v-btn
            v-bind="{ ...attrs, ...buttonOptions }"
            :disabled="readOnlyMode"
            v-on="{ ...tooltipOn, ...dialogOn }"
          >
            <v-icon>mdi-folder-sync</v-icon>
            <span
              v-show="buttonOptions.block"
              class="pl-1"
            >
              Add folder
            </span>
          </v-btn>
        </template>
        <span>Add or refresh datasets from another folder</span>
      </v-tooltip>
    </template>

    <v-card>
      <v-card-title>
        Index datasets from folder
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="indexError"
          type="error"
          dismissible
        >
          {{ indexError }}
        </v-alert>
        <p>
          Scan a Girder folder (and its subfolders) for DIVE datasets and add them to this
          metadata collection. Datasets already in the collection are skipped unless you enable
          replace below.
        </p>
        <v-checkbox
          v-model="replaceMetadata"
          label="Replace default metadata for datasets found in this folder"
          :disabled="indexLoading || readOnlyMode"
          hide-details
          class="mb-2"
        />
        <GirderFileManager
          new-folder-enabled
          no-access-control-w
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
        <v-btn
          depressed
          block
          color="primary"
          class="mt-4"
          :loading="indexLoading"
          :disabled="!locationIsFolder || indexLoading || readOnlyMode"
          @click="doIndex"
        >
          <span v-if="!locationIsFolder">
            Choose a folder...
          </span>
          <span v-else-if="'name' in location">
            Index datasets under {{ location.name }}
          </span>
          <span v-else>
            Index folder
          </span>
        </v-btn>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
