<script lang="ts">
import {
  defineComponent, ref, watch,
} from 'vue';
import { useConfiguration } from 'vue-media-annotator/provides';

export default defineComponent({
  name: 'UIInteractions',
  components: {
  },
  setup() {
    const configMan = useConfiguration();
    const UISelection = ref(configMan.getUISetting('UISelection') as boolean);
    const UIEditing = ref(configMan.getUISetting('UIEditing') as boolean);

    watch([UISelection, UIEditing], () => {
      const data = {
        UISelection: UISelection.value ? undefined : false,
        UIEditing: UIEditing.value ? undefined : false,
      };
      configMan.setUISettings('UIInteractions', data);
    });
    return {
      UISelection,
      UIEditing,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Context Bar (Right side) Settings</v-card-title>
    <v-card-text>
      <div>
        <v-row dense>
          <v-switch
            v-model="UISelection"
            label="UI Selecting/Deselecting"
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UIEditing"
            label="UI Editing Annotations"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
