<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, ref, Ref,
} from 'vue';
import draggable from 'vuedraggable';
import {
  DIVEAction, DIVEActionShortcut, TrackSelectAction, getCreateTrackAfterSelectionLabel,
} from 'dive-common/use/useActions';
import { ButtonShortcut } from 'vue-media-annotator/use/AttributeTypes';
import {
  useAttributes, useConfiguration, useTrackStyleManager,
} from 'vue-media-annotator/provides';
import ActionEditor from './ActionEditor.vue';
import GetShortcut from './GetShortcut.vue';
import TrackFilter from './TrackFilter.vue';
import ButtonShortcutEditor from '../CustomUI/ButtonShortcutEditor.vue';

export default defineComponent({
  name: 'ActionShortcuts',
  components: {
    TrackFilter,
    GetShortcut,
    ActionEditor,
    ButtonShortcutEditor,
    draggable,
  },
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const configMan = useConfiguration();
    const shortcutList: Ref<DIVEActionShortcut[]> = ref([]);

    const updateShortCutList = () => {
      if (configMan.configuration.value?.shortcuts) {
        const tempList: DIVEActionShortcut[] = [];
        configMan.configuration.value.shortcuts.forEach((item) => {
          tempList.push(item);
        });
        shortcutList.value = tempList;
      } else {
        shortcutList.value = [];
      }
    };
    updateShortCutList();
    const generalDialog = ref(false);
    const addEditShortcut = ref(false);
    const addEditShortcutIndex = ref(0);
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const attributesList = useAttributes();
    const editingShortcut: Ref<null | DIVEActionShortcut> = ref(null);
    const addEditActionType: Ref<'TrackSelection' | 'GoToFrame' | 'CreateTrackAction' | 'CreateFullFrameTrackAction' | 'Metadata'> = ref('TrackSelection');
    const actionList: Ref<DIVEAction[]> = ref([]);
    const updateActionList = () => {
      actionList.value = editingShortcut.value?.actions || [];
    };

    const getShortcutDisplay = (item: DIVEActionShortcut) => {
      const { key, modifiers } = item.shortcut;
      if (!key) {
        return '';
      }
      if (modifiers?.length) {
        return `${key}+${modifiers.join('+')}`;
      }
      return key;
    };

    const hasKeyboardShortcut = (item: DIVEActionShortcut) => !!(item.shortcut.key && item.shortcut.key.length);

    const isIconOnlyButton = (button: ButtonShortcut) => {
      const hasText = !!(button.buttonText && button.buttonText.trim());
      return !hasText && !!(button.iconPrepend || button.iconAppend);
    };

    const onShortcutOrderEnd = () => {
      if (!configMan.configuration.value) {
        configMan.configuration.value = {};
      }
      configMan.configuration.value.shortcuts = [...shortcutList.value];
    };

    const editShortcut = (index?: number) => {
      addEditShortcut.value = true;
      if (index !== undefined) {
        addEditShortcutIndex.value = index;
        if (shortcutList.value[index]) {
          editingShortcut.value = shortcutList.value[index];
        }
      } else {
        editingShortcut.value = {
          shortcut: { key: '' },
          actions: [],
        };

        addEditShortcutIndex.value = shortcutList.value.length;
      }
      updateActionList();
    };

    const saveShortcut = () => {
      if (editingShortcut.value) {
        configMan.updateShortcut(editingShortcut.value, addEditShortcutIndex.value);
        updateShortCutList();
      }
      editingShortcut.value = null;
      addEditShortcut.value = false;
    };

    const save = () => {
      // Save all actions to server:
      const id = configMan.configuration.value?.general?.baseConfiguration;
      const config = configMan.configuration;
      if (id && config.value) {
        configMan.saveConfiguration(id, config.value);
        generalDialog.value = false;
      }
    };

    const saveShortcutKey = (shortcut: DIVEActionShortcut['shortcut']) => {
      if (editingShortcut.value) {
        editingShortcut.value.shortcut = shortcut;
      }
    };

    const removeShortcut = (index: number) => {
      configMan.removeShortCut(index);
      updateShortCutList();
      editingShortcut.value = null;
      addEditShortcut.value = false;
    };

    const getAttributeColor = (item: string) => {
      const found = attributesList.value.find((atr) => atr.key === item || atr.key === `detection_${item}`);
      return found?.color || 'white';
    };

    const getAttributeList = (item: TrackSelectAction) => {
      const results: {name: string; color: string; opVal: string}[] = [];
      if (item.attributes?.detection) {
        Object.entries(item.attributes.detection).forEach(([key, data]) => {
          results.push({ name: key, color: getAttributeColor(key), opVal: `${data.op} ${data.val}` });
        });
      }
      if (item.attributes?.track) {
        Object.entries(item.attributes.track).forEach(([key, data]) => {
          results.push({ name: key, color: getAttributeColor(key), opVal: `${data.op} ${data.val}` });
        });
      }
      return results;
    };

    const addEditAction = ref(false);
    const addEditActionindex = ref(0);
    const editingAction: Ref<null | DIVEAction> = ref(null);
    const editAction = (index?: number) => {
      addEditAction.value = true;
      if (index !== undefined) {
        addEditActionindex.value = index;
        if (actionList.value[index]) {
          addEditActionType.value = actionList.value[index].action.type;
          editingAction.value = actionList.value[index];
        }
      } else {
        editingAction.value = {
          action: {
            type: 'TrackSelection',
          },
        };

        addEditActionindex.value = actionList.value.length;
      }
    };
    const saveAction = (diveAction: DIVEAction) => {
      if (editingShortcut.value) {
        if (editingShortcut.value.actions[addEditActionindex.value]) {
          editingShortcut.value.actions[addEditActionindex.value] = diveAction;
        } else {
          editingShortcut.value.actions.push(diveAction);
        }
      }
      addEditAction.value = false;
      updateActionList();
    };

    const removeAction = (index: number) => {
      if (editingShortcut.value) {
        editingShortcut.value.actions.splice(index, 1);
        updateActionList();
      }
    };

    const saveShortcutDisabled = computed(() => {
      if (editingShortcut.value) {
        const { description } = editingShortcut.value;
        const actionLength = editingShortcut.value.actions.length;
        return !(description && actionLength);
      }
      return false;
    });

    return {
      configMan,
      generalDialog,
      addEditShortcut,
      editingShortcut,
      removeShortcut,
      saveShortcut,
      editShortcut,
      shortcutList,
      save,
      getAttributeList,
      typeStylingRef,
      saveShortcutKey,
      actionList,
      addEditAction,
      editingAction,
      editAction,
      updateActionList,
      addEditActionindex,
      saveAction,
      removeAction,
      saveShortcutDisabled,
      getShortcutDisplay,
      hasKeyboardShortcut,
      isIconOnlyButton,
      onShortcutOrderEnd,
      getCreateTrackAfterSelectionLabel,
    };
  },

});
</script>

<template>
  <div class="ma-2">
    <v-btn :disabled="disabled" @click="generalDialog = true">
      <span>
        Action Shortcuts
        <br>
      </span>
      <v-icon
        class="ml-2"
      >
        mdi-cog
      </v-icon>
    </v-btn>
    <v-dialog
      v-model="generalDialog"
      max-width="800"
    >
      <v-card>
        <v-card-title>Action Shortcut Editor</v-card-title>
        <v-card-text>
          <div v-if="!addEditShortcut">
            <v-row dense class="pb-3">
              <v-btn @click="editShortcut()">
                Add Shortcut
              </v-btn>
            </v-row>
            <v-row
              v-if="shortcutList.length"
              dense
              class="px-2 pb-1 font-weight-bold text-caption grey--text text--darken-1"
              align="center"
            >
              <v-col cols="1">
                Drag
              </v-col>
              <v-col cols="2">
                Shortcut
              </v-col>
              <v-col cols="2">
                Button
              </v-col>
              <v-col cols="3">
                Description
              </v-col>
              <v-col cols="2">
                Actions
              </v-col>
              <v-col cols="2" class="text-right">
                Edit
              </v-col>
            </v-row>
            <draggable
              :list="shortcutList"
              handle=".drag-handle"
              @end="onShortcutOrderEnd"
            >
              <v-row
                v-for="(item, index) in shortcutList"
                :key="`shortcut_${item.shortcut.key}_${index}`"
                dense
                align="center"
                class="px-2 py-1 action-shortcut-list-row"
              >
                <v-col cols="1">
                  <v-icon class="drag-handle">
                    mdi-drag
                  </v-icon>
                </v-col>
                <v-col cols="2">
                  <template v-if="hasKeyboardShortcut(item)">
                    <v-tooltip open-delay="200" bottom>
                      <template #activator="{ on }">
                        <v-icon small class="mr-1" color="primary" v-on="on">
                          mdi-keyboard-outline
                        </v-icon>
                      </template>
                      <span>Keyboard shortcut in use</span>
                    </v-tooltip>
                    <v-chip small>
                      {{ getShortcutDisplay(item) }}
                    </v-chip>
                  </template>
                  <v-tooltip
                    v-else
                    open-delay="200"
                    bottom
                  >
                    <template #activator="{ on }">
                      <v-icon small v-on="on">
                        mdi-keyboard-off-outline
                      </v-icon>
                    </template>
                    <span>No keyboard shortcut</span>
                  </v-tooltip>
                </v-col>
                <v-col cols="2">
                  <v-tooltip
                    v-if="item.button"
                    open-delay="200"
                    bottom
                  >
                    <template #activator="{ on }">
                      <v-btn
                        x-small
                        outlined
                        :class="{ 'shortcut-button-preview--icon-only': isIconOnlyButton(item.button) }"
                        :color="item.button.buttonColor || 'primary'"
                        v-on="on"
                        @click.stop.prevent
                      >
                        <v-icon
                          v-if="item.button.iconPrepend"
                          x-small
                          :left="!!item.button.buttonText"
                        >
                          {{ item.button.iconPrepend }}
                        </v-icon>
                        <template v-if="item.button.buttonText">
                          {{ item.button.buttonText }}
                        </template>
                        <v-icon
                          v-if="item.button.iconAppend"
                          x-small
                          :right="!!item.button.buttonText"
                        >
                          {{ item.button.iconAppend }}
                        </v-icon>
                      </v-btn>
                    </template>
                    <span>Custom UI button</span>
                  </v-tooltip>
                  <span v-else class="text-caption grey--text">—</span>
                </v-col>
                <v-col cols="3">
                  {{ item.description || '—' }}
                </v-col>
                <v-col cols="2">
                  <v-chip
                    v-for="action in item.actions"
                    :key="`shortcut_action-${item.shortcut.key}-${action.action.type}`"
                    small
                    class="ma-1"
                  >
                    {{ action.action.type }}
                  </v-chip>
                </v-col>
                <v-col cols="2" class="text-right">
                  <v-btn icon x-small class="ma-0" @click="editShortcut(index)">
                    <v-icon small>
                      mdi-pencil
                    </v-icon>
                  </v-btn>
                  <v-btn icon x-small class="ma-0" color="error" @click="removeShortcut(index)">
                    <v-icon small>
                      mdi-delete
                    </v-icon>
                  </v-btn>
                </v-col>
              </v-row>
            </draggable>
          </div>
          <div v-else-if="editingShortcut !== null">
            <v-row dense>
              <get-shortcut
                v-if="editingShortcut"
                :value="editingShortcut.shortcut"
                @input="saveShortcutKey($event)"
              />
            </v-row>
            <v-row dense>
              <v-text-field v-model="editingShortcut.description" />
            </v-row>
            <div v-if="!addEditAction">
              <v-row
                v-for="(item, index) in actionList"
                :key="`ActionItem_${index}`"
                dense
                style="border: 1px gray solid; margin:2px"
              >
                <v-col cols="3">
                  {{ item.action.type }}
                </v-col>
                <v-col v-if="item.action.type === 'TrackSelection'">
                  <v-row
                    v-for="trackType in item.action.typeFilter"
                    :key="`type_${trackType}`"
                    dense
                  >
                    <div
                      class="type-color-box"
                      :style="{
                        backgroundColor: typeStylingRef.color(trackType),
                      }"
                    />
                    {{ trackType }}
                  </v-row>
                </v-col>
                <v-col v-if="item.action.type === 'GoToFrame' && item.action.track">
                  <v-row
                    v-for="trackType in item.action.track.typeFilter"
                    :key="`frameType_${trackType}`"
                    dense
                  >
                    <div
                      class="type-color-box"
                      :style="{
                        backgroundColor: typeStylingRef.color(trackType),
                      }"
                    />
                    {{ trackType }}
                  </v-row>
                </v-col>
                <v-col v-if="item.action.type === 'GoToFrame' && item.action.track">
                  <v-row
                    v-for="data in getAttributeList(item.action.track)"
                    :key="`attribute_type${data.name}`"
                    dense
                  >
                    <div
                      class="type-color-box"
                      :style="{
                        backgroundColor: data.color,
                      }"
                    />
                    {{ data.name }}: {{ data.opVal }}
                  </v-row>
                </v-col>
                <v-col v-if="item.action.type === 'CreateTrackAction'">
                  <div v-if="item.action.editableType">
                    <b class="mr-2">Editable Type:</b><v-icon v-if="item.action.editableType" color="success">
                      mdi-check
                    </v-icon><v-icon v-else color="error">
                      mdi-close
                    </v-icon>
                  </div>
                  <div v-if="item.action.editableTypeList?.length">
                    <b class="mr-2">Types:</b><span>{{ item.action.editableTypeList.join(', ') }}</span>
                  </div>
                  <div v-if="item.action.trackType">
                    <b class="mr-2">Type:</b><span>{{ item.action.trackType }}</span>
                  </div>
                  <div v-if="item.action.geometryType">
                    <b class="mr-2">Geometry:</b><span>{{ item.action.geometryType }}</span>
                  </div>

                  <div>
                    <b class="mr-2">After creation:</b>
                    <span>{{ getCreateTrackAfterSelectionLabel(item.action.selectTrackAfter) }}</span>
                  </div>
                </v-col>
                <v-spacer />
                <v-col cols="1">
                  <v-icon @click="editAction(index)">
                    mdi-pencil
                  </v-icon>
                  <v-icon
                    color="error"
                    @click="removeAction(index)"
                  >
                    mdi-delete
                  </v-icon>
                </v-col>
              </v-row>
              <v-row>
                <v-spacer />
                <v-btn
                  x-small
                  @click="editAction()"
                >
                  Add Action
                </v-btn>
              </v-row>
            </div>
            <div v-else>
              <action-editor
                v-if="editingAction !== null"
                :value="editingAction"
                @input="saveAction($event)"
                @cancel="addEditAction = false"
              />
            </div>
          </div>
          <div v-if="editingShortcut">
            <button-shortcut-editor
              v-model="editingShortcut.button"
              :attribute="false"
            />
          </div>
          <v-row
            v-if="editingShortcut !== null"
            dense
            class="mt-4"
          >
            <v-spacer />
            <v-btn
              x-small
              @click="editingShortcut = null; addEditShortcut = false"
            >
              Cancel
            </v-btn>
            <v-btn
              x-small
              color="primary"
              :disabled="saveShortcutDisabled"
              @click="saveShortcut()"
            >
              Save Shortcut
            </v-btn>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-row dense>
            <v-spacer />
            <v-btn
              class="mx-2"
              @click="generalDialog = false; editingShortcut = null; addEditShortcut = false"
            >
              Cancel
            </v-btn>
            <v-btn
              class="mx-2"
              color="primary"
              @click="save()"
            >
              Save
            </v-btn>
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
  .type-color-box {
    margin: 7px;
    margin-top: 4px;
    min-width: 15px;
    max-width: 15px;
    min-height: 15px;
    max-height: 15px;
  }

  .drag-handle {
    cursor: grab;
  }

  .action-shortcut-list-row {
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  }

  .shortcut-button-preview--icon-only {
    min-width: 28px !important;
    padding: 0 6px !important;

    .v-icon {
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
  }
</style>
