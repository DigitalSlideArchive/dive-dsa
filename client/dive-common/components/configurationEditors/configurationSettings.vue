<script lang="ts">
import {
  defineComponent, ref,
} from '@vue/composition-api';
import { cloneDeep } from 'lodash';
import { useConfiguration } from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'configurationSettings',
  components: {
  },
  props: {},
  setup() {
    const {
      configuration, saveConfiguration, configurationId,
    } = useConfiguration();
    const generalDialog = ref(false);
    const configurationSettings = configuration.value?.general?.configurationSettings;
    let general = cloneDeep(configuration.value?.general);

    const addTypes = ref(configurationSettings?.addTypes || true);
    const editTypes = ref(configurationSettings?.editTypes || true);
    const addTracks = ref(configurationSettings?.addTracks || true);
    const editTracks = ref(configurationSettings?.editTracks || true);
    const addTrackAttributes = ref(configurationSettings?.addTrackAttributes || true);
    const editTrackAttributes = ref(configurationSettings?.editTrackAttributes || true);

    const addDetectionAttributes = ref(configurationSettings?.addDetectionAttributes || true);
    const editDetectionAttributes = ref(configurationSettings?.editDetectionAttributes || true);

    const launchEditor = () => {
      generalDialog.value = true;
    };

    const saveChanges = () => {
      // We need to take the new values and set them on the 'general' settings
      const newConfigurationSettings = {
        addTypes: addTypes.value,
        editTypes: editTypes.value,
        addTracks: addTracks.value,
        editTracks: editTracks.value,
        addTrackAttributes: addTrackAttributes.value,
        editTrackAttributes: editTrackAttributes.value,
        addDetectionAttributes: addDetectionAttributes.value,
        editDetectionAttributes: editDetectionAttributes.value,
      };
      if (general) {
        general.configurationSettings = newConfigurationSettings;
      } else {
        general = {
          baseConfiguration: configurationId.value,
          configurationMerge: 'disabled',
          configurationSettings: newConfigurationSettings,
        };
      }
      saveConfiguration(configurationId.value, { general });
    };
    return {
      generalDialog,
      addTypes,
      editTypes,
      addTracks,
      editTracks,
      addTrackAttributes,
      editTrackAttributes,
      addDetectionAttributes,
      editDetectionAttributes,
      launchEditor,
      saveChanges,
    };
  },
});
</script>

<template>
  <div class="ma-2">
    <v-btn @click="launchEditor">
      <span>
        Saving/Editing
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
          Configuration Settings
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
          <v-row>
            <v-checkbox
              v-model="addTypes"
              label="Add Types"
            />
          </v-row>
          <v-row>
            <v-checkbox
              v-model="editTypes"
              label="Edit Types"
            />
          </v-row>
          <v-row>
            <v-checkbox
              v-model="editTracks"
              label="Edit Tracks"
            />
          </v-row>
          <v-row>
            <v-checkbox
              v-model="addTrackAttributes"
              label="Add Track Attributes"
            />
          </v-row>
          <v-row>
            <v-checkbox
              v-model="editTrackAttributes"
              label="Edit Track Attributes"
            />
          </v-row>
          <v-row>
            <v-checkbox
              v-model="addDetectionAttributes"
              label="Add Detection Attributes"
            />
          </v-row>
          <v-row>
            <v-checkbox
              v-model="editDetectionAttributes"
              label="Edit Detection Attributes"
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
