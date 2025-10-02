<script lang="ts">
import {
  computed, defineComponent, ref, PropType, Ref,
  watch,
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
    const isSegment = ref(false);
    const segmentEditable = ref(false);
    const segmentSize = ref(0.01);
    const segmentSizeType: Ref<'frames' | 'seconds' | 'percent'> = ref('percent');
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
      isSegment.value = shortcut.segment || false;
      segmentEditable.value = !shortcut.segment ? false : shortcut.segmentEditable || false;
      segmentSize.value = shortcut.segmentSize || 0.01;
      segmentSizeType.value = shortcut.segmentSizeType || 'percent';
    };

    const cancel = () => {
      editShortcutDialog.value = false;
      selectedShortcut.value = -1;
      selectedShortcutType.value = 'set';
      selectedShortcutDescription.value = '';
      selectedShortcutValue.value = '';
      selectedShortcutButton.value = undefined;
      selectedShortcutKey.value = '';
      isSegment.value = false;
      segmentEditable.value = false;
      segmentSize.value = 0.01;
      segmentSizeType.value = 'percent';
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
        segment: isSegment.value || undefined,
        segmentEditable: isSegment.value ? (segmentEditable.value || undefined) : undefined,
        segmentSize: isSegment.value ? segmentSize.value : undefined,
        segmentSizeType: isSegment.value ? segmentSizeType.value : undefined,
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

    watch(segmentSizeType, (newVal) => {
      if (newVal === 'percent' && segmentSize.value > 1) {
        segmentSize.value = 0.01;
      }
      if ((newVal === 'frames' || newVal === 'seconds') && segmentSize.value < 1) {
        segmentSize.value = 1;
      }
    });

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
      selectedShortcutButton,
      isSegment,
      segmentEditable,
      segmentSize,
      segmentSizeType,
      shortcutTypes,
      selectedDisplayKey,
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
        :key="`${shortcut.type}_shorcut_${shortcut.key}`"
      >
        <span>Key:</span><v-chip>{{ getShortcutDisplay(shortcut) }}</v-chip>
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
            <v-btn
              class="mr-4"
              @click="editKeyPress"
            >
              Edit Keys
            </v-btn>
            <v-chip v-if="!awaitingKeyPress && !shortcutError">
              {{ selectedDisplayKey || 'Enter Shorcut' }}
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
          </v-row>
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
          <v-row>
            <v-checkbox
              v-model="isSegment"
              label="Segment Shortcut"
            />
            <v-tooltip
              open-delay="200"
              bottom
              max-width="200"
            >
              <template #activator="{ on }">
                <v-icon class="ml-2" v-on="on">
                  mdi-information-outline
                </v-icon>
              </template>
              <span>Segment shortcuts will create when setting a segment of percentage size of the video.  Deletion will occur when the frame is inside of a segment</span>
            </v-tooltip>
            <v-checkbox
              v-model="segmentEditable"
              label="Segment Editable"
              class="ml-6"
            />
            <v-tooltip
              open-delay="200"
              bottom
              max-width="200"
            >
              <template #activator="{ on }">
                <v-icon class="ml-2" v-on="on">
                  mdi-information-outline
                </v-icon>
              </template>
              <span>Allows for editing of an entire segment</span>
            </v-tooltip>
          </v-row>
          <v-row v-if="isSegment">
            <v-text-field
              v-model.number="segmentSize"
              type="number"
              :step="segmentSizeType === 'percent' ? 0.01 : 1"
              :min="segmentSizeType === 'percent' ? 0.01 : 1"
              label="Segment Size"
              class="mr-4"
            />
            <v-select
              v-model="segmentSizeType"
              :items="['frames', 'seconds', 'percent']"
              label="Segment Size Type"
            />
          </v-row>
          <button-shortcut-editor
            v-model="selectedShortcutButton"
          />
        </v-card-text>
        <v-card-actions>
          <v-row>
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
              :disabled="!!shortcutError"
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
