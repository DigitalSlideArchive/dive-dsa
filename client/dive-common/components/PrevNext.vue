<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import TooltipButton from 'vue-media-annotator/components/TooltipButton.vue';
import { useConfiguration, useHandler } from 'vue-media-annotator/provides';
import { useRouter } from 'vue-router/composables';

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
    const router = useRouter();
    const { getDiveMetadataRootId } = useHandler();
    const diveMetadataRootId = ref(getDiveMetadataRootId());
    const previous = ref(configMap.prevNext.value?.previous);
    const next = ref(configMap.prevNext.value?.next);
    watch(configMap.prevNext, () => {
      previous.value = configMap.prevNext.value?.previous;
      next.value = configMap.prevNext.value?.next;
    });

    const gotoId = (id: string) => {
      router.push({ name: 'viewer', params: { id } });
    };

    const queryStringParams = ref('');
    watch(getDiveMetadataRootId, (newval) => {
      diveMetadataRootId.value = newval;
      if (diveMetadataRootId.value) {
        queryStringParams.value = `?diveMetadataRootId=${diveMetadataRootId.value}`;
      } else {
        queryStringParams.value = '';
      }
    }, { immediate: true });

    return {
      previous,
      next,
      gotoId,
      queryStringParams,
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
        v-mousetrap="{ bind: '[', handler: () => previous && gotoId(previous.id) }"
        class="mr-4"
        icon="mdi-chevron-left"
        :tooltip-text="`Go to Previous Dataset: ${previous.name}`"
        outlined
        tile
        :to="`/viewer/${previous.id}${queryStringParams}`"
      />
    </span>
    <slot name="middle" />
    <span class="ml-4">
      <tooltip-btn
        v-if="next"
        v-mousetrap="{ bind: ']', handler: () => next && gotoId(next.id) }"
        class="pl-4"
        icon="mdi-chevron-right"
        :tooltip-text="`Go to Next Dataset: ${next.name}`"
        outlined
        tile
        :to="`/viewer/${next.id}${queryStringParams}`"
      />
    </span>
  </v-row>
</template>
