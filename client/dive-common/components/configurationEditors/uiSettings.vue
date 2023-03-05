<script lang="ts">
import {
  defineComponent, ref,
} from '@vue/composition-api';
import { cloneDeep } from 'lodash';
import { useConfiguration } from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'uiSettings',
  components: {
  },
  props: {},
  setup() {
    const {
      configuration, saveConfiguration, configurationId,
    } = useConfiguration();
    const generalDialog = ref(false);
    const uiSettings = configuration.value?.uiSettings;
    let uiSettings = cloneDeep(configuration.value?.uiSettings);


    const launchEditor = () => {
      generalDialog.value = true;
    };

    const saveChanges = () => {
      // We need to take the new values and set them on the 'general' settings
    };
    return {
      generalDialog,
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
          UI Settings
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
          Placeholder for tabs for the main UI sections
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
