<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UIControls',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const UILegendControls = ref(configMan.getUISetting('UILegendControls') as boolean);
    const UITimelineSelection = ref(configMan.getUISetting('UITimelineSelection') as boolean);
    const UIPlaybackControls = ref(configMan.getUISetting('UIPlaybackControls') as boolean);
    const UIAudioControls = ref(configMan.getUISetting('UIAudioControls') as boolean);
    const UISpeedControls = ref(configMan.getUISetting('UISpeedControls') as boolean);
    const UITimeDisplay = ref(configMan.getUISetting('UITimeDisplay') as boolean);
    const UIFrameDisplay = ref(configMan.getUISetting('UIFrameDisplay') as boolean);
    const UIImageNameDisplay = ref(configMan.getUISetting('UIImageNameDisplay') as boolean);
    const UILockCamera = ref(configMan.getUISetting('UILockCamera') as boolean);
    const UIResetCamera = ref(configMan.getUISetting('UIResetCamera') as boolean);

    watch([UILegendControls, UITimelineSelection, UIPlaybackControls, UIAudioControls,
      UITimeDisplay, UIFrameDisplay, UIImageNameDisplay, UILockCamera, UISpeedControls, UIResetCamera], () => {
      const data = {
        UILegendControls: UILegendControls.value ? undefined : false,
        UITimelineSelection: UITimelineSelection.value ? undefined : false,
        UIPlaybackControls: UIPlaybackControls.value ? undefined : false,
        UIAudioControls: UIAudioControls.value ? undefined : false,
        UISpeedControls: UISpeedControls.value ? undefined : false,
        UITimeDisplay: UITimeDisplay.value ? undefined : false,
        UIFrameDisplay: UIFrameDisplay.value ? undefined : false,
        UIImageNameDisplay: UIImageNameDisplay.value ? undefined : false,
        UILockCamera: UILockCamera.value ? undefined : false,
        UIResetCamera: UIResetCamera.value ? undefined : false,
      };
      configMan.setUISettings('UIControls', data);
    });
    return {
      UILegendControls,
      UITimelineSelection,
      UIPlaybackControls,
      UIAudioControls,
      UISpeedControls,
      UITimeDisplay,
      UIFrameDisplay,
      UIImageNameDisplay,
      UILockCamera,
      UIResetCamera,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Playback Controls</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UILegendControls"
            label="Legend Controls"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UITimelineSelection"
            label="Timeline Selection Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIPlaybackControls"
            label="Playback Controls"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIAudioControls"
            label="Audio/Volume settings"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UISpeedControls"
            label="Playback Speed controls"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UITimeDisplay"
            label="Time Display"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIFrameDisplay"
            label="Frame Number Display"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIImageNameDisplay"
            label="Image Name Display"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UILockCamera"
            label="Lock Camera Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIResetCamera"
            label="Reset Camera Button"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
