<script lang="ts">
import {
  defineComponent, PropType, ref,
} from 'vue';
import { EditAnnotationTypes } from 'vue-media-annotator/layers/';
import { CreateFullFrameTrackAction } from 'dive-common/use/useActions';

export default defineComponent({
  name: 'EditFullFrameTrackAction',
  props: {
    action: {
      type: Object as PropType<CreateFullFrameTrackAction>,
      required: true,
    },
  },
  emits: ['update:action', 'cancel'],
  setup(props, { emit }) {
    const geometryTypes: EditAnnotationTypes[] = ['rectangle', 'Time'];
    const localAction = ref({ ...props.action });
    const cancel = () => {
      emit('cancel');
    };
    const save = () => {
      emit('update:action', localAction.value);
    };
    return {
      localAction,
      geometryTypes,
      cancel,
      save,
    };
  },
});
</script>

<template>
  <div class="ma-2 action-editor">
    <v-card>
      <v-card-title>Edit: Create  Full Frame Track Action</v-card-title>
      <v-card-text>
        <v-select
          v-model="localAction.geometryType"
          :items="geometryTypes"
          label="Geometry Type"
          outlined
          dense
        />

        <!-- Editable Type Toggle -->

        <!-- Editable Title and Text (Shown if Editable Type is On) -->
        <v-text-field
          v-model="localAction.trackType"
          label="Track Type"
          outlined
          dense
        />
        <!-- Select Track After -->
        <v-checkbox
          v-model="localAction.useExisting"
          label="Use Existing Track"
          class="mt-2"
        />

        <v-checkbox
          v-model="localAction.selectTrackAfter"
          label="Select Track After"
          class="mt-2"
        />
      </v-card-text>
      <v-card-actions>
        <v-row dense>
          <v-spacer />
          <v-btn class="mx-2" @click="cancel">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            class="mx-2"
            @click="save"
          >
            Save
          </v-btn>
        </v-row>
      </v-card-actions>
    </v-card>
  </div>
</template>

<style scoped>
.action-editor {
  width: 100%;
  border: 1px solid gray;
}
</style>
