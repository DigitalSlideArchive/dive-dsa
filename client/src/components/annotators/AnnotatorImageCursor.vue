<script lang="ts">
import { computed, defineComponent } from 'vue';

export default defineComponent({
  name: 'AnnotatorImageCursor',
  props: {
    imageCursor: {
      type: String,
      default: '',
    },
    imageCursorEditing: {
      type: Boolean,
      default: false,
    },
    cursor: {
      type: String,
      default: 'default',
    },
  },
  setup(props) {
    const showEditBadge = computed(
      () => props.imageCursorEditing && !!props.imageCursor,
    );

    return {
      showEditBadge,
    };
  },
});
</script>

<template>
  <span
    class="annotator-image-cursor"
  >
    <v-icon :class="imageCursor">
      {{ imageCursor }}
    </v-icon>
    <v-icon
      v-if="showEditBadge"
      class="annotator-image-cursor__badge"
      small
    >
      mdi-pencil
    </v-icon>
  </span>
</template>

<style lang="scss" scoped>
.annotator-image-cursor {
  position: relative;
  display: inline-flex;
  line-height: 1;
}

.annotator-image-cursor__badge {
  position: absolute;
  right: -10px;
  bottom: -8px;
  font-size: 11px !important;
  width: 11px;
  height: 11px;
  background: transparent;
}
</style>
