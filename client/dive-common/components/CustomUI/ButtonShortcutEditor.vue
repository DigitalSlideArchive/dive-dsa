<script lang="ts">
import {
  defineComponent, PropType, ref, watch, nextTick,
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

function cloneButton(button: ButtonShortcut): ButtonShortcut {
  return { ...button };
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
      props.value
        ? cloneButton(props.value)
        : defaultButtonForType(
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
      const { buttonToolTip } = buttonShortcut.value;
      buttonShortcut.value = {
        ...defaultButtonForType(
          props.shortcutType,
          props.attributeName,
          props.attributeColor,
        ),
        ...(buttonToolTip !== undefined ? { buttonToolTip } : {}),
      };
      syncingFromProps = false;
      updateButtonShortcut();
    };

    watch(
      () => [props.value, props.shortcutType] as const,
      ([newValue, shortcutType], [oldValue, oldShortcutType]) => {
        const valueChanged = newValue !== oldValue;
        const typeChanged = shortcutType !== oldShortcutType;

        if (valueChanged) {
          syncingFromProps = true;
          buttonShortcutEnabled.value = !!newValue;
          buttonShortcut.value = newValue
            ? cloneButton(newValue)
            : defaultButtonForType(
              shortcutType,
              props.attributeName,
              props.attributeColor,
            );
          nextTick(() => {
            syncingFromProps = false;
          });
          return;
        }

        if (typeChanged && buttonShortcutEnabled.value && oldShortcutType) {
          applyTypeDefaults();
        }
      },
    );

    watch(buttonShortcutEnabled, (enabled, wasEnabled) => {
      if (syncingFromProps) {
        return;
      }
      if (enabled && !wasEnabled) {
        if (props.value) {
          buttonShortcut.value = cloneButton(props.value);
        } else {
          applyTypeDefaults();
        }
      } else {
        updateButtonShortcut();
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
    </div>
  </div>
</template>
