<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UISideBar',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const UITrackTypes = ref(configMan.getUISetting('UITrackTypes') as boolean);
    const UIConfidenceThreshold = ref(configMan.getUISetting('UIConfidenceThreshold') as boolean);
    const UITrackList = ref(configMan.getUISetting('UITrackList') as boolean);
    const UITrackDetails = ref(configMan.getUISetting('UITrackDetails') as boolean);
    const UIAttributeSettings = ref(configMan.getUISetting('UIAttributeSettings') as boolean);
    const UIAttributeAdding = ref(configMan.getUISetting('UIAttributeAdding') as boolean);
    const UIAttributeUserReview = ref(configMan.getUISetting('UIAttributeUserReview') as boolean);

    watch([UITrackTypes, UIConfidenceThreshold, UITrackList, UITrackDetails, UIAttributeSettings, UIAttributeAdding, UIAttributeUserReview], () => {
      const data = {
        UITrackTypes: UITrackTypes.value ? undefined : false,
        UIConfidenceThreshold: UIConfidenceThreshold.value ? undefined : false,
        UITrackList: UITrackList.value ? undefined : false,
        UIAttributeSettings: UIAttributeSettings.value ? undefined : false,
        UIAttributeAdding: UIAttributeAdding.value ? undefined : false,
        UIAttributeUserReview: UIAttributeUserReview.value ? undefined : false,

      };
      configMan.setUISettings('UISideBar', data);
    });
    return {
      UITrackTypes,
      UIConfidenceThreshold,
      UITrackList,
      UITrackDetails,
      UIAttributeSettings,
      UIAttributeAdding,
      UIAttributeUserReview,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Side Bar Settings</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UITrackTypes"
            label="Track Types"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIConfidenceThreshold"
            label="Confidence Threshold"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UITrackList"
            label="Track List"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UITrackDetails"
            label="Track Details (Attributes)"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIAttributeSettings"
            label="Attribute Settings"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIAttributeAdding"
            label="Adding Attributes"
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
