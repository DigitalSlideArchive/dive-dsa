<script lang="ts">
import {
  computed, defineComponent, ref,
} from '@vue/composition-api';
import { TypePicker } from 'vue-media-annotator/components';
import { useHandler, useTrackFilters, useTrackStyleManager } from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'GenerateTracks',
  components: {
    TypePicker,
  },
  props: {},
  setup() {
    const handler = useHandler();
    const typeStylingRef = useTrackStyleManager().typeStyling;

    const trackFilters = useTrackFilters();
    const { allTypes } = trackFilters;
    const trackType = ref('unknown');
    const trackLength = ref(-1);
    const generateSettings = ref(false);
    const generateTrack = () => {
      handler.addFullFrameTrack(trackType.value, trackLength.value);
    };
    const trackColor = computed(() => typeStylingRef.value.color(trackType.value));
    return {
      trackType,
      trackLength,
      allTypes,
      generateSettings,
      trackColor,
      generateTrack,
    };
  },
});
</script>

<template>
  <div>
    <v-btn @click="generateTrack">
      <span>
        Generate Tracks
        <br>
        <span
          style="font-size:0.75em"
          :style="`color:${trackColor}`"
        >
          {{ trackType }}
        </span>
      </span>
      <v-icon
        class="ml-2"
        @click.stop="generateSettings = true"
      >
        mdi-cog
      </v-icon>
    </v-btn>
    <v-dialog
      v-model="generateSettings"
      max-width="400"
    >
      <v-card>
        <v-card-title>
          Generate Track Settings
          <v-spacer />
          <v-btn
            icon
            small
            color="white"
            @click="generateSettings = false"
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
            <span>Default Type:</span>
            <TypePicker
              :value="trackType"
              v-bind="{ allTypes }"
              @input="trackType = ($event)"
            />
          </v-row>
          <v-row>
            <v-text-field
              v-model.number="trackLength"
              dense
              outlined
              step="1"
              type="number"
              label="Length"
              :min="-1"
              hint="-1 is full length"
              persistent-hint
            />
          </v-row>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
</style>
