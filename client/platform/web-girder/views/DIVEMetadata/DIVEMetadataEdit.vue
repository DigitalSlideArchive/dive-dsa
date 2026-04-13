<script lang="ts">
import {
  defineComponent, onMounted, ref, Ref,
  watch,
} from 'vue';
import {
  addDiveMetadataKey,
  deleteDiveMetadataKey,
  FilterDisplayConfig,
  getMetadataFilterValues,
  MetadataFilterKeysItem,
  modifyDiveMetadataPermission,
  updateDiveMetadataDisplay,
  updateDiveMetadataKeyDescription,
  updateDiveMetadataSlicerConfig,
} from 'platform/web-girder/api/divemetadata.service';
import { AccessType, getFolder, getFolderAccess } from 'platform/web-girder/api/girder.service';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { useRouter } from 'vue-router/composables';
import DIVEMetadataFilterVue from './DIVEMetadataFilter.vue';
import DIVEMetadataCloneVue from './DIVEMetadataClone.vue';
import MetadataKeyLabel from './MetadataKeyLabel.vue';

interface FormattedMetadataKeys {
    name: string,
    category: string,
    count: number,
    range?: { min: number, max: number},
    unique?: number,
    unlocked: boolean,
    visible: boolean,
    hidden: boolean,
    description?: string,
}

export default defineComponent({
  name: 'DIVEMetadataSearch',
  components: {
    DIVEMetadataFilterVue,
    DIVEMetadataCloneVue,
    MetadataKeyLabel,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const displayConfig: Ref<FilterDisplayConfig> = ref({
      display: [], hide: [], categoricalLimit: 50, slicerCLI: 'Disabled',
    });

    const girderRest = useGirderRest();
    const router = useRouter();
    const categoryLimit = ref(50);
    const slicerCLI: Ref<FilterDisplayConfig['slicerCLI']> = ref('Disabled');

    const processing = ref(false);
    const deleteDialog = ref(false);
    const deleteKey = ref('');
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
      description: '',
    });
    const descriptionDialog = ref(false);
    const descriptionEditKey = ref('');
    const descriptionEditText = ref('');
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
            description: metadataKeys.value[key].description,
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
      try {
        const access = (await getFolderAccess(id)).data;
        const accessMap: Record<string, AccessType> = {};
        access.users.forEach((item) => {
          accessMap[item.id] = item;
        });
        if (accessMap[girderRest.user._id] && accessMap[girderRest.user._id].level === 2) {
          isOwnerAdmin.value = true;
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.warn('Cannot Access Folder assuming not an owner');
      }
      if (folder.meta.DIVEMetadata) {
        displayConfig.value = folder.meta.DIVEMetadataFilter;
        categoryLimit.value = displayConfig.value.categoricalLimit || 50;
        slicerCLI.value = displayConfig.value.slicerCLI || 'Disabled';
      }
      if (folder.creatorId === girderRest.user._id || girderRest.user.admin) {
        isOwnerAdmin.value = true;
      }
    };

    onMounted(async () => {
      await getFolderInfo(props.id);
      await getData();
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

    watch(slicerCLI, () => {
      updateDiveMetadataSlicerConfig(props.id, slicerCLI.value);
    });

    const toggleUnlock = async (index: number) => {
      const item = formattedKeys.value[index];
      if (item) {
        item.unlocked = !item.unlocked;
        modifyDiveMetadataPermission(props.id, item.name, item.unlocked);
      }
    };

    const deleteMetadata = async (name: string, purge = false) => {
      if (name) {
        processing.value = true;
        await deleteDiveMetadataKey(props.id, name, purge);
        getFolderInfo(props.id);
        await getData();
        processing.value = false;
        deleteKey.value = '';
        deleteDialog.value = false;
      }
    };

    const prepDeleteMetadata = (index: number) => {
      const item = formattedKeys.value[index];
      deleteKey.value = item.name;
      deleteDialog.value = true;
    };

    const cancelNewKey = () => {
      addKeyDialog.value = false;
      addKeyData.value = {
        key: 'New Key Name',
        category: 'numerical',
        unlocked: false,
        values: '',
        defaultValue: '',
        description: '',
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
      processing.value = true;
      await addDiveMetadataKey(
        props.id,
        addKeyData.value.key,
        addKeyData.value.category as 'numerical' | 'categorical' | 'search' | 'boolean',
        addKeyData.value.unlocked,
        values,
        defaultValue,
        addKeyData.value.description,
      );
      cancelNewKey();
      await getFolderInfo(props.id);
      await getData();
      processing.value = false;
    };

    const initializeNewKey = () => {
      addKeyData.value = {
        key: 'New Key Name',
        category: 'numerical',
        unlocked: false,
        values: '',
        defaultValue: '',
        description: '',
      };
      addKeyDialog.value = true;
    };

    const openDescriptionDialog = (item: FormattedMetadataKeys) => {
      descriptionEditKey.value = item.name;
      descriptionEditText.value = item.description || '';
      descriptionDialog.value = true;
    };

    const closeDescriptionDialog = () => {
      descriptionDialog.value = false;
      descriptionEditKey.value = '';
      descriptionEditText.value = '';
    };

    const saveDescriptionDialog = async () => {
      processing.value = true;
      try {
        await updateDiveMetadataKeyDescription(
          props.id,
          descriptionEditKey.value,
          descriptionEditText.value,
        );
        closeDescriptionDialog();
        await getData();
      } finally {
        processing.value = false;
      }
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
      isOwnerAdmin,
      processing,
      deleteDialog,
      deleteKey,
      prepDeleteMetadata,
      slicerCLI,
      descriptionDialog,
      descriptionEditKey,
      descriptionEditText,
      openDescriptionDialog,
      closeDescriptionDialog,
      saveDescriptionDialog,
    };
  },
});
</script>

<template>
  <v-container v-if="isOwnerAdmin">
    <v-row dense class="pb-4" align="center">
      <v-btn color="warning" @click="returnToMetadata()">
        Return to Metadata
      </v-btn>
      <v-spacer />
      <v-select
        v-model="slicerCLI"
        label="Slicer CLI:"
        variant="outlined"
        :items="['Disabled', 'Owner', 'All Users']"
        dense
        hide-details
        style="max-width:200px"
        class="mr-6"
      />

      <v-btn color="success" @click="initializeNewKey()">
        Add Metadata Field
      </v-btn>
    </v-row>
    <v-data-table
      :headers="metadataHeader"
      :items="formattedKeys"
      item-key="name"
      :items-per-page="-1"
      hide-default-footer
    >
      <template #item.name="{ item }">
        <MetadataKeyLabel :key-name="item.name" :description="item.description" />
      </template>
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
          <v-tooltip bottom open-delay="200">
            <template #activator="{ on }">
              <v-icon class="mr-1" small v-on="on" @click="openDescriptionDialog(item)">
                mdi-text-box-outline
              </v-icon>
            </template>
            <span>Edit key description (optional)</span>
          </v-tooltip>
          <v-icon :color="!item.unlocked ? '' : 'warning'" @click="toggleUnlock(index)">
            {{ item.unlocked ? 'mdi-lock-open' : 'mdi-lock' }}
          </v-icon>
          <v-icon color="error" @click="prepDeleteMetadata(index)">
            mdi-delete
          </v-icon>
        </v-row>
      </template>
    </v-data-table>
    <v-dialog v-model="deleteDialog" width="600">
      <v-card>
        <v-card-title>Delete Metadata Key: {{ deleteKey }}</v-card-title>
        <v-card-text v-if="!processing">
          <p>The simple 'Delete' Button will delete the key from the Metadata structure but the values will remain on all DIVEDatasets but won't be displayed in the filters</p>
          <p>The 'Purge' option will remove the value from all the datasets.  This will take longer to process</p>
        </v-card-text>
        <v-card-text v-else-if="processing">
          <p>Processing the Delete request</p>
          <v-row>
            <v-spacer />
            <v-progress-circular color="primary" indeterminate :size="128" :width="12" />
            <v-spacer />
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-row dense>
            <v-spacer />
            <v-btn color="" :disabled="processing" class="mx-2" @click="deleteDialog = false; deleteKey = ''">
              Cancel
            </v-btn>
            <v-btn color="error" :disabled="processing" class="mx-2" @click="deleteMetadata(deleteKey)">
              Delete <v-icon>mdi-delete</v-icon>
            </v-btn>
            <v-btn color="error" :disabled="processing" class="mx-2" @click="deleteMetadata(deleteKey, true)">
              Purge <v-icon>mdi-nuke</v-icon>
            </v-btn>
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="addKeyDialog" width="600">
      <v-card>
        <v-card-title>Add New Metadata Key</v-card-title>
        <v-card-text v-if="!processing">
          <v-row dense>
            <v-text-field v-model="addKeyData.key" label="Name" />
          </v-row>
          <v-row dense>
            <v-textarea
              v-model="addKeyData.description"
              auto-grow
              rows="2"
              label="Description (optional)"
              hint="Shown as a tooltip next to the key name in metadata views"
              persistent-hint
            />
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
        <v-card-text v-else-if="processing">
          <p>Processing the update/save request</p>
          <v-row>
            <v-spacer />
            <v-progress-circular color="primary" indeterminate :size="128" :width="12" />
            <v-spacer />
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-row>
            <v-spacer />
            <v-btn color="error" :disabled="processing" class="mx-2" @click="cancelNewKey()">
              Cancel
            </v-btn>
            <v-btn color="success" :disabled="processing" class="mx-2" @click="saveNewKey()">
              Save
            </v-btn>
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="descriptionDialog" width="560" @click:outside="closeDescriptionDialog">
      <v-card>
        <v-card-title>Description: {{ descriptionEditKey }}</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="descriptionEditText"
            auto-grow
            rows="3"
            label="Description"
            hint="Leave empty to remove the description. Shown on hover next to the key name."
            persistent-hint
            outlined
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text :disabled="processing" @click="closeDescriptionDialog">
            Cancel
          </v-btn>
          <v-btn color="primary" :disabled="processing" @click="saveDescriptionDialog">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
  <v-container v-else>
    <v-alert color="warning">
      You don't have owner privileges on this DIVEMetadata Folder.  Request Owner access to be able to edit fields
    </v-alert>
  </v-container>
</template>

<style scoped>
</style>
