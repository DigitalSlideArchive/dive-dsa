<script lang="ts">
import {
  defineComponent,
  reactive,
  PropType,
  ref,
  computed,
  onMounted,
} from 'vue';
import { clientSettings } from 'dive-common/store/settings';
import { SAM_LABELS, SamModel } from 'dive-common/use/segmentation/samModels';
import { samHardwareGpuAvailable } from 'dive-common/use/segmentation/samDevices';
import {
  normalizeSegmentationPolygonPoints,
  SegmentationPolygonPointsSettingMax,
  SegmentationPolygonPointsSettingMin,
} from 'dive-common/use/segmentation/constants';

export default defineComponent({
  name: 'TrackSettingsPanel',

  props: {
    allTypes: {
      type: Array as PropType<Array<string>>,
      required: true,
    },
  },

  setup(props) {
    const itemHeight = 45; // in pixels
    const help = reactive({
      mode: {
        Track: 'Track Mode - advance a frame while drawing',
        Detection: 'Detection Mode - Used to create multiple detections on a single frame.',
      },
      type: 'Choose a default type for the new Track/Detection to be or type in a new type to add it',
      autoAdvanceFrame: 'After creating a track advance to the next frame.  Hit Esc to exit.',
      interpolate: 'Whether new tracks should have interpolation enabled by default',
      continuous: 'Immediately stay in detection creation mode after creating a new track.  Hit Esc to exit.',
      prompt: 'Prompt user before deleting a track?',
      segmentationModel: 'Used by the Segment (wand) tool. Downloads once on first use, then loads from the browser cache. Tiny is fastest; Small is more accurate but slower and needs more memory.',
      segmentationDevice: 'Each new frame is encoded once: about a second on a GPU, often 5-15 seconds on a CPU. Later clicks on the same frame are fast. Auto prefers the GPU and falls back to the CPU.',
      segmentationPolygonPoints: 'Base number of points per Segment (wand) outline. Complex outlines can grow to 4x this value to stay within 5% of the mask area. Higher values follow outlines more closely but create larger polygons. Also available from the gear button while segmenting.',
      segmentationOutputMode: 'What the Segment (wand) tool creates when confirmed: an editable Polygon on the detection, or a Mask stored for the detection (shown with the Mask layer, editable with the mask brush). Also available from the gear button while segmenting.',
    });
    const segmentationModels = (Object.keys(SAM_LABELS) as SamModel[])
      .map((value) => ({ text: SAM_LABELS[value], value }));
    const gpuAvailable = ref(true);
    const segmentationDevices = computed(() => [
      { text: 'Auto', value: 'auto' },
      { text: 'GPU (WebGPU)', value: 'gpu', disabled: !gpuAvailable.value },
      { text: 'CPU (WebAssembly)', value: 'cpu' },
    ]);
    const segmentationRows = computed(() => [
      {
        key: 'model', label: 'Model', items: segmentationModels, help: help.segmentationModel,
      },
      {
        key: 'device', label: 'Device', items: segmentationDevices.value, help: help.segmentationDevice,
      },
      {
        key: 'outputMode',
        label: 'Creates',
        items: [{ text: 'Polygon', value: 'polygon' }, { text: 'Mask', value: 'mask' }],
        help: help.segmentationOutputMode,
      },
    ]);
    /** Keep a typed polygon-point value inside the supported range. */
    function clampPolygonPoints() {
      clientSettings.segmentationSettings.polygonPoints = normalizeSegmentationPolygonPoints(
        clientSettings.segmentationSettings.polygonPoints,
      );
    }
    onMounted(async () => {
      gpuAvailable.value = await samHardwareGpuAvailable();
      if (!gpuAvailable.value && clientSettings.segmentationSettings.device === 'gpu') {
        clientSettings.segmentationSettings.device = 'auto';
      }
    });
    const modes = ref(['Track', 'Detection']);
    // Add unknown as the default type to the typeList
    const typeList = computed(() => ['unknown'].concat(props.allTypes));

    return {
      clientSettings,
      itemHeight,
      help,
      modes,
      typeList,
      segmentationRows,
      gpuAvailable,
      clampPolygonPoints,
      polygonPointsMin: SegmentationPolygonPointsSettingMin,
      polygonPointsMax: SegmentationPolygonPointsSettingMax,
    };
  },
});
</script>

<template>
  <div class="TrackSettings">
    <v-card
      outlined
      class="pa-2"
      width="300"
      color="blue-grey darken-3"
    >
      <div class="subheading">
        New Annotation Settings
      </div>
      <v-row
        align="end"
        dense
      >
        <v-col
          class="mx-2 px-0"
          cols="2"
        >
          Mode:
        </v-col>
        <v-col>
          <v-select
            v-model="clientSettings.trackSettings.newTrackSettings.mode"
            class="ml-0 pa-0"
            x-small
            :items="modes"
            dense
            hide-details
          />
        </v-col>
        <v-col
          cols="2"
          align="right"
        >
          <v-tooltip
            open-delay="200"
            bottom
            max-width="200"
          >
            <template #activator="{ on }">
              <v-icon
                small
                v-on="on"
              >
                mdi-help
              </v-icon>
            </template>
            <span>
              {{ help.mode[clientSettings.trackSettings.newTrackSettings.mode] }}
            </span>
          </v-tooltip>
        </v-col>
      </v-row>
      <v-row
        align="end"
        dense
        class="mb-2"
      >
        <v-col
          class="mx-2"
          cols="2"
        >
          Type:
        </v-col>
        <v-col>
          <v-combobox
            v-model="clientSettings.trackSettings.newTrackSettings.type"
            class="ml-0 pa-0"
            x-small
            :items="typeList"
            dense
            hide-details
          />
        </v-col>
        <v-col
          cols="2"
          align="right"
        >
          <v-tooltip
            open-delay="200"
            max-width="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon
                small
                v-on="on"
              >
                mdi-help
              </v-icon>
            </template>
            <span>{{ help.type }}</span>
          </v-tooltip>
        </v-col>
      </v-row>
      <template v-if="clientSettings.trackSettings.newTrackSettings.mode === 'Track'">
        <v-row>
          <v-col class="py-1">
            <v-switch
              v-model="
                clientSettings.trackSettings.newTrackSettings.modeSettings.Track.autoAdvanceFrame"
              class="my-0 ml-1 pt-0"
              dense
              label="Advance Frame"
              hide-details
            />
          </v-col>
          <v-col
            class="py-1 shrink"
            align="right"
          >
            <v-tooltip
              open-delay="200"
              max-width="200"
              bottom
            >
              <template #activator="{ on }">
                <v-icon
                  small
                  v-on="on"
                >
                  mdi-help
                </v-icon>
              </template>
              <span>{{ help.autoAdvanceFrame }}</span>
            </v-tooltip>
          </v-col>
        </v-row>
        <v-row>
          <v-col class="py-1">
            <v-switch
              v-model="
                clientSettings.trackSettings.newTrackSettings.modeSettings.Track.interpolate"
              class="my-0 ml-1 pt-0"
              dense
              label="Interpolate"
              hide-details
            />
          </v-col>
          <v-col
            class="py-1 shrink"
            align="right"
          >
            <v-tooltip
              open-delay="200"
              max-width="200"
              bottom
            >
              <template #activator="{ on }">
                <v-icon
                  small
                  v-on="on"
                >
                  mdi-help
                </v-icon>
              </template>
              <span>{{ help.interpolate }}</span>
            </v-tooltip>
          </v-col>
        </v-row>
      </template>
      <v-row
        v-if="clientSettings.trackSettings.newTrackSettings.mode === 'Detection'"
      >
        <v-col class="py-1">
          <v-switch
            v-model="
              clientSettings.trackSettings.newTrackSettings.modeSettings.Detection.continuous"
            class="my-0 ml-1 pt-0"
            dense
            label="Continuous"
            hide-details
          />
        </v-col>
        <v-col
          class="py-1 shrink"
          align="right"
        >
          <v-tooltip
            open-delay="200"
            max-width="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon
                small
                v-on="on"
              >
                mdi-help
              </v-icon>
            </template>
            <span>{{ help.continuous }}</span>
          </v-tooltip>
        </v-col>
      </v-row>
      <v-divider class="my-2" />
      <div class="subheading">
        Deletion Settings
      </div>
      <v-row
        align="end"
        dense
      >
        <v-col class="py-1">
          <v-switch
            v-model="clientSettings.trackSettings.deletionSettings.promptUser"
            class="my-0 ml-1 pt-0"
            dense
            label="Prompt User"
            hide-details
          />
        </v-col>
        <v-col
          cols="2"
          class="py-1"
          align="right"
        >
          <v-tooltip
            open-delay="200"
            max-width="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon
                small
                v-on="on"
              >
                mdi-help
              </v-icon>
            </template>
            <span>{{ help.prompt }}</span>
          </v-tooltip>
        </v-col>
      </v-row>
      <v-divider class="my-2" />
      <div class="subheading">
        Segmentation (SAM2)
      </div>
      <v-row
        v-for="setting in segmentationRows"
        :key="setting.key"
        align="end"
        dense
        class="mb-1"
      >
        <v-col
          class="mx-2 px-0"
          cols="3"
        >
          {{ setting.label }}:
        </v-col>
        <v-col>
          <v-select
            v-model="clientSettings.segmentationSettings[setting.key]"
            class="ml-0 pa-0"
            x-small
            :items="setting.items"
            dense
            hide-details
          />
        </v-col>
        <v-col
          cols="2"
          align="right"
        >
          <v-tooltip
            open-delay="200"
            max-width="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon
                small
                v-on="on"
              >
                mdi-help
              </v-icon>
            </template>
            <span>{{ setting.help }}</span>
          </v-tooltip>
        </v-col>
      </v-row>
      <v-row
        v-if="clientSettings.segmentationSettings.outputMode === 'polygon'"
        align="end"
        dense
        class="mb-1"
      >
        <v-col
          class="mx-2 px-0"
          cols="3"
        >
          Points:
        </v-col>
        <v-col>
          <v-text-field
            v-model.number="clientSettings.segmentationSettings.polygonPoints"
            class="ml-0 pa-0"
            type="number"
            :min="polygonPointsMin"
            :max="polygonPointsMax"
            step="5"
            dense
            hide-details
            @change="clampPolygonPoints"
          />
        </v-col>
        <v-col
          cols="2"
          align="right"
        >
          <v-tooltip
            open-delay="200"
            max-width="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon
                small
                v-on="on"
              >
                mdi-help
              </v-icon>
            </template>
            <span>{{ help.segmentationPolygonPoints }}</span>
          </v-tooltip>
        </v-col>
      </v-row>
      <div
        v-if="!gpuAvailable"
        class="text-caption mt-1"
      >
        No hardware GPU was found in this browser, so segmentation runs on the CPU.
      </div>
    </v-card>
  </div>
</template>
