<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'BodyPortal',
  mounted() {
    document.body.appendChild(this.$el);
  },
  beforeDestroy() {
    if (this.$el.parentNode) {
      this.$el.parentNode.removeChild(this.$el);
    }
  },
});
</script>

<template>
  <div class="timeline-tooltip-portal">
    <slot />
  </div>
</template>
