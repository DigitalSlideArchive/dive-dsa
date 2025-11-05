<script lang="ts">
import {
  computed,
  defineComponent, onMounted, PropType, Ref, ref,
  watch,
} from 'vue';
import { EditAnnotationTypes } from 'vue-media-annotator/layers/';
import { DIVEMetadataAction } from 'dive-common/use/useActions';
import { useHandler } from 'vue-media-annotator/provides';
import { MetadataFilterKeysItem, getMetadataFilterValues } from 'platform/web-girder/api/divemetadata.service';

export default defineComponent({
  name: 'DiveMetadataAction',
  props: {
    action: {
      type: Object as PropType<DIVEMetadataAction>,
      required: true,
    },
  },
  emits: ['update:action', 'cancel'],
  setup(props, { emit }) {
    const geometryTypes: EditAnnotationTypes[] = ['rectangle', 'Time'];
    const localAction = ref({ ...props.action });
    const { getDiveMetadataRootId } = useHandler();
    const unlockedMap: Ref<Record<string, MetadataFilterKeysItem>> = ref({});
    const visibilityTypes: Ref<DIVEMetadataAction['visibility'][]> = ref(['always', 'connected']);
    const getMetadataFilters = async () => {
      const rootId = getDiveMetadataRootId();
      if (rootId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filterData = await getMetadataFilterValues(rootId);
        const { unlocked } = filterData.data;
        unlockedMap.value = {};
        if (unlocked) {
          unlocked.forEach((item) => {
            if (filterData.data.metadataKeys[item]) {
              unlockedMap.value[item] = filterData.data.metadataKeys[item];
            }
          });
        }
      }
    };
    onMounted(() => {
      getMetadataFilters();
    });
    const cancel = () => {
      emit('cancel');
    };
    const save = () => {
      emit('update:action', localAction.value);
    };
    const unlockedKeyValues = computed(() => Object.keys(unlockedMap.value));

    const selectedKeyCategory = computed(() => {
      if (localAction.value.key && unlockedMap.value[localAction.value.key]) {
        return unlockedMap.value[localAction.value.key].category;
      }
      return null;
    });

    const keyDataType: Ref<'string' | 'number' | 'boolean'> = ref('string');

    const actionTypes = ref(['set', 'dialog', 'remove']);
    watch(() => localAction.value.key, () => {
      const category = selectedKeyCategory.value;
      if (category) {
        if (category === 'numerical') {
          keyDataType.value = 'number';
        } else {
          keyDataType.value = 'string';
        }
      }
    });

    return {
      localAction,
      selectedKeyCategory,
      geometryTypes,
      unlockedKeyValues,
      keyDataType,
      actionTypes,
      visibilityTypes,
      cancel,
      save,
    };
  },
});
</script>

<template>
  <div class="ma-2 action-editor">
    <v-card>
      <v-card-title>Edit: DIVE Metadata Ation</v-card-title>
      <v-card-text>
        <v-combobox
          v-model="localAction.key"
          :items="unlockedKeyValues"
          label="Metadata Key"
          outlined
          dense
        />

        <!-- Key Data Type -->
        <v-select
          v-model="keyDataType"
          :items="['string', 'number', 'boolean']"
          label="Key Data Type"
          outlined
          dense
          class="mt-2"
        />

        <v-select
          v-model="localAction.actionType"
          :items="actionTypes"
          label="Action Type"
          outlined
          dense
          class="mt-2"
        />
        <!-- Value Setting-->
        <div v-if="localAction.actionType === 'set'">
          <v-text-field
            v-if="keyDataType !== 'boolean'"
            v-model="localAction.value"
            :label="`Value (${keyDataType})`"
            :type="keyDataType === 'number' ? 'number' : 'text'"
            outlined
            dense
            class="mt-2"
          />
          <v-checkbox
            v-else
            v-model="localAction.value"
            label="Boolean Value"
            class="mt-2"
          />
        </div>
        <!-- Visibility Setting-->
        <v-select
          v-model="localAction.visibility"
          :items="visibilityTypes"
          label="Visibility"
          outlined
          dense
          class="mt-2"
        />

      </v-card-text>
      <v-card-actions>
        <v-row dense>
          <v-spacer />
          <v-btn class="mx-2" @click="cancel">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            class="mx-2"
            @click="save"
          >
            Save
          </v-btn>
        </v-row>
      </v-card-actions>
    </v-card>
  </div>
</template>

<style scoped>
.action-editor {
  width: 100%;
  border: 1px solid gray;
}
</style>
