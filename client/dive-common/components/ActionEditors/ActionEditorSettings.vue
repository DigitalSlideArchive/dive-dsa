<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, Ref,
} from '@vue/composition-api';
import {
  DIVEAction, TrackSelectAction,
} from 'dive-common/use/useActions';
import {
  useAttributes, useConfiguration, useTrackStyleManager,
} from 'vue-media-annotator/provides';
import ActionEditor from './ActionEditor.vue';
import TrackFilter from './TrackFilter.vue';


export default defineComponent({
  name: 'ActionEditorSettings',
  components: {
    TrackFilter,
    ActionEditor,
  },
  setup() {
    const configMan = useConfiguration();
    const actionList: Ref<DIVEAction[]> = ref([]);

    const updateActionList = () => {
      if (configMan.configuration.value?.actions) {
        const tempList: DIVEAction[] = [];
        configMan.configuration.value.actions.forEach((item) => {
          tempList.push(item);
        });
        actionList.value = tempList;
      }
    };
    updateActionList();
    const generalDialog = ref(false);
    const addEditAction = ref(false);
    const addEditActionindex = ref(0);
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const attributesList = useAttributes();
    const editingAction: Ref<null | DIVEAction> = ref(null);
    const addEditActionType: Ref<'TrackSelection' | 'GoToFrame'> = ref('TrackSelection');
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
      configMan.updateAction(diveAction, addEditActionindex.value);
      addEditAction.value = false;
      updateActionList();
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
    const changeType = () => {
      if (addEditActionType.value === 'GoToFrame') {
        editingAction.value = {
          action: {
            track: {
              type: 'TrackSelection',
            },
            type: 'GoToFrame',
          },
        };
      }
      if (addEditActionType.value === 'TrackSelection') {
        editingAction.value = {
          action: {
            type: 'TrackSelection',
          },
        };
      }
    };

    const removeAction = (index: number) => {
      configMan.removeAction(index);
      updateActionList();
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

    return {
      configMan,
      generalDialog,
      actionList,
      addEditAction,
      addEditActionType,
      addEditActionindex,
      editingAction,
      editAction,
      saveAction,
      save,
      changeType,
      removeAction,
      getAttributeList,
      typeStylingRef,
    };
  },

});
</script>

<template>
  <div class="ma-2">
    <v-btn @click="generalDialog = true">
      <span>
        Launch Actions
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
        <v-card-title>Action Editor</v-card-title>
        <v-card-text>
          <div v-if="!addEditAction">
            <p>Below is a list of actions which will activated on launching</p>
            <v-row
              v-for="(item, index) in actionList"
              :key="`ActionItem_${index}`"
              dense
              style="border: 1px gray solid; margin:2px"
            >
              <v-col cols="2">
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
              <v-btn @click="editAction()">
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
        </v-card-text>
        <v-card-actions>
          <v-btn
            x-small
            @click="generalDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="save()"
          >
            Save
          </v-btn>
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
</style>
