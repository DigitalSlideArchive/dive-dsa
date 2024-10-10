<script lang="ts">
import {
  computed, defineComponent, Ref, ref, PropType,
} from 'vue';
import { GirderFileManager, GirderModelType } from '@girder/components/src';
import useRequest from 'dive-common/use/useRequest';
import { RootlessLocationType } from 'platform/web-girder/store/types';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { getFolder } from 'platform/web-girder/api';
import { useRouter } from 'vue-router/composables';
import { createDiveMetadataFolder } from 'platform/web-girder/api/divemetadata.service';
import { GirderModel } from 'vue-girder-slicer-cli-ui/dist/girderTypes';

export default defineComponent({
  components: { GirderFileManager },

  props: {
    datasetId: {
      type: String as PropType<string | null>,
      default: null,
    },
    revision: {
      type: Number,
      default: undefined,
    },
    buttonOptions: {
      type: Object,
      default: () => ({}),
    },
    menuOptions: {
      type: Object,
      default: () => ({}),
    },
  },

  setup(props) {
    const router = useRouter();
    const girderRest = useGirderRest();
    const source = ref(null as GirderModel | null);
    const open = ref(false);
    const categoricalLimit = ref(50);
    const location: Ref<RootlessLocationType> = ref({
      _modelType: ('user' as GirderModelType),
      _id: girderRest.user._id,
    });
    const newName = ref('');

    const locationIsFolder = computed(() => (location.value._modelType === 'folder'));

    async function click() {
      if (props.datasetId) {
        source.value = (await getFolder(props.datasetId)).data;
        newName.value = `DiveMetadata of ${source.value.name}`;
        open.value = true;
      }
    }

    function setLocation(newLoc: RootlessLocationType) {
      if (!('meta' in newLoc && newLoc.meta.annotate)) {
        location.value = newLoc;
      }
    }

    const { request: _createRequest, error: createError, loading: createLoading } = useRequest();
    const doCreate = () => _createRequest(async () => {
      if (!props.datasetId) {
        throw new Error('no source dataset');
      }
      const newDataset = await createDiveMetadataFolder(
        location.value._id,
        newName.value,
        props.datasetId,
        categoricalLimit.value,
      );
      router.push({ name: 'metadata', params: { id: newDataset.data.folderId } });
    });

    return {
      createError,
      createLoading,
      location,
      locationIsFolder,
      newName,
      open,
      source,
      categoricalLimit,
      /* methods */
      click,
      doCreate,
      setLocation,
    };
  },
});
</script>

<template>
  <v-dialog
    v-model="open"
    :max-width="800"
    :overlay-opacity="0.95"
  >
    <template #activator="{ attrs, on }">
      <v-tooltip
        v-bind="attrs"
        bottom
        open-delay="400"
        v-on="on"
      >
        <template #activator="{ on: ton, attrs: tattrs }">
          <v-btn
            v-bind="{ ...tattrs, ...buttonOptions }"
            :disabled="datasetId === null"
            v-on="{ ...ton, click }"
          >
            <v-icon>
              mdi-format-list-bulleted
            </v-icon>
            <span
              v-show="buttonOptions.block"
              class="pl-1"
            >
              Create Metadata Folder
            </span>
            <v-spacer />
          </v-btn>
        </template>
        <span>Create a DIVEMetadata Item based on subfolders</span>
      </v-tooltip>
    </template>

    <v-card v-if="source">
      <v-divider />
      <v-card-title>
        Create a DIVEMetadata Item from the current folder
      </v-card-title>
      <v-card-text>
        <v-card-text>
          This will generate a DIVEMetadata Item for the current folder.  It will recursively find all DIVE
          Datasets in the children folder and extract the filename, id, and ffmpeg information for indexing purposes.
          After this is complete you can then use the <v-chip>edit filters</v-chip> button to add new fields and change what fields are bvisible by default.
          <v-text-field
            v-model="newName"
            label="New MetadataFolder name"
            class="mt-4"
            outlined
            dense
            block
          />
          <v-text-field
            v-model="categoricalLimit"
            type="number"
            label="Categorical Limit"
            hint="number of unique values before converting to a searchable field"
          />

          <v-card
            outlined
            flat
          >
            <p>Choose a location where the new metadataFolder should be placed</p>
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
          </v-card>
          <v-btn
            depressed
            block
            color="primary"
            class="mt-4"
            :loading="createLoading"
            :disabled="!locationIsFolder || createLoading"
            @click="doCreate"
          >
            <span v-if="!locationIsFolder">
              Choose a destination folder...
            </span>
            <span v-else-if="'name' in location">
              Create DIVEMetadata Item into {{ location.name }}
            </span>
            <span v-else>
              Something went wrong
            </span>
          </v-btn>
        </v-card-text>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
