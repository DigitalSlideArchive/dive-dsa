<!-- eslint-disable no-await-in-loop -->
<script lang="ts">
import { defineComponent } from 'vue';
import { uploadMask } from 'platform/web-girder/api/annotation.service';
import {
  useSelectedTrackId, useTime, useDatasetId,
  useCameraStore,
  useMasks,
} from 'vue-media-annotator/provides';
import { MaskEditingTools } from 'vue-media-annotator/use/useMasks';

export default defineComponent({
  name: 'MaskEditor',
  props: {
  },
  setup() {
    const { frame } = useTime();
    const selectedTrackId = useSelectedTrackId();
    const datasetIdRef = useDatasetId();
    const cameraStore = useCameraStore();
    const { editorFunctions, editorOptions } = useMasks();

    const numberOfFrames = 600; // How many frames to generate
    const radius = 100; // Radius of circular motion

    const createMask = async () => {
      if (selectedTrackId.value === null) {
        console.error('No track selected');
        return;
      }
      const track = cameraStore.getAnyPossibleTrack(selectedTrackId.value);
      for (let i = 0; i < numberOfFrames; i += 1) {
        const angle = (2 * Math.PI * i) / 60;
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;
        if (track) {
          track.setHasMask(frame.value + i, true);
        }
        const blob = await generateStarMaskPng(offsetX, offsetY);
        const result = await uploadMask(
          datasetIdRef.value,
          selectedTrackId.value || 0,
          frame.value + i, // Save frames at different timestamps
          blob,
        );
        console.log(`Uploaded frame ${i}`, result);
      }
    };

    async function generateStarMaskPng(offsetX = 0, offsetY = 0): Promise<Blob> {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      // Fill background black
      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, size, size);

      // Draw white star
      ctx.fillStyle = 'white';
      ctx.beginPath();
      const centerX = size / 2 + offsetX;
      const centerY = size / 2 + offsetY;
      const spikes = 5;
      const outerRadius = size / 4;
      const innerRadius = size / 8;

      for (let i = 0; i < spikes * 2; i += 1) {
        const radius = (i % 2 === 0) ? outerRadius : innerRadius;
        const angle = (Math.PI / spikes) * i;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();

      return new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            throw new Error('Failed to create PNG blob');
          }
          resolve(blob);
        }, 'image/png');
      });
    }

    const setEditingMode = (value: MaskEditingTools) => {
      editorFunctions.setEditorOptions({ toolEnabled: value });
    };

    return {
      createMask,
      toolEnabled: editorOptions.toolEnabled,
      brushSize: editorOptions.brushSize,
      opacity: editorOptions.opacity,
      setEditingMode,
    };
  },
});
</script>

<template>
  <v-row
    class="pa-0 ma-0 grow"
    no-gutters
  >
    <span class="mx-1">
      <v-btn
        color="success"
        depressed
        small
        @click="createMask"
      >
        Create Circular Mask Frames
        <v-icon small class="ml-2">
          mdi-star
        </v-icon>
      </v-btn>
    </span>
    <span>
      <v-tooltip bottom>
        <template #activator="{ on }">
          <div v-on="on">
            <v-btn
              :color="toolEnabled === 'pointer' ? 'primary' : ''"
              :outlined="toolEnabled !== 'pointer'"
              class="mx-1"
              small
              @click="setEditingMode('pointer')"
            >
              <v-icon>mdi-cursor-default-outline</v-icon>
            </v-btn>
          </div>
        </template>
        <span>Pointer Mode for panning/ zoom and dragging</span>
      </v-tooltip>
    </span>
    <span>
      <v-tooltip bottom>
        <template #activator="{ on }">
          <div v-on="on">
            <v-btn
              :color="toolEnabled === 'brush' ? 'primary' : ''"
              :outlined="toolEnabled !== 'brush'"
              class="mx-1"
              small
              @click="setEditingMode('brush')"
            >
              <v-icon>mdi-brush-outline</v-icon>
            </v-btn>
          </div>
        </template>
        <span>Brush Mode for panning/ zoom and dragging</span>
      </v-tooltip>
    </span>
    <span>
      <v-tooltip bottom>
        <template #activator="{ on }">
          <div v-on="on">
            <v-btn
              :color="toolEnabled === 'eraser' ? 'primary' : ''"
              :outlined="toolEnabled !== 'eraser'"
              class="mx-1"
              small
              @click="setEditingMode('eraser')"
            >
              <v-icon>mdi-eraser</v-icon>
            </v-btn>
          </div>
        </template>
        <span>Eraser for removing data from the image</span>
      </v-tooltip>
    </span>
  </v-row>
</template>
