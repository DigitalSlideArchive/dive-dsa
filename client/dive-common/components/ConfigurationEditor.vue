<script lang="ts">
import { computed, defineComponent, ref } from '@vue/composition-api';
import { useGirderRest } from 'platform/web-girder/plugins/girder';
import { UISettingsKey } from 'vue-media-annotator/ConfigurationManager';
import { useConfiguration } from 'vue-media-annotator/provides';
import ConfigurationSettings from './configurationEditors/configurationSettings.vue';
import GeneralConfiguration from './configurationEditors/generalConfiguration.vue';
import UiSettings from './configurationEditors/uiSettings.vue';

export default defineComponent({
  name: 'ConfigurationEditor',
  components: {
    GeneralConfiguration,
    ConfigurationSettings,
    UiSettings,
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
  },
  setup() {
    const configMan = useConfiguration();
    const getUISetting = (key: UISettingsKey) => (configMan.getUISetting(key));
    const girderRest = useGirderRest();
    const isAdminOwner = computed(() => {
      let ownerAdmin = false;
      if (girderRest.user) {
        ownerAdmin = girderRest.user.admin;
      }
      if (configMan.baseConfigurationOwner.value === girderRest.user.login) {
        ownerAdmin = true;
      }
      return ownerAdmin;
    });
    const menuOpen = ref(false);
    const additive = ref(false);
    const additivePrepend = ref('');
    return {
      menuOpen,
      additive,
      additivePrepend,
      isAdminOwner,
      getUISetting,
    };
  },
});
</script>

<template>
  <v-menu
    v-if="isAdminOwner"
    v-model="menuOpen"
    :close-on-content-click="false"
    :nudge-width="120"
    v-bind="menuOptions"
    max-width="280"
  >
    <template #activator="{ on: menuOn }">
      <v-tooltip bottom>
        <template #activator="{ on: tooltipOn }">
          <v-btn
            class="ma-0"
            v-bind="buttonOptions"
            v-on="{ ...tooltipOn, ...menuOn }"
          >
            <div>
              <v-icon>
                mdi-cog
              </v-icon>
              <span
                v-show="!$vuetify.breakpoint.mdAndDown || buttonOptions.block"
                class="pl-1"
              >
                Configuration
              </span>
            </div>
          </v-btn>
        </template>
        <span> Tools for Generating/Modifying Tracks</span>
      </v-tooltip>
    </template>
    <template>
      <v-card>
        <v-card-title>Tools</v-card-title>
        <v-card-text>
          <v-row>
            <general-configuration />
          </v-row>
          <v-row v-if="false">
            <configuration-settings />
          </v-row>
          <v-row>
            <ui-settings />
          </v-row>
        </v-card-text>
      </v-card>
    </template>
  </v-menu>
</template>
