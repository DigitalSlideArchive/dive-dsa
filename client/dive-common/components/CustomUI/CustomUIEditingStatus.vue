<script lang="ts">
import { defineComponent } from 'vue';
import useEditingStatus from './useEditingStatus';

export default defineComponent({
  name: 'CustomUIEditingStatus',
  props: {
    title: {
      type: String,
      default: 'Current Mode',
    },
  },
  setup() {
    const {
      statusHeader,
      instructionText,
    } = useEditingStatus();

    return {
      statusHeader,
      instructionText,
    };
  },
});
</script>

<template>
  <v-card
    outlined
    class="custom-ui-editing-status mb-3"
  >
    <v-card-text class="py-2 px-3">
      <div class="custom-ui-editing-status__title text-caption grey--text text--lighten-1 mb-1">
        {{ title }}
      </div>
      <div class="d-flex align-start">
        <v-icon
          small
          class="mr-2 mt-1"
          :color="statusHeader.color || undefined"
        >
          {{ statusHeader.icon }}
        </v-icon>
        <div>
          <div class="custom-ui-editing-status__label text-subtitle-2">
            {{ statusHeader.text }}
          </div>
          <div class="custom-ui-editing-status__instruction text-caption">
            {{ instructionText }}
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss">
.custom-ui-editing-status__instruction {
  line-height: 1.35;
  margin-top: 2px;
}
</style>
