<script lang="ts">
import {
  defineComponent, PropType, ref, Ref,
  watch,
} from 'vue';
import { EditAnnotationTypes } from 'vue-media-annotator/layers/';
import { CreateTrackAction } from 'dive-common/use/useActions';

export default defineComponent({
  name: 'CreateTrackActionEditor',
  props: {
    action: {
      type: Object as PropType<CreateTrackAction>,
      required: true,
    },
  },
  emits: ['update:action', 'cancel'],
  setup(props, { emit }) {
    const geometryTypes: EditAnnotationTypes[] = ['Point', 'rectangle', 'Polygon', 'LineString', 'Time'];
    const localAction = ref({ ...props.action });
    const editableTypeListEnabled = ref(false);
    const editableTypeList: Ref<string> = ref('');
    watch(editableTypeList, () => {
      localAction.value.editableTypeList = editableTypeList.value.split(',').map((type) => type.trim());
    });
    const cancel = () => {
      emit('cancel');
    };
    const save = () => {
      emit('update:action', localAction.value);
    };
    return {
      localAction,
      geometryTypes,
      editableTypeList,
      editableTypeListEnabled,
      cancel,
      save,
    };
  },
});
</script>

<template>
  <div class="ma-2 action-editor">
    <v-card>
      <v-card-title>Edit: Create Track Action</v-card-title>
      <v-card-text>
        <v-select
          v-model="localAction.geometryType"
          :items="geometryTypes"
          label="Geometry Type"
          outlined
          dense
        />

        <!-- Editable Type Toggle -->
        <v-row dense align="center" justify="center">
          <v-switch
            v-model="localAction.editableType"
            label="Editable Type"
            class="mt-2 mr-2"
          />
          <v-tooltip
            open-delay="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon class="mb-3" v-on="on">
                mdi-help-circle
              </v-icon>
            </template>
            <span>This enables a popup that will ask the user what type of track they want to create.  The Title and Text are the information displayed to the user</span>
          </v-tooltip>
          <v-spacer />
        </v-row>

        <!-- Editable Title and Text (Shown if Editable Type is On) -->
        <v-text-field
          v-if="localAction.editableType"
          v-model="localAction.editableTitle"
          label="Editable Title"
          outlined
          dense
        />

        <v-textarea
          v-if="localAction.editableType"
          v-model="localAction.editableText"
          label="Editable Text"
          outlined
          dense
        />

        <v-row dense align="center" justify="center">
          <v-switch
            v-model="editableTypeListEnabled"
            label="Type List"
            class="mt-2 mr-2"
          />
          <v-tooltip
            open-delay="200"
            bottom
          >
            <template #activator="{ on }">
              <v-icon class="mb-3" v-on="on">
                mdi-help-circle
              </v-icon>
            </template>
            <span>Provide a comma separate list of types that can be used</span>
          </v-tooltip>
          <v-spacer />
        </v-row>

        <v-text-field
          v-if="editableTypeListEnabled"
          v-model="editableTypeList"
          label="Type List"
          details="Comma separated list of types"
          outlined
          dense
        />

        <!-- Select Track After -->
        <v-checkbox
          v-model="localAction.selectTrackAfter"
          label="Select Track After"
          class="mt-2"
        />
      </v-card-text>
      <v-card-actions>
        <v-row dense>
          <v-spacer />
          <v-btn class="mx-2" @click="cancel">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            class="mx-2"
            @click="save"
          >
            Save
          </v-btn>
        </v-row>
      </v-card-actions>
    </v-card>
  </div>
</template>

<style scoped>
.action-editor {
  width: 100%;
  border: 1px solid gray;
}
</style>
