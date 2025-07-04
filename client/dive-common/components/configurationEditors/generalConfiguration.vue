<!-- eslint-disable max-len -->
<script lang="ts">
import { RootlessLocationType } from 'platform/web-girder/store/types';
import { GirderMetadataStatic } from 'platform/web-girder/constants';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { getDiveConfiguration } from 'platform/web-girder/api/dataset.service';
import { GirderFileManager, GirderModelType } from '@girder/components/src';

import {
  defineComponent, computed, ref, Ref,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'GeneralConfiguration',
  components: {
    GirderFileManager,
  },
  props: {},
  setup() {
    const configMan = useConfiguration();
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
      snackbar.value = true;
    };
    return {
      generalDialog,
      hierarchy: configMan.hierarchy,
      baseConfiguration,
      originalConfiguration,
      disableConfigurationEditing,
      currentConfigName,
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
      max-width="400"
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
        <v-snackbar
          v-model="snackbar"
          :timeout="2000"
        >
          <v-alert type="success">
            Transfer to Folder complete
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
      </v-card>
    </v-dialog>
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
