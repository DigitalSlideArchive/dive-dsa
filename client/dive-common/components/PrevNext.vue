<script lang="ts">
import { defineComponent, ref, watch } from '@vue/composition-api';
import TooltipButton from 'vue-media-annotator/components/TooltipButton.vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'PrevNext',
  components: {
    'tooltip-btn': TooltipButton,
  },
  props: {
    buttonOptions: {
      type: Object,
      default: () => ({}),
    },
    menuOptions: {
      type: Object,
      default: () => ({}),
    },
    readOnlyMode: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: 'Title',
    },
  },
  setup() {
    const configMap = useConfiguration();

    const previous = ref(configMap.prevNext.value?.previous);
    const next = ref(configMap.prevNext.value?.next);
    watch(configMap.prevNext, () => {
      previous.value = configMap.prevNext.value?.previous;
      next.value = configMap.prevNext.value?.next;
    });
    return {
      previous,
      next,
    };
  },
});
</script>

<template>
  <v-row dense>
    <span class="mr-4">
      <tooltip-btn
        v-if="previous"
        class="mr-4"
        icon="mdi-chevron-left"
        :tooltip-text="`Go to Previous Dataset: ${previous.name}`"
        outlined
        tile
        :to="`/viewer/${previous.id}`"
      />
    </span>
    <slot class="pa-10" />
    <span class="ml-4">
      <tooltip-btn
        v-if="next"
        class="pl-4"
        icon="mdi-chevron-right"
        :tooltip-text="`Go to Next Dataset: ${next.name}`"
        outlined
        tile
        :to="`/viewer/${next.id}`"
      />
    </span>
  </v-row>
</template>
