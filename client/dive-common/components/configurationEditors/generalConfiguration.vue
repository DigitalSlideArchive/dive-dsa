<!-- eslint-disable max-len -->
<script lang="ts">
import { getDiveConfiguration } from 'platform/web-girder/api/dataset.service';
import {
  defineComponent, ref,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'GeneralConfiguration',
  components: {
  },
  props: {},
  setup() {
    const configMan = useConfiguration();
    const generalDialog = ref(false);
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
      if (configMan.hierarchy.value?.length && baseConfiguration.value) {
        configMan.transferConfiguration(configMan.hierarchy.value[0].id, baseConfiguration.value);
      }
      transferProgress.value = false;
    };
    return {
      generalDialog,
      hierarchy: configMan.hierarchy,
      baseConfiguration,
      disableConfigurationEditing,
      mergeType,
      mergeSelection,
      launchEditor,
      saveChanges,
      transferConfig,
      transferProgress,
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
          <v-btn
            :disabled="
              baseConfiguration === 'null' || (hierarchy && hierarchy[0].id === baseConfiguration)"
            color="warning"
            @click="transferConfig"
          >
            Transfer <v-icon>{{ transferProgress ? 'mdi-spin mdi-sync' : '' }}</v-icon>
          </v-btn>
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
  </div>
</template>

<style lang="scss">
</style>
