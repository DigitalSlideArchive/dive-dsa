<script lang="ts">
import {
  defineComponent, onMounted, ref, Ref,
} from 'vue';
import {
  FilterDisplayConfig,
  getMetadataFilterValues,
  MetadataFilterKeysItem,
} from 'platform/web-girder/api/divemetadata.service';
import { getFolder } from 'platform/web-girder/api/girder.service';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
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
    const isOwnerAdmin = ref(false);
    const unlocked: Ref<string[]> = ref([]);
    const metadataKeys: Ref<Record<string, MetadataFilterKeysItem>> = ref({});
    const formattedKeys: Ref<FormattedMetadataKeys[]> = ref([]);
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
    const toggleVisibility = (index: number) => {
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
    };

    return {
      metadataHeader,
      formattedKeys,
      getEyeState,
      toggleVisibility,
    };
  },
});
</script>

<template>
  <v-container>
    <v-row dense>
      <v-spacer />
      <v-btn color="success">
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

      <template #item.edit="{ item }">
        <v-row>
          <v-icon :color="!item.unlocked ? '' : 'warning'">
            {{ item.unlocked ? 'mdi-lock-open' : 'mdi-lock' }}
          </v-icon>
          <v-icon color="error">
            mdi-delete
          </v-icon>
        </v-row>
      </template>
    </v-data-table>
  </v-container>
</template>

<style scoped>
</style>
