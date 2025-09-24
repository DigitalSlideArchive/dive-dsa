<script lang="ts">
import {
  computed,
  defineComponent, onMounted, Ref, ref,
} from 'vue';

import StackedVirtualSidebarContainer from 'dive-common/components/StackedVirtualSidebarContainer.vue';
import { getFolder } from 'platform/web-girder/api';
import { useStore } from 'platform/web-girder/store/types';
import { useHandler } from 'vue-media-annotator/provides';
import { FilterDisplayConfig, filterDiveMetadata } from 'platform/web-girder/api/divemetadata.service';

export default defineComponent({
  name: 'DatasetInfo',
  components: {
    StackedVirtualSidebarContainer,
  },

  props: {
    width: {
      type: Number,
      default: 300,
    },
  },

  setup() {
    const store = useStore();
    const { getDiveMetadataRootId } = useHandler();
    const diveMetadataRootId = ref(getDiveMetadataRootId());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasetInfo: Ref<Record<string, any>> = ref({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasetMetadata: Ref<Record<string, any> | null> = ref(null);
    const diveMetadataFilter: Ref<FilterDisplayConfig> = ref({
      display: [], hide: [], categoricalLimit: 50, slicerCLI: 'Disabled',
    });
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
        [datasetMetadata.value] = results.data.pageResults;
      }
    });

    const processedDatasetMetadata = computed(() => {
      if (!datasetMetadata.value || !diveMetadataFilter.value) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const display: { default: Record<string, any>, advanced: Record<string, any>} = { default: {}, advanced: {} };
      display.default.FileName = datasetMetadata.value.filename || 'N/A';
      Object.keys(datasetMetadata.value.metadata).forEach((field) => {
        if (datasetMetadata.value === null) return;
        if (diveMetadataFilter.value.display.includes(field)) {
          display.default[field] = datasetMetadata.value.metadata[field];
        } else if (!diveMetadataFilter.value.hide.includes(field)) {
          display.advanced[field] = datasetMetadata.value.metadata[field];
        }
      });
      return display;
    });
    const datasetInfoLength = computed(() => Object.keys(datasetInfo.value || []).length);

    const panels = ref([0, 1]);
    return {
      datasetInfo,
      datasetMetadata,
      datasetInfoLength,
      processedDatasetMetadata,
      panels,
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
              <v-list-item v-for="(value, name) in processedDatasetMetadata.default" :key="`datasetMetadata_${name}`" two-line dense>
                <v-list-item-content>
                  <v-list-item-title :name="name" />
                  <v-list-item-subtitle class="wrap-text">
                    {{ value !== undefined ? value.toString() : '' }}
                  </v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
              <v-expansion-panels>
                <v-expansion-panel>
                  <v-expansion-panel-header>Advanced</v-expansion-panel-header>
                  <v-expansion-panel-content class="pa-0">
                    <v-list-item v-for="(value, name) in processedDatasetMetadata.advanced" :key="`datasetMetadata_${name}`" two-line dense>
                      <v-list-item-content>
                        <v-list-item-title :name="name" />
                        <v-list-item-subtitle class="wrap-text">
                          {{ value !== undefined ? value.toString() : '' }}
                        </v-list-item-subtitle>
                      </v-list-item-content>
                    </v-list-item>
                  </v-expansion-panel-content>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-expansion-panel-content>
          </v-expansion-panel>
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
