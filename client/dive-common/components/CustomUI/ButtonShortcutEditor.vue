<script lang="ts">
import {
  defineComponent, PropType, ref, watch,
} from 'vue';
import { ButtonShortcut } from 'vue-media-annotator/use/AttributeTypes';

export default defineComponent({
  name: 'ButtonShortcutEditor',
  props: {
    value: {
      type: Object as PropType<ButtonShortcut | undefined>,
      required: false,
    },
  },
  setup(props, { emit }) {
    const buttonShortcutEnabled = ref(!!props.value);
    const buttonShortcut = ref<ButtonShortcut>(props.value || { buttonText: 'Button Name', buttonColor: '#FF00FF' });

    watch(() => props.value, (newValue) => {
      buttonShortcutEnabled.value = !!newValue;
      buttonShortcut.value = newValue || { buttonText: 'Button Name', buttonColor: '#FF00FF' };
    });
    const updateButtonShortcut = () => {
      if (buttonShortcutEnabled.value) {
        emit('input', buttonShortcut.value);
      } else {
        emit('input', undefined);
      }
    };

    return {
      buttonShortcutEnabled,
      buttonShortcut,
      updateButtonShortcut,
    };
  },
  watch: {
    buttonShortcutEnabled: 'updateButtonShortcut',
    buttonShortcut: {
      handler: 'updateButtonShortcut',
      deep: true,
    },
  },
});
</script>

<template>
  <div>
    <v-switch v-model="buttonShortcutEnabled" label="Enable Button Shortcut" />
    <div v-if="buttonShortcutEnabled">
      <v-text-field v-model="buttonShortcut.buttonText" label="Button Text" />
      <v-text-field v-model="buttonShortcut.buttonToolTip" label="Button Tooltip" />
      <v-text-field v-model="buttonShortcut.iconPrepend" label="Prepend Icon" />
      <v-text-field v-model="buttonShortcut.iconAppend" label="Append Icon" />
      <v-color-picker v-model="buttonShortcut.buttonColor" label="Button Color" />
    </div>
  </div>
</template>
