<script lang="ts">
import {
  defineComponent, PropType, ref, watch,
} from 'vue';
import { AttributeShortcut, ButtonShortcut } from 'vue-media-annotator/use/AttributeTypes';

function defaultButtonForType(
  shortcutType: AttributeShortcut['type'] | undefined,
  attributeName: string | undefined,
  attributeColor: string | undefined,
): ButtonShortcut {
  if (shortcutType === 'remove') {
    return {
      buttonText: '',
      iconPrepend: 'mdi-delete',
      buttonColor: '#F44336',
    };
  }
  return {
    buttonText: attributeName || 'Button Name',
    buttonColor: attributeColor || '#FF00FF',
  };
}

export default defineComponent({
  name: 'ButtonShortcutEditor',
  props: {
    value: {
      type: Object as PropType<ButtonShortcut | undefined>,
      required: false,
    },
    attribute: {
      type: Boolean,
      default: true,
    },
    attributeName: {
      type: String,
      default: '',
    },
    attributeColor: {
      type: String,
      default: '',
    },
    shortcutType: {
      type: String as PropType<AttributeShortcut['type'] | undefined>,
      default: undefined,
    },
  },
  setup(props, { emit }) {
    const buttonShortcutEnabled = ref(!!props.value);
    const buttonShortcut = ref<ButtonShortcut>(
      props.value || defaultButtonForType(
        props.shortcutType,
        props.attributeName,
        props.attributeColor,
      ),
    );
    let syncingFromProps = false;

    const updateButtonShortcut = () => {
      if (syncingFromProps) {
        return;
      }
      if (buttonShortcutEnabled.value) {
        emit('input', buttonShortcut.value);
      } else {
        emit('input', undefined);
      }
    };

    const applyTypeDefaults = () => {
      syncingFromProps = true;
      buttonShortcut.value = defaultButtonForType(
        props.shortcutType,
        props.attributeName,
        props.attributeColor,
      );
      syncingFromProps = false;
      updateButtonShortcut();
    };

    watch(() => props.value, (newValue) => {
      syncingFromProps = true;
      buttonShortcutEnabled.value = !!newValue;
      buttonShortcut.value = newValue
        || defaultButtonForType(
          props.shortcutType,
          props.attributeName,
          props.attributeColor,
        );
      syncingFromProps = false;
    });

    watch(buttonShortcutEnabled, (enabled, wasEnabled) => {
      if (syncingFromProps) {
        return;
      }
      if (enabled && !wasEnabled) {
        applyTypeDefaults();
      } else {
        updateButtonShortcut();
      }
    });

    watch(() => props.shortcutType, (type, prevType) => {
      if (syncingFromProps) {
        return;
      }
      if (buttonShortcutEnabled.value && type && prevType && type !== prevType) {
        applyTypeDefaults();
      }
    });

    watch(buttonShortcut, () => {
      updateButtonShortcut();
    }, { deep: true });

    return {
      buttonShortcutEnabled,
      buttonShortcut,
    };
  },
});
</script>

<template>
  <div>
    <v-switch v-model="buttonShortcutEnabled" label="Enable Button Shortcut" />
    <div v-if="buttonShortcutEnabled">
      <v-text-field v-model="buttonShortcut.buttonText" label="Button Text" />
      <v-text-field v-model="buttonShortcut.buttonToolTip" label="Button Tooltip" />
      <v-row dense align="center">
        <v-col>
          <v-text-field
            v-model="buttonShortcut.iconPrepend"
            label="Prepend Icon"
            hide-details
            class="mb-2"
          />
        </v-col>
        <v-col
          v-if="buttonShortcut.iconPrepend"
          cols="auto"
        >
          <v-icon :color="buttonShortcut.buttonColor">
            {{ buttonShortcut.iconPrepend }}
          </v-icon>
        </v-col>
      </v-row>
      <v-row dense align="center">
        <v-col>
          <v-text-field
            v-model="buttonShortcut.iconAppend"
            label="Append Icon"
            hide-details
            class="mb-2"
          />
        </v-col>
        <v-col
          v-if="buttonShortcut.iconAppend"
          cols="auto"
        >
          <v-icon :color="buttonShortcut.buttonColor">
            {{ buttonShortcut.iconAppend }}
          </v-icon>
        </v-col>
      </v-row>
      <v-color-picker v-model="buttonShortcut.buttonColor" label="Button Color" />
      <v-checkbox v-if="attribute" v-model="buttonShortcut.displayValue" label="Display Value" />
    </div>
  </div>
</template>
