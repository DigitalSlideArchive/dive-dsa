<script lang="ts">
import {
  computed, defineComponent, ref, PropType, Ref,
} from '@vue/composition-api';
import usedShortcuts from 'dive-common/use/usedShortcuts';
import { useAttributes } from 'vue-media-annotator/provides';
import { uniq } from 'lodash';

export default defineComponent({
  name: 'GetShortcut',
  props: {
    value: {
      type: Object as PropType<{
        key: string;
        modifiers?: string[];
      }>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const attributes = useAttributes();
    const selectedShortcutKey = ref(props.value.key || '');
    const selectedShortcutModifiers: Ref<string[]> = ref(props.value.modifiers || []);
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
        if (shortcutError.value === null) {
          emit('input', {
            key: selectedShortcutKey.value,
            modifiers: selectedShortcutModifiers.value,
          });
        }
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
        base = selectedShortcutModifiers.value.join('+');
        base = `${base}+`;
      }
      const displaykey = `${base}${selectedShortcutKey.value}`;
      if (existingShortcuts.value[displaykey]) {
        shortcutError.value = existingShortcuts.value[displaykey];
      }
      awaitingKeyPress.value = false;
      if (shortcutError.value === null) {
        emit('input', {
          key: selectedShortcutKey.value,
          modifiers: selectedShortcutModifiers.value,
        });
      }
      window.document.removeEventListener('keydown', handleKeyDown);
      window.document.removeEventListener('keypress', handleKeyPress);
    }
    const editKeyPress = () => {
      awaitingKeyPress.value = true;
      selectedShortcutModifiers.value = [];
      window.document.addEventListener('keypress', handleKeyPress);
      window.document.addEventListener('keydown', handleKeyDown);
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
      selectedDisplayKey,
      awaitingKeyPress,
      shortcutError,
      editKeyPress,
    };
  },
});
</script>
awaitingKeyPress
<template>
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
</template>

<style lang="scss">
</style>
