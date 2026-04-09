<script lang="ts">
import {
  computed, defineComponent, PropType, ref, watch,
} from 'vue';
import {
  Attribute,
  MetadataLinkNumberConditions,
  MetadataLinkOptions,
  StringAttributeEditorOptions,
} from 'vue-media-annotator/use/AttributeTypes';
import { useHandler } from 'vue-media-annotator/provides';
import {
  addDiveMetadataKey,
  getMetadataFilterValues,
  modifyDiveMetadataPermission,
  updateDiveMetadataDisplay,
} from 'platform/web-girder/api/divemetadata.service';
import { AccessType, getFolder, getFolderAccess } from 'platform/web-girder/api/girder.service';
import { useGirderRest } from 'platform/web-girder/plugins/girder';

type KeysLoadState = 'idle' | 'loading' | 'ready' | 'error';

function metadataCategoryForAttribute(datatype: Attribute['datatype']): 'numerical' | 'search' | 'boolean' {
  if (datatype === 'number') return 'numerical';
  if (datatype === 'boolean') return 'boolean';
  return 'search';
}

function isLockedTextDetection(attr: Attribute, excludeKey: string): boolean {
  if (attr.belongs !== 'detection' || attr.datatype !== 'text') {
    return false;
  }
  if (excludeKey && attr.key === excludeKey) {
    return false;
  }
  const ed = attr.editor as StringAttributeEditorOptions | undefined;
  const editorLocked = ed?.type === 'locked';
  return !!(attr.lockedValues || editorLocked);
}

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
    datatype: {
      type: String as PropType<Attribute['datatype']>,
      required: true,
    },
    allAttributes: {
      type: Array as PropType<Attribute[]>,
      default: () => [],
    },
    currentAttributeKey: {
      type: String,
      default: '',
    },
  },
  setup(props, { emit }) {
    const { getDiveMetadataRootId } = useHandler();
    const girderRest = useGirderRest();
    /** Unlocked (editable) keys only — used for combobox suggestions. */
    const editableMetadataKeys = ref<string[]>([]);
    /** All keys defined on the metadata root (for unknown vs locked warnings). */
    const allMetadataKeys = ref<string[]>([]);
    const keysLoadState = ref<KeysLoadState>('idle');
    const isMetadataRootOwnerAdmin = ref(false);
    const makeKeyVisible = ref(false);
    const creatingOrUnlocking = ref(false);
    const operationError = ref('');

    const mergeEmit = (partial: Partial<MetadataLinkOptions>) => {
      const current = props.value || { key: '', updateValue: false };
      emit('input', {
        ...current,
        ...partial,
      });
    };

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

    const loadMetadataRootAdmin = async () => {
      const rootId = getDiveMetadataRootId();
      if (!rootId || !girderRest.user?._id) {
        isMetadataRootOwnerAdmin.value = false;
        return;
      }
      let ownerAdmin = false;
      try {
        const folder = (await getFolder(rootId)).data;
        try {
          const access = (await getFolderAccess(rootId)).data;
          const accessMap: Record<string, AccessType> = {};
          access.users.forEach((item) => {
            accessMap[item.id] = item;
          });
          if (accessMap[girderRest.user._id] && accessMap[girderRest.user._id].level === 2) {
            ownerAdmin = true;
          }
        } catch {
          // Access list unavailable; rely on creator/admin below.
        }
        if (folder.creatorId === girderRest.user._id || girderRest.user.admin) {
          ownerAdmin = true;
        }
        isMetadataRootOwnerAdmin.value = ownerAdmin;
      } catch {
        isMetadataRootOwnerAdmin.value = false;
      }
    };

    watch(
      () => getDiveMetadataRootId(),
      () => {
        operationError.value = '';
        loadKnownKeys();
        loadMetadataRootAdmin();
      },
      { immediate: true },
    );

    const isMetadataConnected = computed(() => !!getDiveMetadataRootId());

    const updateValueModel = computed({
      get: () => props.value?.updateValue || false,
      set: (newVal: boolean) => {
        mergeEmit({ updateValue: newVal });
      },
    });

    const metadataKeyModel = computed({
      get: () => props.value?.key || '',
      set: (newVal: string | null) => {
        const key = newVal != null ? String(newVal) : '';
        mergeEmit({ key });
      },
    });

    const useDynamicKeyModel = computed({
      get: () => !!props.value?.useDynamicKeyFromAttribute,
      set: (enabled: boolean) => {
        if (!enabled) {
          mergeEmit({ useDynamicKeyFromAttribute: false });
          return;
        }
        mergeEmit({ useDynamicKeyFromAttribute: true });
      },
    });

    const dynamicKeyAttributeKeyModel = computed({
      get: () => props.value?.dynamicKeyAttributeKey || '',
      set: (newVal: string | null) => {
        mergeEmit({
          dynamicKeyAttributeKey: newVal != null ? String(newVal) : '',
        });
      },
    });

    const dynamicKeyPickerItems = computed(() => props.allAttributes
      .filter((a) => isLockedTextDetection(a, props.currentAttributeKey))
      .map((a) => ({
        text: a.displayText || a.name,
        value: a.key,
      })));

    const selectedDynamicKeySource = computed((): Attribute | null => {
      const k = props.value?.dynamicKeyAttributeKey;
      if (!k) {
        return null;
      }
      return props.allAttributes.find((a) => a.key === k) || null;
    });

    const uniqueCandidateMetadataKeys = computed(() => {
      const vals = selectedDynamicKeySource.value?.values;
      if (!vals?.length) {
        return [] as string[];
      }
      const seen = new Set<string>();
      const out: string[] = [];
      vals.forEach((v) => {
        const t = String(v).trim();
        if (t && !seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      });
      out.sort((a, b) => a.localeCompare(b));
      return out;
    });

    const dynamicUnknownKeys = computed(() => {
      if (keysLoadState.value !== 'ready') {
        return [] as string[];
      }
      return uniqueCandidateMetadataKeys.value.filter(
        (k) => !allMetadataKeys.value.includes(k),
      );
    });

    const dynamicLockedKeys = computed(() => {
      if (keysLoadState.value !== 'ready') {
        return [] as string[];
      }
      return uniqueCandidateMetadataKeys.value.filter(
        (k) => allMetadataKeys.value.includes(k) && !editableMetadataKeys.value.includes(k),
      );
    });

    const showMetadataLinkFields = computed(
      () => props.belongs === 'detection' && updateValueModel.value,
    );

    const showDynamicCreateSection = computed(() => {
      if (!showMetadataLinkFields.value || !isMetadataConnected.value) return false;
      if (!isMetadataRootOwnerAdmin.value) return false;
      if (keysLoadState.value !== 'ready') return false;
      if (!props.value?.useDynamicKeyFromAttribute) return false;
      if (!selectedDynamicKeySource.value) return false;
      if (!uniqueCandidateMetadataKeys.value.length) return false;
      return dynamicUnknownKeys.value.length > 0 || dynamicLockedKeys.value.length > 0;
    });

    const showConditionalSection = computed(
      () => showMetadataLinkFields.value
        && (props.datatype === 'number' || props.datatype === 'text'),
    );

    const useConditionalsModel = computed({
      get: () => props.value?.useConditionals || false,
      set: (enabled: boolean) => {
        if (!enabled) {
          mergeEmit({ useConditionals: false });
          return;
        }
        const next: Partial<MetadataLinkOptions> = { useConditionals: true };
        if (props.datatype === 'number' && !props.value?.numberConditions) {
          next.numberConditions = { mode: 'greater_than', threshold: 0 };
        }
        if (props.datatype === 'text' && !props.value?.stringConditions) {
          next.stringConditions = { mode: 'contains', substring: '' };
        }
        mergeEmit(next);
      },
    });

    const numberModeItems: { text: string; value: MetadataLinkNumberConditions['mode'] }[] = [
      { text: 'Less than current metadata value', value: 'min' },
      { text: 'Greater than current metadata value', value: 'max' },
      { text: 'Greater than threshold', value: 'greater_than' },
      { text: 'Less than threshold', value: 'less_than' },
    ];

    const numberModeModel = computed({
      get: () => props.value?.numberConditions?.mode ?? 'greater_than',
      set: (mode: MetadataLinkNumberConditions['mode']) => {
        mergeEmit({
          numberConditions: {
            ...props.value?.numberConditions,
            mode,
          },
        });
      },
    });

    const numberThresholdModel = computed({
      get: () => props.value?.numberConditions?.threshold ?? 0,
      set: (threshold: number) => {
        mergeEmit({
          numberConditions: {
            ...props.value?.numberConditions,
            mode: props.value?.numberConditions?.mode ?? 'greater_than',
            threshold,
          },
        });
      },
    });

    const stringContainsModel = computed({
      get: () => props.value?.stringConditions?.substring ?? '',
      set: (substring: string) => {
        mergeEmit({
          stringConditions: {
            mode: 'contains',
            substring,
          },
        });
      },
    });

    const showNumberThreshold = computed(() => {
      const m = props.value?.numberConditions?.mode;
      return m === 'greater_than' || m === 'less_than';
    });

    const trimmedMetadataKey = computed(() => (props.value?.key || '').trim());

    const showUnlinkedWarning = computed(
      () => showMetadataLinkFields.value && !isMetadataConnected.value,
    );

    const showUnknownKeyWarning = computed(() => {
      if (props.value?.useDynamicKeyFromAttribute) {
        return false;
      }
      if (!showMetadataLinkFields.value || !isMetadataConnected.value) {
        return false;
      }
      if (keysLoadState.value !== 'ready' || !trimmedMetadataKey.value) {
        return false;
      }
      return !allMetadataKeys.value.includes(trimmedMetadataKey.value);
    });

    const showLockedKeyWarning = computed(() => {
      if (props.value?.useDynamicKeyFromAttribute) {
        return false;
      }
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

    const isUnknownMetadataKey = computed(() => {
      const k = trimmedMetadataKey.value;
      if (!k || keysLoadState.value !== 'ready') return false;
      return !allMetadataKeys.value.includes(k);
    });

    const showCreateOrUnlockButton = computed(() => {
      if (props.value?.useDynamicKeyFromAttribute) return false;
      if (!showMetadataLinkFields.value || !isMetadataConnected.value) return false;
      if (!isMetadataRootOwnerAdmin.value) return false;
      if (keysLoadState.value !== 'ready') return false;
      const k = trimmedMetadataKey.value;
      if (!k) return false;
      const unknown = !allMetadataKeys.value.includes(k);
      const locked = allMetadataKeys.value.includes(k) && !editableMetadataKeys.value.includes(k);
      return unknown || locked;
    });

    const fixMetadataKey = async () => {
      const rootId = getDiveMetadataRootId();
      const key = trimmedMetadataKey.value;
      if (!rootId || !key) return;
      const keyWasMissing = isUnknownMetadataKey.value;
      operationError.value = '';
      creatingOrUnlocking.value = true;
      try {
        if (keyWasMissing) {
          await addDiveMetadataKey(
            rootId,
            key,
            metadataCategoryForAttribute(props.datatype),
            true,
            [],
          );
        } else {
          await modifyDiveMetadataPermission(rootId, key, true);
        }
        if (makeKeyVisible.value) {
          await updateDiveMetadataDisplay(rootId, key, 'display');
        }
        await loadKnownKeys();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        operationError.value = err?.response?.data?.message || String(err);
      } finally {
        creatingOrUnlocking.value = false;
      }
    };

    const fixAllDynamicMetadataKeys = async () => {
      const rootId = getDiveMetadataRootId();
      const keys = uniqueCandidateMetadataKeys.value;
      if (!rootId || !keys.length) return;
      operationError.value = '';
      creatingOrUnlocking.value = true;
      const cat = metadataCategoryForAttribute(props.datatype);
      try {
        await keys.reduce<Promise<void>>(async (prev, key) => {
          await prev;
          const unknown = !allMetadataKeys.value.includes(key);
          const locked = allMetadataKeys.value.includes(key)
            && !editableMetadataKeys.value.includes(key);
          if (unknown) {
            await addDiveMetadataKey(rootId, key, cat, true, []);
          } else if (locked) {
            await modifyDiveMetadataPermission(rootId, key, true);
          }
          if (makeKeyVisible.value) {
            await updateDiveMetadataDisplay(rootId, key, 'display');
          }
        }, Promise.resolve());
        await loadKnownKeys();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        operationError.value = err?.response?.data?.message || String(err);
      } finally {
        creatingOrUnlocking.value = false;
      }
    };

    watch(
      () => [props.value?.key, props.value?.dynamicKeyAttributeKey],
      () => {
        operationError.value = '';
      },
    );

    return {
      updateValueModel,
      metadataKeyModel,
      useDynamicKeyModel,
      dynamicKeyAttributeKeyModel,
      dynamicKeyPickerItems,
      selectedDynamicKeySource,
      uniqueCandidateMetadataKeys,
      dynamicUnknownKeys,
      dynamicLockedKeys,
      showDynamicCreateSection,
      showMetadataLinkFields,
      showUnlinkedWarning,
      showUnknownKeyWarning,
      showLockedKeyWarning,
      comboboxItems,
      keysLoadState,
      isMetadataConnected,
      showConditionalSection,
      useConditionalsModel,
      numberModeItems,
      numberModeModel,
      numberThresholdModel,
      stringContainsModel,
      showNumberThreshold,
      showCreateOrUnlockButton,
      isUnknownMetadataKey,
      makeKeyVisible,
      creatingOrUnlocking,
      operationError,
      fixMetadataKey,
      fixAllDynamicMetadataKeys,
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
      <v-switch
        v-model="useDynamicKeyModel"
        dense
        class="mt-2"
        label="Use another detection attribute's value as the DIVEMetadata key name"
      />
      <template v-if="useDynamicKeyModel">
        <v-alert
          type="info"
          dense
          outlined
          class="mt-2 mb-0"
        >
          Only <strong>text</strong> detection attributes with <strong>locked predefined values</strong> are listed. Each predefined value should be the exact name of a DIVEMetadata field to update.
        </v-alert>
        <v-select
          v-model="dynamicKeyAttributeKeyModel"
          class="mt-3"
          :items="dynamicKeyPickerItems"
          item-text="text"
          item-value="value"
          label="Key source attribute"
          hint="The current value of this attribute on the detection picks which metadata field receives updates."
          persistent-hint
          outlined
          dense
          clearable
          hide-details="auto"
        />
        <v-alert
          v-if="useDynamicKeyModel && !dynamicKeyPickerItems.length"
          type="warning"
          dense
          class="mt-2"
        >
          No qualifying attributes found. Add another detection attribute that is text with locked values, or turn off this option and enter a fixed key.
        </v-alert>
        <v-alert
          v-else-if="useDynamicKeyModel && !dynamicKeyAttributeKeyModel"
          type="info"
          dense
          class="mt-2"
        >
          Select which attribute supplies the metadata key name.
        </v-alert>
        <v-alert
          v-else-if="selectedDynamicKeySource && !uniqueCandidateMetadataKeys.length"
          type="warning"
          dense
          class="mt-2"
        >
          The selected attribute has no predefined values. Add values to that attribute so each can name a metadata key.
        </v-alert>
        <v-alert
          v-if="dynamicUnknownKeys.length"
          type="warning"
          dense
          class="mt-2"
        >
          These metadata keys are not in the linked DIVEMetadata yet:
          <code>{{ dynamicUnknownKeys.join(', ') }}</code>
        </v-alert>
        <v-alert
          v-if="dynamicLockedKeys.length"
          type="warning"
          dense
          class="mt-2"
        >
          These keys exist but are not editable:
          <code>{{ dynamicLockedKeys.join(', ') }}</code>
        </v-alert>
        <div
          v-if="showDynamicCreateSection"
          class="mt-3"
        >
          <v-switch
            v-model="makeKeyVisible"
            dense
            hide-details
            class="mt-0 pt-0"
            label="Add keys to default visible columns"
          />
          <v-btn
            color="primary"
            small
            class="mt-1"
            :loading="creatingOrUnlocking"
            @click="fixAllDynamicMetadataKeys"
          >
            Create missing keys and unlock
          </v-btn>
          <v-alert
            v-if="operationError"
            type="error"
            dense
            class="mt-2 mb-0"
          >
            {{ operationError }}
          </v-alert>
        </div>
      </template>
      <template v-else>
        <v-combobox
          v-model="metadataKeyModel"
          class="mt-2"
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
        <div
          v-if="showCreateOrUnlockButton"
          class="mt-3"
        >
          <v-switch
            v-model="makeKeyVisible"
            dense
            hide-details
            class="mt-0 pt-0"
            label="Add key to default visible columns"
          />
          <v-btn
            color="primary"
            small
            class="mt-1"
            :loading="creatingOrUnlocking"
            @click="fixMetadataKey"
          >
            {{ isUnknownMetadataKey ? 'Create key and unlock' : 'Unlock key' }}
          </v-btn>
          <v-alert
            v-if="operationError"
            type="error"
            dense
            class="mt-2 mb-0"
          >
            {{ operationError }}
          </v-alert>
        </div>
      </template>
      <v-alert
        v-if="keysLoadState === 'error' && isMetadataConnected"
        type="info"
        dense
        class="mt-2"
      >
        Could not load metadata keys for the linked root. You can still enter a key name manually but make sure it is unlocked and available in the MetadataRoot as an editable key.
      </v-alert>

      <template v-if="showConditionalSection">
        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">
          Conditional updates
        </div>
        <v-switch
          v-model="useConditionalsModel"
          dense
          label="Only update metadata when conditions are met"
        />
        <v-alert
          v-if="!useConditionalsModel"
          type="info"
          dense
          outlined
          class="mb-0"
        >
          The linked metadata key is updated on every change to this attribute.
        </v-alert>
        <template v-else>
          <template v-if="datatype === 'number'">
            <v-select
              v-model="numberModeModel"
              :items="numberModeItems"
              item-text="text"
              item-value="value"
              label="When to update"
              outlined
              dense
              hide-details="auto"
              class="mb-2"
            />
            <v-alert
              v-if="numberModeModel === 'min'"
              type="info"
              dense
              outlined
              class="mb-2"
            >
              Updates only when the new attribute value is <strong>less than</strong> the value currently stored in the linked metadata key for this dataset. If the key has no numeric value yet, the next change is written.
            </v-alert>
            <v-alert
              v-if="numberModeModel === 'max'"
              type="info"
              dense
              outlined
              class="mb-2"
            >
              Updates only when the new attribute value is <strong>greater than</strong> the value currently stored in the linked metadata key for this dataset. If the key has no numeric value yet, the next change is written.
            </v-alert>
            <v-text-field
              v-if="showNumberThreshold"
              v-model.number="numberThresholdModel"
              type="number"
              label="Threshold"
              :hint="numberModeModel === 'greater_than'
                ? 'Update runs when the value is greater than this number.'
                : 'Update runs when the value is less than this number.'"
              persistent-hint
              outlined
              dense
            />
          </template>
          <template v-else-if="datatype === 'text'">
            <v-text-field
              v-model="stringContainsModel"
              label="Contains"
              hint="Update runs only when the attribute text includes this substring."
              persistent-hint
              outlined
              dense
            />
          </template>
        </template>
      </template>
      <v-alert
        v-else-if="showMetadataLinkFields && datatype === 'boolean'"
        type="info"
        dense
        outlined
        class="mt-4 mb-0"
      >
        Boolean attributes always push every value change to the linked metadata key (no conditional rules).
      </v-alert>
    </template>
  </div>
</template>
