<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UITopBar',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const UIData = ref(configMan.getUISetting('UIData') as boolean);
    const UIJobs = ref(configMan.getUISetting('UIJobs') as boolean);
    const UINextPrev = ref(configMan.getUISetting('UINextPrev') as boolean);
    const UIToolBox = ref(configMan.getUISetting('UIToolBox') as boolean);
    const UIImport = ref(configMan.getUISetting('UIImport') as boolean);
    const UIExport = ref(configMan.getUISetting('UIExport') as boolean);
    const UIClone = ref(configMan.getUISetting('UIClone') as boolean);
    const UIConfiguration = ref(configMan.getUISetting('UIConfiguration') as boolean);
    const UIKeyboardShortcuts = ref(configMan.getUISetting('UIKeyboardShortcuts') as boolean);
    const UISave = ref(configMan.getUISetting('UISave') as boolean);

    watch([UIData, UIJobs, UINextPrev, UIToolBox, UIImport,
      UIExport, UIClone, UIConfiguration, UIKeyboardShortcuts, UISave], () => {
      const data = {
        UIData: UIData.value ? undefined : false,
        UIJobs: UIJobs.value ? undefined : false,
        UINextPrev: UINextPrev.value ? undefined : false,
        UIToolBox: UIToolBox.value ? undefined : false,
        UIImport: UIImport.value ? undefined : false,
        UIExport: UIExport.value ? undefined : false,
        UIClone: UIClone.value ? undefined : false,
        UIConfiguration: UIConfiguration.value ? undefined : false,
        UIKeyboardShortcuts: UIKeyboardShortcuts.value ? undefined : false,
        UISave: UISave.value ? undefined : false,

      };
      configMan.setUISettings('UITopBar', data);
    });
    return {
      UIData,
      UIJobs,
      UINextPrev,
      UIToolBox,
      UIImport,
      UIExport,
      UIClone,
      UIConfiguration,
      UIKeyboardShortcuts,
      UISave,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title> Top Bar UI Settings</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UIData"
            label="Data Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIJobs"
            label="Jobs Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UINextPrev"
            label="Next/Previous"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIToolBox"
            label="Toolbox Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIImport"
            label="Import Button"
          />
        </v-row>

        <v-row dense>
          <v-switch
            v-model="UIExport"
            label="Export Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIClone"
            label="Clone Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIConfiguration"
            label="Configuration Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIKeyboardShortcuts"
            label="Keyboard Shorcuts Button"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UISave"
            label="SaveButton"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
