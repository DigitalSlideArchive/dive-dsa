<script lang="ts">
import {
  computed, defineComponent, ref, PropType, Ref,
} from 'vue';
import { AttributeShortcut, ButtonShortcut } from 'vue-media-annotator/use/AttributeTypes';
import usedShortcuts from 'dive-common/use/usedShortcuts';
import { useAttributes } from 'vue-media-annotator/provides';
import { uniq } from 'lodash';
import ButtonShortcutEditor from '../CustomUI/ButtonShortcutEditor.vue';

export default defineComponent({
  name: 'AttributeShortcuts',
  components: {
    ButtonShortcutEditor,
  },
  props: {
    value: {
      type: Array as PropType<AttributeShortcut[]>,
      required: true,
    },
    valueType: {
      type: String as PropType<'text' | 'number' | 'boolean'>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const editShortcutDialog = ref(false);
    const attributes = useAttributes();
    const selectedShortcut = ref(-1);
    const selectedShortcutType: Ref<AttributeShortcut['type']> = ref('set');
    const selectedShortcutDescription = ref('');
    const selectedShortcutValue: Ref<string | number | boolean> = ref('');
    const shortcutTypes: Ref<string[]> = ref(['set', 'dialog', 'remove']);
    const selectedShortcutKey = ref('');
    const selectedShortcutModifiers: Ref<string[]> = ref([]);
    const selectedShortcutButton: Ref<ButtonShortcut | undefined> = ref(undefined);
    const copy = ref(props.value);
    const awaitingKeyPress = ref(false);
    const shortcutError: Ref<{description: string; type: 'System' | 'Custom'}| null> = ref(null);

    const existingShortcuts = computed(() => {
      const dataList: Record<string, {description: string; type: 'System' | 'Custom'}> = {};
      attributes.value.forEach((attribute) => {
        if (attribute.shortcuts && attribute.shortcuts.length > 0) {
          attribute.shortcuts.forEach((shortcut) => {
            let base = '';
            if (shortcut.modifiers && shortcut.modifiers.length > 0) {
              base = shortcut.modifiers.join('+');
              base = `${base}+`;
            }
            const displayKey = `${base}${shortcut.key}`;
            if (displayKey && shortcut.description !== undefined) {
              dataList[displayKey] = { description: shortcut.description, type: 'Custom' };
            }
          });
        }
      });
      usedShortcuts.forEach((shortcut) => {
        dataList[shortcut.key] = { description: shortcut.description, type: 'System' };
      });
      return dataList;
    });
    const getShortcutDisplay = (shorcut: AttributeShortcut) => {
      let base = '';
      if (shorcut.modifiers?.length) {
        base = shorcut.modifiers.join('+');
        base = `${base}+`;
      }
      return `${base}${shorcut.key}`;
    };

    const editShortcut = (shortcut: AttributeShortcut, index: number) => {
      selectedShortcut.value = index;
      selectedShortcutType.value = shortcut.type;
      selectedShortcutDescription.value = shortcut.description || 'Enter a Description';
      selectedShortcutValue.value = shortcut.value || 0;
      selectedShortcutKey.value = getShortcutDisplay(shortcut);
      selectedShortcutButton.value = shortcut.button || undefined;
      editShortcutDialog.value = true;
    };

    const cancel = () => {
      editShortcutDialog.value = false;
      selectedShortcut.value = -1;
      selectedShortcutType.value = 'set';
      selectedShortcutDescription.value = '';
      selectedShortcutValue.value = '';
      selectedShortcutKey.value = '';
      selectedShortcutButton.value = undefined;
    };
    const save = () => {
      editShortcutDialog.value = false;
      copy.value[selectedShortcut.value] = {
        type: selectedShortcutType.value,
        key: selectedShortcutKey.value,
        modifiers: selectedShortcutModifiers.value,
        value: selectedShortcutValue.value,
        description: selectedShortcutDescription.value,
        button: selectedShortcutButton.value,
      };
      selectedShortcutButton.value = undefined;
      emit('input', copy.value);
    };
    const deleteShortcut = (index: number) => {
      copy.value.splice(index, 1);
      emit('input', copy.value);
    };
    const addShortcut = () => {
      selectedShortcut.value = props.value.length;
      selectedShortcutType.value = 'set';
      selectedShortcutType.value = 'set';
      selectedShortcutDescription.value = 'Enter a Description';
      if (props.valueType === 'boolean') {
        selectedShortcutValue.value = false;
      }
      if (props.valueType === 'number') {
        selectedShortcutValue.value = 0;
      }
      if (props.valueType === 'text') {
        selectedShortcutValue.value = 'Text Value';
      }
      selectedShortcutKey.value = '';
      selectedShortcutModifiers.value = [];
      selectedShortcutButton.value = undefined;
      editShortcutDialog.value = true;
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey) {
        selectedShortcutModifiers.value.push('alt');
      }
      if (e.ctrlKey) {
        selectedShortcutModifiers.value.push('ctrl');
      }
      if (e.shiftKey) {
        selectedShortcutModifiers.value.push('shift');
      }
      let { key } = e;
      if (e.code.includes('Arrow')) {
        key = e.code.replace('Arrow', '');
        key = key.toLowerCase();
        selectedShortcutKey.value = key;
        // Now check to make sure it doesn't conflict with any other shortucts.
        let base = '';
        if (selectedShortcutModifiers.value.length) {
          selectedShortcutModifiers.value = uniq(selectedShortcutModifiers.value);
          base = selectedShortcutModifiers.value.join('+');
          base = `${base}+`;
        }
        const displaykey = `${base}${selectedShortcutKey.value}`;
        if (existingShortcuts.value[displaykey]) {
          shortcutError.value = existingShortcuts.value[displaykey];
        }
        awaitingKeyPress.value = false;
        window.document.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        window.document.removeEventListener('keypress', handleKeyPress);
      }
    }

    function handleKeyPress(e: KeyboardEvent) {
      shortcutError.value = null;
      let { key } = e;
      if (e.code.includes('Digit')) {
        key = e.code.replace('Digit', '');
      }
      if (e.code.includes('Arrow')) {
        key = e.code.replace('Arrow', '');
      }

      if (e.code.includes('Key')) {
        key = e.code.replace('Key', '');
      }
      key = key.toLowerCase();
      selectedShortcutKey.value = key;
      // Now check to make sure it doesn't conflict with any other shortucts.
      let base = '';
      if (selectedShortcutModifiers.value.length) {
        selectedShortcutModifiers.value = uniq(selectedShortcutModifiers.value);
        base = selectedShortcutModifiers.value.join('+');
        base = `${base}+`;
      }
      const displaykey = `${base}${selectedShortcutKey.value}`;
      if (existingShortcuts.value[displaykey]) {
        shortcutError.value = existingShortcuts.value[displaykey];
      }
      awaitingKeyPress.value = false;
      window.document.removeEventListener('keydown', handleKeyDown);
      window.document.removeEventListener('keypress', handleKeyPress);
    }
    const editKeyPress = () => {
      awaitingKeyPress.value = true;
      selectedShortcutModifiers.value = [];
      window.document.addEventListener('keypress', handleKeyPress);
      window.document.addEventListener('keydown', handleKeyDown);
    };

    const deleteShortcutKey = () => {
      awaitingKeyPress.value = false;
      selectedShortcutModifiers.value = [];
      selectedShortcutKey.value = '';
    };

    const shortcutLabel = (shortcut: AttributeShortcut) => {
      if (shortcut.key) {
        return shortcut.key;
      } if (shortcut.button) {
        return shortcut.button.buttonText;
      }
      return '';
    };

    const selectedDisplayKey = computed(() => {
      let base = '';
      if (selectedShortcutModifiers.value.length) {
        base = selectedShortcutModifiers.value.join('+');
        base = `${base}+`;
      }
      return `${base}${selectedShortcutKey.value}`;
    });
    return {
      editShortcutDialog,
      selectedShortcutType,
      selectedShortcutDescription,
      selectedShortcutKey,
      selectedShortcutValue,
      shortcutTypes,
      selectedDisplayKey,
      selectedShortcutButton,
      awaitingKeyPress,
      shortcutError,
      getShortcutDisplay,
      cancel,
      save,
      addShortcut,
      deleteShortcut,
      editShortcut,
      editKeyPress,
      copy,
      shortcutLabel,
      deleteShortcutKey,
    };
  },
});
</script>
awaitingKeyPress
<template>
  <div>
    <v-btn @click="addShortcut">
      Add Shortcut
    </v-btn>
    <v-list>
      <v-list-item
        v-for="(shortcut, index) in copy"
        :key="`${shortcut.type}_shorcut_${shortcutLabel(shortcut)}`"
      >
        <span v-if="shortcut.key" class="mr-2"><span>Key:</span><v-chip>{{ getShortcutDisplay(shortcut) }}</v-chip></span>
        <span v-if="shortcut.button"><span>Button:</span><v-chip>{{ shortcut.button.buttonText }}</v-chip></span>
        <v-spacer />
        <span>Type:</span><v-chip>{{ shortcut.type }}</v-chip>
        <v-spacer />
        <div v-if="shortcut.type === 'set'">
          <span>Value:</span> <v-chip> {{ shortcut.value }}</v-chip>
        </div>
        <v-spacer />
        <v-tooltip
          open-delay="200"
          bottom
          max-width="200"
        >
          <template #activator="{ on }">
            <v-icon v-on="on">
              mdi-card-text-outline
            </v-icon>
          </template>
          <span>{{ shortcut.description }}</span>
        </v-tooltip>
        <v-spacer />
        <v-icon @click="editShortcut(shortcut, index)">
          mdi-pencil
        </v-icon>
        <v-spacer />
        <v-icon
          color="error"
          @click="deleteShortcut(index)"
        >
          mdi-delete
        </v-icon>
      </v-list-item>
    </v-list>
    <v-dialog
      v-model="editShortcutDialog"
      max-width="600"
    >
      <v-card>
        <v-card-title>
          Edit Shortcut
          <v-spacer />
          <v-btn
            icon
            small
            color="white"
            @click="cancel"
          >
            <v-icon
              small
            >
              mdi-close
            </v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-select
              v-model="selectedShortcutType"
              :items="shortcutTypes"
              label="Type"
            />
          </v-row>
          <v-row v-if="selectedShortcutType === 'set'">
            <div v-if="valueType === 'boolean'">
              <v-switch
                v-model="selectedShortcutValue"
                label="Boolean Value"
              />
            </div>
            <div v-else-if="valueType === 'text'">
              <v-text-field
                v-model="selectedShortcutValue"
                label="Text Value"
              />
            </div>
            <div v-else-if="valueType === 'number'">
              <v-text-field
                v-model.number="selectedShortcutValue"
                type="number"
                step="0.1"
                label="Numerical Value"
              />
            </div>
          </v-row>
          <v-row>
            <v-text-field
              v-model="selectedShortcutDescription"
              label="Description"
            />
          </v-row>
          <v-row class="pb-2">
            <v-btn
              class="mr-4"
              @click="editKeyPress"
            >
              Edit Keys
            </v-btn>
            <v-chip v-if="!awaitingKeyPress && !shortcutError">
              {{ selectedDisplayKey || 'Enter Shortcut' }}
            </v-chip>
            <v-chip
              v-else-if="awaitingKeyPress"
              color="warning"
            >
              Press Key(s)
            </v-chip>
            <v-chip
              v-else-if="shortcutError"
              color="error"
            >
              <span style="font-weight:bold">Key:</span>
              <span class="pl-2">{{ selectedDisplayKey }}</span>
              <span
                class="pl-4"
                style="font-weight:bold"
              >Type:  </span>
              <span class="pl-2">{{ shortcutError.type }}</span>
              <span
                class="pl-4"
                style="font-weight:bold"
              >Description:  </span>
              <span class="pl-2">{{ shortcutError.description }}</span>
            </v-chip>
            <v-spacer />
            <v-btn v-if="!awaitingKeyPress && !shortcutError && selectedDisplayKey" color="error" @click="deleteShortcutKey()">
              Delete <v-icon>mdi-delete</v-icon>
            </v-btn>
          </v-row>
          <button-shortcut-editor
            v-model="selectedShortcutButton"
          />
          <v-row v-if="!!shortcutError || (selectedDisplayKey === '' && !selectedShortcutButton?.buttonText) ">
            <v-spacer />
            <v-alert type="warning">Saving requires either a Keyboard Shortcut or a Button</v-alert>
            <v-spacer />
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-row class="my-3 pb-2">
            <v-spacer />
            <v-btn
              depressed
              text
              @click="cancel"
            >
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              :disabled="!!shortcutError || (selectedDisplayKey === '' && !selectedShortcutButton?.buttonText)"
              @click="save"
            >
              Save
            </v-btn>
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
</style>
