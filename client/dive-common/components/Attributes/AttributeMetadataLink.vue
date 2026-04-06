<script lang="ts">
import {
  computed, defineComponent, PropType, ref, watch,
} from 'vue';
import { Attribute, MetadataLinkOptions } from 'vue-media-annotator/use/AttributeTypes';
import { useHandler } from 'vue-media-annotator/provides';
import { getMetadataFilterValues } from 'platform/web-girder/api/divemetadata.service';

type KeysLoadState = 'idle' | 'loading' | 'ready' | 'error';

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
    const { getDiveMetadataRootId } = useHandler();
    /** Unlocked (editable) keys only — used for combobox suggestions. */
    const editableMetadataKeys = ref<string[]>([]);
    /** All keys defined on the metadata root (for unknown vs locked warnings). */
    const allMetadataKeys = ref<string[]>([]);
    const keysLoadState = ref<KeysLoadState>('idle');

    const loadKnownKeys = async () => {
      const rootId = getDiveMetadataRootId();
      if (!rootId) {
        editableMetadataKeys.value = [];
        allMetadataKeys.value = [];
        keysLoadState.value = 'idle';
        return;
      }
      keysLoadState.value = 'loading';
      try {
        const { data } = await getMetadataFilterValues(rootId);
        const metadataKeys = data.metadataKeys || {};
        const unlocked = data.unlocked || [];
        const editable = unlocked.filter((k) => metadataKeys[k]);
        editable.sort((a, b) => a.localeCompare(b));
        editableMetadataKeys.value = editable;
        const allKeys = Object.keys(metadataKeys);
        allKeys.sort((a, b) => a.localeCompare(b));
        allMetadataKeys.value = allKeys;
        keysLoadState.value = 'ready';
      } catch {
        editableMetadataKeys.value = [];
        allMetadataKeys.value = [];
        keysLoadState.value = 'error';
      }
    };

    watch(
      () => getDiveMetadataRootId(),
      () => {
        loadKnownKeys();
      },
      { immediate: true },
    );

    const isMetadataConnected = computed(() => !!getDiveMetadataRootId());

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
      set: (newVal: string | null) => {
        const key = newVal != null ? String(newVal) : '';
        emit('input', {
          key,
          updateValue: props.value?.updateValue || false,
        });
      },
    });

    const showMetadataLinkFields = computed(
      () => props.belongs === 'detection' && updateValueModel.value,
    );

    const trimmedMetadataKey = computed(() => (props.value?.key || '').trim());

    const showUnlinkedWarning = computed(
      () => showMetadataLinkFields.value && !isMetadataConnected.value,
    );

    const showUnknownKeyWarning = computed(() => {
      if (!showMetadataLinkFields.value || !isMetadataConnected.value) {
        return false;
      }
      if (keysLoadState.value !== 'ready' || !trimmedMetadataKey.value) {
        return false;
      }
      return !allMetadataKeys.value.includes(trimmedMetadataKey.value);
    });

    const showLockedKeyWarning = computed(() => {
      if (!showMetadataLinkFields.value || !isMetadataConnected.value) {
        return false;
      }
      if (keysLoadState.value !== 'ready' || !trimmedMetadataKey.value) {
        return false;
      }
      const k = trimmedMetadataKey.value;
      return allMetadataKeys.value.includes(k) && !editableMetadataKeys.value.includes(k);
    });

    const comboboxItems = computed(() => (
      isMetadataConnected.value ? editableMetadataKeys.value : []
    ));

    return {
      updateValueModel,
      metadataKeyModel,
      showMetadataLinkFields,
      showUnlinkedWarning,
      showUnknownKeyWarning,
      showLockedKeyWarning,
      comboboxItems,
      keysLoadState,
      isMetadataConnected,
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
    <template v-if="showMetadataLinkFields">
      <v-alert
        v-if="showUnlinkedWarning"
        type="warning"
        dense
        class="mb-2"
      >
        No DIVEMetadata link in this session — key suggestions would appear here if the viewer were opened with a metadata root (for example <code>diveMetadataRootId</code> in the URL).
      </v-alert>
      <v-combobox
        v-model="metadataKeyModel"
        :items="comboboxItems"
        label="DIVEMetadata key name"
        hint="Suggestions list editable (unlocked) keys only; you can still type another key name."
        persistent-hint
        outlined
        dense
        clearable
        hide-no-data
      />
      <v-alert
        v-if="showUnknownKeyWarning"
        type="warning"
        dense
        class="mt-2"
      >
        This key is not present in the linked DIVEMetadata yet. Create it in DIVEMetadata before relying on updates to succeed.
      </v-alert>
      <v-alert
        v-if="showLockedKeyWarning"
        type="warning"
        dense
        class="mt-2"
      >
        This key exists in DIVEMetadata but is not editable (locked). Ask a metadata owner to unlock it or choose an unlocked key.
      </v-alert>
      <v-alert
        v-if="keysLoadState === 'error' && isMetadataConnected"
        type="info"
        dense
        class="mt-2"
      >
        Could not load metadata keys for the linked root. You can still enter a key name manually but make sure it is unlocked and available in the MetadataRoot as an editable key.
      </v-alert>
    </template>
  </div>
</template>
