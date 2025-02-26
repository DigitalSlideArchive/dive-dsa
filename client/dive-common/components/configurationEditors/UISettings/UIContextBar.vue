<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UIContextBar',
  components: {
  },
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

    const CustomUIEnabled = ref(!!configMan.configuration.value?.customUI);
    const customUITitle = ref(configMan.configuration.value?.customUI?.title || 'Custom UI');
    const customUIInformation = ref(configMan.configuration.value?.customUI?.information || ['Custom UI Information']);
    const customUIWidth = ref(configMan.configuration.value?.customUI?.width || 300);

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

    const addNewInformation = () => {
      customUIInformation.value.push('');
    };
    const removeInformation = (index: number) => {
      customUIInformation.value.splice(index, 1);
    };
    watch([CustomUIEnabled, customUITitle, customUIInformation, customUIWidth], () => {
      const data = {
        title: customUITitle.value,
        information: customUIInformation.value,
        width: customUIWidth.value,
      };
      configMan.setCustomUI(data);
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
      CustomUIEnabled,
      customUITitle,
      customUIInformation,
      customUIWidth,
      addNewInformation,
      removeInformation,
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
        <v-row dense>
          <v-switch
            v-model="CustomUIEnabled"
            label="Custom UI Enabled"
          />
        </v-row>
        <v-row v-if="CustomUIEnabled" dense>
          <v-text-field v-model="customUITitle" label="Title" />
          <v-text-field v-model.number="customUIWidth" label="Width" />
        </v-row>
        <div
          v-if="CustomUIEnabled"
        >
          <v-row>
            <v-btn @click="addNewInformation()">
              Add New
            </v-btn>
          </v-row>
          <v-row v-for="(info, index) in customUIInformation" :key="index" class="my-2">
            <v-col>
              <v-text-field v-model="customUIInformation[index]" label="Information" />
            </v-col>
            <v-col cols="auto">
              <v-btn icon @click="removeInformation(index)">
                <v-icon color="error">
                  mdi-delete
                </v-icon>
              </v-btn>
            </v-col>
          </v-row>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
