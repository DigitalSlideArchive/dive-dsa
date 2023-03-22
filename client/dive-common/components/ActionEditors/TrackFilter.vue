<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, ref, watch, Ref, PropType,
} from '@vue/composition-api';
import {
  AttributeMatch, AttributeSelectAction, MatchOperator, TrackSelectAction,
} from 'dive-common/use/useActions';
import {
  useAttributes, useCameraStore, useConfiguration, useTrackFilters,
} from 'vue-media-annotator/provides';


export default defineComponent({
  name: 'TrackFilter',
  components: {
  },
  props: {
    data: {
      type: Object as PropType<TrackSelectAction>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const configMan = useConfiguration();
    const attributes = useAttributes();
    const generalDialog = ref(false);
    const cameraStore = useCameraStore();
    const trackFilterControls = useTrackFilters();
    const types = computed(() => trackFilterControls.allTypes.value);

    const typeFilter: Ref<string[]> = ref(props.data.typeFilter || []);
    const confidenceNumber: Ref<number | undefined> = ref(props.data.confidenceFilter || 0);
    const startTrack: Ref<number | undefined> = ref(props.data.startTrack || -1);
    const startFrame: Ref<number | undefined> = ref(props.data.startFrame || -1);
    const Nth: Ref<number | undefined> = ref(props.data.Nth || 0);

    const attributeFilters: Ref<AttributeSelectAction> = ref(props.data.attributes || {});

    const testFilter = (type = 'track') => {
      // build action filter
      const selectTrackAction: TrackSelectAction = {
        typeFilter: typeFilter.value,
        confidenceFilter: confidenceNumber.value,
        startTrack: startTrack.value,
        startFrame: startFrame.value,
        Nth: Nth.value,
        attributes: attributeFilters.value,
        type: 'TrackSelection',
      };
      if (type === 'track') {
        const result = cameraStore.getTrackFromAction(selectTrackAction);
        console.log(result);
      }
      if (type === 'frame') {
        const result = cameraStore.getFrameFomAction(selectTrackAction);
        console.log(result);
      }
    };
    const creatingAtrType: Ref<'track' | 'detection'> = ref('track');
    // Editing Atribute Filters:
    const attributeList = computed(() => attributes.value.filter((item) => item.belongs === creatingAtrType.value).map((item) => item.name));
    const attributeTypes = computed(() => {
      const typeMap: Record<string, string> = {};
      attributes.value.forEach((item) => {
        typeMap[item.name] = item.datatype;
      });
      return typeMap;
    });
    const creatingAttribute = ref(false);
    const editingAtrKey = ref('');
    const editingOps = ref(['=', '!=', '>', '<', '>=', '<=', 'range', 'in']);
    const editingAtrOp: Ref<MatchOperator> = ref('=');
    const editingAtrVal: Ref<string[] | string | number | number[]> = ref('');
    const addAttribute = (type: 'track' | 'detection', editing?: string) => {
      creatingAttribute.value = true;
      creatingAtrType.value = type;
    };
    const removeAttribute = (type: 'track' | 'detection', editing?: string) => {
      if (type === 'track' && editing && attributeFilters.value.track) {
        if (attributeFilters.value.track[editing]) {
          delete attributeFilters.value.track[editing];
        }
      }
      if (type === 'detection' && editing && attributeFilters.value.detection) {
        if (attributeFilters.value.detection[editing]) {
          delete attributeFilters.value.detection[editing];
        }
      }
      attributeFilters.value = { ...attributeFilters.value };
    };

    const cancelAttr = () => {
      editingAtrKey.value = '';
      editingAtrOp.value = '=';
      editingAtrVal.value = '';
      creatingAttribute.value = false;
    };
    const saveAttr = () => {
      if (creatingAtrType.value === 'track') {
        if (attributeFilters.value.track === undefined) { attributeFilters.value.track = { }; }
        attributeFilters.value.track[editingAtrKey.value] = {
          val: editingAtrVal.value,
          op: editingAtrOp.value,
        };
      }
      if (creatingAtrType.value === 'detection') {
        if (attributeFilters.value.detection === undefined) { attributeFilters.value.detection = { }; }
        attributeFilters.value.detection[editingAtrKey.value] = {
          val: editingAtrVal.value,
          op: editingAtrOp.value,
        };
      }
      attributeFilters.value = { ...attributeFilters.value };
      creatingAttribute.value = false;
    };
    const trackAtrList = computed(() => {
      const result: {key: string; item: AttributeMatch}[] = [];
      if (attributeFilters.value.track) {
        Object.entries(attributeFilters.value.track).forEach(([key, item]) => {
          result.push({ key, item });
        });
      }
      return result;
    });
    const detectionAtrList = computed(() => {
      const result: {key: string; item: AttributeMatch}[] = [];
      if (attributeFilters.value.detection) {
        Object.entries(attributeFilters.value.detection).forEach(([key, item]) => {
          result.push({ key, item });
        });
      }
      return result;
    });
    const saveFilter = () => {
      const selectTrackAction: TrackSelectAction = {
        typeFilter: typeFilter.value,
        confidenceFilter: confidenceNumber.value,
        startTrack: startTrack.value,
        startFrame: startFrame.value,
        Nth: Nth.value,
        attributes: attributeFilters.value,
        type: 'TrackSelection',
      };
      emit('update-trackselection', selectTrackAction);
    };
    return {
      typeFilter,
      types,
      confidenceNumber,
      generalDialog,
      startTrack,
      startFrame,
      Nth,
      testFilter,
      creatingAttribute,
      attributeTypes,
      creatingAtrType,
      attributeList,
      editingAtrKey,
      editingOps,
      editingAtrOp,
      editingAtrVal,
      addAttribute,
      cancelAttr,
      saveAttr,
      trackAtrList,
      detectionAtrList,
      attributeFilters,
      saveFilter,
      removeAttribute,
    };
  },

});
</script>

<template>
  <div class="ma-2">
    <v-card>
      <v-card-title>Track Filter Creation</v-card-title>
      <v-card-text>
        <p>
          Below are filter settings which can be added to grab a track for
          a frame filtered by the settings below
        </p>
        <div>
          <v-row dense>
            <v-col class="mx-3">
              <v-select
                v-model="typeFilter"
                :items="types"
                multiple
                clearable
                deletable-chips
                chips
                label="Filter Types"
              />
            </v-col>
            <v-col class="mx-3">
              <v-text-field
                v-model.number="confidenceNumber"
                label="Confidence Number"
                min="0"
                max="1.0"
                step="0.01"
                type="number"
              />
            </v-col>
          </v-row>
          <v-row dense>
            <v-col class="mx-3">
              <p>-1 will start at current track</p>
              <v-text-field
                v-model.number="startTrack"
                label="Start Track"
                min="-1"
                step="1"
                type="number"
              />
            </v-col>
            <v-col class="mx-3">
              <p>-1 will start at current frame</p>
              <v-text-field
                v-model.number="startFrame"
                label="Start Frame"
                min="-1"
                step="1"
                type="number"
              />
            </v-col>
            <v-col class="mx-3">
              <p>Nth track which meets the criteria</p>
              <v-text-field
                v-model.number="Nth"
                label="Nth Track"
                min="-1"
                step="1"
                type="number"
              />
            </v-col>
          </v-row>
        </div>
        <v-row dense>
          <v-btn
            x-small
            class="mx-2"
            @click="addAttribute('track')"
          >
            <v-icon>mdi-plus</v-icon> Track Attribute
          </v-btn>
          <v-btn
            x-small
            class="mx-2"
            @click="addAttribute('detection')"
          >
            <v-icon>mdi-plus</v-icon> Detection Attribute
          </v-btn>
        </v-row>
        <v-row
          v-if="trackAtrList.length"
          dense
        >
          <v-row
            v-for="item in trackAtrList"
            :key="`trackAtr_${item.key}`"
            dense
          >
            <v-col>{{ item.key }}</v-col>
            <v-col>{{ item.item.op }}</v-col>
            <v-col>{{ item.item.val }}</v-col>
            <v-col>
              <v-icon
                @click="addAttribute('track', item.key)"
              >
                mdi-pencil
              </v-icon>
              <v-icon
                color="error"
                @click="removeAttribute('detection', item.key)"
              >
                mdi-delete
              </v-icon>
            </v-col>
          </v-row>
        </v-row>
        <v-row
          v-if="detectionAtrList.length"
          dense
        >
          <v-row
            v-for="item in detectionAtrList"
            :key="`detectionAttr_${item.key}`"
            dense
          >
            <v-col>{{ item.key }}</v-col>
            <v-col>{{ item.item.op }}</v-col>
            <v-col>{{ item.item.val }}</v-col>
            <v-col>
              <v-icon
                @click="addAttribute('detection', item.key)"
              >
                mdi-pencil
              </v-icon>
              <v-icon
                color="error"
                @click="removeAttribute('detection', item.key)"
              >
                mdi-delete
              </v-icon>
            </v-col>
          </v-row>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-row>
          <v-spacer />
          <v-btn
            small
            @click="$emit('cancel')"
          >
            Cancel
          </v-btn>
          <v-btn
            small
            color="primary"
            @click="saveFilter()"
          >
            Save
          </v-btn>
        </v-row>
      </v-card-actions>
    </v-card>
    <v-dialog
      v-model="creatingAttribute"
      max-width="400"
    >
      <v-card>
        <v-card-title>Attribute Filter</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-select
              v-model="editingAtrKey"
              :items="attributeList"
              label="Attribute"
            />
          </v-row>
          <v-row dense>
            <v-select
              v-model="editingAtrOp"
              :items="editingOps"
              label="Operator"
            />
          </v-row>
          <v-row dense>
            <v-text-field
              v-model="editingAtrVal"
              :type="attributeTypes[editingAtrKey] === 'text' ? 'text' : 'number'"
            />
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-row>
            <v-spacer />
            <v-btn @click="cancelAttr">
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              @click="saveAttr"
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
</style>
