<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api';
import GenerateTracks from './GenerateTracks.vue';

export default defineComponent({
  name: 'DIVETools',
  components: {
    GenerateTracks,
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
  setup(props) {
    const menuOpen = ref(false);
    const additive = ref(false);
    const additivePrepend = ref('');
    return {
      menuOpen,
      additive,
      additivePrepend,

    };
  },
});
</script>

<template>
  <v-menu
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
                mdi-toolbox
              </v-icon>
              <span
                v-show="!$vuetify.breakpoint.mdAndDown || buttonOptions.block"
                class="pl-1"
              >
                Tools
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
          <generate-tracks />
        </v-card-text>
      </v-card>
    </template>
  </v-menu>
</template>
