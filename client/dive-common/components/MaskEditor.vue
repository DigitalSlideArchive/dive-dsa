<!-- eslint-disable no-await-in-loop -->
<script lang="ts">
import { defineComponent, ref } from 'vue';
import {
  useMasks,
} from 'vue-media-annotator/provides';
import { MaskEditingTools, MaskTriggerActions } from 'vue-media-annotator/use/useMasks';

export default defineComponent({
  name: 'MaskEditor',
  props: {
  },
  setup() {
    const { editorFunctions, editorOptions } = useMasks();

    const setEditingMode = (value: MaskEditingTools) => {
      editorFunctions.setEditorOptions({ toolEnabled: value });
    };

    const sliderChange = (value: number) => {
      editorFunctions.setEditorOptions({ brushSize: value });
    };

    const setTriggerAction = (value: MaskTriggerActions) => {
      editorFunctions.setEditorOptions({ triggerAction: value });
    };

    const mousetrap = ref([
      {
        bind: '1',
        handler: () => setEditingMode('pointer'),
      },
      {
        bind: '2',
        handler: () => setEditingMode('brush'),
      },
      {
        bind: '3',
        handler: () => setEditingMode('eraser'),
      },
    ]);

    return {
      toolEnabled: editorOptions.toolEnabled,
      brushSize: editorOptions.brushSize,
      opacity: editorOptions.opacity,
      setEditingMode,
      sliderChange,
      mousetrap,
      setTriggerAction,
    };
  },
});
</script>

<template>
  <v-row
    v-mousetrap="mousetrap"
    class="pa-0 ma-0 grow"
    no-gutters
  >
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
              <pre>1:</pre>
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
              <pre>2:</pre>
              <v-icon>mdi-brush-outline</v-icon>
            </v-btn>
          </div>
        </template>
        <span>Brush Mode for painting the mask</span>
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
              <pre>3:</pre>
              <v-icon>mdi-eraser</v-icon>
            </v-btn>
          </div>
        </template>
        <span>Eraser for removing data from the image</span>
      </v-tooltip>
    </span>
    <v-tooltip v-if="['eraser', 'brush'].includes(toolEnabled)" bottom>
      <template #activator="{ on }">
        <span v-on="on">
          <v-slider
            :value="brushSize"
            step="1"
            min="1"
            max="50"
            thum
            thumb-label="always"
            hide-details
            style="min-width: 100px; max-width: 100px; max-height: 5px;"
            @input="sliderChange"
          />
        </span>
      </template>
      <span>Brush Size Adjustment</span>
    </v-tooltip>
    <v-tooltip bottom>
      <template #activator="{ on }">
        <div v-on="on">
          <v-btn
            color="success"
            class="mx-1"
            small
            @click="setTriggerAction('save')"
          >
            <v-icon>mdi-content-save</v-icon>
          </v-btn>
        </div>
      </template>
      <span>Save Mask</span>
    </v-tooltip>
  </v-row>
</template>
