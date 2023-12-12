<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UITimeline',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const UIDetections = ref(configMan.getUISetting('UIDetections') as boolean);
    const UIEvents = ref(configMan.getUISetting('UIEvents') as boolean);

    watch([UIDetections, UIEvents], () => {
      const data = {
        UIDetections: UIDetections.value ? undefined : false,
        UIEvents: UIEvents.value ? undefined : false,

      };
      configMan.setUISettings('UITimeline', data);
    });
    return {
      UIDetections,
      UIEvents,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Timeline Settings</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UIDetections"
            label="Detections Timeline"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIEvents"
            label="Events Timeline"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
