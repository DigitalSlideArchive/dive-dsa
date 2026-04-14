<script lang="ts">
import {
  defineComponent, onMounted, ref, Ref,
  watch,
} from 'vue';
import draggable from 'vuedraggable';
import {
  addDiveMetadataKey,
  deleteDiveMetadataKey,
  FilterDisplayConfig,
  getMetadataFilterValues,
  MetadataKeyGroup,
  MetadataFilterKeysItem,
  modifyDiveMetadataPermission,
  partitionMetadataKeys,
  updateDiveMetadataDisplay,
  updateDiveMetadataFilterVisibility,
  updateDiveMetadataKeyDescription,
  updateDiveMetadataOrder,
  updateDiveMetadataSlicerConfig,
  effectiveFilterLists,
  orderMetadataKeys,
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
    filterVisible: boolean,
    filterHidden: boolean,
    description?: string,
}

interface FormattedMetadataGroup {
  id: string;
  name: string;
  description?: string;
  keys: FormattedMetadataKeys[];
}

export default defineComponent({
  name: 'DIVEMetadataSearch',
  components: {
    DIVEMetadataFilterVue,
    DIVEMetadataCloneVue,
    MetadataKeyLabel,
    draggable,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const displayConfig: Ref<FilterDisplayConfig> = ref({
      display: [], hide: [], order: [], groups: [], categoricalLimit: 50, slicerCLI: 'Disabled',
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
    const ungroupedKeys: Ref<FormattedMetadataKeys[]> = ref([]);
    const groupedKeys: Ref<FormattedMetadataGroup[]> = ref([]);
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
    const groupDialog = ref(false);
    const groupName = ref('');
    const groupDescription = ref('');
    const editingGroupId = ref('');

    const persistLayout = async () => {
      const arrangedOrder = [
        ...ungroupedKeys.value.map((item) => item.name),
        ...groupedKeys.value.flatMap((group) => group.keys.map((item) => item.name)),
      ];
      const groups: MetadataKeyGroup[] = groupedKeys.value.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        keys: group.keys.map((item) => item.name),
      }));
      const normalizedOrder = orderMetadataKeys(
        Object.keys(metadataKeys.value),
        {
          ...displayConfig.value,
          order: arrangedOrder,
          groups,
        },
      );
      await updateDiveMetadataOrder(props.id, normalizedOrder, groups);
    };

    const getData = async () => {
      const { data } = await getMetadataFilterValues(props.id);
      metadataKeys.value = data.metadataKeys;
      unlocked.value = data.unlocked;
      const { filterDisplay, filterHide } = effectiveFilterLists(displayConfig.value);
      const orderedKeys = orderMetadataKeys(Object.keys(metadataKeys.value), displayConfig.value);
      const allKeys: FormattedMetadataKeys[] = [];
      orderedKeys.forEach((key) => {
        if (metadataKeys.value && metadataKeys.value[key]) {
          allKeys.push({
            name: key,
            category: metadataKeys.value[key].category,
            count: metadataKeys.value[key].count,
            range: metadataKeys.value[key].range,
            unique: metadataKeys.value[key].unique,
            unlocked: unlocked.value.includes(key),
            visible: displayConfig.value.display.includes(key),
            hidden: displayConfig.value.hide.includes(key),
            filterVisible: filterDisplay.includes(key),
            filterHidden: filterHide.includes(key),
            description: metadataKeys.value[key].description,
          });
        }
      });
      const keyMap = allKeys.reduce<Record<string, FormattedMetadataKeys>>((acc, item) => {
        acc[item.name] = item;
        return acc;
      }, {});
      const partitioned = partitionMetadataKeys(
        Object.keys(keyMap),
        displayConfig.value,
        { includeEmptyGroups: true },
      );
      groupedKeys.value = partitioned.groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        keys: group.keys.map((key) => keyMap[key]).filter((item) => !!item),
      }));
      ungroupedKeys.value = partitioned.ungrouped.map((key) => keyMap[key]).filter((item) => !!item);
    };

    const saveOrder = async () => {
      processing.value = true;
      try {
        await persistLayout();
        await getFolderInfo(props.id);
        await getData();
      } finally {
        processing.value = false;
      }
    };
    const onDragEnd = async () => {
      await saveOrder();
    };
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
      if (folder.meta.DIVEMetadataFilter) {
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

    const getListEyeState = (item: FormattedMetadataKeys) => {
      if (item.visible) {
        return { tooltip: 'Shown in main list columns', icon: 'mdi-eye' };
      }
      if (item.hidden) {
        return { tooltip: 'Hidden from list view', icon: 'mdi-eye-off' };
      }
      return { tooltip: 'Shown only under Advanced on the list', icon: 'mdi-filter-variant' };
    };
    const toggleListVisibility = async (item: FormattedMetadataKeys) => {
      let val: 'display' | 'hidden' | 'none';
      if (!item.visible && !item.hidden) {
        val = 'display';
      } else if (item.visible) {
        val = 'hidden';
      } else {
        val = 'none';
      }
      await updateDiveMetadataDisplay(props.id, item.name, val);
      await getFolderInfo(props.id);
      await getData();
    };

    const getFilterEyeState = (item: FormattedMetadataKeys) => {
      if (item.filterVisible) {
        return { tooltip: 'Shown in main filters', icon: 'mdi-eye' };
      }
      if (item.filterHidden) {
        return { tooltip: 'Hidden from filters', icon: 'mdi-eye-off' };
      }
      return { tooltip: 'Shown only under Advanced Filters', icon: 'mdi-filter-variant' };
    };
    const getDetailsText = (item: FormattedMetadataKeys) => {
      if (item.category === 'numerical' && item.range) {
        return `Min: ${item.range.min} | Max: ${item.range.max}`;
      }
      return `Count: ${item.count} | Unique: ${item.unique ?? 0}`;
    };
    const nonUnlockableKeys = new Set([
      'DIVE_DatasetId',
      'DatasetId',
      'DIVEPath',
      'DIVE_Path',
      'DIVE_URL',
      'DIVE_Name',
      'LastModifiedBy',
      'LastModifiedTime',
      'LastModfiiedTime',
    ]);
    const ffprobeKeys = new Set([
      'width',
      'height',
      'display_aspect_ratio',
      'nb_frames',
      'duration',
    ]);
    const getUnlockRestrictionReason = (keyName: string) => {
      if (nonUnlockableKeys.has(keyName)) {
        return 'This system metadata field cannot be unlocked for editing.';
      }
      if (ffprobeKeys.has(keyName) || keyName.startsWith('ffprobe_')) {
        return 'This ffprobe-derived field cannot be unlocked for editing.';
      }
      return '';
    };
    const getDeleteRestrictionReason = (keyName: string) => {
      if (nonUnlockableKeys.has(keyName)) {
        return 'This system metadata field cannot be deleted.';
      }
      if (ffprobeKeys.has(keyName) || keyName.startsWith('ffprobe_')) {
        return 'This ffprobe-derived field cannot be deleted.';
      }
      return '';
    };
    const toggleFilterVisibility = async (item: FormattedMetadataKeys) => {
      let val: 'display' | 'hidden' | 'none';
      if (!item.filterVisible && !item.filterHidden) {
        val = 'display';
      } else if (item.filterVisible) {
        val = 'hidden';
      } else {
        val = 'none';
      }
      await updateDiveMetadataFilterVisibility(props.id, item.name, val);
      await getFolderInfo(props.id);
      await getData();
    };

    watch(slicerCLI, () => {
      updateDiveMetadataSlicerConfig(props.id, slicerCLI.value);
    });

    const toggleUnlock = async (item: FormattedMetadataKeys) => {
      if (item) {
        if (getUnlockRestrictionReason(item.name)) {
          return;
        }
        const nextUnlocked = !item.unlocked;
        await modifyDiveMetadataPermission(props.id, item.name, nextUnlocked);
        await getData();
      }
    };

    const deleteMetadata = async (name: string, purge = false) => {
      if (name) {
        if (getDeleteRestrictionReason(name)) {
          return;
        }
        processing.value = true;
        await deleteDiveMetadataKey(props.id, name, purge);
        getFolderInfo(props.id);
        await getData();
        processing.value = false;
        deleteKey.value = '';
        deleteDialog.value = false;
      }
    };

    const prepDeleteMetadata = (item: FormattedMetadataKeys) => {
      if (getDeleteRestrictionReason(item.name)) {
        return;
      }
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

    const initializeNewGroup = () => {
      editingGroupId.value = '';
      groupName.value = '';
      groupDescription.value = '';
      groupDialog.value = true;
    };

    const editGroup = (group: FormattedMetadataGroup) => {
      editingGroupId.value = group.id;
      groupName.value = group.name;
      groupDescription.value = group.description || '';
      groupDialog.value = true;
    };

    const saveGroup = async () => {
      if (!groupName.value.trim()) {
        return;
      }
      if (editingGroupId.value) {
        const existing = groupedKeys.value.find((group) => group.id === editingGroupId.value);
        if (existing) {
          existing.name = groupName.value.trim();
          existing.description = groupDescription.value.trim() || undefined;
        }
      } else {
        groupedKeys.value.push({
          id: `group_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          name: groupName.value.trim(),
          description: groupDescription.value.trim() || undefined,
          keys: [],
        });
      }
      groupDialog.value = false;
      await saveOrder();
    };

    const removeGroup = async (group: FormattedMetadataGroup) => {
      ungroupedKeys.value.push(...group.keys);
      groupedKeys.value = groupedKeys.value.filter((item) => item.id !== group.id);
      await saveOrder();
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
      onDragEnd,
      ungroupedKeys,
      groupedKeys,
      getListEyeState,
      toggleListVisibility,
      getFilterEyeState,
      getDetailsText,
      getUnlockRestrictionReason,
      getDeleteRestrictionReason,
      toggleFilterVisibility,
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
      groupDialog,
      groupName,
      groupDescription,
      editingGroupId,
      initializeNewGroup,
      editGroup,
      saveGroup,
      removeGroup,
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
      <v-btn color="primary" class="ml-2" @click="initializeNewGroup()">
        Add Group
      </v-btn>
    </v-row>
    <v-card class="pa-3 mb-4">
      <div class="text-subtitle-1 mb-2">
        Ungrouped Metadata Keys
      </div>
      <v-row dense class="px-2 pb-2 font-weight-bold text-caption">
        <v-col cols="1">
          Drag
        </v-col>
        <v-col cols="2">
          List/Filter
        </v-col>
        <v-col cols="3">
          Name
        </v-col>
        <v-col cols="1">
          Category
        </v-col>
        <v-col cols="2">
          Details
        </v-col>
        <v-col cols="3">
          Edit
        </v-col>
      </v-row>
      <draggable :list="ungroupedKeys" :group="{ name: 'metadata-keys' }" handle=".drag-handle" @end="onDragEnd">
        <v-card v-for="item in ungroupedKeys" :key="item.name" outlined class="mb-2 pa-2">
          <v-row align="center" dense>
            <v-col cols="1">
              <v-icon class="drag-handle" :disabled="processing">
                mdi-drag
              </v-icon>
            </v-col>
            <v-col cols="2">
              <v-tooltip bottom open-delay="200">
                <template #activator="{ on }">
                  <v-icon :color="item.visible ? 'primary' : ''" v-on="on" @click="toggleListVisibility(item)">
                    {{ getListEyeState(item).icon }}
                  </v-icon>
                </template>
                <span>{{ getListEyeState(item).tooltip }}</span>
              </v-tooltip>
              <v-tooltip bottom open-delay="200">
                <template #activator="{ on }">
                  <v-icon :color="item.filterVisible ? 'primary' : ''" class="ml-2" v-on="on" @click="toggleFilterVisibility(item)">
                    {{ getFilterEyeState(item).icon }}
                  </v-icon>
                </template>
                <span>{{ getFilterEyeState(item).tooltip }}</span>
              </v-tooltip>
            </v-col>
            <v-col cols="3">
              <MetadataKeyLabel :key-name="item.name" :description="item.description" />
            </v-col>
            <v-col cols="1">
              {{ item.category }}
            </v-col>
            <v-col cols="2" class="text-caption">
              {{ getDetailsText(item) }}
            </v-col>
            <v-col cols="3">
              <v-row dense no-gutters class="edit-actions-row align-center">
                <v-tooltip bottom open-delay="200">
                  <template #activator="{ on }">
                    <v-icon class="mr-1" small v-on="on" @click="openDescriptionDialog(item)">
                      mdi-text-box-outline
                    </v-icon>
                  </template>
                  <span>Edit metadata key description</span>
                </v-tooltip>
                <v-tooltip bottom open-delay="200">
                  <template v-if="getUnlockRestrictionReason(item.name)" #activator="{ on }">
                    <v-icon color="error" v-on="on">
                      mdi-lock-alert
                    </v-icon>
                  </template>
                  <template v-else #activator="{ on }">
                    <v-icon :color="!item.unlocked ? '' : 'warning'" v-on="on" @click="toggleUnlock(item)">
                      {{ item.unlocked ? 'mdi-lock-open' : 'mdi-lock' }}
                    </v-icon>
                  </template>
                  <span>{{ getUnlockRestrictionReason(item.name) || (item.unlocked ? 'Field is unlocked for editing' : 'Field is locked from editing') }}</span>
                </v-tooltip>
                <v-tooltip bottom open-delay="200">
                  <template v-if="getDeleteRestrictionReason(item.name)" #activator="{ on }">
                    <v-icon color="error" v-on="on">
                      mdi-delete-off
                    </v-icon>
                  </template>
                  <template v-else #activator="{ on }">
                    <v-icon color="error" v-on="on" @click="prepDeleteMetadata(item)">
                      mdi-delete
                    </v-icon>
                  </template>
                  <span>{{ getDeleteRestrictionReason(item.name) || 'Delete this metadata field' }}</span>
                </v-tooltip>
              </v-row>
            </v-col>
          </v-row>
        </v-card>
      </draggable>
    </v-card>

    <v-card v-for="group in groupedKeys" :key="group.id" class="pa-3 mb-4">
      <v-row align="center" dense>
        <v-col cols="8">
          <MetadataKeyLabel :key-name="group.name" :description="group.description" />
        </v-col>
        <v-col cols="4" class="text-right">
          <v-btn icon small @click="editGroup(group)">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn icon small color="error" @click="removeGroup(group)">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </v-col>
      </v-row>
      <v-row dense class="px-2 pb-2 font-weight-bold text-caption">
        <v-col cols="1">
          Drag
        </v-col>
        <v-col cols="2">
          List/Filter
        </v-col>
        <v-col cols="3">
          Name
        </v-col>
        <v-col cols="1">
          Category
        </v-col>
        <v-col cols="2">
          Details
        </v-col>
        <v-col cols="3">
          Edit
        </v-col>
      </v-row>
      <draggable :list="group.keys" :group="{ name: 'metadata-keys' }" handle=".drag-handle" @end="onDragEnd">
        <v-card v-for="item in group.keys" :key="item.name" outlined class="mb-2 pa-2">
          <v-row align="center" dense>
            <v-col cols="1">
              <v-icon class="drag-handle" :disabled="processing">
                mdi-drag
              </v-icon>
            </v-col>
            <v-col cols="2">
              <v-tooltip bottom open-delay="200">
                <template #activator="{ on }">
                  <v-icon :color="item.visible ? 'primary' : ''" v-on="on" @click="toggleListVisibility(item)">
                    {{ getListEyeState(item).icon }}
                  </v-icon>
                </template>
                <span>{{ getListEyeState(item).tooltip }}</span>
              </v-tooltip>
              <v-tooltip bottom open-delay="200">
                <template #activator="{ on }">
                  <v-icon :color="item.filterVisible ? 'primary' : ''" class="ml-2" v-on="on" @click="toggleFilterVisibility(item)">
                    {{ getFilterEyeState(item).icon }}
                  </v-icon>
                </template>
                <span>{{ getFilterEyeState(item).tooltip }}</span>
              </v-tooltip>
            </v-col>
            <v-col cols="3">
              <MetadataKeyLabel :key-name="item.name" :description="item.description" />
            </v-col>
            <v-col cols="1">
              {{ item.category }}
            </v-col>
            <v-col cols="2" class="text-caption">
              {{ getDetailsText(item) }}
            </v-col>
            <v-col cols="3">
              <v-row dense no-gutters class="edit-actions-row align-center">
                <v-tooltip bottom open-delay="200">
                  <template #activator="{ on }">
                    <v-icon class="mr-1" small v-on="on" @click="openDescriptionDialog(item)">
                      mdi-text-box-outline
                    </v-icon>
                  </template>
                  <span>Edit metadata key description</span>
                </v-tooltip>
                <v-tooltip bottom open-delay="200">
                  <template v-if="getUnlockRestrictionReason(item.name)" #activator="{ on }">
                    <v-icon color="error" v-on="on">
                      mdi-lock-alert
                    </v-icon>
                  </template>
                  <template v-else #activator="{ on }">
                    <v-icon :color="!item.unlocked ? '' : 'warning'" v-on="on" @click="toggleUnlock(item)">
                      {{ item.unlocked ? 'mdi-lock-open' : 'mdi-lock' }}
                    </v-icon>
                  </template>
                  <span>{{ getUnlockRestrictionReason(item.name) || (item.unlocked ? 'Field is unlocked for editing' : 'Field is locked from editing') }}</span>
                </v-tooltip>
                <v-tooltip bottom open-delay="200">
                  <template v-if="getDeleteRestrictionReason(item.name)" #activator="{ on }">
                    <v-icon color="error" v-on="on">
                      mdi-delete-off
                    </v-icon>
                  </template>
                  <template v-else #activator="{ on }">
                    <v-icon color="error" v-on="on" @click="prepDeleteMetadata(item)">
                      mdi-delete
                    </v-icon>
                  </template>
                  <span>{{ getDeleteRestrictionReason(item.name) || 'Delete this metadata field' }}</span>
                </v-tooltip>
              </v-row>
            </v-col>
          </v-row>
        </v-card>
      </draggable>
    </v-card>
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
    <v-dialog v-model="groupDialog" width="520">
      <v-card>
        <v-card-title>
          {{ groupName && editingGroupId ? 'Edit Group' : 'Add Group' }}
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="groupName" label="Group name" />
          <v-textarea
            v-model="groupDescription"
            auto-grow
            rows="3"
            label="Group description (optional)"
            hint="Shown as a tooltip info icon in metadata views."
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="groupDialog = false">
            Cancel
          </v-btn>
          <v-btn color="primary" :disabled="!groupName.trim()" @click="saveGroup">
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
.edit-actions-row {
  flex-wrap: nowrap;
  gap: 4px;
}
</style>
