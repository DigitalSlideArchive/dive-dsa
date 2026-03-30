<script lang="ts">
import {
  computed, defineComponent, PropType,
} from 'vue';
import { Attribute, MetadataLinkOptions } from 'vue-media-annotator/use/AttributeTypes';

export default defineComponent({
  name: 'AttributeMetadataLink',
  props: {
    value: {
      type: Object as PropType<MetadataLinkOptions>,
      default: () => ({
        key: '',
        updateValue: false,
      }),
    },
    belongs: {
      type: String as PropType<Attribute['belongs']>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const updateValueModel = computed({
      get: () => props.value?.updateValue || false,
      set: (newVal: boolean) => {
        emit('input', {
          key: props.value?.key || '',
          updateValue: newVal,
        });
      },
    });

    const metadataKeyModel = computed({
      get: () => props.value?.key || '',
      set: (newVal: string) => {
        emit('input', {
          key: newVal,
          updateValue: props.value?.updateValue || false,
        });
      },
    });

    return {
      updateValueModel,
      metadataKeyModel,
    };
  },
});
</script>

<template>
  <div class="pb-4">
    <v-alert
      v-if="belongs !== 'detection'"
      type="info"
      dense
    >
      Metadata links are only applied for Detection attributes.
    </v-alert>
    <v-switch
      v-model="updateValueModel"
      :disabled="belongs !== 'detection'"
      label="Update linked DIVEMetadata key when this attribute changes"
    />
    <v-text-field
      v-model="metadataKeyModel"
      :disabled="belongs !== 'detection' || !updateValueModel"
      label="Metadata key name"
      hint="The key to update in the linked DIVEMetadata item."
      persistent-hint
    />
  </div>
</template>
