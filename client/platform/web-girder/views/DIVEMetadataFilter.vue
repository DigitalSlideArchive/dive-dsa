<script lang="ts">
import {
  DIVEMetadataFilter, MetadataFilterItem, DIVEMetadataFilterValueResults, getMetadataFilterValues, FilterDisplayConfig,
} from 'platform/web-girder/api/divemetadata.service';
import {
  computed, defineComponent, onMounted, PropType, Ref, ref, watch,
} from 'vue';
import { intersection } from 'lodash';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import DIVEMetadataFilterItemVue from './DIVEMetadataFilterItem.vue';
import DIVEMetadataCloneVue from './DIVEMetadataClone.vue';
import DIVEMetadataSlicerVue from './DIVEMetadataSlicer.vue';
import DIVEMetadataExportVue from './DIVEMetadataExport.vue';

export default defineComponent({
  name: 'DIVEMetadataFilter',
  components: {
    DIVEMetadataFilterItemVue, DIVEMetadataCloneVue, DIVEMetadataSlicerVue, DIVEMetadataExportVue,
  },
  props: {
    currentPage: {
      type: Number,
      default: 0,
    },
    totalPages: {
      type: Number,
      default: 0,
    },
    count: {
      type: Number,
      default: 0,
    },
    filtered: {
      type: Number,
      default: 0,
    },
    id: {
      type: String,
      default: '',
    },
    displayConfig: {
      type: Object as PropType<FilterDisplayConfig>,
      required: true,
    },
    rootFilter: {
      type: Object as PropType<DIVEMetadataFilter>,
      default: () => {},

    },
    ownerAdmin: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const { prompt } = usePrompt();
    const checkConfig = async () => {
      if (typeof (props.displayConfig) === 'string') {
        await prompt({
          title: 'Filter Error',
          text: 'The default filter for this folder is not a JSON Object it appears to be a string',
        });
      }
    };
    watch(() => props.displayConfig, () => checkConfig());
    const search: Ref<string> = ref(props.rootFilter.search || '');
    const regEx: Ref<undefined | boolean> = ref(props.rootFilter.searchRegEx);
    const filters: Ref<DIVEMetadataFilterValueResults['metadataKeys']> = ref({});
    const splitFilters = computed(() => {
      const advanced: DIVEMetadataFilterValueResults['metadataKeys'] = {};
      const displayed: DIVEMetadataFilterValueResults['metadataKeys'] = {};
      Object.entries(filters.value).forEach(([key, item]) => {
        if (props.displayConfig.display && props.displayConfig.display.includes(key)) {
          displayed[key] = item;
        } else if (props.displayConfig.hide && !props.displayConfig.hide.includes(key)) {
          advanced[key] = item;
        }
      });
      return { advanced, displayed };
    });
    const filtersOn = ref(false);
    const defaultEnabledKeys: Ref<string[]> = ref([]); // If items should default to on because they are in the URL parameters
    const currentFilter: Ref<DIVEMetadataFilter> = ref({});
    const sortParams = computed(() => {
      if (splitFilters.value) {
        return ['filename', ...Object.keys(splitFilters.value.displayed), ...Object.keys(splitFilters.value.advanced)];
      }
      return ['filename'];
    });
    const sortValue = ref('filename');
    const sortDir = ref(1);

    const pageList = computed(() => {
      const list = [];
      for (let i = 0; i < props.totalPages; i += 1) {
        list.push(i + 1);
      }
      return list;
    });

    const getFilters = async () => {
      const filterData = await getMetadataFilterValues(props.id);
      filters.value = filterData.data.metadataKeys;
      emit('filter-data', filterData.data);
    };
    onMounted(async () => {
      if (props.rootFilter.metadataFilters) {
        const enabledFilters = loadCurrentFilter();
        const metadataKeys: string[] = [];
        const advancedKeys: string[] = [];
        await getFilters();
        Object.keys(filters.value).forEach((key) => {
          if (props.displayConfig.display && props.displayConfig.display.includes(key)) {
            metadataKeys.push(key);
          } else if (props.displayConfig.hide && !props.displayConfig.hide.includes(key)) {
            advancedKeys.push(key);
          }
        });
        defaultEnabledKeys.value = enabledFilters;
        if (currentFilter.value?.metadataFilters) {
          if (intersection(Object.keys(currentFilter.value.metadataFilters), advancedKeys).length) {
            filtersOn.value = true;
          }
        }
      } else {
        await getFilters();
      }
    });

    const loadCurrentFilter = () => {
      let enabledFilters: string[] = [];
      if (props.rootFilter.metadataFilters && Object.keys(props.rootFilter.metadataFilters).length) {
        currentFilter.value.metadataFilters = props.rootFilter.metadataFilters;
        enabledFilters = Object.keys(props.rootFilter.metadataFilters);
      }
      if (props.rootFilter.search) {
        search.value = props.rootFilter.search;
      }
      if (props.rootFilter.searchRegEx) {
        regEx.value = true;
      }
      return enabledFilters;
    };

    watch(() => props.rootFilter, () => {
      loadCurrentFilter();
    });

    watch(filtersOn, (newVal, oldVal) => {
      if (!newVal && oldVal) {
        // We remove all of the old filters then
        Object.keys(splitFilters.value.advanced).forEach((key) => {
          if (currentFilter.value && currentFilter.value.metadataFilters && currentFilter.value.metadataFilters[key]) {
            delete currentFilter.value.metadataFilters[key];
          }
        });
        emit('updateFilters', { filter: currentFilter.value, sortVal: sortValue.value, sortDir: sortDir.value });
      }
    });

    watch([search, regEx], () => {
      currentFilter.value.search = search.value;
      currentFilter.value.searchRegEx = regEx.value;
      emit('updateFilters', { filter: currentFilter.value, sortVal: sortValue.value, sortDir: sortDir.value });
    });

    const clearFilter = (key: string) => {
      if (!currentFilter.value.metadataFilters) {
        currentFilter.value.metadataFilters = {};
      }
      if (currentFilter.value.metadataFilters[key]) {
        delete currentFilter.value.metadataFilters[key];
      }
      emit('updateFilters', { filter: currentFilter.value, sortVal: sortValue.value, sortDir: sortDir.value });
    };
    const updateFilter = (key: string, { value, category, regEx } : {value: string | string[] | number | boolean | number[], category: MetadataFilterItem['category'], regEx?: boolean}) => {
      if (!currentFilter.value.metadataFilters) {
        currentFilter.value.metadataFilters = {};
      }
      if (value === '' || ((Array.isArray(value) && value.length === 0))) {
        if (currentFilter.value.metadataFilters && currentFilter.value.metadataFilters[key]) {
          delete currentFilter.value.metadataFilters[key];
        }
      } else if (category === 'numerical') {
        currentFilter.value.metadataFilters[key] = {
          category,
          range: value as [number, number],
        };
      } else if (value === undefined) {
        if (currentFilter.value.metadataFilters && currentFilter.value.metadataFilters[key]) {
          delete currentFilter.value.metadataFilters[key];
        }
      } else {
        currentFilter.value.metadataFilters[key] = {
          category,
          value,
          regEx,
        };
      }
      emit('updateFilters', {
        filter: currentFilter.value, sortVal: sortValue.value, sortDir: sortDir.value, resetPage: true,
      });
    };

    const changePage = async (page: number) => {
      emit('update:currentPage', page - 1);
    };

    watch([sortValue, sortDir], () => {
      emit('updateFilters', { filter: currentFilter.value, sortVal: sortValue.value, sortDir: sortDir.value });
    });

    const getDefaultValue = (key: string) => {
      if (currentFilter.value.metadataFilters) {
        if (currentFilter.value.metadataFilters[key] && currentFilter.value.metadataFilters[key].category === 'numerical') {
          return currentFilter.value.metadataFilters[key].range;
        }
        if (currentFilter.value.metadataFilters[key]) {
          return currentFilter.value.metadataFilters[key].value;
        }
      }
      return undefined;
    };

    const getRegExVal = (key: string) => {
      if (currentFilter.value.metadataFilters) {
        if (currentFilter.value.metadataFilters[key] && currentFilter.value.metadataFilters[key].category === 'numerical') {
          return undefined;
        }
        if (currentFilter.value.metadataFilters[key]) {
          return currentFilter.value.metadataFilters[key].regEx;
        }
      }
      return undefined;
    };

    const categoricalLimit = ref(props.displayConfig.categoricalLimit);
    watch(() => props.displayConfig, () => {
      categoricalLimit.value = props.displayConfig.categoricalLimit;
    });

    const toggleRegex = () => {
      if (regEx.value) {
        regEx.value = undefined;
      } else {
        regEx.value = true;
      }
    };

    const jobCompleted = () => {
      emit('updateFilters', { filter: currentFilter.value, sortVal: sortValue.value, sortDir: sortDir.value });
    };

    const showSlicerCLI = computed(() => {
      if (props.displayConfig.slicerCLI === 'Disabled') {
        return false;
      }
      if (props.displayConfig.slicerCLI === 'Owner' && props.ownerAdmin) {
        return true;
      }
      if (props.displayConfig.slicerCLI === 'All Users') {
        return true;
      }
      return false;
    });

    return {

      pageList,
      filters,
      splitFilters,
      filtersOn,
      search,
      currentFilter,
      defaultEnabledKeys,
      categoricalLimit,
      changePage,
      updateFilter,
      jobCompleted,
      clearFilter,
      getDefaultValue,
      getRegExVal,
      sortValue,
      sortParams,
      sortDir,
      toggleRegex,
      regEx,
      showSlicerCLI,
    };
  },
});
</script>

<template>
  <v-card class="pb-2">
    <v-container>
      <v-row class="pt-2">
        <v-btn
          class="ma-1 pa-0"
          :depressed="filtersOn"
          outlined
          :color="filtersOn ? 'success' : ''"
          text
          x-small
          @click.stop.prevent="filtersOn = !filtersOn"
        >
          <v-icon
            left
            class="mx-1"
          >
            mdi-filter
          </v-icon>
          Advanced Filters
        </v-btn>
        <v-btn
          v-if="ownerAdmin"
          class="ma-1 pa-0"
          outlined
          color="warning"
          text
          x-small
          :to="`/metadata-edit/${id}`"
        >
          <v-icon
            left
            class="mx-1"
          >
            mdi-pencil
          </v-icon>
          Edit Filters
        </v-btn>

        <v-spacer />
        <DIVEMetadataSlicerVue v-if="showSlicerCLI" :filters="currentFilter" :metadata-root="id" class="pr-2" @job-complete="jobCompleted()" />
        <DIVEMetadataExportVue :metadata-root="id" :filters="currentFilter" class="pr-4" />
        <v-chip><span class="pr-1">Filtered:</span>{{ filtered }} / {{ count }}</v-chip>
        <v-select
          v-model="sortValue"
          class="mx-2 pa-0 fit"
          style="max-width: 150px"
          x-small
          :items="sortParams"
          dense
          label="Sort"
          hide-details
        />
        <v-icon v-if="sortDir === 1" @click="sortDir = -1">
          mdi-sort-ascending
        </v-icon>
        <v-icon v-else-if="sortDir === -1" @click="sortDir = 1">
          mdi-sort-descending
        </v-icon>
      </v-row>
      <v-row
        no-wrap
        class="mt-3 mx-2"
      >
        <v-text-field
          v-model="search"
          label="search"
          clearable
          @change="updateFilter"
        />
        <v-tooltip
          open-delay="100"
          bottom
        >
          <template #activator="{ on }">
            <v-btn variant="plain" :ripple="false" icon :color="regEx ? 'blue' : ''" v-on="on" @click="toggleRegex()">
              <v-icon>
                mdi-regex
              </v-icon>
            </v-btn>
          </template>
          <span>Enable/Disable Regular Expressions</span>
        </v-tooltip>
      </v-row>
      <v-row
        no-wrap
        class="mt-3 mx-2"
        :class="{ 'mb-4': !filtersOn }"
      >
        <v-spacer />
        <div v-for="(filterItem, key) in splitFilters.displayed" :key="`filterItem_${key}`">
          <DIVEMetadataFilterItemVue
            :label="key"
            :default-value="getDefaultValue(key)"
            :reg-ex-value="getRegExVal(key)"
            :filter-item="filterItem"
            :default-enabled="defaultEnabledKeys.includes(key)"
            :categorical-limit="categoricalLimit"
            @update-value="updateFilter(key, $event)"
            @clear-filter="clearFilter(key)"
          />
        </div>
        <v-spacer />
      </v-row>
      <v-row
        v-if="filtersOn"
        no-wrap
        class="mt-3 mb-4"
      >
        <v-spacer />
        <div v-for="(filterItem, key) in splitFilters.advanced" :key="`filterItem_${key}`">
          <DIVEMetadataFilterItemVue
            :label="key"
            :default-value="getDefaultValue(key)"
            :reg-ex-value="getRegExVal(key)"
            :filter-item="filterItem"
            :default-enabled="defaultEnabledKeys.includes(key)"
            :categorical-limit="categoricalLimit"
            @update-value="updateFilter(key, $event)"
            @clear-filter="clearFilter(key)"
          />
        </div>
        <v-spacer />
      </v-row>
      <v-row class="mt-3">
        <slot name="leftOptions" />
        <v-spacer />
        <v-select
          class="mx-2 pa-0 fit"
          style="max-width: 50px"
          x-small
          :items="pageList"
          :value="currentPage + 1"
          dense
          label="Page"
          hide-details
          @change="changePage"
        />
      </v-row>
      <slot name="additionalOptions" />
    </v-container>
  </v-card>
</template>

<style scoped lang="scss">

</style>
