<script lang="ts">
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'MetadataKeyLabel',
  props: {
    keyName: {
      type: String,
      required: true,
    },
    description: {
      type: String as PropType<string | undefined>,
      default: undefined,
    },
  },
});
</script>

<template>
  <span class="d-inline-flex align-center flex-wrap metadata-key-label">
    <span>{{ keyName }}</span>
    <v-tooltip
      v-if="description"
      bottom
      max-width="360"
      open-delay="200"
    >
      <template #activator="{ on }">
        <v-icon
          small
          class="ml-1 metadata-key-label__icon"
          color="grey lighten-1"
          v-on="on"
        >
          mdi-information
        </v-icon>
      </template>
      <span class="metadata-key-label__tooltip">{{ description }}</span>
    </v-tooltip>
  </span>
</template>

<style scoped>
.metadata-key-label__tooltip {
  white-space: pre-wrap;
}
</style>
