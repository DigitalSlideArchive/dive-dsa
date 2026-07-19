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
import {
  createDiveMetadataFolder,
  createDiveMetadataRecursive,
} from 'platform/web-girder/api/divemetadata.service';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { notifyAndWatchMetadataIngestJob } from 'platform/web-girder/utils/metadataIngestJobUi';
import type { GirderModel } from 'vue-girder-slicer-cli-ui/dist/girderTypes';
import eventBus from '../eventBus';

export default defineComponent({
  components: { GirderFileManager },

  props: {
    datasetId: {
      type: String as PropType<string | null>,
      default: null,
    },
    resourceType: {
      type: String as PropType<'folder' | 'collection' | null>,
      default: null,
    },
    resourceName: {
      type: String,
      default: '',
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
    const { prompt } = usePrompt();
    const girderRest = useGirderRest();
    const source = ref(null as GirderModel | { _id: string; _modelType: string; name: string } | null);
    const open = ref(false);
    const categoricalLimit = ref(50);
    const perSubfolder = ref(false);
    const scope = ref<'single' | 'subfolders'>('single');
    const location: Ref<RootlessLocationType> = ref({
      _modelType: ('user' as GirderModelType),
      _id: girderRest.user._id,
    });
    const newName = ref('DIVE Metadata');

    const isCollection = computed(() => props.resourceType === 'collection');
    const useRecursiveApi = computed(
      () => isCollection.value || perSubfolder.value,
    );
    const locationIsFolder = computed(() => (location.value._modelType === 'folder'));
    const effectiveScope = computed(() => {
      if (isCollection.value) {
        return scope.value;
      }
      return perSubfolder.value ? 'subfolders' : 'single';
    });

    async function click() {
      if (!props.datasetId) {
        return;
      }
      if (props.resourceType === 'collection') {
        source.value = {
          _id: props.datasetId,
          _modelType: 'collection',
          name: props.resourceName || 'Collection',
        };
        scope.value = 'subfolders';
        perSubfolder.value = true;
        newName.value = 'DIVE Metadata';
      } else {
        source.value = (await getFolder(props.datasetId)).data;
        newName.value = `DiveMetadata of ${source.value.name}`;
        scope.value = 'single';
        perSubfolder.value = false;
      }
      open.value = true;
    }

    function setLocation(newLoc: RootlessLocationType) {
      if (!('meta' in newLoc && newLoc.meta.annotate)) {
        location.value = newLoc;
      }
    }

    const { request: _createRequest, error: createError, loading: createLoading } = useRequest();
    const doCreate = () => _createRequest(async () => {
      if (!props.datasetId) {
        throw new Error('no source resource');
      }
      if (useRecursiveApi.value) {
        const { data: job } = await createDiveMetadataRecursive(
          props.datasetId,
          isCollection.value ? 'collection' : 'folder',
          effectiveScope.value,
          newName.value,
          categoricalLimit.value,
        );
        open.value = false;
        await notifyAndWatchMetadataIngestJob({
          job,
          prompt,
          router,
          onSuccess: () => {
            eventBus.$emit('refresh-data-browser');
          },
        });
        return;
      }
      if (!locationIsFolder.value) {
        throw new Error('Choose a destination folder');
      }
      const { data: job } = await createDiveMetadataFolder(
        location.value._id,
        newName.value,
        props.datasetId,
        categoricalLimit.value,
      );
      open.value = false;
      await notifyAndWatchMetadataIngestJob({
        job,
        prompt,
        router,
        onSuccess: () => {
          eventBus.$emit('refresh-data-browser');
        },
      });
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
      perSubfolder,
      scope,
      isCollection,
      useRecursiveApi,
      effectiveScope,
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
        <span>Create DIVE metadata for this folder or collection (skips existing metadata)</span>
      </v-tooltip>
    </template>

    <v-card v-if="source">
      <v-divider />
      <v-card-title>
        Create DIVE metadata from {{ source.name }}
      </v-card-title>
      <v-card-text>
        <v-card-text>
          <p v-if="isCollection">
            For a <strong>collection</strong>, you can create one metadata folder for the whole
            collection or one per top-level folder (as a sibling folder next to each one). Existing
            metadata folders are reused and only missing datasets are indexed.
          </p>
          <p v-else>
            This indexes DIVE datasets under the current folder. Existing metadata rows are not
            replaced. Choose a destination folder, or enable per-subfolder creation below.
          </p>
          <v-text-field
            v-model="newName"
            label="Metadata folder name"
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
          <v-radio-group
            v-if="isCollection"
            v-model="scope"
            label="Collection scope"
            class="mt-2"
          >
            <v-radio
              label="One metadata folder for the entire collection"
              value="single"
            />
            <v-radio
              label="One metadata folder per top-level folder"
              value="subfolders"
            />
          </v-radio-group>
          <v-checkbox
            v-else
            v-model="perSubfolder"
            label="Create a sibling metadata folder for each immediate subfolder"
            class="mt-2"
          />

          <v-card
            v-if="!useRecursiveApi"
            outlined
            flat
            class="mt-2"
          >
            <p>Choose where the new metadata folder should be placed</p>
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
            :disabled="(!useRecursiveApi && !locationIsFolder) || createLoading"
            @click="doCreate"
          >
            <span v-if="!useRecursiveApi && !locationIsFolder">
              Choose a destination folder...
            </span>
            <span v-else-if="useRecursiveApi && effectiveScope === 'subfolders'">
              Create metadata for subfolders of {{ source.name }}
            </span>
            <span v-else-if="useRecursiveApi">
              Create metadata for {{ source.name }}
            </span>
            <span v-else-if="'name' in location">
              Create metadata folder in {{ location.name }}
            </span>
            <span v-else>
              Create metadata
            </span>
          </v-btn>
        </v-card-text>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
