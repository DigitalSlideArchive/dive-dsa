<script lang="ts">
import {
  computed, defineComponent, ref, watch,
} from 'vue';
import context from 'dive-common/store/context';
import { useConfiguration } from 'vue-media-annotator/provides';
import { UISettingsKey } from 'vue-media-annotator/ConfigurationManager';

export default defineComponent({
  props: {
    width: {
      type: Number,
      default: 300,
    },
  },
  setup(props) {
    const configMan = useConfiguration();
    const getUISetting = (key: UISettingsKey) => (configMan.getUISetting(key));

    const options = computed(() => Object.entries(context.componentMap).map(([value, entry]) => ({
      text: entry.description,
      value,
    })));
    const updatedWidth = ref(context.state.width || props.width);
    watch(() => context.state.width, () => {
      updatedWidth.value = context.state.width || props.width;
    });
    const getOptionText = (text: string) => options.value.find((item) => item.value === text)?.text || 'Custom UI';
    return {
      context, options, getUISetting, updatedWidth, getOptionText,
    };
  },
});
</script>

<template>
  <div>
    <v-card
      v-if="context.state.active !== null"
      :width="updatedWidth"
      tile
      outlined
      class="d-flex flex-column sidebar"
      style="z-index:1;"
    >
      <div class="d-flex align-center mx-1">
        <v-select
          v-if="options.length > 1"
          :items="options"
          :value="context.state.active"
          dense
          solo
          flat
          hide-details
          style="max-width: 240px;"
          @change="context.toggle($event)"
        />
        <h2 v-else>
          {{ getOptionText(context.state.active) }}
        </h2>
        <v-spacer />
        <v-btn
          v-if="getUISetting('UIContextBarNotStatic')"
          icon
          color="white"
          class="shrink"
          @click="context.toggle(null)"
        >
          <v-icon>
            mdi-close
          </v-icon>
        </v-btn>
      </div>
      <div class="sidebar-content">
        <slot
          v-bind="{ name: context.state.active, subCategory: context.state.subCategory }"
        />
      </div>
    </v-card>
  </div>
</template>

<style scoped lang="scss">
.sidebar {
  height: calc(100vh - 112px);
  overflow-y: hidden;
}
.sidebar-content {
  overflow-y: auto;
}
</style>
