<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UITrackDetails',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const UITrackBrowser = ref(configMan.getUISetting('UITrackBrowser') as boolean);
    const UITrackMerge = ref(configMan.getUISetting('UITrackMerge') as boolean);
    const UIConfidencePairs = ref(configMan.getUISetting('UIConfidencePairs') as boolean);
    const UITrackAttributes = ref(configMan.getUISetting('UITrackAttributes') as boolean);
    const UIDetectionAttributes = ref(configMan.getUISetting('UIDetectionAttributes') as boolean);

    watch([UITrackBrowser, UITrackMerge,
      UIConfidencePairs, UITrackAttributes, UIDetectionAttributes], () => {
      const data = {
        UITrackBrowser: UITrackBrowser.value ? undefined : false,
        UITrackMerge: UITrackMerge.value ? undefined : false,
        UIConfidencePairs: UIConfidencePairs.value ? undefined : false,
        UITrackAttributes: UITrackAttributes.value ? undefined : false,
        UIDetectionAttributes: UIDetectionAttributes.value ? undefined : false,

      };
      configMan.setUISettings('UITrackDetails', data);
    });
    return {
      UITrackBrowser,
      UITrackMerge,
      UIConfidencePairs,
      UITrackAttributes,
      UIDetectionAttributes,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Track Details</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UITrackBrowser"
            label="Track Browser Controls"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UITrackMerge"
            label="Track Merging"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIConfidencePairs"
            label="Confidence Pairs Viewer"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UITrackAttributes"
            label="Track Attributes"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIDetectionAttributes"
            label="Detection Attributes"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
