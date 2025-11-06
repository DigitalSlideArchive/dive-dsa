<script lang="ts">
import {
  computed,
  defineComponent, onMounted, PropType, Ref, ref,
  watch,
} from 'vue';
import { EditAnnotationTypes } from 'vue-media-annotator/layers/';
import { DIVEMetadataAction } from 'dive-common/use/useActions';
import { useHandler } from 'vue-media-annotator/provides';
import { MetadataFilterKeysItem, addDiveMetadataKey, getMetadataFilterValues } from 'platform/web-girder/api/divemetadata.service';

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
    const existingKey = ref(true);
    watch(() => localAction.value.key, () => {
      const category = selectedKeyCategory.value;
      if (category) {
        if (category === 'numerical') {
          keyDataType.value = 'number';
        } else if (category === 'boolean') {
          keyDataType.value = 'boolean';
        } else {
          keyDataType.value = 'string';
        }
        if (isConnectedToMetadata.value) {
          existingKey.value = true;
        } else {
          existingKey.value = false;
        }
      } else {
        keyDataType.value = 'string';
        existingKey.value = false;
      }
    });

    const newKeyType: Ref<'numerical' | 'categorical' | 'search' | 'boolean'> = ref('search');
    const newKeyTypes = ref(['numerical', 'categorical', 'search', 'boolean']);
    const newKeyCategoricalValues = ref('');
    const newKeyInitialValue = ref('');
    const processingNewKey = ref(false);

    const createNewKey = async () => {
      let values: string[] = [];
      if (newKeyType.value === 'categorical') {
        values = newKeyCategoricalValues.value.split(',');
      }
      let defaultValue;
      if (newKeyInitialValue.value) {
        if (newKeyType.value === 'numerical') {
          defaultValue = parseFloat(newKeyInitialValue.value);
        } else if (newKeyType.value === 'boolean') {
          defaultValue = !!newKeyInitialValue.value;
        } else {
          defaultValue = newKeyInitialValue.value;
        }
      }
      processingNewKey.value = true;
      const rootId = getDiveMetadataRootId();
      if (!rootId) {
        processingNewKey.value = false;
        return;
      }
      await addDiveMetadataKey(
        rootId,
        localAction.value.key,
        newKeyType.value,
        true,
        values,
        defaultValue,
      );
      await getMetadataFilters();
      processingNewKey.value = false;
      if (unlockedKeyValues.value.includes(localAction.value.key)) {
        existingKey.value = true;
      }
    };

    const isConnectedToMetadata = computed(() => {
      const rootId = getDiveMetadataRootId();
      return !!rootId;
    });

    return {
      isConnectedToMetadata,
      localAction,
      selectedKeyCategory,
      geometryTypes,
      unlockedKeyValues,
      keyDataType,
      actionTypes,
      visibilityTypes,
      existingKey,
      cancel,
      save,
      // Adding new Key
      newKeyType,
      newKeyTypes,
      newKeyInitialValue,
      processingNewKey,
      createNewKey,
    };
  },
});
</script>

<template>
  <div class="ma-2 action-editor">
    <v-card>
      <v-card-title>Edit: DIVE Metadata Action</v-card-title>
      <v-card-text>
        <v-alert v-if="!isConnectedToMetadata" type="info" dense>
          Error: Not connected to DIVE Metadata. You can still create the action, keys won't be automatically populated and errors could occur during execution.
        </v-alert>
        <v-combobox
          v-model="localAction.key"
          :items="unlockedKeyValues"
          label="Metadata Key"
          outlined
          dense
        />

        <v-alert v-if="!existingKey" type="warning" class="mt-2" dense>
          Warning: The selected key does not exist in the unlocked metadata keys.  If you are the metadata owner you can create the key now.
        </v-alert>
        <div v-if="!existingKey" class="ma-2 action-editor">
          <v-card class="pb-6">
            <v-card-title>Create New Key</v-card-title>
            <v-card-text>
              <v-select
                v-model="newKeyType"
                :items="newKeyTypes"
                label="New Key Type"
                outlined
                dense
                class="mt-2"
              />
              <v-text-field
                v-model="newKeyInitialValue"
                :label="`Initial Value (${newKeyType === 'numerical' ? 'number' : 'string'})`"
                :type="newKeyType === 'numerical' ? 'number' : 'text'"
                outlined
                dense
                class="mt-2"
              />
              <v-btn
                :loading="processingNewKey"
                class="mt-2"
                color="primary"
                @click="createNewKey"
              >
                Create New Key
              </v-btn>
            </v-card-text>
          </v-card>
        </div>

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
        <p><b>connected:</b> Only show button/icons when coming from Metadata Link</p>

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
