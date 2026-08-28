<script lang="ts">
import {
  computed, defineComponent, PropType, ref, watch, nextTick,
} from 'vue';
import { AttributeCustomUI, AttributeCustomUIStickyIndicator, Attribute } from 'vue-media-annotator/use/AttributeTypes';
import { createGetAttributeValueColor } from 'vue-media-annotator/use/attributeValueColor';
import { useTrackStyleManager } from 'vue-media-annotator/provides';

const defaultStickyIndicator = (): AttributeCustomUIStickyIndicator => ({
  bold: true,
  italic: false,
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
  valuePrepend: string,
  valueAppend: string,
  showHeader: boolean,
  valueFontSizeScale: number,
  valueAlign: AttributeCustomUI['valueAlign'],
  valueColor: string | undefined,
  showDescription: boolean,
): AttributeCustomUI {
  const payload: AttributeCustomUI = {
    enabled,
    showWithoutButtons,
    displayValue,
    showHeader,
    showDescription,
  };
  if (displayValue) {
    payload.stickyValue = stickyValue;
    payload.valuePosition = valuePosition;
    payload.longValueMode = longValueMode;
    payload.emptyValueLabel = emptyValueLabel || undefined;
    payload.valuePrepend = valuePrepend || undefined;
    payload.valueAppend = valueAppend || undefined;
    if (valueFontSizeScale !== 1) {
      payload.valueFontSizeScale = valueFontSizeScale;
    }
    if (valueAlign && valueAlign !== 'left') {
      payload.valueAlign = valueAlign;
    }
    if (valueColor) {
      payload.valueColor = valueColor;
    }
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
    attribute: {
      type: Object as PropType<Attribute>,
      default: undefined,
    },
  },
  setup(props, { emit }) {
    const getAttributeValueColor = createGetAttributeValueColor(useTrackStyleManager());
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
    const valuePrepend = ref(props.value.valuePrepend ?? '');
    const valueAppend = ref(props.value.valueAppend ?? '');
    const showHeader = ref(props.value.showHeader ?? true);
    const valueFontSizeScale = ref(props.value.valueFontSizeScale ?? 1);
    const valueAlign = ref(props.value.valueAlign ?? 'left');
    const valueColor = ref<string | undefined>(props.value.valueColor);
    const valueColorCustom = ref(
      props.value.valueColor && props.value.valueColor !== 'auto'
        ? props.value.valueColor
        : '#FFFFFF',
    );
    const editingValueColor = ref(false);
    const editingHighlightColor = ref(false);
    const showDescription = ref(props.value.showDescription ?? true);
    let syncingFromProps = false;

    const valuePositionOptions = [
      { text: 'Below buttons', value: 'below' },
      { text: 'Above buttons', value: 'above' },
      { text: 'Below title', value: 'header' },
    ];

    const longValueModeOptions = [
      { text: 'Expand (panel for long values)', value: 'expand' },
      { text: 'Truncate', value: 'truncate' },
      { text: 'Scroll', value: 'scroll' },
    ];

    const valueAlignOptions = [
      { text: 'Left', value: 'left' },
      { text: 'Center', value: 'center' },
      { text: 'Right', value: 'right' },
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
        valuePrepend.value,
        valueAppend.value,
        showHeader.value,
        valueFontSizeScale.value,
        valueAlign.value,
        valueColor.value,
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
        valuePrepend.value = newValue.valuePrepend ?? '';
        valueAppend.value = newValue.valueAppend ?? '';
        showHeader.value = newValue.showHeader ?? true;
        valueFontSizeScale.value = newValue.valueFontSizeScale ?? 1;
        valueAlign.value = newValue.valueAlign ?? 'left';
        valueColor.value = newValue.valueColor;
        valueColorCustom.value = newValue.valueColor && newValue.valueColor !== 'auto'
          ? newValue.valueColor
          : '#FFFFFF';
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
        valuePrepend,
        valueAppend,
        showHeader,
        valueFontSizeScale,
        valueAlign,
        valueColor,
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

    const valueColorEnabled = computed({
      get: () => valueColor.value !== undefined,
      set: (enabled: boolean) => {
        if (!enabled) {
          valueColor.value = undefined;
          return;
        }
        valueColor.value = valueColor.value || 'auto';
      },
    });

    const valueColorAuto = computed({
      get: () => valueColor.value === 'auto',
      set: (auto: boolean) => {
        if (auto) {
          valueColor.value = 'auto';
          return;
        }
        valueColor.value = valueColorCustom.value;
      },
    });

    const computedValueColorPreview = computed(() => {
      if (!valueColor.value) {
        return '#FFFFFF';
      }
      if (valueColor.value === 'auto') {
        if (props.attribute) {
          return getAttributeValueColor(props.attribute);
        }
        return '#FFFFFF';
      }
      return valueColor.value;
    });

    watch(valueColorCustom, (color) => {
      if (valueColor.value !== undefined && valueColor.value !== 'auto') {
        valueColor.value = color;
      }
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
      valuePrepend,
      valueAppend,
      showHeader,
      valueFontSizeScale,
      valueAlign,
      valueColor,
      valueColorEnabled,
      valueColorAuto,
      valueColorCustom,
      editingValueColor,
      editingHighlightColor,
      computedValueColorPreview,
      showDescription,
      valuePositionOptions,
      longValueModeOptions,
      valueAlignOptions,
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
      <v-checkbox
        v-model="showWithoutButtons"
        label="Show Without Buttons"
        hide-details
        dense
        class="mt-0 pt-0 ml-4"
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
            <v-row
              dense
              align="center"
              class="mt-2 mb-2"
            >
              <v-col cols="auto" class="py-0">
                <v-checkbox
                  v-model="highlightEnabled"
                  label="Font Color"
                  hide-details
                  dense
                  class="mt-0 pt-0"
                />
              </v-col>
              <v-col
                v-if="highlightEnabled"
                cols="auto"
                class="py-0"
              >
                <div
                  class="value-color-box edit-color-box"
                  :style="{ backgroundColor: highlightColorValue }"
                  @click="editingHighlightColor = true"
                />
              </v-col>
            </v-row>
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
              v-model.number="valueFontSizeScale"
              label="Font Size Multiplier"
              type="number"
              min="0.5"
              max="3"
              step="0.05"
              hint="Multiplier for the displayed value size. 1 is the default."
              persistent-hint
              class="mb-4"
            />
            <v-select
              v-model="valueAlign"
              :items="valueAlignOptions"
              item-text="text"
              item-value="value"
              label="Value Alignment"
              class="mb-4"
            />
            <v-row
              dense
              align="center"
              class="mb-4"
            >
              <v-col cols="auto" class="py-0">
                <v-checkbox
                  v-model="valueColorEnabled"
                  label="Value Color"
                  hide-details
                  dense
                  class="mt-0 pt-0"
                />
              </v-col>
              <template v-if="valueColorEnabled">
                <v-col cols="auto" class="py-0">
                  <v-switch
                    v-model="valueColorAuto"
                    label="Attribute Value Color"
                    hide-details
                    dense
                    class="mt-0 pt-0"
                  />
                </v-col>
                <v-col
                  v-if="valueColorAuto"
                  cols="auto"
                  class="py-0"
                >
                  <div
                    class="value-color-box"
                    :style="{ backgroundColor: computedValueColorPreview }"
                  />
                </v-col>
                <v-col
                  v-if="!valueColorAuto"
                  cols="auto"
                  class="py-0"
                >
                  <div
                    class="value-color-box edit-color-box"
                    :style="{ backgroundColor: computedValueColorPreview }"
                    @click="editingValueColor = true"
                  />
                </v-col>
              </template>
            </v-row>
            <v-text-field
              v-model="valuePrepend"
              label="Value Prepend Text"
              hint="Text shown before the attribute value."
              persistent-hint
              class="mb-4"
            />
            <v-text-field
              v-model="valueAppend"
              label="Value Append Text"
              hint="Text shown after the attribute value."
              persistent-hint
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
    <v-expansion-panels class="mb-4">
      <v-expansion-panel outlined>
        <v-expansion-panel-header>
          Header
        </v-expansion-panel-header>
        <v-expansion-panel-content>
          <v-row
            dense
            align="center"
            no-gutters
            class="custom-ui-option"
          >
            <v-checkbox
              v-model="showHeader"
              label="Show Header"
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
              <span>Show the attribute name as a heading in the Custom UI panel.</span>
            </v-tooltip>
          </v-row>
          <v-row
            dense
            align="center"
            no-gutters
            class="custom-ui-option"
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
        </v-expansion-panel-content>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-dialog
      v-model="editingValueColor"
      max-width="300"
    >
      <v-card>
        <v-card-title>
          Edit Value Color
        </v-card-title>
        <v-card-text>
          <v-color-picker
            v-model="valueColorCustom"
            hide-inputs
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="editingValueColor = false"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog
      v-model="editingHighlightColor"
      max-width="300"
    >
      <v-card>
        <v-card-title>
          Edit Inherited Font Color
        </v-card-title>
        <v-card-text>
          <v-color-picker
            v-model="highlightColorValue"
            hide-inputs
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="editingHighlightColor = false"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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

.value-color-box {
  display: inline-block;
  min-width: 36px;
  max-width: 36px;
  min-height: 36px;
  max-height: 36px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.edit-color-box:hover {
  cursor: pointer;
  border: 2px solid white;
}
</style>
