<script lang="ts">
import { computed, defineComponent, PropType } from 'vue';
import { useRouter } from 'vue-router/composables';
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
    /** Show open-in-new icon alongside each launch button (metadata viewer) */
    showOpenInNew: { type: Boolean, default: false },
  },
  setup(props) {
    const router = useRouter();
    const parts = computed(() => splitLaunchConfigs(props.launchConfigs));
    const linkFor = (config?: LaunchConfig) => ({
      name: 'viewer',
      params: { id: props.datasetId },
      query: config
        ? { ...props.extraQuery, configFolderId: config.configurationFolderId }
        : { ...props.extraQuery },
    });
    const openInNewTab = (config?: LaunchConfig) => {
      const route = router.resolve(linkFor(config));
      window.open(route.href, '_blank');
    };
    return { parts, linkFor, openInNewTab };
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
      <template v-if="showOpenInNew">
        <span class="ml-1">|</span>
        <v-icon
          small
          class="ml-1"
          style="cursor:pointer;"
          @click.stop.prevent="openInNewTab()"
        >
          mdi-open-in-new
        </v-icon>
      </template>
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
            <template v-if="showOpenInNew">
              <span class="ml-1">|</span>
              <v-icon
                small
                class="ml-1"
                style="cursor:pointer;"
                @click.stop.prevent="openInNewTab(config)"
              >
                mdi-open-in-new
              </v-icon>
            </template>
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
            <v-list-item-action v-if="showOpenInNew">
              <v-btn
                icon
                x-small
                @click.stop.prevent="openInNewTab(config)"
              >
                <v-icon small>
                  mdi-open-in-new
                </v-icon>
              </v-btn>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>
  </span>
</template>
