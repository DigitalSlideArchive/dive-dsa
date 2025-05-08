<script lang="ts">
import { defineComponent, computed, PropType } from 'vue';
import { EditAnnotationTypes } from 'vue-media-annotator/layers/';

export default defineComponent({
  name: 'DeleteControls',

  props: {
    selectedFeatureHandle: {
      type: Number,
      required: true,
    },
    editingMode: {
      type: [String, Boolean] as PropType<EditAnnotationTypes | boolean>,
      required: true,
    },
  },

  setup(props, { emit }) {
    const disabled = computed(() => {
      if (props.selectedFeatureHandle < 0 && props.editingMode === false) {
        return true;
      }
      if (props.editingMode === 'rectangle' || props.editingMode === 'Mask') {
        return true; // deleting rectangle is unsupported
      }
      return false;
    });

    const deleteSelected = () => {
      if (disabled.value) {
        throw new Error('Cannot delete while disabled!');
      }
      if (props.selectedFeatureHandle >= 0) {
        emit('delete-point');
      } else {
        emit('delete-annotation');
      }
    };

    const toggleTime = () => {
      if (disabled.value) {
        throw new Error('Cannot endTime while disabled!');
      }
      emit('toggle-time');
    };

    return {
      disabled,
      deleteSelected,
      toggleTime,
    };
  },
});
</script>

<template>
  <span class="mx-1">
    <v-btn
      v-if="!disabled"
      color="error"
      depressed
      small
      @click="deleteSelected"
    >
      <pre class="mr-1 text-body-2">del</pre>
      <span v-if="selectedFeatureHandle >= 0">
        point {{ selectedFeatureHandle }}
      </span>
      <span v-else-if="editingMode">
        {{ editingMode }}
      </span>
      <span v-else>unselected</span>
      <v-icon
        small
        class="ml-2"
      >
        mdi-delete
      </v-icon>
    </v-btn>
    <v-btn
      v-if="editingMode === 'Time'"
      color="primary"
      depressed
      small
      class="mx-1"
      @click="toggleTime"
    >
      Keyframe <v-icon>mdi-star</v-icon>
    </v-btn>
  </span>
</template>
