<script lang="ts">
import { computed, defineComponent, PropType } from '@vue/composition-api';
import { UISettingsKey } from 'vue-media-annotator/ConfigurationManager';
import { useConfiguration, useSelectedCamera } from '../../provides';
import { injectAggregateController } from '../annotators/useMediaController';

export default defineComponent({
  name: 'FileNameTimeDisplay',
  props: {
    displayType: {
      type: String as PropType<'filename' |'time'>,
      required: true,
    },
  },
  setup(props) {
    const mediaController = injectAggregateController();
    const { currentTime, frame } = mediaController.value;
    const selectedCamera = useSelectedCamera();
    const configMan = useConfiguration();
    const getUISetting = (key: UISettingsKey) => (configMan.getUISetting(key));

    const selectedCameraController = computed(() => {
      try {
        return mediaController.value.getController(selectedCamera.value);
      } catch {
        return undefined;
      }
    });
    const filename = computed(() => (selectedCameraController.value?.filename.value));
    const duration = computed(() => (selectedCameraController.value?.duration.value));
    const display = computed(() => {
      let value = 'unsupported display';
      if (props.displayType === 'filename') {
        value = filename.value || 'uninitialized';
      } if (props.displayType === 'time') {
        value = `${new Date(currentTime.value * 1000).toISOString().substr(11, 8)} / ${new Date((duration.value || 0) * 1000).toISOString().substr(11, 8)}`;
      }
      return value;
    });
    return {
      display,
      frame,
      currentTime,
      selectedCamera,
      getUISetting,
    };
  },
});
</script>

<template>
  <span>
    <span v-if="getUISetting('UITimeDisplay')">
      {{ display }}
    </span>
    <span
      v-if="getUISetting('UIFrameDisplay')"
      class="border-radius mr-1"
    >frame {{ frame }}</span>
    <v-tooltip
      v-if="getUISetting('UIFrameDisplay')"
      open-delay="200"
      bottom
    >
      <template #activator="{ on }">
        <v-icon
          small
          class="mx-2"
          v-on="on"
        >
          mdi-information
        </v-icon>
      </template>
      <span>
        annotation framerate may be downsampled.
        <br>
        frame numbers start at zero.
      </span>
    </v-tooltip>

  </span>
</template>

<style scoped>
.border-radius {
  border: 1px solid #888888;
  padding: 2px 5px;
  border-radius: 5px;
}
</style>
