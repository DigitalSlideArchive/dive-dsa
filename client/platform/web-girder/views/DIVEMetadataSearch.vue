<script lang="ts">
import {
  defineComponent, onMounted, ref, Ref,
} from 'vue';
import {
  DIVEMetadataResults, DIVEMetadaFilter, filterDiveMetadata, MetadataResultItem, FilterDisplayConfig,
} from 'platform/web-girder/api/divemetadata.service';
import { getFolder } from 'platform/web-girder/api/girder.service';
import DIVEMetadataFilter from './DIVEMetadataFilter.vue';

export default defineComponent({
  name: 'DIVEMetadataSearch',
  components: {
    DIVEMetadataFilter,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const folderList: Ref<MetadataResultItem[]> = ref([]);
    const displayConfig: Ref<FilterDisplayConfig> = ref({ display: [], hide: [] });
    const totalPages = ref(0);
    const currentPage = ref(0);
    const filters: Ref<DIVEMetadaFilter> = ref({ });
    const locationStore = {
      _id: props.id,
      _modelType: 'folder',
    };

    const processFilteredMetadataResults = (data: DIVEMetadataResults) => {
      folderList.value = data.pageResults;
      totalPages.value = data.totalPages;
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
    };

    onMounted(() => {
      getFolderInfo(props.id);
      getData();
    });

    const updateFilter = async (filter?: DIVEMetadaFilter) => {
      if (filter) {
        filters.value = filter;
        currentPage.value = 0;
      }
      const sort = 'filename';
      const { data } = await filterDiveMetadata(props.id, { ...filters.value }, currentPage.value * 50, 50, sort);
      processFilteredMetadataResults(data);
    };

    const changePage = async (page: number) => {
      currentPage.value = page;
      await updateFilter();
    };
    return {
      totalPages,
      currentPage,
      changePage,
      locationStore,
      updateFilter,
      folderList,
      displayConfig,
    };
  },
});
</script>

<template>
  <v-container>
    <DIVEMetadataFilter
      :id="id"
      :current-page="currentPage"
      :total-pages="totalPages"
      :display-config="displayConfig"
      @update:currentPage="changePage($event)"
      @updateFilters="updateFilter($event)"
    />
    <v-card
      v-for="(item, key) in folderList"
      :key="key"
      class="my-2 pa-2"
    >
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
        <div class="mx-2">
          {{ item.metadata[display] }}
        </div>
      </v-row>
    </v-card>
  </v-container>
</template>