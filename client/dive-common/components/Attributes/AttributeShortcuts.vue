<script lang="ts">
import {
  computed, defineComponent, ref, PropType, Ref,
  watch,
} from 'vue';
import draggable from 'vuedraggable';
import { AttributeShortcut, ButtonShortcut } from 'vue-media-annotator/use/AttributeTypes';
import usedShortcuts from 'dive-common/use/usedShortcuts';
import { useAttributes } from 'vue-media-annotator/provides';
import { uniq } from 'lodash';
import ButtonShortcutEditor from '../CustomUI/ButtonShortcutEditor.vue';

export default defineComponent({
  name: 'AttributeShortcuts',
  components: {
    ButtonShortcutEditor,
    draggable,
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
    attributeName: {
      type: String,
      default: '',
    },
    attributeColor: {
      type: String,
      default: '',
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

    const defaultDescription = (type: AttributeShortcut['type']) => {
      if (type === 'remove') {
        return 'Remove the value';
      }
      return 'Set the Value';
    };

    const isDefaultDescription = (description: string) => [
      'Set the Value',
      'Remove the value',
      'Enter a Description',
      '',
    ].includes(description);

    const hasKeyboardShortcut = (shortcut: AttributeShortcut) => !!(shortcut.key && shortcut.key.length);

    const isIconOnlyButton = (button: ButtonShortcut) => {
      const hasText = !!(button.buttonText && button.buttonText.trim());
      return !hasText && !!(button.iconPrepend || button.iconAppend);
    };

    const editShortcut = (shortcut: AttributeShortcut, index: number) => {
      selectedShortcut.value = index;
      selectedShortcutType.value = shortcut.type;
      selectedShortcutDescription.value = shortcut.description || defaultDescription(shortcut.type);
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
      copy.value[selectedShortcut.value] = {
        type: selectedShortcutType.value,
        key: selectedShortcutKey.value,
        modifiers: selectedShortcutModifiers.value,
        value: selectedShortcutValue.value,
        description: selectedShortcutDescription.value,
        button: selectedShortcutButton.value
          ? { ...selectedShortcutButton.value }
          : undefined,
        segment: isSegment.value || undefined,
        segmentEditable: isSegment.value ? (segmentEditable.value || undefined) : undefined,
        segmentSize: isSegment.value ? segmentSize.value : undefined,
        segmentSizeType: isSegment.value ? segmentSizeType.value : undefined,
      };
      selectedShortcutButton.value = undefined;
      editShortcutDialog.value = false;
      emit('input', copy.value);
    };
    const deleteShortcut = (index: number) => {
      copy.value.splice(index, 1);
      emit('input', copy.value);
    };
    const addShortcut = () => {
      selectedShortcut.value = props.value.length;
      selectedShortcutType.value = 'set';
      selectedShortcutDescription.value = defaultDescription('set');
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
      if (newVal === 'percent' && segmentSize.value >= 1) {
        segmentSize.value = 0.99;
      }
    });

    watch(selectedShortcutType, (type) => {
      if (!editShortcutDialog.value) {
        return;
      }
      if (isDefaultDescription(selectedShortcutDescription.value)) {
        selectedShortcutDescription.value = defaultDescription(type);
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

    const onShortcutOrderEnd = () => {
      emit('input', copy.value);
    };

    watch(() => props.value, (val) => {
      copy.value = val;
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
      hasKeyboardShortcut,
      isIconOnlyButton,
      cancel,
      save,
      addShortcut,
      deleteShortcut,
      editShortcut,
      editKeyPress,
      copy,
      onShortcutOrderEnd,
    };
  },
});
</script>

<template>
  <div>
    <v-btn class="mb-2" @click="addShortcut">
      Add Shortcut
    </v-btn>
    <v-row
      v-if="copy.length"
      dense
      class="px-2 pb-1 font-weight-bold text-caption grey--text text--darken-1"
      align="center"
    >
      <v-col cols="1">
        Drag
      </v-col>
      <v-col cols="2">
        Shortcut
      </v-col>
      <v-col cols="2">
        Type
      </v-col>
      <v-col cols="2">
        Value
      </v-col>
      <v-col cols="2" class="shortcut-list-col-button">
        Button
      </v-col>
      <v-col cols="1">
        Info
      </v-col>
      <v-col cols="2" class="text-right">
        Edit
      </v-col>
    </v-row>
    <draggable
      :list="copy"
      handle=".drag-handle"
      @end="onShortcutOrderEnd"
    >
      <v-row
        v-for="(shortcut, index) in copy"
        :key="`${shortcut.type}_shortcut_${index}_${shortcut.key}`"
        dense
        align="center"
        class="px-2 py-1 shortcut-list-row"
      >
        <v-col cols="1">
          <v-icon class="drag-handle">
            mdi-drag
          </v-icon>
        </v-col>
        <v-col cols="2">
          <template v-if="hasKeyboardShortcut(shortcut)">
            <v-tooltip open-delay="200" bottom>
              <template #activator="{ on }">
                <v-icon small class="mr-1" color="primary" v-on="on">
                  mdi-keyboard-outline
                </v-icon>
              </template>
              <span>Keyboard shortcut in use</span>
            </v-tooltip>
            <v-chip small>
              {{ getShortcutDisplay(shortcut) }}
            </v-chip>
          </template>
          <v-tooltip
            v-else
            open-delay="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon small v-on="on">
                mdi-keyboard-off-outline
              </v-icon>
            </template>
            <span>No keyboard shortcut</span>
          </v-tooltip>
        </v-col>
        <v-col cols="2">
          <v-chip small>
            {{ shortcut.type }}
          </v-chip>
        </v-col>
        <v-col cols="2">
          <v-chip v-if="shortcut.type === 'set'" small>
            {{ shortcut.value }}
          </v-chip>
          <span v-else class="text-caption grey--text">—</span>
        </v-col>
        <v-col cols="2" class="shortcut-list-col-button">
          <v-tooltip
            v-if="shortcut.button"
            open-delay="200"
            bottom
          >
            <template #activator="{ on }">
              <div class="shortcut-button-preview-wrapper" v-on="on">
                <v-btn
                  x-small
                  outlined
                  class="shortcut-button-preview"
                  :class="{ 'shortcut-button-preview--icon-only': isIconOnlyButton(shortcut.button) }"
                  :color="shortcut.button.buttonColor || 'primary'"
                  @click.stop.prevent
                >
                  <v-icon
                    v-if="shortcut.button.iconPrepend"
                    x-small
                    :left="!!shortcut.button.buttonText"
                  >
                    {{ shortcut.button.iconPrepend }}
                  </v-icon>
                  <span
                    v-if="shortcut.button.buttonText"
                    class="shortcut-button-preview__text"
                  >
                    {{ shortcut.button.buttonText }}
                  </span>
                  <v-icon
                    v-if="shortcut.button.iconAppend"
                    x-small
                    :right="!!shortcut.button.buttonText"
                  >
                    {{ shortcut.button.iconAppend }}
                  </v-icon>
                </v-btn>
              </div>
            </template>
            <span>{{ shortcut.button.buttonText || 'Custom UI button' }}</span>
          </v-tooltip>
          <span v-else class="text-caption grey--text">—</span>
        </v-col>
        <v-col cols="1">
          <v-tooltip
            open-delay="200"
            bottom
            max-width="200"
          >
            <template #activator="{ on }">
              <v-icon small v-on="on">
                mdi-card-text-outline
              </v-icon>
            </template>
            <span>{{ shortcut.description || 'No description' }}</span>
          </v-tooltip>
        </v-col>
        <v-col cols="2" class="text-right">
          <v-btn icon x-small class="ma-0" @click="editShortcut(shortcut, index)">
            <v-icon small>
              mdi-pencil
            </v-icon>
          </v-btn>
          <v-btn icon x-small class="ma-0" color="error" @click="deleteShortcut(index)">
            <v-icon small>
              mdi-delete
            </v-icon>
          </v-btn>
        </v-col>
      </v-row>
    </draggable>
    <v-dialog
      v-model="editShortcutDialog"
      max-width="850"
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
              :max="segmentSizeType === 'percent' ? 1 : undefined"
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
            v-if="editShortcutDialog"
            :key="selectedShortcut"
            v-model="selectedShortcutButton"
            :attribute-name="attributeName"
            :attribute-color="attributeColor"
            :shortcut-type="selectedShortcutType"
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
.drag-handle {
  cursor: grab;
}

.shortcut-list-row {
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}

.shortcut-list-col-button {
  min-width: 0;
  overflow: hidden;
}

.shortcut-button-preview-wrapper {
  max-width: 100%;
  overflow: hidden;
}

.shortcut-button-preview {
  max-width: 100%;

  .v-btn__content {
    max-width: 100%;
    overflow: hidden;
  }
}

.shortcut-button-preview__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1 1 auto;
}

.shortcut-button-preview--icon-only {
  min-width: 28px !important;
  padding: 0 6px !important;

  .v-icon {
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
}
</style>
