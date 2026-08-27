<script lang="ts">
import {
  computed, defineComponent, PropType, ref, watch, nextTick,
} from 'vue';
import { AttributeCustomUI, AttributeCustomUIStickyIndicator } from 'vue-media-annotator/use/AttributeTypes';

const defaultStickyIndicator = (): AttributeCustomUIStickyIndicator => ({
  bold: false,
  italic: true,
  underline: false,
  highlightColor: undefined,
  fontSizeScale: 1,
  opacity: 1,
});

function buildCustomUIEditorPayload(
  enabled: boolean,
  showWithoutButtons: boolean,
  displayValue: boolean,
  stickyValue: boolean,
  stickyIndicator: AttributeCustomUIStickyIndicator,
  valuePosition: AttributeCustomUI['valuePosition'],
  longValueMode: AttributeCustomUI['longValueMode'],
  emptyValueLabel: string,
  showDescription: boolean,
): AttributeCustomUI {
  const payload: AttributeCustomUI = {
    enabled,
    showWithoutButtons,
    displayValue,
    showDescription,
  };
  if (displayValue) {
    payload.stickyValue = stickyValue;
    payload.valuePosition = valuePosition;
    payload.longValueMode = longValueMode;
    payload.emptyValueLabel = emptyValueLabel || undefined;
    if (stickyValue) {
      payload.stickyValueIndicator = { ...stickyIndicator };
    }
  }
  return payload;
}

function customUIPayloadsEqual(a: AttributeCustomUI, b: AttributeCustomUI): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default defineComponent({
  name: 'AttributeCustomUIEditor',
  props: {
    value: {
      type: Object as PropType<AttributeCustomUI>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const enabled = ref(props.value.enabled ?? true);
    const showWithoutButtons = ref(props.value.showWithoutButtons ?? false);
    const displayValue = ref(props.value.displayValue ?? false);
    const stickyValue = ref(props.value.stickyValue ?? false);
    const stickyIndicator = ref<AttributeCustomUIStickyIndicator>(
      props.value.stickyValueIndicator
        ? { ...defaultStickyIndicator(), ...props.value.stickyValueIndicator }
        : defaultStickyIndicator(),
    );
    const valuePosition = ref(props.value.valuePosition ?? 'below');
    const longValueMode = ref(props.value.longValueMode ?? 'expand');
    const emptyValueLabel = ref(props.value.emptyValueLabel ?? '');
    const showDescription = ref(props.value.showDescription ?? true);
    let syncingFromProps = false;

    const valuePositionOptions = [
      { text: 'Below buttons', value: 'below' },
      { text: 'Above buttons', value: 'above' },
      { text: 'In header', value: 'header' },
    ];

    const longValueModeOptions = [
      { text: 'Expand (panel for long values)', value: 'expand' },
      { text: 'Truncate', value: 'truncate' },
      { text: 'Scroll', value: 'scroll' },
    ];

    const fontSizeScaleOptions = [
      { text: 'Same size', value: 1 },
      { text: 'Smaller', value: 0.85 },
      { text: 'Larger', value: 1.15 },
    ];

    const emitValue = () => {
      if (syncingFromProps) {
        return;
      }
      const payload = buildCustomUIEditorPayload(
        enabled.value,
        showWithoutButtons.value,
        displayValue.value,
        stickyValue.value,
        stickyIndicator.value,
        valuePosition.value,
        longValueMode.value,
        emptyValueLabel.value,
        showDescription.value,
      );
      if (customUIPayloadsEqual(payload, props.value)) {
        return;
      }
      emit('input', payload);
    };

    watch(
      () => props.value,
      (newValue) => {
        syncingFromProps = true;
        enabled.value = newValue.enabled ?? true;
        showWithoutButtons.value = newValue.showWithoutButtons ?? false;
        displayValue.value = newValue.displayValue ?? false;
        stickyValue.value = newValue.stickyValue ?? false;
        stickyIndicator.value = newValue.stickyValueIndicator
          ? { ...defaultStickyIndicator(), ...newValue.stickyValueIndicator }
          : defaultStickyIndicator();
        valuePosition.value = newValue.valuePosition ?? 'below';
        longValueMode.value = newValue.longValueMode ?? 'expand';
        emptyValueLabel.value = newValue.emptyValueLabel ?? '';
        showDescription.value = newValue.showDescription ?? true;
        nextTick(() => {
          syncingFromProps = false;
        });
      },
      { deep: true },
    );

    watch(displayValue, (enabled) => {
      if (!enabled) {
        stickyValue.value = false;
      }
    });

    watch(
      [
        enabled,
        showWithoutButtons,
        displayValue,
        stickyValue,
        stickyIndicator,
        valuePosition,
        longValueMode,
        emptyValueLabel,
        showDescription,
      ],
      emitValue,
      { deep: true },
    );

    const highlightEnabled = computed({
      get: () => !!stickyIndicator.value.highlightColor,
      set: (enabled: boolean) => {
        if (!enabled) {
          stickyIndicator.value = {
            ...stickyIndicator.value,
            highlightColor: undefined,
          };
          return;
        }
        const current = stickyIndicator.value.highlightColor;
        const defaultColor = current && current !== 'auto' ? current : '#F57C00';
        stickyIndicator.value = {
          ...stickyIndicator.value,
          highlightColor: defaultColor,
        };
      },
    });

    const highlightColorValue = computed({
      get: () => {
        const color = stickyIndicator.value.highlightColor;
        return color && color !== 'auto' ? color : '#F57C00';
      },
      set: (color: string) => {
        stickyIndicator.value = {
          ...stickyIndicator.value,
          highlightColor: color,
        };
      },
    });

    return {
      enabled,
      showWithoutButtons,
      displayValue,
      stickyValue,
      stickyIndicator,
      valuePosition,
      longValueMode,
      emptyValueLabel,
      showDescription,
      valuePositionOptions,
      longValueModeOptions,
      fontSizeScaleOptions,
      highlightEnabled,
      highlightColorValue,
    };
  },
});
</script>

<template>
  <div class="custom-ui-editor">
    <v-row
      dense
      align="center"
      no-gutters
      class="custom-ui-option"
    >
      <v-checkbox
        v-model="enabled"
        label="Show in Custom UI"
        hide-details
        dense
        class="mt-0 pt-0"
      />
      <v-tooltip
        open-delay="200"
        bottom
        max-width="280"
      >
        <template #activator="{ on, attrs }">
          <v-icon
            small
            color="grey"
            class="custom-ui-option__info ml-1"
            v-bind="attrs"
            v-on="on"
          >
            mdi-information-outline
          </v-icon>
        </template>
        <span>When disabled, this attribute is hidden from the Custom UI panel.</span>
      </v-tooltip>
    </v-row>
    <v-row
      dense
      align="center"
      no-gutters
      class="custom-ui-option"
    >
      <v-checkbox
        v-model="showWithoutButtons"
        label="Show Without Buttons"
        hide-details
        dense
        class="mt-0 pt-0"
      />
      <v-tooltip
        open-delay="200"
        bottom
        max-width="280"
      >
        <template #activator="{ on, attrs }">
          <v-icon
            small
            color="grey"
            class="custom-ui-option__info ml-1"
            v-bind="attrs"
            v-on="on"
          >
            mdi-information-outline
          </v-icon>
        </template>
        <span>Display this attribute in Custom UI even when it has no button shortcuts.</span>
      </v-tooltip>
    </v-row>
    <v-row
      dense
      align="center"
      no-gutters
      class="custom-ui-option"
    >
      <v-checkbox
        v-model="displayValue"
        label="Display Value"
        hide-details
        dense
        class="mt-0 pt-0"
      />
      <v-tooltip
        open-delay="200"
        bottom
        max-width="280"
      >
        <template #activator="{ on, attrs }">
          <v-icon
            small
            color="grey"
            class="custom-ui-option__info ml-1"
            v-bind="attrs"
            v-on="on"
          >
            mdi-information-outline
          </v-icon>
        </template>
        <span>Show the current attribute value in the Custom UI panel.</span>
      </v-tooltip>
    </v-row>
    <template v-if="displayValue">
      <v-row
        dense
        align="center"
        no-gutters
        class="custom-ui-option"
      >
        <v-checkbox
          v-model="stickyValue"
          label="Sticky Value"
          hide-details
          dense
          class="mt-0 pt-0"
        />
        <v-tooltip
          open-delay="200"
          bottom
          max-width="280"
        >
          <template #activator="{ on, attrs }">
            <v-icon
              small
              color="grey"
              class="custom-ui-option__info ml-1"
              v-bind="attrs"
              v-on="on"
            >
              mdi-information-outline
            </v-icon>
          </template>
          <span>When empty on the current frame, show the last non-empty value from earlier keyframes.</span>
        </v-tooltip>
      </v-row>
      <v-expansion-panels
        v-if="stickyValue"
        class="mb-4"
      >
        <v-expansion-panel outlined>
          <v-expansion-panel-header>
            Inherited Value Indicator
          </v-expansion-panel-header>
          <v-expansion-panel-content>
            <p class="text-caption grey--text mb-3">
              Style applied when the displayed value is inherited from a previous keyframe.
            </p>
            <v-row dense>
              <v-col cols="12" sm="4">
                <v-checkbox
                  v-model="stickyIndicator.bold"
                  label="Bold"
                  hide-details
                  dense
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-checkbox
                  v-model="stickyIndicator.italic"
                  label="Italic"
                  hide-details
                  dense
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-checkbox
                  v-model="stickyIndicator.underline"
                  label="Underline"
                  hide-details
                  dense
                />
              </v-col>
            </v-row>
            <div class="d-flex align-center mt-2 mb-2">
              <v-checkbox
                v-model="highlightEnabled"
                label="Font Color"
                hide-details
                dense
                class="mt-0 pt-0 shrink"
              />
              <v-color-picker
                v-if="highlightEnabled"
                v-model="highlightColorValue"
                hide-inputs
                hide-mode-switch
                class="ml-2 highlight-color-picker"
              />
            </div>
            <v-select
              v-model="stickyIndicator.fontSizeScale"
              :items="fontSizeScaleOptions"
              item-text="text"
              item-value="value"
              label="Font Size"
              class="mb-2"
            />
            <v-slider
              v-model="stickyIndicator.opacity"
              label="Opacity"
              min="0.3"
              max="1"
              step="0.05"
              thumb-label
            />
          </v-expansion-panel-content>
        </v-expansion-panel>
      </v-expansion-panels>
      <v-expansion-panels class="mb-4">
        <v-expansion-panel outlined>
          <v-expansion-panel-header>
            Value Display
          </v-expansion-panel-header>
          <v-expansion-panel-content>
            <v-select
              v-model="valuePosition"
              :items="valuePositionOptions"
              item-text="text"
              item-value="value"
              label="Value Position"
              class="mb-4"
            />
            <v-select
              v-model="longValueMode"
              :items="longValueModeOptions"
              item-text="text"
              item-value="value"
              label="Long Value Display"
              class="mb-4"
            />
            <v-text-field
              v-model="emptyValueLabel"
              label="Empty Value Label"
              hide-details
              dense
              class="mt-0 pt-0"
            >
              <template #append>
                <v-tooltip
                  open-delay="200"
                  bottom
                  max-width="280"
                >
                  <template #activator="{ on, attrs }">
                    <v-icon
                      small
                      color="grey"
                      class="custom-ui-option__info"
                      v-bind="attrs"
                      v-on="on"
                    >
                      mdi-information-outline
                    </v-icon>
                  </template>
                  <span>Text shown when the attribute has no value. Leave blank to show nothing.</span>
                </v-tooltip>
              </template>
            </v-text-field>
          </v-expansion-panel-content>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>
    <v-row
      dense
      align="center"
      no-gutters
      class="custom-ui-option mb-4 pb-2"
    >
      <v-checkbox
        v-model="showDescription"
        label="Show Description"
        hide-details
        dense
        class="mt-0 pt-0"
      />
      <v-tooltip
        open-delay="200"
        bottom
        max-width="280"
      >
        <template #activator="{ on, attrs }">
          <v-icon
            small
            color="grey"
            class="custom-ui-option__info ml-1"
            v-bind="attrs"
            v-on="on"
          >
            mdi-information-outline
          </v-icon>
        </template>
        <span>Show the attribute description above the buttons in the Custom UI panel.</span>
      </v-tooltip>
    </v-row>
  </div>
</template>

<style scoped lang="scss">
.custom-ui-editor {
  .custom-ui-option {
    flex-wrap: nowrap;
  }

  .custom-ui-option__info {
    flex: 0 0 auto;
    cursor: help;
  }
}

.highlight-color-picker {
  max-width: 200px;
}
</style>
