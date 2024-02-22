<script lang="ts">
import { defineComponent } from 'vue';
import { GirderSlicerTasksIntegrated } from '@bryonlewis/vue-girder-slicer-cli-ui';

export default defineComponent({
  name: 'SlicerTaskRunner',
  components: {
    GirderSlicerTasksIntegrated,
  },
  description: 'Slicer Task Runner',

  setup() {
    return {
    };
  },
});
</script>

<template>
  <v-container fluid fill-height>
    <girder-slicer-tasks-integrated />
  </v-container>
</template>

<style scoped>
.slicer {
    min-height: 100%;
    height: 100%;
}
</style>
