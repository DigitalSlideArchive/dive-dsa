<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import type { UIControls } from 'vue-media-annotator/ConfigurationManager';
import {
  KEY_PANEL_MAX_WIDTH,
  KEY_PANEL_MIN_WIDTH,
} from 'vue-media-annotator/components/controls/timelineLayout';
import { useConfiguration } from 'vue-media-annotator/provides';

function readNumberSetting(
  flatMap: Record<string, unknown>,
  key: 'UILegendKeyMinWidth' | 'UILegendKeyMaxWidth',
  fallback: number,
): number {
  const value = flatMap[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseKeyWidth(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(40, Math.round(value)) : fallback;
}

export default defineComponent({
  name: 'UITimeline',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const flatMap = configMan.getFlatUISettingMap();
    const UIDetections = ref(configMan.getUISetting('UIDetections') as boolean);
    const UIEvents = ref(configMan.getUISetting('UIEvents') as boolean);
    const UILegendControls = ref(configMan.getUISetting('UILegendControls') as boolean);
    const UILegendForceOpen = ref(flatMap.UILegendForceOpen === true);
    const UILegendHideToggle = ref(flatMap.UILegendHideToggle === true);
    const UILegendKeyMinWidth = ref(readNumberSetting(flatMap, 'UILegendKeyMinWidth', KEY_PANEL_MIN_WIDTH));
    const UILegendKeyMaxWidth = ref(readNumberSetting(flatMap, 'UILegendKeyMaxWidth', KEY_PANEL_MAX_WIDTH));

    const migrateLegendSettingsFromControls = () => {
      const controls = configMan.getUISettingValue('UIControls');
      if (typeof controls !== 'object' || !controls) {
        return;
      }
      const {
        UILegendControls: legacyLegendControls,
        UILegendForceOpen: legacyLegendForceOpen,
        UILegendHideToggle: legacyLegendHideToggle,
        ...rest
      } = controls as UIControls & {
        UILegendControls?: boolean;
        UILegendForceOpen?: boolean;
        UILegendHideToggle?: boolean;
      };
      if (
        legacyLegendControls !== undefined
        || legacyLegendForceOpen !== undefined
        || legacyLegendHideToggle !== undefined
      ) {
        configMan.setUISettings('UIControls', rest);
      }
    };

    watch([
      UIDetections,
      UIEvents,
      UILegendControls,
      UILegendForceOpen,
      UILegendHideToggle,
      UILegendKeyMinWidth,
      UILegendKeyMaxWidth,
    ], () => {
      const minWidth = parseKeyWidth(UILegendKeyMinWidth.value, KEY_PANEL_MIN_WIDTH);
      const maxWidth = Math.max(minWidth, parseKeyWidth(UILegendKeyMaxWidth.value, KEY_PANEL_MAX_WIDTH));
      UILegendKeyMinWidth.value = minWidth;
      UILegendKeyMaxWidth.value = maxWidth;

      const data = {
        UIDetections: UIDetections.value ? undefined : false,
        UIEvents: UIEvents.value ? undefined : false,
        UILegendControls: UILegendControls.value ? undefined : false,
        UILegendForceOpen: UILegendForceOpen.value ? true : undefined,
        UILegendHideToggle: UILegendHideToggle.value ? true : undefined,
        UILegendKeyMinWidth: minWidth !== KEY_PANEL_MIN_WIDTH ? minWidth : undefined,
        UILegendKeyMaxWidth: maxWidth !== KEY_PANEL_MAX_WIDTH ? maxWidth : undefined,
      };
      configMan.setUISettings('UITimeline', data);
      migrateLegendSettingsFromControls();
    });
    return {
      UIDetections,
      UIEvents,
      UILegendControls,
      UILegendForceOpen,
      UILegendHideToggle,
      UILegendKeyMinWidth,
      UILegendKeyMaxWidth,
      KEY_PANEL_MIN_WIDTH,
      KEY_PANEL_MAX_WIDTH,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Timeline Settings</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UIDetections"
            label="Detections Timeline"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIEvents"
            label="Events Timeline"
          />
        </v-row>
        <v-divider class="my-3" />
        <div class="text-subtitle-2 mb-2">
          Legend / Key
        </div>
        <v-row dense>
          <v-switch
            v-model="UILegendControls"
            label="Legend Controls"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UILegendForceOpen"
            label="Legend Force Open"
            hint="Always show the timeline legend/key and prevent closing it"
            persistent-hint
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UILegendHideToggle"
            label="Legend Hide Toggle"
            hint="Hide the legend toggle button (use with Force Open or when legend is not needed)"
            persistent-hint
          />
        </v-row>
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model.number="UILegendKeyMinWidth"
              type="number"
              min="40"
              label="Key Min Width (px)"
              :hint="`Default: ${KEY_PANEL_MIN_WIDTH}px`"
              persistent-hint
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model.number="UILegendKeyMaxWidth"
              type="number"
              min="40"
              label="Key Max Width (px)"
              :hint="`Default: ${KEY_PANEL_MAX_WIDTH}px`"
              persistent-hint
            />
          </v-col>
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
