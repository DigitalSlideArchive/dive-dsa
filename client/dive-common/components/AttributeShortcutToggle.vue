<script lang="ts">
import {
  computed, defineComponent, ref,
} from '@vue/composition-api';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import {
  useAttributes, useCameraStore, useSelectedTrackId, useTime,
} from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'AttributeShortcutToggle',
  props: {
    hotkeysDisabled: {
      type: Boolean,
      required: true,
    },
  },
  setup(props) {
    const showShortcuts = ref(false);
    const { inputValue } = usePrompt();
    const shortcutsOn = ref(true);
    const attributes = useAttributes();
    const selectedTrackIdRef = useSelectedTrackId();
    const cameraStore = useCameraStore();
    const { frame: frameRef } = useTime();
    const shortcutList = computed(() => {
      const dataList: {
        shortcut: string;
        type: string;
        value: string;
        dataType: 'number' | 'text' | 'boolean';
        description: string; belongs: 'track' | 'detection'; name: string;}[] = [];
      attributes.value.forEach((attribute) => {
        if (attribute.shortcuts && attribute.shortcuts.length > 0) {
          attribute.shortcuts.forEach((shortcut) => {
            let base = '';
            if (shortcut.modifiers && shortcut.modifiers.length > 0) {
              base = shortcut.modifiers.join('+');
              base = `${base}+`;
            }
            const displayKey = `${base}${shortcut.key}`;
            dataList.push({
              shortcut: displayKey,
              type: shortcut.type,
              value: shortcut.value.toString(),
              description: shortcut.description || '',
              belongs: attribute.belongs,
              dataType: attribute.datatype,
              name: attribute.name,
            });
          });
        }
      });
      return dataList;
    });

    function updateAttribute({ name, value, belongs }: { name: string; value: unknown; belongs: 'track' | 'detection' }) {
      if (selectedTrackIdRef.value !== null) {
        // Tracks across all cameras get the same attributes set if they are linked
        const tracks = cameraStore.getTrackAll(selectedTrackIdRef.value);
        if (tracks.length) {
          if (belongs === 'track') {
            tracks.forEach((track) => track.setAttribute(name, value));
          } else if (belongs === 'detection' && frameRef.value !== undefined) {
            tracks.forEach((track) => track.setFeatureAttribute(frameRef.value, name, value));
          }
        }
      }
    }


    const mouseTrap = computed(() => {
      const actions: {bind: string; handler: Function; disabled: boolean}[] = [];
      shortcutList.value.forEach((shortcut) => {
        const bind = shortcut.shortcut;
        let handler: Function;
        if (shortcut.type === 'set') {
          handler = () => {
            let val: number | string = shortcut.value;
            if (shortcut.dataType === 'number' && typeof (shortcut.value) === 'string') {
              val = parseFloat(shortcut.value);
            }
            updateAttribute({
              name: shortcut.name,
              value: val,
              belongs: shortcut.belongs,
            });
          };
          actions.push({ bind, handler, disabled: props.hotkeysDisabled });
        }
        if (shortcut.type === 'remove') {
          handler = () => {
            updateAttribute({
              name: shortcut.name,
              value: undefined,
              belongs: shortcut.belongs,
            });
          };
          actions.push({ bind, handler, disabled: props.hotkeysDisabled });
        }
        if (shortcut.type === 'dialog') {
          handler = async () => {
            const val = await inputValue({
              title: `Set ${shortcut.name} Value`,
              text: 'Set the Attribute Value below',
              positiveButton: 'Save',
              negativeButton: 'Cancel',
              confirm: true,
              valueType: shortcut.dataType,

            });
            if (val !== null) {
              updateAttribute({
                name: shortcut.name,
                value: val,
                belongs: shortcut.belongs,
              });
            }
          };
          actions.push({ bind, handler, disabled: props.hotkeysDisabled });
        }
      });
      return actions;
    });
    return {
      shortcutList,
      shortcutsOn,
      showShortcuts,
      mouseTrap,
    };
  },
});
</script>

<template>
  <div>
    <v-icon
      v-mousetrap=" shortcutsOn ? mouseTrap : []"
      :color="shortcutsOn ? 'primary': 'default'"
      @click="shortcutsOn = !shortcutsOn"
    >
      mdi-keyboard
    </v-icon>
    <v-icon
      @click="showShortcuts = !showShortcuts"
    >
      mdi-information-variant
    </v-icon>
    <v-dialog
      v-model="showShortcuts"
      max-width="600"
    >
      <v-card>
        <v-card-title>
          Configured Shortcuts
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="2">
              <span>Shortcut</span>
            </v-col>
            <v-col cols="2">
              <span>Action</span>
            </v-col>
            <v-col
              col="2"
            >
              <span>Value</span>
            </v-col>
            <v-col col="6">
              <span>Description</span>
            </v-col>
          </v-row>
          <v-row
            v-for="shortcut in shortcutList"
            :key="`${shortcut.shortcut}`"
            class="helpContextRow ma-0 align-center"
          >
            <v-col cols="2">
              <v-chip>{{ shortcut.shortcut }}</v-chip>
            </v-col>
            <v-col cols="2">
              <v-chip>{{ shortcut.type }}</v-chip>
            </v-col>
            <v-col
              col="2"
            >
              <v-chip v-if="shortcut.value.length">
                {{ shortcut.value }}
              </v-chip>
            </v-col>
            <v-col col="6">
              <v-chip>{{ shortcut.description }}</v-chip>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
</style>
