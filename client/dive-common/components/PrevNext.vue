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
  setup(_props, { root }) {
    const configMap = useConfiguration();

    const previous = ref(configMap.prevNext.value?.previous);
    const next = ref(configMap.prevNext.value?.next);
    watch(configMap.prevNext, () => {
      previous.value = configMap.prevNext.value?.previous;
      next.value = configMap.prevNext.value?.next;
    });

    const gotoId = (id: string) => {
      root.$router.push({ name: 'viewer', params: { id } });
    };
    return {
      previous,
      next,
      gotoId,
    };
  },
});
</script>

<template>
  <v-row
    dense
    class="flex-nowrap"
  >
    <span class="mr-4">
      <tooltip-btn
        v-if="previous"
        v-mousetrap="{bind: '[', handler: () => previous && gotoId(previous.id)}"
        class="mr-4"
        icon="mdi-chevron-left"
        :tooltip-text="`Go to Previous Dataset: ${previous.name}`"
        outlined
        tile
        :to="`/viewer/${previous.id}`"
      />
    </span>
    <slot name="middle" />
    <span class="ml-4">
      <tooltip-btn
        v-if="next"
        v-mousetrap="{bind: ']', handler: () => next && gotoId(next.id)}"
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
