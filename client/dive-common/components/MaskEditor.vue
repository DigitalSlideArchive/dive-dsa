<script lang="ts">
import { defineComponent } from 'vue';
import { uploadMask } from 'platform/web-girder/api/annotation.service';
import {
  useSelectedTrackId, useTime, useDatasetId,
} from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'MaskEditor',
  props: {
  },
  setup() {
    const { frame } = useTime();
    const selectedTrackId = useSelectedTrackId();
    const datasetIdRef = useDatasetId();
    const createMask = async () => {
      const blob = await generateStarMaskPng();
      const result = await uploadMask(datasetIdRef.value, selectedTrackId.value || 0, frame.value, blob);
      console.log(result);
    };

    async function generateStarMaskPng(): Promise<Blob> {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      // Fill background black
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, size, size);

      // Draw white star
      ctx.fillStyle = 'white';
      ctx.beginPath();
      const centerX = size / 2;
      const centerY = size / 2;
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
    return {
      createMask,
    };
  },
});
</script>

<template>
  <span class="mx-1">
    <v-btn
      color="success"
      depressed
      small
      @click="createMask"
    >
      Create Mask
      <v-icon
        small
        class="ml-2"
      >
        mdi-star
      </v-icon>
    </v-btn>
  </span>
</template>
