<script lang="ts">
import {
  defineComponent, reactive, watch,
} from 'vue';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import context from 'dive-common/store/context';
import { useConfiguration } from 'vue-media-annotator/provides';
import { UISettingsKey } from 'vue-media-annotator/ConfigurationManager';
import { useRoute } from 'vue-router/composables';
import { injectAggregateController } from '../annotators/useMediaController';

export default defineComponent({
  name: 'Control',
  setup() {
    const data = reactive({
      frame: 0,
      dragging: false,
    });
    const mediaController = injectAggregateController().value;
    const { visible } = usePrompt();
    const route = useRoute();
    const configMan = useConfiguration();
    const getUISetting = (key: UISettingsKey) => (configMan.getUISetting(key));

    watch(mediaController.frame, (frame) => {
      if (!data.dragging) {
        data.frame = frame;
      }
    });
    const dragHandler = {
      start() { data.dragging = true; },
      end() { data.dragging = false; },
    };
    function input(value: number) {
      if (mediaController.frame.value !== value) {
        mediaController.seek(value);
      }
      data.frame = value;
    }
    function togglePlay(_: HTMLElement, keyEvent: KeyboardEvent) {
      // Prevent scroll from spacebar and other default effects.
      keyEvent.preventDefault();
      if (mediaController.playing.value) {
        mediaController.pause();
      } else {
        mediaController.play();
      }
    }
    function toggleEnhancements() {
      context.toggle('ImageEnhancements');
    }
    watch(() => route.query, (newQuery) => {
      if (newQuery.frame) {
        const frame = parseInt(newQuery.frame as string, 10);
        if (frame !== mediaController.frame.value) {
          mediaController.seek(frame);
        }
      }
    });

    return {
      data,
      mediaController,
      dragHandler,
      input,
      togglePlay,
      toggleEnhancements,
      visible,
      getUISetting,
    };
  },
});
</script>

<template>
  <div
    v-mousetrap="[
      { bind: 'left', handler: mediaController.prevFrame, disabled: visible() },
      { bind: 'right', handler: mediaController.nextFrame, disabled: visible() },
      { bind: 'space', handler: togglePlay, disabled: visible() },
      { bind: 'f', handler: mediaController.nextFrame, disabled: visible() },
      { bind: 'd', handler: mediaController.prevFrame, disabled: visible() },
      {
        bind: 'l',
        handler: () => mediaController.toggleSynchronizeCameras(!mediaController.cameraSync.value),
        disabled: visible(),
      },
    ]"
  >
    <v-card
      class="px-4 py-1 controller"
      tile
    >
      <v-slider
        hide-details
        :min="0"
        :max="mediaController.maxFrame.value"
        :value="data.frame"
        @start="dragHandler.start"
        @end="dragHandler.end"
        @input="input"
      />
      <v-row no-gutters>
        <v-col class="pl-1 py-1 grow">
          <v-row>
            <slot
              justify="start"
              name="timelineControls"
            />
          </v-row>
        </v-col>
        <v-col
          v-if="getUISetting('UIPlaybackControls')"
          class="py-1 shrink"
          style="min-width: 100px;"
        >
          <v-btn
            icon
            small
            title="(d, left-arrow) previous frame"
            @click="mediaController.prevFrame"
          >
            <v-icon>mdi-skip-previous</v-icon>
          </v-btn>
          <v-btn
            v-if="!mediaController.playing.value"
            icon
            small
            title="(space) Play"
            @click="mediaController.play"
          >
            <v-icon>mdi-play</v-icon>
          </v-btn>
          <v-btn
            v-else
            icon
            small
            title="(space) Pause"
            @click="mediaController.pause"
          >
            <v-icon>mdi-pause</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="(f, right-arrow) next frame"
            @click="mediaController.nextFrame"
          >
            <v-icon>mdi-skip-next</v-icon>
          </v-btn>
        </v-col>
        <v-col
          class="pl-1 py-1"
        >
          <slot name="middle" />
        </v-col>
        <v-col
          class="pl-1 py-1 shrink d-flex"
          align="right"
        >
          <v-btn
            v-if="getUISetting('UILockCamera')"
            icon
            small
            :color="mediaController.lockedCamera.value ? 'primary' : 'default'"
            title="center camera on selected track"
            @click="mediaController.toggleLockedCamera"
          >
            <v-icon>
              {{ mediaController.lockedCamera.value ? 'mdi-lock-check' : 'mdi-lock-open' }}
            </v-icon>
          </v-btn>
          <v-btn
            v-if="getUISetting('UIResetCamera')"
            icon
            small
            title="(r)eset pan and zoom"
            @click="mediaController.resetZoom"
          >
            <v-icon>mdi-image-filter-center-focus</v-icon>
          </v-btn>
          <v-btn
            v-if="getUISetting('UIImageEnhancements')"
            icon
            small
            title="Image Enhancements"
            @click="toggleEnhancements"
          >
            <v-icon>mdi-contrast-box</v-icon>
          </v-btn>

          <v-btn
            v-if="mediaController.cameras.value.length > 1"
            icon
            small
            :color="mediaController.cameraSync.value ? 'primary' : 'default'"
            title="Synchronize camera controls"

            @click="mediaController.toggleSynchronizeCameras(!mediaController.cameraSync.value)"
          >
            <v-icon>
              {{ mediaController.cameraSync.value ? 'mdi-link' : 'mdi-link-off' }}
            </v-icon>
          </v-btn>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>

<style lang="css" scoped>
.controller {
  -webkit-user-select: none; /* Safari */
  -ms-user-select: none; /* IE 10 and IE 11 */
  user-select: none; /* Standard syntax */
}
</style>
