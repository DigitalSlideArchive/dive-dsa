<!-- eslint-disable max-len -->
<script lang="ts">
import { RootlessLocationType } from 'platform/web-girder/store/types';
import { GirderMetadataStatic } from 'platform/web-girder/constants';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { getDiveConfiguration, importUiConfiguration } from 'platform/web-girder/api/dataset.service';
import { getUri } from 'platform/web-girder/api';
import { GirderFileManager, GirderModelType } from '@girder/components/src';

import {
  defineComponent, computed, ref, Ref,
} from 'vue';
import { useConfiguration, useDatasetId } from 'vue-media-annotator/provides';
import { DatasetMetaMutable } from 'dive-common/apispec';

export default defineComponent({
  name: 'GeneralConfiguration',
  components: {
    GirderFileManager,
  },
  props: {},
  setup() {
    const configMan = useConfiguration();
    const datasetId = useDatasetId();
    const generalDialog = ref(false);
    const transferFolder = ref(false);
    const girderRest = useGirderRest();
    const source = ref(null as GirderMetadataStatic | null);
    const location: Ref<RootlessLocationType> = ref({
      _modelType: ('user' as GirderModelType),
      _id: girderRest.user._id,
    });

    const locationIsFolder = computed(() => (location.value._modelType === 'folder'));
    const snackbar = ref(false);
    const snackbarMessage = ref('Transfer to Folder complete');
    const snackbarType = ref<'success' | 'error'>('success');
    const importBusy = ref(false);
    const confirmImportDialog = ref(false);
    const pendingImportData = ref<DatasetMetaMutable | null>(null);

    function setLocation(newLoc: RootlessLocationType) {
      if (!('meta' in newLoc && newLoc.meta.annotate)) {
        location.value = newLoc;
      }
    }

    const baseConfiguration = ref(
      configMan.configuration.value?.general?.baseConfiguration
         || (configMan.hierarchy.value?.length ? configMan.hierarchy.value[0].id : null),
    );
    const mergeType = ref(configMan.configuration.value?.general?.configurationMerge || 'disabled');
    const disableConfigurationEditing = ref(
      configMan.configuration.value?.general?.disableConfigurationEditing,
    );
    const mergeSelection = ref(['merge up', 'merge down', 'disabled']);
    const launchEditor = () => {
      generalDialog.value = true;
    };
    const originalConfiguration = {
      baseConfiguration: baseConfiguration.value,
      configurationMerge: mergeType.value,
      disableConfigurationEditing: disableConfigurationEditing.value,
    };
    const currentConfigName = ref('unknown');
    const calculateConfigName = () => {
      if (configMan.hierarchy.value) {
        const origIndex = configMan.hierarchy.value.findIndex((item) => item.id === originalConfiguration.baseConfiguration);
        if (origIndex !== -1) {
          currentConfigName.value = configMan.hierarchy.value[origIndex].name;
          return;
        }
      }
      currentConfigName.value = 'unknown';
    };
    calculateConfigName();

    const selectedFolderName = computed(() => {
      if (!baseConfiguration.value || !configMan.hierarchy.value) {
        return 'selected folder';
      }
      const match = configMan.hierarchy.value.find((item) => item.id === baseConfiguration.value);
      return match?.name || 'selected folder';
    });

    const saveChanges = async () => {
      // We need to take the new values and set them on the 'general' settings
      if (baseConfiguration.value) {
        configMan.setConfigurationId(baseConfiguration.value);
        const general = {
          baseConfiguration: baseConfiguration.value,
          configurationMerge: mergeType.value,
          disableConfigurationEditing: disableConfigurationEditing.value,
        };
        // Need to disable the previous base configuration value if it's lower
        if (configMan.hierarchy.value) {
          const origIndex = configMan.hierarchy.value.findIndex((item) => item.id === originalConfiguration.baseConfiguration);
          const newIndex = configMan.hierarchy.value.findIndex((item) => item.id === baseConfiguration.value);
          if (origIndex < newIndex) { //We remove the original baseConfiguration
            const id = originalConfiguration.baseConfiguration;
            originalConfiguration.baseConfiguration = null;
            if (id) {
              configMan.saveConfiguration(id, { general: originalConfiguration });
            }
          }
        }

        await configMan.saveConfiguration(baseConfiguration.value, { general });
        generalDialog.value = false;
      }
    };

    // On launch if the configuration is not set we configure it
    const checkNullConfig = async () => {
      if (configMan.configuration.value === null) {
        await saveChanges();
        // Give it some time to generate the new config for the metadata
        setTimeout(async () => {
          if (baseConfiguration.value) {
            const newConfig = await getDiveConfiguration(baseConfiguration.value);
            if (newConfig.data.metadata.configuration) {
              configMan.setConfiguration(newConfig.data.metadata.configuration);
            }
          }
        }, 500);
      }
    };
    checkNullConfig();

    const transferProgress = ref(false);
    const transferConfig = () => {
      transferProgress.value = true;
      if (originalConfiguration.baseConfiguration && baseConfiguration.value) {
        configMan.transferConfiguration(originalConfiguration.baseConfiguration, baseConfiguration.value);
        originalConfiguration.baseConfiguration = baseConfiguration.value;
        calculateConfigName();
      }
      transferProgress.value = false;
    };

    const transferFolderConfig = () => {
      if (originalConfiguration.baseConfiguration) {
        configMan.transferConfiguration(originalConfiguration.baseConfiguration, location.value._id);
      }
      transferFolder.value = false;
      snackbarType.value = 'success';
      snackbarMessage.value = 'Transfer to Folder complete';
      snackbar.value = true;
    };

    const showMessage = (message: string, type: 'success' | 'error' = 'success') => {
      snackbarMessage.value = message;
      snackbarType.value = type;
      snackbar.value = true;
    };

    const exportUiConfiguration = () => {
      if (!datasetId.value) {
        showMessage('No dataset loaded for export', 'error');
        return;
      }
      const url = getUri({
        url: `dive_dataset/${datasetId.value}/export_ui_configuration`,
      });
      window.location.assign(url);
    };

    const pickUiConfigFile = (): Promise<File | null> => new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files?.[0] || null;
        resolve(file);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });

    const launchImport = async () => {
      if (!baseConfiguration.value) {
        showMessage('Select a hierarchy folder as the import destination', 'error');
        return;
      }
      const file = await pickUiConfigFile();
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as DatasetMetaMutable;
        const hasContent = !!(
          parsed.configuration
          || parsed.attributes
          || parsed.timelines
          || parsed.swimlanes
          || parsed.filters
          || parsed.customTypeStyling
          || parsed.customGroupStyling
          || parsed.confidenceFilters
        );
        if (!hasContent) {
          showMessage('File does not look like a UI Configuration JSON', 'error');
          return;
        }
        pendingImportData.value = parsed;
        confirmImportDialog.value = true;
      } catch (err) {
        showMessage(`Failed to read UI Configuration file: ${err}`, 'error');
      }
    };

    const cancelImport = () => {
      confirmImportDialog.value = false;
      pendingImportData.value = null;
    };

    const confirmImport = async () => {
      if (!baseConfiguration.value || !pendingImportData.value) {
        cancelImport();
        return;
      }
      importBusy.value = true;
      try {
        await importUiConfiguration(baseConfiguration.value, pendingImportData.value);
        originalConfiguration.baseConfiguration = baseConfiguration.value;
        calculateConfigName();
        configMan.setConfigurationId(baseConfiguration.value);
        confirmImportDialog.value = false;
        pendingImportData.value = null;
        generalDialog.value = false;
        showMessage(`UI Configuration imported to ${selectedFolderName.value}. Reloading…`);
        window.location.reload();
      } catch (err) {
        // Close confirm first so the root snackbar is visible above the General dialog
        confirmImportDialog.value = false;
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          || String(err);
        showMessage(`Import failed: ${message}`, 'error');
      } finally {
        importBusy.value = false;
      }
    };

    return {
      generalDialog,
      hierarchy: configMan.hierarchy,
      baseConfiguration,
      originalConfiguration,
      disableConfigurationEditing,
      currentConfigName,
      selectedFolderName,
      mergeType,
      mergeSelection,
      launchEditor,
      saveChanges,
      transferConfig,
      transferProgress,
      // Transfer Folder
      transferFolder,
      setLocation,
      location,
      locationIsFolder,
      source,
      transferFolderConfig,
      snackbar,
      snackbarMessage,
      snackbarType,
      // UI Configuration Import/Export
      exportUiConfiguration,
      launchImport,
      confirmImportDialog,
      confirmImport,
      cancelImport,
      importBusy,
    };
  },
});
</script>

<template>
  <div class="ma-2">
    <v-btn @click="launchEditor">
      <span>
        General
        <br>
      </span>
      <v-icon
        class="ml-2"
      >
        mdi-cog
      </v-icon>
    </v-btn>
    <v-dialog
      v-model="generalDialog"
      max-width="480"
    >
      <v-card>
        <v-card-title>
          General Configuration Settings
          <v-spacer />
          <v-btn
            icon
            small
            color="white"
            @click="generalDialog = false"
          >
            <v-icon
              small
            >
              mdi-close
            </v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-row class="pb-4">
            <p>
              The Base Configuration is the location where the attributes,
              timeline and configuration will be saved.
              The list is a folder hierarchy.
            </p>
            <div class="mb-4">
              <span>Current Config:</span> <span class="ml-2"><b>{{ currentConfigName }}</b></span>
            </div>
            <v-select
              v-model="baseConfiguration"
              :items="hierarchy"
              item-text="name"
              item-value="id"
              label="Choose Folder"
            />
          </v-row>
          <v-row
            v-if="false"
            class="pb-4"
          >
            <p>
              The Merge property specified how merging is handled when multiple
              configurations are found in the folder hierarchy
            </p>
            <v-select
              v-model="mergeType"
              :items="mergeSelection"
              label="Merge Property"
            />
          </v-row>
          <v-row
            v-if="false"
            class="pb-4"
          >
            <p>
              To prevent user's other than the
              owner of the target folder from modifying the configuration settings.
            </p>
            <v-checkbox
              v-model="disableConfigurationEditing"
              label="Disable Configuration Editing"
            />
          </v-row>
          <v-row>
            <v-btn
              :disabled="
                baseConfiguration === 'null' || (originalConfiguration.baseConfiguration === baseConfiguration)"
              color="warning"
              @click="transferConfig"
            >
              Transfer <v-icon>{{ transferProgress ? 'mdi-spin mdi-sync' : '' }}</v-icon>
            </v-btn>
            <v-spacer />
            <v-tooltip bottom>
              <template #activator="{ on: tooltipOn }">
                <v-btn
                  class="ma-0"
                  color="primary"
                  v-on="tooltipOn"
                  @click="transferFolder = true"
                >
                  <v-icon>
                    mdi-folder
                  </v-icon>

                  Transfer
                </v-btn>
              </template>
              <span> Transfer to folder outside hierarchy</span>
            </v-tooltip>
          </v-row>
          <v-divider class="my-4" />
          <v-row class="pb-2">
            <p class="mb-2">
              Export or import the full UI Configuration (UI settings, attributes,
              timelines, swimlanes, shortcuts, and related settings) for portability
              between servers. Import writes to the folder selected above.
            </p>
          </v-row>
          <v-row>
            <v-btn
              color="secondary"
              class="mr-2"
              @click="exportUiConfiguration"
            >
              <v-icon left>
                mdi-export
              </v-icon>
              Export
            </v-btn>
            <v-btn
              color="secondary"
              :disabled="!baseConfiguration || importBusy"
              :loading="importBusy"
              @click="launchImport"
            >
              <v-icon left>
                mdi-import
              </v-icon>
              Import
            </v-btn>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="generalDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="saveChanges"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog
      v-model="confirmImportDialog"
      max-width="480"
      persistent
    >
      <v-card>
        <v-card-title>Import UI Configuration</v-card-title>
        <v-card-text>
          This will replace UI configuration, attributes, timelines, swimlanes,
          and related settings on <b>{{ selectedFolderName }}</b>.
          Continue?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            text
            :disabled="importBusy"
            @click="cancelImport"
          >
            Cancel
          </v-btn>
          <v-btn
            color="warning"
            :loading="importBusy"
            @click="confirmImport"
          >
            Replace
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <!-- Outside dialogs so messages remain visible when confirm/General overlay state changes -->
    <v-snackbar
      v-model="snackbar"
      :timeout="3000"
    >
      <v-alert :type="snackbarType">
        {{ snackbarMessage }}
      </v-alert>

      <template #action="{ attrs }">
        <v-btn
          color="blue"
          text
          v-bind="attrs"
          @click="snackbar = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
    <v-dialog v-model="transferFolder" width="600">
      <v-card
        outlined
        flat
      >
        <v-card-title>Transfer Config to Another Folder</v-card-title>
        <v-card-text>
          <GirderFileManager
            new-folder-enabled
            no-access-control-w
            :location="location"
            @update:location="setLocation"
          >
            <template #row="{ item }">
              <span>{{ item.name }}</span>
              <v-chip
                v-if="(item.meta && item.meta.annotate)"
                color="white"
                x-small
                outlined
                class="mx-3"
              >
                dataset
              </v-chip>
            </template>
          </GirderFileManager>
        </v-card-text>
        <v-card-actions>
          <v-btn
            depressed
            block
            color="primary"
            class="mt-4"
            :disabled="!locationIsFolder"
            @click="transferFolderConfig"
          >
            <span v-if="!locationIsFolder">
              Choose a destination folder...
            </span>
            <span v-else-if="'name' in location">
              Transfer Configuration To this Folder
            </span>
            <span v-else>
              Something went wrong
            </span>
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
</style>
