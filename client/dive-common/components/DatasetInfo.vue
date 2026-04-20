<script lang="ts">
import {
  computed,
  defineComponent, onMounted, Ref, ref,
} from 'vue';

import StackedVirtualSidebarContainer from 'dive-common/components/StackedVirtualSidebarContainer.vue';
import { getFolder } from 'platform/web-girder/api';
import { useStore } from 'platform/web-girder/store/types';
import { useHandler } from 'vue-media-annotator/provides';
import DIVEMetadataEditKey from 'platform/web-girder/views/DIVEMetadata/DIVEMetadataEditKey.vue';
import MetadataKeyLabel from 'platform/web-girder/views/DIVEMetadata/MetadataKeyLabel.vue';
import {
  FilterDisplayConfig,
  filterDiveMetadata,
  getMetadataFilterValues,
  MetadataFilterKeysItem,
  partitionMetadataKeys,
  setDiveDatasetMetadataKey,
} from 'platform/web-girder/api/divemetadata.service';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import DatasetInfoAttributes from './DatasetInfoAttributes.vue';

export default defineComponent({
  name: 'DatasetInfo',
  components: {
    StackedVirtualSidebarContainer,
    DIVEMetadataEditKey,
    MetadataKeyLabel,
    DatasetInfoAttributes,
  },

  props: {
    width: {
      type: Number,
      default: 300,
    },
  },

  setup() {
    const store = useStore();
    const prompt = usePrompt();
    const { getDiveMetadataRootId } = useHandler();
    const diveMetadataRootId = ref(getDiveMetadataRootId());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasetInfo: Ref<Record<string, any>> = ref({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasetMetadata: Ref<Record<string, any> | null> = ref(null);
    const diveMetadataFilter: Ref<FilterDisplayConfig> = ref({
      display: [], hide: [], categoricalLimit: 50, slicerCLI: 'Disabled',
    });
    const unlockedMap: Ref<Record<string, MetadataFilterKeysItem>> = ref({});
    const metadataKeysByName: Ref<Record<string, MetadataFilterKeysItem>> = ref({});
    const getMetadata = async () => {
      if (store.state.Dataset.meta) {
        const resp = await getFolder(store.state.Dataset.meta?.id);
        if (resp.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          datasetInfo.value = resp.data.meta.datasetInfo as Record<string, any>;
        }
      }
    };
    onMounted(async () => {
      diveMetadataRootId.value = getDiveMetadataRootId();
      await getMetadata();
      if (diveMetadataRootId.value && store.state.Dataset.meta?.id) {
        const outline = await getFolder(diveMetadataRootId.value);
        if (outline.data.meta.DIVEMetadataFilter) {
          diveMetadataFilter.value = outline.data.meta.DIVEMetadataFilter;
        }
        const results = await filterDiveMetadata(
          diveMetadataRootId.value,
          {
            metadataFilters: {
              DIVE_DatasetId: {
                category: 'search',
                value: store.state.Dataset.meta.id,
              },
            },
          },
        );
        const filterData = await getMetadataFilterValues(diveMetadataRootId.value);
        metadataKeysByName.value = filterData.data.metadataKeys || {};
        const { unlocked } = filterData.data;
        unlockedMap.value = {};
        if (unlocked) {
          unlocked.forEach((item) => {
            if (filterData.data.metadataKeys[item]) {
              unlockedMap.value[item] = filterData.data.metadataKeys[item];
            }
          });
        }
        [datasetMetadata.value] = results.data.pageResults;
      }
    });

    const processedDatasetMetadata = computed(() => {
      if (!datasetMetadata.value || !diveMetadataFilter.value) return null;
      type MetadataField = { name: string; value: unknown };
      type MetadataGroup = { id: string; name: string; description?: string; items: MetadataField[] };
      const display: {
        default: MetadataField[];
        defaultGroups: MetadataGroup[];
        advanced: MetadataField[];
        advancedGroups: MetadataGroup[];
      } = {
        default: [{ name: 'FileName', value: datasetMetadata.value.filename || 'N/A' }],
        defaultGroups: [],
        advanced: [],
        advancedGroups: [],
      };
      const allKeys = Object.keys(datasetMetadata.value.metadata);
      const defaultKeys = allKeys.filter((field) => diveMetadataFilter.value.display.includes(field));
      const advancedKeys = allKeys.filter((field) => !diveMetadataFilter.value.display.includes(field) && !diveMetadataFilter.value.hide.includes(field));

      const defaultPartition = partitionMetadataKeys(defaultKeys, diveMetadataFilter.value);
      display.default.push(...defaultPartition.ungrouped.map((name) => ({
        name,
        value: datasetMetadata.value?.metadata[name],
      })));
      display.defaultGroups = defaultPartition.groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        items: group.keys.map((name) => ({
          name,
          value: datasetMetadata.value?.metadata[name],
        })),
      }));

      const advancedPartition = partitionMetadataKeys(advancedKeys, diveMetadataFilter.value);
      display.advanced = advancedPartition.ungrouped.map((name) => ({
        name,
        value: datasetMetadata.value?.metadata[name],
      }));
      display.advancedGroups = advancedPartition.groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        items: group.keys.map((name) => ({
          name,
          value: datasetMetadata.value?.metadata[name],
        })),
      }));
      return display;
    });
    const datasetInfoLength = computed(() => Object.keys(datasetInfo.value || []).length);

    const panels = ref([0, 1]);

    const updateDiveMetadataKeyVal = async (key: string, val: boolean | number | string) => {
      try {
        if (!store.state.Dataset.meta?.id) return;
        if (diveMetadataRootId.value === null) return;
        await setDiveDatasetMetadataKey(store.state.Dataset.meta?.id, diveMetadataRootId.value, key, val);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        prompt.prompt({
          title: 'Error Setting Data',
          text: err.response.data.message,
        });
      }
    };
    const getEditableValue = (value: unknown): string | number | boolean | null => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      return null;
    };
    const getEditableSetValues = (key: string): string[] => {
      const values = unlockedMap.value[key]?.set || [];
      return values.filter((value): value is string => typeof value === 'string');
    };

    return {
      datasetInfo,
      datasetMetadata,
      datasetInfoLength,
      processedDatasetMetadata,
      panels,
      unlockedMap,
      metadataKeysByName,
      updateDiveMetadataKeyVal,
      getEditableValue,
      getEditableSetValues,
    };
  },
});
</script>

<template>
  <StackedVirtualSidebarContainer
    :width="width"
    :enable-slot="false"
  >
    <template #default>
      <v-container>
        <v-expansion-panels v-model="panels" multiple>
          <v-expansion-panel v-if="datasetInfoLength">
            <v-expansion-panel-header>Folder Info</v-expansion-panel-header>
            <v-expansion-panel-content>
              <v-simple-table dark>
                <template #default>
                  <thead>
                    <tr>
                      <th class="text-left">
                        Name
                      </th>
                      <th class="text-left">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(value, name) in datasetInfo"
                      :key="`datasetInfo_${name}`"
                    >
                      <td>{{ name }}</td>
                      <td>{{ value !== undefined ? value.toString() : '' }}</td>
                    </tr>
                  </tbody>
                </template>
              </v-simple-table>
            </v-expansion-panel-content>
          </v-expansion-panel>
          <v-expansion-panel v-if="processedDatasetMetadata" class="border">
            <v-expansion-panel-header>DIVE Metadata</v-expansion-panel-header>
            <v-expansion-panel-content class="pa-0">
              <v-list-item v-for="item in processedDatasetMetadata.default" :key="`datasetMetadata_${item.name}`" two-line dense>
                <v-list-item-content>
                  <v-list-item-title>
                    <MetadataKeyLabel
                      :key-name="item.name"
                      :description="metadataKeysByName[item.name] ? metadataKeysByName[item.name].description : undefined"
                    />
                  </v-list-item-title>
                  <v-list-item-subtitle class="wrap-text">
                    <span v-if="unlockedMap[item.name] !== undefined">
                      <DIVEMetadataEditKey
                        :category="unlockedMap[item.name].category"
                        :value="getEditableValue(item.value)"
                        :set-values="getEditableSetValues(item.name)"
                        class="pl-2"
                        @update="updateDiveMetadataKeyVal(item.name, $event)"
                      />
                    </span>
                    <span v-else>
                      {{ item.value !== undefined && item.value !== null ? item.value.toString() : '' }}
                    </span>
                  </v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
              <v-expansion-panels>
                <v-expansion-panel
                  v-for="group in processedDatasetMetadata.defaultGroups"
                  :key="`datasetMetadata_default_group_${group.id}`"
                >
                  <v-expansion-panel-header>
                    <span class="d-inline-flex align-center">
                      {{ group.name }}
                      <v-tooltip v-if="group.description" bottom max-width="320" open-delay="200">
                        <template #activator="{ on }">
                          <v-icon small class="ml-1" color="grey lighten-1" v-on="on">
                            mdi-information
                          </v-icon>
                        </template>
                        <span>{{ group.description }}</span>
                      </v-tooltip>
                    </span>
                  </v-expansion-panel-header>
                  <v-expansion-panel-content class="pa-0">
                    <v-list-item v-for="item in group.items" :key="`datasetMetadata_${group.id}_${item.name}`" two-line dense>
                      <v-list-item-content>
                        <v-list-item-title>
                          <MetadataKeyLabel
                            :key-name="item.name"
                            :description="metadataKeysByName[item.name] ? metadataKeysByName[item.name].description : undefined"
                          />
                        </v-list-item-title>
                        <v-list-item-subtitle class="wrap-text">
                          <span v-if="unlockedMap[item.name] !== undefined">
                            <DIVEMetadataEditKey
                              :category="unlockedMap[item.name].category"
                              :value="getEditableValue(item.value)"
                              :set-values="getEditableSetValues(item.name)"
                              class="pl-2"
                              @update="updateDiveMetadataKeyVal(item.name, $event)"
                            />
                          </span>
                          <span v-else>
                            {{ item.value !== undefined && item.value !== null ? item.value.toString() : '' }}
                          </span>
                        </v-list-item-subtitle>
                      </v-list-item-content>
                    </v-list-item>
                  </v-expansion-panel-content>
                </v-expansion-panel>
              </v-expansion-panels>
              <v-expansion-panels>
                <v-expansion-panel>
                  <v-expansion-panel-header>Advanced</v-expansion-panel-header>
                  <v-expansion-panel-content class="pa-0">
                    <v-list-item v-for="item in processedDatasetMetadata.advanced" :key="`datasetMetadata_${item.name}`" two-line dense>
                      <v-list-item-content>
                        <v-list-item-title>
                          <MetadataKeyLabel
                            :key-name="item.name"
                            :description="metadataKeysByName[item.name] ? metadataKeysByName[item.name].description : undefined"
                          />
                        </v-list-item-title>
                        <v-list-item-subtitle class="wrap-text">
                          <span v-if="unlockedMap[item.name] !== undefined">
                            <DIVEMetadataEditKey
                              :category="unlockedMap[item.name].category"
                              :value="getEditableValue(item.value)"
                              :set-values="getEditableSetValues(item.name)"
                              class="pl-2"
                              @update="updateDiveMetadataKeyVal(item.name, $event)"
                            />
                          </span>
                          <span v-else>
                            {{ item.value !== undefined && item.value !== null ? item.value.toString() : '' }}
                          </span>
                        </v-list-item-subtitle>
                      </v-list-item-content>
                    </v-list-item>
                    <v-expansion-panels>
                      <v-expansion-panel
                        v-for="group in processedDatasetMetadata.advancedGroups"
                        :key="`datasetMetadata_advanced_group_${group.id}`"
                      >
                        <v-expansion-panel-header>
                          <span class="d-inline-flex align-center">
                            {{ group.name }}
                            <v-tooltip v-if="group.description" bottom max-width="320" open-delay="200">
                              <template #activator="{ on }">
                                <v-icon small class="ml-1" color="grey lighten-1" v-on="on">
                                  mdi-information
                                </v-icon>
                              </template>
                              <span>{{ group.description }}</span>
                            </v-tooltip>
                          </span>
                        </v-expansion-panel-header>
                        <v-expansion-panel-content class="pa-0">
                          <v-list-item v-for="item in group.items" :key="`datasetMetadata_${group.id}_${item.name}`" two-line dense>
                            <v-list-item-content>
                              <v-list-item-title>
                                <MetadataKeyLabel
                                  :key-name="item.name"
                                  :description="metadataKeysByName[item.name] ? metadataKeysByName[item.name].description : undefined"
                                />
                              </v-list-item-title>
                              <v-list-item-subtitle class="wrap-text">
                                <span v-if="unlockedMap[item.name] !== undefined">
                                  <DIVEMetadataEditKey
                                    :category="unlockedMap[item.name].category"
                                    :value="getEditableValue(item.value)"
                                    :set-values="getEditableSetValues(item.name)"
                                    class="pl-2"
                                    @update="updateDiveMetadataKeyVal(item.name, $event)"
                                  />
                                </span>
                                <span v-else>
                                  {{ item.value !== undefined && item.value !== null ? item.value.toString() : '' }}
                                </span>
                              </v-list-item-subtitle>
                            </v-list-item-content>
                          </v-list-item>
                        </v-expansion-panel-content>
                      </v-expansion-panel>
                    </v-expansion-panels>
                  </v-expansion-panel-content>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-expansion-panel-content>
          </v-expansion-panel>
          <DatasetInfoAttributes />
        </v-expansion-panels>
      </v-container>
    </template>
  </StackedVirtualSidebarContainer>
</template>

<style scoped>
.wrap-text {
  white-space: normal !important;
  word-break: break-word;
}

</style>
