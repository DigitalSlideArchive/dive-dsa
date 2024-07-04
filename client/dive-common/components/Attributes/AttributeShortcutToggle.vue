<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed, defineComponent, ref,
} from 'vue';
import { DIVEAction, UIDIVEAction } from 'dive-common/use/useActions';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { useStore } from 'platform/web-girder/store/types';
import {
  useAttributes, useCameraStore, useConfiguration, useHandler, useSelectedTrackId, useTime,
  useUINotifications,
} from 'vue-media-annotator/provides';

interface MouseTrapInterface {
  bind: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  handler: Function;
  disabled: boolean;
}

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
    const configMan = useConfiguration();
    const { diveActionShortcuts } = useUINotifications();
    const store = useStore();
    const { inputValue } = usePrompt();
    const shortcutsOn = ref(true);
    const attributes = useAttributes();
    const selectedTrackIdRef = useSelectedTrackId();
    const cameraStore = useCameraStore();
    const { frame: frameRef } = useTime();
    const getDiveActionShortcutString = (diveActionShortcut: UIDIVEAction) => {
      let bind: string = '';
      if (diveActionShortcut.shortcut) {
        bind = diveActionShortcut.shortcut.key.toLocaleLowerCase();
        if (diveActionShortcut.shortcut.modifiers) {
          bind = `${bind}+${diveActionShortcut.shortcut.modifiers?.join('+')}`;
        }
      }
      return bind;
    };
    const actionShortcuts = computed(() => {
      const dataList: {
        shortcut: string;
        description: string;
        actions: DIVEAction[];
      }[] = [];
      if (configMan.configuration.value?.shortcuts) {
        configMan.configuration.value.shortcuts.forEach((item) => {
          let base = '';
          if (item.shortcut.modifiers && item.shortcut.modifiers.length > 0) {
            base = item.shortcut.modifiers.join('+');
            base = `${base}+`;
          }
          const displayKey = `${base}${item.shortcut.key}`;
          const description = item.description || '';
          dataList.push({ shortcut: displayKey, description, actions: item.actions });
        });
      }
      return dataList;
    });
    const shortcutList = computed(() => {
      const dataList: {
        shortcut: string;
        type: string;
        value: string;
        dataType: 'number' | 'text' | 'boolean';
        description: string; belongs: 'track' | 'detection'; name: string;
        list?: string[];
      }[] = [];
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
              list: attribute.values,
            });
          });
        }
      });
      return dataList;
    });

    function getAttributeUser({ name, belongs }: { name: string; belongs: 'track' | 'detection' }) {
      const attribute = attributes.value.find((attr) => attr.name === name && attr.belongs === belongs);
      if (attribute?.user) {
        return store.state.User.user?.login || null;
      }
      return null;
    }

    function updateAttribute({ name, value, belongs }: { name: string; value: unknown; belongs: 'track' | 'detection' }) {
      if (selectedTrackIdRef.value !== null) {
        // Tracks across all cameras get the same attributes set if they are linked
        const tracks = cameraStore.getTrackAll(selectedTrackIdRef.value);
        const user = getAttributeUser({ name, belongs });
        if (tracks.length) {
          if (belongs === 'track') {
            tracks.forEach((track) => track.setAttribute(name, value, user));
          } else if (belongs === 'detection' && frameRef.value !== undefined) {
            tracks.forEach((track) => track.setFeatureAttribute(frameRef.value, name, value, user));
          }
        }
      }
    }

    const systemHandler = useHandler();

    const runActions = (shortcut: string) => {
      const index = actionShortcuts.value.findIndex((item) => item.shortcut === shortcut);
      if (index !== -1) {
        actionShortcuts.value[index].actions.forEach((action) => {
          systemHandler.processAction(action, true, { frame: frameRef.value });
        });
      }
    };

    const runUIAction = (shortcut: string) => {
      const index = diveActionShortcuts.value.findIndex((item) => {
        if (item.shortcut) {
          return (getDiveActionShortcutString(item) === shortcut);
        }
        return false;
      });
      if (index !== -1) {
        diveActionShortcuts.value[index].actions.forEach((action) => {
          systemHandler.processAction(action, true, { frame: frameRef.value });
        });
      }
    };

    const existingShortcut = (actions: MouseTrapInterface[], bind: string) => actions.find((item) => bind === item.bind) !== undefined;
    const mouseTrap = computed(() => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      const actions: MouseTrapInterface[] = [];

      // UINotificaton Shortcuts, These take precendence over Attribute/System Actions
      diveActionShortcuts.value.forEach((diveActionShortcut) => {
        const bind = getDiveActionShortcutString(diveActionShortcut);
        actions.push({ bind, handler: () => runUIAction(bind), disabled: props.hotkeysDisabled });
      });

      // System Actions
      actionShortcuts.value.forEach((shortcut) => {
        const bind = shortcut.shortcut;
        if (!existingShortcut(actions, bind)) {
          actions.push({ bind, handler: () => runActions(shortcut.shortcut), disabled: props.hotkeysDisabled });
        }
      });

      // Attribute Actions
      shortcutList.value.forEach((shortcut) => {
        const bind = shortcut.shortcut;
        if (existingShortcut(actions, bind)) {
          return;
        }
        // eslint-disable-next-line @typescript-eslint/ban-types
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
              text: shortcut.list ? 'Press Spacebar to choose a selection, then Enter to select' : 'Set the Attribute Value below',
              positiveButton: 'Save',
              negativeButton: 'Cancel',
              confirm: true,
              valueType: shortcut.dataType,
              valueList: shortcut.list,
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
      diveActionShortcuts,
      actionShortcuts,
      shortcutsOn,
      showShortcuts,
      mouseTrap,
      getDiveActionShortcutString,
    };
  },
});
</script>

<template>
  <div>
    <v-tooltip
      open-delay="200"
      left
      max-width="200"
    >
      <template #activator="{ on }">
        <v-icon
          v-mousetrap=" shortcutsOn ? mouseTrap : []"
          :color="shortcutsOn ? 'primary' : 'default'"
          v-on="on"
          @click="shortcutsOn = !shortcutsOn"
        >
          mdi-keyboard
        </v-icon>
      </template>
      <span> Toggle Keyboard Shortcuts On/Off</span>
    </v-tooltip>
    <v-tooltip
      open-delay="200"
      bottom
      max-width="200"
    >
      <template #activator="{ on }">
        <v-icon
          v-on="on"
          @click="showShortcuts = !showShortcuts"
        >
          mdi-information-variant
        </v-icon>
      </template>
      <span>View Custom Keyboard Shortucts</span>
    </v-tooltip>
    <v-dialog
      v-model="showShortcuts"
      max-width="600"
    >
      <v-card>
        <v-card-title>
          Configured Shortcuts
        </v-card-title>
        <v-card-text>
          <v-row
            dense
            class="helpContextRow ma-0 align-center"
          >
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
          <v-row dense>
            <b>Action Shortcuts</b>
          </v-row>
          <v-row
            v-for="shortcut in actionShortcuts"
            :key="`${shortcut.shortcut}`"
            class="helpContextRow ma-0 align-cente py-2"
            style="border: 1px solid gray;"
            dense
          >
            <v-col cols="2">
              <v-chip>{{ shortcut.shortcut }}</v-chip>
            </v-col>
            <v-col cols="2">
              <v-chip>System</v-chip>
            </v-col>
            <v-col
              col="2"
            />
            <v-col col="6">
              <v-chip>{{ shortcut.description }}</v-chip>
            </v-col>
          </v-row>
          <v-row v-if="diveActionShortcuts.length" dense>
            <b>UI Notification Shortcuts</b>
          </v-row>
          <v-row
            v-for="shortcut in diveActionShortcuts"
            :key="`${getDiveActionShortcutString(shortcut)}`"
            class="helpContextRow ma-0 align-cente py-2"
            style="border: 1px solid gray;"
            dense
          >
            <v-col cols="2">
              <v-chip>{{ getDiveActionShortcutString(shortcut) }}</v-chip>
            </v-col>
            <v-col cols="2">
              <v-chip>UI</v-chip>
            </v-col>
            <v-col
              col="2"
            />
            <v-col col="6">
              <v-chip>{{ shortcut.description }}</v-chip>
            </v-col>
          </v-row>
          <v-row v-if="shortcutList.length" dense>
            <b>Attribute Shortcuts</b>
          </v-row>
          <v-row
            v-for="shortcut in shortcutList"
            :key="`${shortcut.shortcut}`"
            class="helpContextRow ma-0 align-center py-2"
            style="border: 1px solid gray;"
            dense
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
