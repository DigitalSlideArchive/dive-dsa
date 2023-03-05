<script lang="ts">
import {
  defineComponent, ref,
} from '@vue/composition-api';
import { TypePicker } from 'vue-media-annotator/components';
import { useConfiguration } from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'GeneralConfiguration',
  components: {
    TypePicker,
  },
  props: {},
  setup() {
    const {
      setConfigurationId, hierarchy, configuration, saveConfiguration,
    } = useConfiguration();
    const generalDialog = ref(false);
    const baseConfiguration = ref(
        configuration.value?.general?.baseConfiguration
         || (hierarchy.value?.length ? hierarchy.value[0].id : null),
    );
    const mergeType = ref(configuration.value?.general?.configurationMerge || 'disabled');
    const disableConfigurationEditing = ref(
        configuration.value?.general?.disableConfigurationEditing,
    );
    const mergeSelection = ref(['merge up', 'merge down', 'disabled']);
    const launchEditor = () => {
      generalDialog.value = true;
    };

    const saveChanges = () => {
      // We need to take the new values and set them on the 'general' settings
      if (baseConfiguration.value) {
        setConfigurationId(baseConfiguration.value);
        const general = {
          baseConfiguration: baseConfiguration.value,
          configurationMerge: mergeType.value,
          disableConfigurationEditing: disableConfigurationEditing.value,
        };
        saveConfiguration(baseConfiguration.value, { general });
      }
    };
    return {
      generalDialog,
      hierarchy,
      baseConfiguration,
      disableConfigurationEditing,
      mergeType,
      mergeSelection,
      launchEditor,
      saveChanges,
    };
  },
});
</script>

<template>
  <div>
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
          <v-row class="pb-4">
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
          <v-row class="pb-4">
            <p>
              To prevent user's other than the
              owner of the target folder from modifying the configuration settings.
            </p>
            <v-checkbox
              v-model="disableConfigurationEditing"
              label="Disable Configuration Editing"
            />
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
  </div>
</template>

<style lang="scss">
</style>
