<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UIContextBar',
  setup() {
    const configMan = useConfiguration();
    const UIContextBarDefaultNotOpen = ref(configMan.getUISetting('UIContextBarDefaultNotOpen') as boolean);
    const UIContextBarNotStatic = ref(configMan.getUISetting('UIContextBarNotStatic') as boolean);
    const UIThresholdControls = ref(configMan.getUISetting('UIThresholdControls') as boolean);
    const UIImageEnhancements = ref(configMan.getUISetting('UIImageEnhancements') as boolean);
    const UIGroupManager = ref(configMan.getUISetting('UIGroupManager') as boolean);
    const UIAttributeDetails = ref(configMan.getUISetting('UIAttributeDetails') as boolean);
    const UIRevisionHistory = ref(configMan.getUISetting('UIRevisionHistory') as boolean);
    const UIDatasetInfo = ref(configMan.getUISetting('UIDatasetInfo') as boolean);
    const UIAttributeUserReview = ref(configMan.getUISetting('UIAttributeUserReview') as boolean);

    watch([UIThresholdControls, UIImageEnhancements,
      UIGroupManager, UIAttributeDetails, UIRevisionHistory, UIDatasetInfo, UIAttributeUserReview, UIContextBarDefaultNotOpen, UIContextBarNotStatic], () => {
      const data = {
        UIContextBarDefaultNotOpen: UIContextBarDefaultNotOpen.value ? undefined : false,
        UIContextBarNotStatic: UIContextBarNotStatic.value ? undefined : false,
        UIThresholdControls: UIThresholdControls.value ? undefined : false,
        UIImageEnhancements: UIImageEnhancements.value ? undefined : false,
        UIGroupManager: UIGroupManager.value ? undefined : false,
        UIAttributeDetails: UIAttributeDetails.value ? undefined : false,
        UIRevisionHistory: UIRevisionHistory.value ? undefined : false,
        UIDatasetInfo: UIDatasetInfo.value ? undefined : false,
        UIAttributeUserReview: UIAttributeUserReview.value ? undefined : false,
      };
      configMan.setUISettings('UIContextBar', data);
    });

    return {
      UIContextBarDefaultNotOpen,
      UIContextBarNotStatic,
      UIThresholdControls,
      UIImageEnhancements,
      UIGroupManager,
      UIAttributeDetails,
      UIRevisionHistory,
      UIDatasetInfo,
      UIAttributeUserReview,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Context Bar (Right side) Settings</v-card-title>
    <v-card-text>
      <div>
        <p>Context Bar Generic Settings</p>
        <v-row dense>
          <v-switch
            v-model="UIContextBarDefaultNotOpen"
            label="Closed by Default"
            class="mx-2"
          />
          <v-switch
            v-model="UIContextBarNotStatic"
            label="Dismissable"
            class="mx-2"
          />
        </v-row>
        <v-divider />
      </div>
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
        <v-row dense>
          <v-switch
            v-model="UIDatasetInfo"
            label="Dataset Info"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIAttributeUserReview"
            label="Attribute User Review"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
