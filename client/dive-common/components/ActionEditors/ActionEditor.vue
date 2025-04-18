<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, Ref, PropType,
} from 'vue';
import {
  CreateTrackAction, DIVEAction, TrackSelectAction, CreateFullFrameTrackAction,
} from 'dive-common/use/useActions';
import {
  useAttributes, useTrackStyleManager,
} from 'vue-media-annotator/provides';
import TrackFilter from './TrackFilter.vue';
import CreateTrackActionEditor from './CreateTrackActionEditor.vue';
import CreateFullFrameTrackActionEditor from './CreateFullFrameTrackActionEditor.vue';

export default defineComponent({
  name: 'ActionEditorSettings',
  components: {
    TrackFilter,
    CreateTrackActionEditor,
    CreateFullFrameTrackActionEditor,
  },
  props: {
    value: {
      type: Object as PropType<DIVEAction>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const attributesList = useAttributes();
    const editingAction: Ref<DIVEAction> = ref(props.value);
    const addEditActionType: Ref<'TrackSelection' | 'GoToFrame' | 'CreateTrackAction' | 'CreateFullFrameTrackAction'> = ref(props.value.action.type);

    const saveAction = (action: TrackSelectAction | CreateTrackAction | CreateFullFrameTrackAction, type: DIVEAction['action']['type']) => {
      let diveAction: DIVEAction = {
        action,
      };
      if (type === 'GoToFrame' && action.type === 'TrackSelection') {
        diveAction = {
          action: {
            track: action,
            type: 'GoToFrame',
          },

        };
      }
      emit('input', diveAction);
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
      if (addEditActionType.value === 'CreateTrackAction') {
        editingAction.value = {
          action: {
            type: 'CreateTrackAction',
            geometryType: 'rectangle',
            editableType: true,
            selectTrackAfter: false,
          },
        };
      }
      if (addEditActionType.value === 'CreateFullFrameTrackAction') {
        editingAction.value = {
          action: {
            type: 'CreateFullFrameTrackAction',
            geometryType: 'rectangle',
            trackType: 'unknown',
            useExisting: true,
            selectTrackAfter: true,
          },
        };
      }
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
      addEditActionType,
      editingAction,
      saveAction,
      changeType,
      getAttributeList,
      typeStylingRef,
    };
  },

});
</script>

<template>
  <v-card>
    <v-card-title>Action Editor</v-card-title>
    <v-card-text>
      <div>
        <h2>Create/Edit Action</h2>
        <v-row class="pt-4">
          <v-select
            v-model="addEditActionType"
            :items="['GoToFrame', 'TrackSelection', 'CreateTrackAction', 'CreateFullFrameTrackAction']"
            label="Action Type"
            @change="changeType"
          />
        </v-row>
        <v-row v-if="addEditActionType === 'TrackSelection'">
          <track-filter
            v-if="editingAction !== null && editingAction.action.type === 'TrackSelection'"
            :data="editingAction.action"
            @update-trackselection="saveAction($event, addEditActionType)"
            @cancel="$emit('cancel')"
          />
        </v-row>
        <v-row v-else-if="addEditActionType === 'GoToFrame'">
          <track-filter
            v-if="editingAction !== null && editingAction.action.type === 'GoToFrame' && editingAction.action.track"
            :data="editingAction.action.track"
            @update-trackselection="saveAction($event, addEditActionType)"
            @cancel="$emit('cancel')"
          />
        </v-row>
        <v-row v-else-if="addEditActionType === 'CreateTrackAction' && editingAction.action.type === 'CreateTrackAction'">
          <CreateTrackActionEditor
            :action="editingAction.action"
            @update:action="saveAction($event, addEditActionType)"
            @cancel="$emit('cancel')"
          />
        </v-row>
        <v-row v-else-if="addEditActionType === 'CreateFullFrameTrackAction' && editingAction.action.type === 'CreateFullFrameTrackAction'">
          <CreateFullFrameTrackActionEditor
            :action="editingAction.action"
            @update:action="saveAction($event, addEditActionType)"
            @cancel="$emit('cancel')"
          />
        </v-row>
      </div>
    </v-card-text>
  </v-card>
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
