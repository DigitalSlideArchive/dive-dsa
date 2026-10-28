<script lang="ts">
import {
  computed, defineComponent, PropType, ref,
} from 'vue';
import SegmentationPointClick from 'dive-common/recipes/segmentationpointclick';
import type { SamModelProgress } from 'dive-common/use/segmentation/SamOnnx';
import { clientSettings } from 'dive-common/store/settings';
import {
  normalizeSegmentationPolygonPoints,
  SegmentationMaxPolygonPoints,
  SegmentationPolygonPointsGrowthFactor,
  SegmentationPolygonPointsSettingMax,
  SegmentationPolygonPointsSettingMin,
} from 'dive-common/use/segmentation/constants';

/**
 * Editing bar controls shown while point-click segmentation is loading or active:
 * model status, Reset (clear points and the previewed polygon) and Confirm.
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
    /**
     * Resettable whenever there is anything to clear: prompt points on the
     * current frame or a previewed polygon on any frame (e.g. after moving
     * to another frame, where the current frame has no points).
     */
    const canReset = computed(() => props.recipe.active.value
      && (props.recipe.pointCount.value > 0 || props.recipe.predictionCount.value > 0
        || props.recipe.hasPoints()));
    const busy = computed(() => !!props.status || props.recipe.predicting.value);
    const statusText = computed(() => {
      if (props.status) return props.status;
      if (props.recipe.predicting.value) return 'Computing segmentation…';
      return '';
    });
    /** Magic-wand settings dialog; the draft only commits on Apply. */
    const settingsOpen = ref(false);
    const draftPolygonPoints = ref(clientSettings.segmentationSettings.polygonPoints);
    const draftOutputMode = ref(clientSettings.segmentationSettings.outputMode);
    const outputModes = [
      { text: 'Polygon', value: 'polygon' },
      { text: 'Mask', value: 'mask' },
    ];
    const draftMaxPolygonPoints = computed(() => normalizeSegmentationPolygonPoints(
      draftPolygonPoints.value,
    ) * SegmentationPolygonPointsGrowthFactor);
    function openSettings() {
      draftPolygonPoints.value = clientSettings.segmentationSettings.polygonPoints;
      draftOutputMode.value = clientSettings.segmentationSettings.outputMode;
      settingsOpen.value = true;
    }
    function applySettings() {
      draftPolygonPoints.value = normalizeSegmentationPolygonPoints(draftPolygonPoints.value);
      clientSettings.segmentationSettings.polygonPoints = draftPolygonPoints.value;
      clientSettings.segmentationSettings.outputMode = draftOutputMode.value;
      settingsOpen.value = false;
      // Regenerate the displayed outline with the new settings, if any.
      props.recipe.refreshPrediction();
    }
    function resetDraftPolygonPoints() {
      draftPolygonPoints.value = SegmentationMaxPolygonPoints;
    }
    return {
      visible,
      downloading,
      canReset,
      busy,
      statusText,
      settingsOpen,
      draftPolygonPoints,
      draftOutputMode,
      outputModes,
      draftMaxPolygonPoints,
      openSettings,
      applySettings,
      resetDraftPolygonPoints,
      polygonPointsDefault: SegmentationMaxPolygonPoints,
      polygonPointsMin: SegmentationPolygonPointsSettingMin,
      polygonPointsMax: SegmentationPolygonPointsSettingMax,
      polygonPointsGrowthFactor: SegmentationPolygonPointsGrowthFactor,
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
          :disabled="!canReset"
          v-on="on"
          @click="recipe.resetPoints()"
        >
          <v-icon small>mdi-undo</v-icon>
          <span class="ml-1">Reset</span>
        </v-btn>
      </template>
      <span>Clear the points and the displayed polygon, and restore the detection (Esc)</span>
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
    <v-tooltip bottom>
      <template #activator="{ on }">
        <v-btn
          small
          outlined
          class="mx-1"
          v-on="on"
          @click="openSettings"
        >
          <v-icon small>mdi-cog</v-icon>
        </v-btn>
      </template>
      <span>Segment settings</span>
    </v-tooltip>
    <v-dialog
      v-model="settingsOpen"
      max-width="440"
    >
      <v-card>
        <v-card-title>Segment Settings</v-card-title>
        <v-card-text>
          <v-select
            v-model="draftOutputMode"
            :items="outputModes"
            label="Creates"
            dense
            hide-details
            class="mb-3"
          />
          <div
            v-if="draftOutputMode === 'mask'"
            class="text-caption mb-2"
          >
            Confirming stores the segmentation as a mask on the detection
            instead of an editable polygon. While segmenting, the mask
            itself is previewed at 75% opacity. Confirmed masks are shown
            with the Mask layer and can be refined with the mask brush.
          </div>
          <v-row
            v-if="draftOutputMode === 'polygon'"
            align="center"
            dense
          >
            <v-col>
              <v-slider
                v-model="draftPolygonPoints"
                :min="polygonPointsMin"
                :max="polygonPointsMax"
                :step="5"
                label="Polygon points"
                hide-details
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                v-model.number="draftPolygonPoints"
                type="number"
                :min="polygonPointsMin"
                :max="polygonPointsMax"
                step="5"
                dense
                hide-details
              />
            </v-col>
          </v-row>
          <div
            v-if="draftOutputMode === 'polygon'"
            class="text-caption mt-2"
          >
            Each outline starts with this many points and can grow to
            {{ draftMaxPolygonPoints }} points ({{ polygonPointsGrowthFactor }}x)
            when needed to keep the simplified outline within 5% of the
            mask's area. Higher values follow complex outlines more closely
            but create larger polygons.
          </div>
          <div class="text-caption mt-2">
            Applying regenerates the current frame's result; otherwise it
            takes effect on the next click. Saved in this browser.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn
            v-if="draftOutputMode === 'polygon'"
            text
            @click="resetDraftPolygonPoints"
          >
            Reset to {{ polygonPointsDefault }}
          </v-btn>
          <v-spacer />
          <v-btn
            text
            @click="settingsOpen = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            text
            @click="applySettings"
          >
            Apply
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
