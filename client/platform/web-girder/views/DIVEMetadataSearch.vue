<script lang="ts">
import {
  defineComponent, onMounted, ref, Ref, PropType,
} from 'vue';
import {
  DIVEMetadataResults, DIVEMetadataFilter, filterDiveMetadata, MetadataResultItem, FilterDisplayConfig,
  DIVEMetadataFilterValueResults,
  MetadataFilterKeysItem,
  setDiveDatasetMetadataKey,
} from 'platform/web-girder/api/divemetadata.service';
import { getFolder } from 'platform/web-girder/api/girder.service';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import DIVEMetadataFilterVue from './DIVEMetadataFilter.vue';
import DIVEMetadataCloneVue from './DIVEMetadataClone.vue';
import DIVEMetadataEditKey from './DIVEMetadataEditKey.vue';

export default defineComponent({
  name: 'DIVEMetadataSearch',
  components: {
    DIVEMetadataFilterVue,
    DIVEMetadataCloneVue,
    DIVEMetadataEditKey,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
    filter: {
      type: Object as PropType<DIVEMetadataFilter>,
      default: () => { },
    },
  },
  setup(props) {
    const folderList: Ref<MetadataResultItem[]> = ref([]);
    const unlockedMap: Ref<Record<string, MetadataFilterKeysItem>> = ref({});
    const displayConfig: Ref<FilterDisplayConfig> = ref({ display: [], hide: [], categoricalLimit: 50 });
    const totalPages = ref(0);
    const currentPage = ref(0);
    const count = ref(0);
    const filtered = ref(0);
    const girderRest = useGirderRest();
    const filters: Ref<DIVEMetadataFilter> = ref(props.filter || {});
    const locationStore = {
      _id: props.id,
      _modelType: 'folder',
    };

    const currentFilter: Ref<DIVEMetadataFilter> = ref(props.filter || {});
    const isOwnerAdmin = ref(false);
    const processFilteredMetadataResults = (data: DIVEMetadataResults) => {
      folderList.value = data.pageResults;
      totalPages.value = data.totalPages;
      filtered.value = data.filtered;
      count.value = data.count;
    };
    const getData = async () => {
      const { data } = await filterDiveMetadata(props.id, { ...filters.value });
      processFilteredMetadataResults(data);
    };

    const getFolderInfo = async (id: string) => {
      const folder = (await getFolder(id)).data;
      if (folder.meta.DIVEMetadata) {
        displayConfig.value = folder.meta.DIVEMetadataFilter;
      }
      if (folder.creatorId === girderRest.user._id || girderRest.user.admin) {
        isOwnerAdmin.value = true;
      }
    };

    const updateURLParams = () => {
      if ((filters.value.metadataFilters && Object.keys(filters.value.metadataFilters).length) || filters.value.search) {
        window.location.href = window.location.href.replace(/metadata\/.*/, `metadata/${props.id}?filter=${(JSON.stringify(filters.value))}`);
      } else {
        window.location.href = window.location.href.replace(/filter=.*/, '');
      }
    };

    onMounted(() => {
      getFolderInfo(props.id);
      getData();
    });

    const storedSortVal = ref('filename');
    const storedSortDir = ref(1);

    const updateFilter = async ({ filter, sortVal, sortDir }: { filter?: DIVEMetadataFilter, sortVal?: string, sortDir?: number }) => {
      if (filter) {
        filters.value = filter;
        currentPage.value = 0;
        currentFilter.value = filter;
      }
      if (sortVal) {
        storedSortVal.value = sortVal;
      }
      if (sortDir) {
        storedSortDir.value = sortDir;
      }
      updateURLParams();
      let updatedSortVal = sortVal;
      if (updatedSortVal !== 'filename') {
        updatedSortVal = `metadata.${updatedSortVal}`;
      }
      const { data } = await filterDiveMetadata(props.id, { ...filters.value }, currentPage.value * 50, 50, updatedSortVal, sortDir);
      processFilteredMetadataResults(data);
    };

    const changePage = async (page: number) => {
      currentPage.value = page;
      await updateFilter({ filter: currentFilter.value, sortVal: storedSortVal.value, sortDir: storedSortDir.value });
    };

    const getAdvanced = (item: MetadataResultItem) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const advancedList: Record<string, any> = {};
      Object.entries(item.metadata).forEach(([key, value]) => {
        if (!displayConfig.value.hide.includes(key)) {
          advancedList[key] = value;
        }
      });
      return advancedList;
    };
    const openClone = ref(false);

    const setFilterData = (data: DIVEMetadataFilterValueResults) => {
      //get unlock fields and their data types:
      const { unlocked } = data;
      unlockedMap.value = {};
      unlocked.forEach((item) => {
        if (data.metadataKeys[item]) {
          unlockedMap.value[item] = data.metadataKeys[item];
        }
      });
    };

    const updateDiveMetadataKeyVal = async (key: string, val: boolean | number | string) => {
      await setDiveDatasetMetadataKey(props.id, key, val);
    };
    return {
      totalPages,
      count,
      filtered,
      currentPage,
      changePage,
      locationStore,
      updateFilter,
      folderList,
      displayConfig,
      getAdvanced,
      filters,
      //Cloning
      openClone,
      currentFilter,
      setFilterData,
      unlockedMap,
      updateDiveMetadataKeyVal,
    };
  },
});
</script>

<template>
  <v-container>
    <DIVEMetadataFilterVue
      :id="id"
      :current-page="currentPage"
      :root-filter="filters"
      :total-pages="totalPages"
      :count="count"
      :filtered="filtered"
      :display-config="displayConfig"
      @update:currentPage="changePage($event)"
      @updateFilters="updateFilter($event)"
      @filter-data="setFilterData($event)"
    >
      <template slot="leftOptions">
        <v-tooltip bottom open-delay="400">
          <template #activator="{ on }">
            <v-btn :disabled="id === null" class="ml-2" v-on="on" @click="openClone = true">
              <v-icon>
                mdi-content-copy
              </v-icon>
              <span class="pl-1 ,l-1">
                Clone
              </span>
              <v-spacer />
            </v-btn>
            <v-dialog v-model="openClone" width="800">
              <DIVEMetadataCloneVue :base-id="id" :filter="currentFilter" />
            </v-dialog>
          </template>
          <span>Create a clone of this data</span>
        </v-tooltip>
      </template>
    </DIVEMetadataFilterVue>
    <span v-if="!openClone">
      <v-card v-for="(item, key) in folderList" :key="key" class="my-2 pa-2">
        <v-row class="ma-4">
          <div>{{ item.filename }}</div>
          <div>
            <v-btn
              class="mx-2 mb-2"
              x-small
              color="primary"
              depressed
              :to="{ name: 'viewer', params: { id: item.DIVEDataset } }"
            >
              Launch Annotator
            </v-btn>
          </div>
        </v-row>
        <v-row v-for="display in displayConfig['display']" :key="display" class="ma-4">
          <b>{{ display }}:</b>
          <div v-if="unlockedMap[display] !== undefined">
            <DIVEMetadataEditKey
              :category="unlockedMap[display].category"
              :value="item.metadata[display]"
              :set-values="unlockedMap[display].set || []"
              @update="updateDiveMetadataKeyVal(display, $event)"
            />
          </div>
          <div v-else class="mx-2">
            {{ item.metadata[display] }}
          </div>
        </v-row>
        <v-expansion-panels>
          <v-expansion-panel class="border">
            <v-expansion-panel-header>Advanced</v-expansion-panel-header>
            <v-expansion-panel-content>
              <v-row v-for="(data, dataKey) in getAdvanced(item)" :key="dataKey" class="border" dense>
                <v-col cols="2" class="border">
                  <b>{{ dataKey }}:</b>
                </v-col>
                <v-col cols="10">
                  <div v-if="unlockedMap[dataKey] !== undefined">
                    <DIVEMetadataEditKey
                      :category="unlockedMap[dataKey].category"
                      :value="data"
                      :set-values="unlockedMap[dataKey].set || []"
                      @update="updateDiveMetadataKeyVal(dataKey, $event)"
                    />
                  </div>
                  <div v-else class="mx-2">
                    {{ data }}
                  </div>
                </v-col>
                <v-spacer />
              </v-row>
            </v-expansion-panel-content>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card>
    </span>
  </v-container>
</template>

<style scoped>
.border {
  border: 1px solid white
}

.list {
  overflow-y: scroll;
}
</style>
