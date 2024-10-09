<script lang="ts">
import {
  defineComponent, onMounted, ref, Ref,
} from 'vue';
import {
  addDiveMetadataKey,
  deleteDiveMetadataKey,
  FilterDisplayConfig,
  getMetadataFilterValues,
  MetadataFilterKeysItem,
  modifyDiveMetadataPermission,
  updateDiveMetadataDisplay,
} from 'platform/web-girder/api/divemetadata.service';
import { getFolder } from 'platform/web-girder/api/girder.service';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { useRouter } from 'vue-router/composables';
import DIVEMetadataFilterVue from './DIVEMetadataFilter.vue';
import DIVEMetadataCloneVue from './DIVEMetadataClone.vue';

interface FormattedMetadataKeys {
    name: string,
    category: string,
    count: number,
    range?: { min: number, max: number},
    unique?: number,
    unlocked: boolean,
    visible: boolean,
    hidden: boolean,
}

export default defineComponent({
  name: 'DIVEMetadataSearch',
  components: {
    DIVEMetadataFilterVue,
    DIVEMetadataCloneVue,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const displayConfig: Ref<FilterDisplayConfig> = ref({ display: [], hide: [], categoricalLimit: 50 });

    const girderRest = useGirderRest();
    const router = useRouter();

    const isOwnerAdmin = ref(false);
    const unlocked: Ref<string[]> = ref([]);
    const metadataKeys: Ref<Record<string, MetadataFilterKeysItem>> = ref({});
    const formattedKeys: Ref<FormattedMetadataKeys[]> = ref([]);
    const addKeyDialog = ref(false);
    const addKeyData = ref({
      key: 'New Key Name',
      category: 'numerical',
      unlocked: false,
      values: '',
      defaultValue: '',
    });
    const getData = async () => {
      const { data } = await getMetadataFilterValues(props.id);
      formattedKeys.value = [];
      metadataKeys.value = data.metadataKeys;
      unlocked.value = data.unlocked;
      Object.keys(metadataKeys.value).forEach((key) => {
        if (metadataKeys.value && metadataKeys.value[key]) {
          formattedKeys.value.push({
            name: key,
            category: metadataKeys.value[key].category,
            count: metadataKeys.value[key].count,
            range: metadataKeys.value[key].range,
            unique: metadataKeys.value[key].unique,
            unlocked: unlocked.value.includes(key),
            visible: displayConfig.value.display.includes(key),
            hidden: displayConfig.value.hide.includes(key),
          });
        }
      });
    };

    const metadataHeader = ref([
      { text: 'State', value: 'visibility', width: '75px' },
      { text: 'Name', value: 'name' },
      { text: 'Category', value: 'category' },
      { text: 'Details', value: 'details' },
      { text: 'Edit', value: 'edit' },
    ]);
    const getFolderInfo = async (id: string) => {
      const folder = (await getFolder(id)).data;
      if (folder.meta.DIVEMetadata) {
        displayConfig.value = folder.meta.DIVEMetadataFilter;
        if (folder.creatorId === girderRest.user._id || girderRest.user.admin) {
          isOwnerAdmin.value = true;
        }
      }
    };

    onMounted(() => {
      getFolderInfo(props.id);
      getData();
    });

    const getEyeState = (item: FormattedMetadataKeys) => {
      if (item.visible) {
        return { tooltip: 'Item is default visible', icon: 'mdi-eye' };
      }
      if (item.hidden) {
        return { tooltip: 'Item is hidden', icon: 'mdi-eye-off' };
      }
      return { tooltip: 'Item is in the advanced view', icon: 'mdi-eye' };
    };
    const toggleVisibility = async (index: number) => {
      const item = formattedKeys.value[index];
      if (!item.visible && !item.hidden) {
        item.visible = true;
      } else if (!item.hidden) {
        item.visible = false;
        item.hidden = true;
      } else {
        item.visible = false;
        item.hidden = false;
      }
      let val: 'display' | 'hidden' | 'none' = 'none';
      if (item.visible) {
        val = 'display';
      } else if (item.hidden) {
        val = 'hidden';
      }
      updateDiveMetadataDisplay(props.id, item.name, val);
    };

    const toggleUnlock = async (index: number) => {
      const item = formattedKeys.value[index];
      if (item) {
        item.unlocked = !item.unlocked;
        modifyDiveMetadataPermission(props.id, item.name, item.unlocked);
      }
    };

    const deleteMetadata = async (index: number) => {
      const item = formattedKeys.value[index];
      if (item) {
        await deleteDiveMetadataKey(props.id, item.name);
        getFolderInfo(props.id);
        getData();
      }
    };

    const cancelNewKey = () => {
      addKeyDialog.value = false;
      addKeyData.value = {
        key: 'New Key Name',
        category: 'numerical',
        unlocked: false,
        values: '',
        defaultValue: '',
      };
    };

    const saveNewKey = async () => {
      let values: string[] = [];
      if (addKeyData.value.category === 'categorical') {
        values = addKeyData.value.values.split(',');
      }
      let defaultValue;
      if (addKeyData.value.defaultValue) {
        if (addKeyData.value.category === 'numerical') {
          defaultValue = parseFloat(addKeyData.value.defaultValue);
        } else if (addKeyData.value.category === 'boolean') {
          defaultValue = !!addKeyData.value.defaultValue;
        } else {
          defaultValue = addKeyData.value.defaultValue;
        }
      }
      await addDiveMetadataKey(
        props.id,
        addKeyData.value.key,
        addKeyData.value.category as 'numerical' | 'categorical' | 'search' | 'boolean',
        addKeyData.value.unlocked,
        values,
        defaultValue,
      );
      cancelNewKey();
      getFolderInfo(props.id);
      getData();
    };

    const initializeNewKey = () => {
      addKeyData.value = {
        key: 'New Key Name',
        category: 'numerical',
        unlocked: false,
        values: '',
        defaultValue: '',
      };
      addKeyDialog.value = true;
    };

    const returnToMetadata = () => {
      router.push({ name: 'metadata', params: { id: props.id } });
    };

    return {
      metadataHeader,
      formattedKeys,
      getEyeState,
      toggleVisibility,
      toggleUnlock,
      deleteMetadata,
      addKeyDialog,
      addKeyData,
      cancelNewKey,
      saveNewKey,
      initializeNewKey,
      returnToMetadata,
    };
  },
});
</script>

<template>
  <v-container>
    <v-row dense class="pb-4">
      <v-btn color="warning" @click="returnToMetadata()">
        Return to Metadata
      </v-btn>
      <v-spacer />
      <v-btn color="success" @click="initializeNewKey()">
        Add Metadata Field
      </v-btn>
    </v-row>
    <v-data-table
      :headers="metadataHeader"
      :items="formattedKeys"
      item-key="name"
    >
      <template #item.visibility="{ item, index }">
        <v-icon :color="item.visible ? 'primary' : ''" @click="toggleVisibility(index)">
          {{ getEyeState(item).icon }}
        </v-icon>
        <v-tooltip
          open-delay="200"
          bottom
          max-width="200"
        >
          <template #activator="{ on }">
            <v-icon small v-on="on">
              mdi-help
            </v-icon>
          </template>
          <span>{{ getEyeState(item).tooltip }}</span>
        </v-tooltip>
      </template>
      <template #item.details="{ item }">
        <div v-if="item.category !== 'numerical'">
          <div><span>Count:</span><span class="ml-2">{{ item.count }}</span></div>
          <div><span>Unique:</span><span class="ml-2">{{ item.unique }}</span></div>
        </div>
        <div v-else-if="item.category === 'numerical' && item.range">
          <div><span>Min:</span><span class="ml-2">{{ item.range.min }}</span></div>
          <div><span>Max:</span><span class="ml-2">{{ item.range.max }}</span></div>
        </div>
      </template>

      <template #item.edit="{ item, index }">
        <v-row>
          <v-icon :color="!item.unlocked ? '' : 'warning'" @click="toggleUnlock(index)">
            {{ item.unlocked ? 'mdi-lock-open' : 'mdi-lock' }}
          </v-icon>
          <v-icon color="error" @click="deleteMetadata(index)">
            mdi-delete
          </v-icon>
        </v-row>
      </template>
    </v-data-table>
    <v-dialog v-model="addKeyDialog" width="600">
      <v-card>
        <v-card-title>Add New Metadata Key</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-text-field v-model="addKeyData.key" label="Name" />
          </v-row>
          <v-row dense>
            <v-select v-model="addKeyData.category" :items="['numerical', 'categorical', 'search', 'boolean']" label="Category" />
          </v-row>
          <v-row dense>
            <v-switch v-model="addKeyData.unlocked" label="Unlocked" />
          </v-row>
          <v-row v-if="addKeyData.category === 'categorical'" dense>
            <v-text-field v-model="addKeyData.values" label="Categorical Values" hint="comma separated list of values" persistent-hint />
          </v-row>
          <v-row dense>
            <v-switch v-if="addKeyData.category === 'boolean'" v-model="addKeyData.defaultValue" label="Default Value" />
            <v-text-field v-else v-model="addKeyData.defaultValue" label="Default Value" />
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-row>
            <v-spacer />
            <v-btn color="error" class="mx-2" @click="cancelNewKey()">
              Cancel
            </v-btn>
            <v-btn color="success" class="mx-2" @click="saveNewKey()">
              Save
            </v-btn>
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
</style>
