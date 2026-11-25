<script lang="ts">
import { defineComponent } from 'vue';
import { useTime } from 'vue-media-annotator/provides';

/**
 * The current frame number as its own component, so that only this label re-renders on every
 * frame of playback. Rendered inline in a large panel, it would re-render the whole panel.
 */
export default defineComponent({
  name: 'CurrentFrameLabel',
  setup() {
    const { frame } = useTime();
    return { frame };
  },
});
</script>

<template>
  <span>{{ `Frame: ${frame}` }}</span>
</template>
