<script lang="ts">
import {
  defineComponent, ref,
} from 'vue';
import { Configuration, UISettings } from 'vue-media-annotator/ConfigurationManager';
import { useConfiguration } from 'vue-media-annotator/provides';
import UIInteractionsVue from './UISettings/UIInteractions.vue';
import UITopBarVue from './UISettings/UITopBar.vue';
import UIToolBarVue from './UISettings/UIToolBar.vue';
import UIContextBarVue from './UISettings/UIContextBar.vue';
import UIControlsVue from './UISettings/UIControls.vue';
import UISideBarVue from './UISettings/UISideBar.vue';
import UITimelineVue from './UISettings/UITimeline.vue';
import UITrackDetailsVue from './UISettings/UITrackDetails.vue';

export default defineComponent({
  name: 'uiSettings',
  components: {
    'ui-interactions': UIInteractionsVue,
    'ui-top-bar': UITopBarVue,
    'ui-tool-bar': UIToolBarVue,
    'ui-context-bar': UIContextBarVue,
    'ui-controls': UIControlsVue,
    'ui-side-bar': UISideBarVue,
    'ui-timeline': UITimelineVue,
    'ui-track-details': UITrackDetailsVue,
  },
  props: {},
  setup() {
    const generalDialog = ref(false);
    const configMan = useConfiguration();
    const currentTab = ref('Main');
    const UITopBar = ref(configMan.getUISetting('UITopBar') as boolean);
    const UIToolBar = ref(configMan.getUISetting('UIToolBar') as boolean);
    const UISideBar = ref(configMan.getUISetting('UISideBar') as boolean);
    const UIContextBar = ref(configMan.getUISetting('UIContextBar') as boolean);
    const UITrackDetails = ref(configMan.getUISetting('UITrackDetails') as boolean);
    const UIControls = ref(configMan.getUISetting('UIControls') as boolean);
    const UITimeline = ref(configMan.getUISetting('UITimeline') as boolean);
    const UIInteractions = ref(configMan.getUISetting('UIInteractions') as boolean);

    const launchEditor = () => {
      generalDialog.value = true;
    };

    const setVal = (key: keyof UISettings, val: boolean) => {
      const keyVal = configMan.getUISettingValue(key);
      if (keyVal !== undefined) {
        if (typeof (keyVal) === 'object') {
          return keyVal;
        }
        return val;
      }
      return val;
    };

    const saveChanges = () => {
      // We need to take the new values and set them on the 'general' settings
      const data = {
        UITopBar: setVal('UITopBar', UITopBar.value),
        UIToolBar: setVal('UIToolBar', UIToolBar.value),
        UISideBar: setVal('UISideBar', UISideBar.value),
        UIContextBar: setVal('UIContextBar', UIContextBar.value),
        UITrackDetails: setVal('UITrackDetails', UITrackDetails.value),
        UIControls: setVal('UIControls', UIControls.value),
        UITimeline: setVal('UITimeline', UITimeline.value),
        UIInteractions: setVal('UIInteractions', UIInteractions.value),

      };
      configMan.setRootUISettings(data as UISettings);
      const updatedConfig = { UISettings: data, ...configMan.configuration.value };
      if (updatedConfig) {
        configMan.saveConfiguration(configMan.configurationId.value,
          { ...updatedConfig as Configuration });
      }
      generalDialog.value = false;
    };

    return {
      currentTab,
      generalDialog,
      launchEditor,
      saveChanges,
      UIInteractions,
      UITopBar,
      UIToolBar,
      UISideBar,
      UIContextBar,
      UITrackDetails,
      UIControls,
      UITimeline,
    };
  },
});
</script>

<template>
  <div class="ma-2">
    <v-btn @click="launchEditor">
      <span>
        UI Settings
        <br>
      </span>
      <v-icon
        class="ml-2"
      >
        mdi-cog
      </v-icon>
    </v-btn>
    <v-dialog
      v-model="generalDialog"
      max-width="900"
    >
      <v-card>
        <v-card-title>
          UI Settings
          <v-spacer />
          <v-btn
            icon
            small
            color="white"
            @click="generalDialog = false"
          >
            <v-icon
              small
            >
              mdi-close
            </v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-card-title class="text-h6">
            <v-tabs v-model="currentTab">
              <v-tab> Main </v-tab>
              <v-tab :disabled="!UIInteractions">
                Interactions
              </v-tab>
              <v-tab :disabled="!UITopBar">
                TopBar
              </v-tab>
              <v-tab :disabled="!UIToolBar">
                ToolBar
              </v-tab>
              <v-tab :disabled="!UISideBar">
                Sidebar
              </v-tab>
              <v-tab :disabled="!UIContextBar">
                ContextBar
              </v-tab>
              <v-tab :disabled="!UITrackDetails">
                TrackDetails
              </v-tab>
              <v-tab :disabled="!UIControls">
                Playback Controls
              </v-tab>
              <v-tab :disabled="!UITimeline">
                Timeline
              </v-tab>
            </v-tabs>
          </v-card-title>
          <v-tabs-items v-model="currentTab">
            <v-tab-item>
              <v-row dense>
                <v-switch
                  v-model="UIInteractions"
                  label="Interactions"
                />
              </v-row>

              <v-row dense>
                <v-switch
                  v-model="UITopBar"
                  label="Top Bar"
                />
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="UIToolBar"
                  label="Tool Bar"
                />
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="UISideBar"
                  label="SideBar (Track Types, Track List)"
                />
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="UIContextBar"
                  label="Context Bar (right side)"
                />
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="UITrackDetails"
                  label="Track Details (Attributes)"
                />
              </v-row>
              <v-row dense>
                <v-switch
                  v-model="UIControls"
                  label="Media Controls"
                />
              </v-row>

              <v-row dense>
                <v-switch
                  v-model="UITimeline"
                  label="Timeline"
                />
              </v-row>
            </v-tab-item>
            <v-tab-item>
              <ui-interactions />
            </v-tab-item>
            <v-tab-item>
              <ui-top-bar />
            </v-tab-item>
            <v-tab-item>
              <ui-tool-bar />
            </v-tab-item>
            <v-tab-item>
              <ui-side-bar />
            </v-tab-item>
            <v-tab-item>
              <ui-context-bar />
            </v-tab-item>
            <v-tab-item>
              <ui-track-details />
            </v-tab-item>
            <v-tab-item>
              <ui-controls />
            </v-tab-item>
            <v-tab-item>
              <ui-timeline />
            </v-tab-item>
          </v-tabs-items>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="generalDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="saveChanges"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
</style>
