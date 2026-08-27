<script lang="ts">
import {
  defineComponent, PropType, ref, watch,
} from 'vue';
import { AttributeCustomUI } from 'vue-media-annotator/use/AttributeTypes';

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
    const valuePosition = ref(props.value.valuePosition ?? 'below');
    const longValueMode = ref(props.value.longValueMode ?? 'expand');
    const emptyValueLabel = ref(props.value.emptyValueLabel ?? '');
    const showDescription = ref(props.value.showDescription ?? true);

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

    const emitValue = () => {
      emit('input', {
        enabled: enabled.value,
        showWithoutButtons: showWithoutButtons.value,
        displayValue: displayValue.value,
        valuePosition: valuePosition.value,
        longValueMode: longValueMode.value,
        emptyValueLabel: emptyValueLabel.value || undefined,
        showDescription: showDescription.value,
      });
    };

    watch(
      () => props.value,
      (newValue) => {
        enabled.value = newValue.enabled ?? true;
        showWithoutButtons.value = newValue.showWithoutButtons ?? false;
        displayValue.value = newValue.displayValue ?? false;
        valuePosition.value = newValue.valuePosition ?? 'below';
        longValueMode.value = newValue.longValueMode ?? 'expand';
        emptyValueLabel.value = newValue.emptyValueLabel ?? '';
        showDescription.value = newValue.showDescription ?? true;
      },
      { deep: true },
    );

    watch(
      [enabled, showWithoutButtons, displayValue, valuePosition, longValueMode, emptyValueLabel, showDescription],
      emitValue,
    );

    return {
      enabled,
      showWithoutButtons,
      displayValue,
      valuePosition,
      longValueMode,
      emptyValueLabel,
      showDescription,
      valuePositionOptions,
      longValueModeOptions,
    };
  },
});
</script>

<template>
  <div>
    <v-switch
      v-model="enabled"
      label="Show in Custom UI"
      hint="When disabled, this attribute is hidden from the Custom UI panel."
      persistent-hint
      class="mb-4"
    />
    <v-switch
      v-model="showWithoutButtons"
      label="Show Without Buttons"
      hint="Display this attribute in Custom UI even when it has no button shortcuts."
      persistent-hint
      class="mb-4"
    />
    <v-switch
      v-model="displayValue"
      label="Display Value"
      hint="Show the current attribute value in the Custom UI panel."
      persistent-hint
      class="mb-4"
    />
    <v-select
      v-model="valuePosition"
      :items="valuePositionOptions"
      item-text="text"
      item-value="value"
      label="Value Position"
      :disabled="!displayValue"
      class="mb-4"
    />
    <v-select
      v-model="longValueMode"
      :items="longValueModeOptions"
      item-text="text"
      item-value="value"
      label="Long Value Display"
      :disabled="!displayValue"
      class="mb-4"
    />
    <v-text-field
      v-model="emptyValueLabel"
      label="Empty Value Label"
      hint="Text shown when the attribute has no value. Leave blank to show nothing."
      persistent-hint
      :disabled="!displayValue"
      class="mb-4"
    />
    <v-switch
      v-model="showDescription"
      label="Show Description"
      hint="Show the attribute description above the buttons in the Custom UI panel."
      persistent-hint
      class="mb-6 pb-4"
    />
  </div>
</template>
