<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, ref, watch, Ref,
} from '@vue/composition-api';
import {
  AttributeMatch, AttributeSelectAction, DIVEAction, MatchOperator, TrackSelectAction,
} from 'dive-common/use/useActions';
import {
  useAttributes, useCameraStore, useConfiguration, useTrackFilters,
} from 'vue-media-annotator/provides';
import TrackFilter from './TrackFilter.vue';


export default defineComponent({
  name: 'ActionEditor',
  components: {
    TrackFilter,
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
    const editingAction: Ref<null | DIVEAction['action']> = ref(null);
    const addEditActionType: Ref<'TrackSelection' | 'GoToFrame'> = ref('TrackSelection');
    const editAction = (index?: number) => {
      addEditAction.value = true;
      console.log(index);
      if (index !== undefined) {
        addEditActionindex.value = index;
        if (actionList.value[index]) {
          addEditActionType.value = actionList.value[index].action.type;
          editingAction.value = actionList.value[index].action;
        }
      } else {
        editingAction.value = {
          type: 'TrackSelection',
        };

        addEditActionindex.value = actionList.value.length - 1;
      }
    };


    const saveAction = (action: TrackSelectAction, type: DIVEAction['action']['type']) => {
      let diveAction: DIVEAction = {
        action,
      };
      if (type === 'GoToFrame' && action) {
        diveAction = {
          action: {
            track: action,
            type: 'GoToFrame',
          },

        };
      }
      configMan.addAction(diveAction);
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
          track: {
            type: 'TrackSelection',
          },
          type: 'GoToFrame',
        };
      }
      if (addEditActionType.value === 'TrackSelection') {
        editingAction.value = {
          type: 'TrackSelection',
        };
      }
    };

    const removeAction = (index: number) => {
      configMan.removeAction(index);
      updateActionList();
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
        <v-card-title>Track Filter Creation</v-card-title>
        <v-card-text>
          <div v-if="!addEditAction">
            <p>Below is a list of actions which will activated on launching</p>
            <v-row
              v-for="(item, index) in actionList"
              :key="`ActionItem_${index}`"
              dense
            >
              <v-col>
                {{ item.action.type }}
              </v-col>
              <v-col>
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
            <h2>Create/Edit Action</h2>
            <v-row>
              <v-select
                v-model="addEditActionType"
                :items="['GoToFrame', 'TrackSelection']"
                label="Action Type"
                @change="changeType"
              />
            </v-row>
            <v-row v-if="addEditActionType === 'TrackSelection'">
              <track-filter
                v-if="editingAction !== null && editingAction.type === 'TrackSelection'"
                :data="editingAction"
                @update-trackselection="saveAction($event, addEditActionType)"
              />
            </v-row>
            <v-row v-else-if="addEditActionType === 'GoToFrame'">
              <track-filter
                v-if="editingAction !== null && editingAction.type === 'GoToFrame' && editingAction.track"
                :data="editingAction.track"
                @update-trackselection="saveAction($event, addEditActionType)"
              />
              <v-text-field
                v-if="editingAction !== null && editingAction.type === 'GoToFrame' && editingAction.track"
                v-model="editingAction.frame"
                type="number"
              />
            </v-row>
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
</style>
