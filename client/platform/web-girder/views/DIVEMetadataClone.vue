<script lang="ts">
import {
  computed, defineComponent, Ref, ref, PropType,
} from 'vue';
import { GirderFileManager, GirderModelType } from '@girder/components/src';
import useRequest from 'dive-common/use/useRequest';
import { RootlessLocationType } from 'platform/web-girder/store/types';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { useRouter } from 'vue-router/composables';
import { DIVEMetadaFilter, createDiveMetadataClone } from 'platform/web-girder/api/divemetadata.service';

export default defineComponent({
  components: { GirderFileManager },

  props: {
    baseId: {
      type: String,
      required: true,
    },
    filter: {
      // Filter to apply to the dataset
      type: Object as PropType<DIVEMetadaFilter>,
      required: true,
    },
  },

  setup(props) {
    const router = useRouter();
    const girderRest = useGirderRest();
    const open = ref(false);
    const location: Ref<RootlessLocationType> = ref({
      _modelType: ('user' as GirderModelType),
      _id: girderRest.user._id,
    });
    const newName = ref('');

    const locationIsFolder = computed(() => (location.value._modelType === 'folder'));

    async function click() {
      open.value = true;
    }

    function setLocation(newLoc: RootlessLocationType) {
      if (!('meta' in newLoc && newLoc.meta.annotate)) {
        location.value = newLoc;
      }
    }

    const { request: _cloneRequest, error: cloneError, loading: cloneLoading } = useRequest();
    const doClone = () => _cloneRequest(async () => {
      const newDataset = await createDiveMetadataClone(props.baseId, props.filter, location.value._id, newName.value);
      router.push({ name: 'folder', params: { id: newDataset.data } });
    });

    return {
      cloneError,
      cloneLoading,
      location,
      locationIsFolder,
      newName,
      open,
      /* methods */
      click,
      doClone,
      setLocation,
    };
  },
});
</script>

<template>
  <v-dialog
    v-model="open"
    :max-width="800"
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
            v-bind="{ ...tattrs }"
            :disabled="baseId === null"
            v-on="{ ...ton, click }"
          >
            <v-icon>
              mdi-content-copy
            </v-icon>
            <span
              class="pl-1"
            >
              Clone
            </span>
            <v-spacer />
          </v-btn>
        </template>
        <span>Create a clone of this data</span>
      </v-tooltip>
    </template>

    <v-card>
      <v-divider />
      <v-card-title>
        Create a new clone
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="cloneError"
          type="error"
          dismissible
        >
          {{ cloneError }}
        </v-alert>
        Create a copy of this filter in your personal workspace.  You will be able
        to edit annotations and run pipelines on the cloned datasets.  This operation does not
        copy, but instead directly references the source media.
        <v-text-field
          v-model="newName"
          label="New clone name"
          class="mt-4"
          outlined
          dense
          block
        />
        <v-card
          outlined
          flat
        >
          <GirderFileManager
            new-folder-enabled
            root-location-disabled
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
          :loading="cloneLoading"
          :disabled="!locationIsFolder || cloneLoading"
          @click="doClone"
        >
          <span v-if="!locationIsFolder">
            Choose a destination folder...
          </span>
          <span v-else-if="'name' in location">
            Clone into {{ location.name }}
          </span>
          <span v-else>
            Something went wrong
          </span>
        </v-btn>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
</style>
