<script lang="ts">
import {
  defineComponent, ref, watch,
} from '@vue/composition-api';
import { useConfiguration } from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'UIContextBar',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const UIThresholdControls = ref(configMan.getUISetting('UIThresholdControls') as boolean);
    const UIImageEnhancements = ref(configMan.getUISetting('UIImageEnhancements') as boolean);
    const UIGroupManager = ref(configMan.getUISetting('UIGroupManager') as boolean);
    const UIAttributeDetails = ref(configMan.getUISetting('UIAttributeDetails') as boolean);
    const UIRevisionHistory = ref(configMan.getUISetting('UIRevisionHistory') as boolean);

    watch([UIThresholdControls, UIImageEnhancements,
      UIGroupManager, UIAttributeDetails, UIRevisionHistory], () => {
      const data = {
        UIThresholdControls: UIThresholdControls.value ? undefined : false,
        UIImageEnhancements: UIImageEnhancements.value ? undefined : false,
        UIGroupManager: UIGroupManager.value ? undefined : false,
        UIAttributeDetails: UIAttributeDetails.value ? undefined : false,
        UIRevisionHistory: UIRevisionHistory.value ? undefined : false,

      };
      configMan.setUISettings('UIContextBar', data);
    });
    return {
      UIThresholdControls,
      UIImageEnhancements,
      UIGroupManager,
      UIAttributeDetails,
      UIRevisionHistory,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Context Bar (Right side) Settings</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UIThresholdControls"
            label="Confidence Detailed Controls"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIImageEnhancements"
            label="Image Enhancements"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIGroupManager"
            label="Group Manager"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIAttributeDetails"
            label="Attribute Filtering/Graphing"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIRevisionHistory"
            label="Revision History"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
