<script lang="ts">
import { computed, defineComponent, PropType } from 'vue';
import { LaunchConfig } from 'vue-media-annotator/ConfigurationManager';
import { splitLaunchConfigs } from 'vue-media-annotator/launchConfigs';

export default defineComponent({
  name: 'LaunchButtons',
  props: {
    datasetId: { type: String, required: true },
    launchConfigs: { type: Array as PropType<LaunchConfig[]>, default: () => [] },
    /** Extra query params (e.g. diveMetadataRootId) added to every link */
    extraQuery: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
    xSmall: { type: Boolean, default: true },
  },
  setup(props) {
    const parts = computed(() => splitLaunchConfigs(props.launchConfigs));
    const linkFor = (config?: LaunchConfig) => ({
      name: 'viewer',
      params: { id: props.datasetId },
      query: config
        ? { ...props.extraQuery, configFolderId: config.configurationFolderId }
        : { ...props.extraQuery },
    });
    return { parts, linkFor };
  },
});
</script>

<template>
  <span>
    <v-btn
      v-if="launchConfigs.length === 0"
      class="ml-2"
      :x-small="xSmall"
      color="primary"
      depressed
      :to="linkFor()"
    >
      Launch Annotator
    </v-btn>
    <template v-else>
      <v-tooltip
        v-for="config in parts.inline"
        :key="config.id"
        bottom
        :disabled="!config.tooltip"
      >
        <template #activator="{ on }">
          <v-btn
            class="ml-2"
            :x-small="xSmall"
            :color="config.color || 'primary'"
            depressed
            :to="linkFor(config)"
            v-on="on"
          >
            {{ config.label }}
          </v-btn>
        </template>
        <span>{{ config.tooltip }}</span>
      </v-tooltip>
      <v-menu
        v-if="parts.overflow.length"
        offset-y
      >
        <template #activator="{ on }">
          <v-btn
            class="ml-2"
            :x-small="xSmall"
            depressed
            v-on="on"
          >
            <v-icon small>
              mdi-dots-horizontal
            </v-icon>
          </v-btn>
        </template>
        <v-list dense>
          <v-list-item
            v-for="config in parts.overflow"
            :key="config.id"
            :to="linkFor(config)"
            :title="config.tooltip"
          >
            <v-list-item-title>
              <v-icon
                small
                :color="config.color || 'primary'"
                class="mr-1"
              >
                mdi-circle
              </v-icon>
              {{ config.label }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>
  </span>
</template>
