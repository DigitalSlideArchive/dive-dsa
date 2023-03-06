<script lang="ts">
import {
  defineComponent, ref, watch, Ref,
} from '@vue/composition-api';
import { isArray, isObject } from 'lodash';
import { useConfiguration } from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'UIToolBar',
  components: {
  },
  setup(props) {
    const configMan = useConfiguration();
    const editVisTypes = ref(['bounding box', 'polygon', 'line']);
    const visTypes = ref(['bounding_box', 'polygon', 'line', 'text', 'tooltip']);
    const transferArr = (data: boolean[], typesUsed: Ref<string[]>) => {
      const results: string[] = [];
      typesUsed.value.forEach((item, index) => {
        if (data[index]) {
          results.push(item);
        }
      });
      return results;
    };

    const UIEditingInfo = ref(configMan.getUISetting('UIEditingInfo') as boolean);
    const UIEditingTypes = ref(isObject(configMan.getUISetting('UIEditingTypes')) ? transferArr(configMan.getUISetting('UIEditingTypes') as boolean[], editVisTypes) : ['bounding box', 'polygon', 'line']);
    const UIVisibility = ref(isObject(configMan.getUISetting('UIVisibility')) ? transferArr(configMan.getUISetting('UIVisibility') as boolean[], visTypes) : ['bounding box', 'polygon', 'line']);
    const UITrackTrails = ref(configMan.getUISetting('UITrackTrails') as boolean);

    const convertArr = (data: string[], typesUseD: Ref<string[]>) => {
      const results: boolean[] = [];
      typesUseD.value.forEach((item) => {
        results.push(data.includes(item));
      });
      if (results.filter((item) => (!item)).length === 0) {
        return undefined;
      }
      return results;
    };
    watch([UIEditingInfo, UIEditingTypes, UIVisibility, UITrackTrails], () => {
      const data = {
        UIEditingInfo: UIEditingInfo.value ? undefined : false,
        UIEditingTypes: convertArr(UIEditingTypes.value, editVisTypes),
        UIVisibility: convertArr(UIVisibility.value, visTypes),
        UITrackTrails: UITrackTrails.value ? undefined : false,

      };
      configMan.setUISettings('UIToolBar', data);
    });
    return {
      UIEditingInfo,
      UIEditingTypes,
      UIVisibility,
      UITrackTrails,
      editVisTypes,
      visTypes,
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
            v-model="UIEditingInfo"
            label="Editing/Selection Info"
          />
        </v-row>
        <v-row dense>
          <v-select
            v-model="UIEditingTypes"
            multiple
            :items="editVisTypes"
            label="Editing Types"
            chips
            deletable-chips
            clearable
          />
        </v-row>
        <v-row dense>
          <v-select
            v-model="UIVisibility"
            multiple
            :items="visTypes"
            label="Visibile Types"
            chips
            deletable-chips
            clearable
          />
        </v-row>
        <v-row dense>
          <v-switch
            v-model="UITrackTrails"
            label="Track Trails"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<style lang="scss">
</style>
