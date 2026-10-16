<script lang="ts">
import { computed, defineComponent, PropType } from 'vue';
import SegmentationPointClick from 'dive-common/recipes/segmentationpointclick';
import type { SamModelProgress } from 'dive-common/use/segmentation/SamOnnx';

/**
 * Editing bar controls shown while point-click segmentation is loading or active:
 * model status, Reset (clear points) and Confirm.
 */
export default defineComponent({
  name: 'SegmentationControls',
  props: {
    recipe: {
      type: Object as PropType<SegmentationPointClick>,
      required: true,
    },
    status: {
      type: String as PropType<string | null>,
      default: null,
    },
    progress: {
      type: Object as PropType<SamModelProgress | null>,
      default: null,
    },
  },
  setup(props) {
    const visible = computed(() => props.recipe.active.value || props.recipe.loading.value);
    const downloading = computed(() => props.progress?.phase === 'download'
      && props.progress.percent !== undefined && props.progress.percent < 100);
    const busy = computed(() => !!props.status || props.recipe.predicting.value);
    const statusText = computed(() => {
      if (props.status) return props.status;
      if (props.recipe.predicting.value) return 'Computing segmentation…';
      return '';
    });
    return {
      visible,
      downloading,
      busy,
      statusText,
    };
  },
});
</script>

<template>
  <span
    v-if="visible"
    class="d-flex align-center segmentation-controls"
  >
    <v-tooltip bottom>
      <template #activator="{ on }">
        <v-btn
          small
          outlined
          class="mx-1"
          :disabled="!recipe.active.value || recipe.pointCount.value === 0"
          v-on="on"
          @click="recipe.resetPoints()"
        >
          <v-icon small>mdi-undo</v-icon>
          <span class="ml-1">Reset</span>
        </v-btn>
      </template>
      <span>Clear the points and restore the detection (Esc)</span>
    </v-tooltip>
    <v-tooltip bottom>
      <template #activator="{ on }">
        <v-btn
          small
          outlined
          color="success"
          class="mx-1"
          :disabled="!recipe.active.value || recipe.predictionCount.value === 0"
          v-on="on"
          @click="recipe.confirmPrediction()"
        >
          <v-icon small>mdi-check</v-icon>
          <span class="ml-1">Confirm</span>
        </v-btn>
      </template>
      <span>Keep the segmentation (Enter or right click)</span>
    </v-tooltip>
    <span
      v-if="busy"
      class="d-flex align-center ml-2 status"
    >
      <v-progress-circular
        v-if="!downloading"
        indeterminate
        size="16"
        width="2"
        color="primary"
        class="mr-2"
      />
      <span class="text-caption">{{ statusText }}</span>
      <v-progress-linear
        v-if="downloading"
        :value="progress.percent"
        height="6"
        rounded
        class="ml-2 download"
      />
    </span>
  </span>
</template>

<style scoped>
.status {
  white-space: nowrap;
}
.download {
  width: 120px;
}
</style>
