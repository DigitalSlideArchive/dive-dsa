<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  defineComponent, ref, Ref, PropType,
} from 'vue';
import {
  AttributeMatch, AttributeSelectAction, MatchOperator, TrackSelectAction,
} from 'dive-common/use/useActions';
import {
  useAttributes, useTrackFilters, useTrackStyleManager,
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
    const typeStylingRef = useTrackStyleManager().typeStyling;

    const attributes = useAttributes();
    const generalDialog = ref(false);
    const trackFilterControls = useTrackFilters();
    const types = computed(() => trackFilterControls.allTypes.value);

    const typeFilter: Ref<string[]> = ref(props.data.typeFilter || []);
    const confidenceNumber: Ref<number | undefined> = ref(props.data.confidenceFilter || 0);
    const startTrack: Ref<number | undefined> = ref(props.data.startTrack || -1);
    const startFrame: Ref<number | undefined> = ref(props.data.startFrame || -1);
    const Nth: Ref<number | undefined> = ref(props.data.Nth || 0);
    const direction: Ref<TrackSelectAction['direction']> = ref(props.data.direction || 'next');

    const attributeFilters: Ref<AttributeSelectAction> = ref(props.data.attributes || {});

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        direction: direction.value,
        type: 'TrackSelection',
      };
      emit('update-trackselection', selectTrackAction);
    };

    const deleteChip = (item: string) => {
      typeFilter.value.splice(typeFilter.value.findIndex((data) => data === item));
    };

    const getAttributeColor = (item: string) => {
      const found = attributes.value.find((atr) => atr.key === item || atr.key === `detection_${item}`);
      return found?.color || 'white';
    };

    const changeAttributeType = () => {
      if (editingAtrOp.value === 'range') {
        editingAtrVal.value = [0, 1];
      } else {
        editingAtrVal.value = '';
      }
    };

    return {
      typeFilter,
      types,
      confidenceNumber,
      generalDialog,
      startTrack,
      startFrame,
      Nth,
      direction,
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
      deleteChip,
      typeStylingRef,
      getAttributeColor,
      changeAttributeType,
    };
  },

});
</script>

<template>
  <div class="ma-2 action-editor">
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
              >
                <template #selection="{ item }">
                  <v-chip
                    close
                    :color="typeStylingRef.color(item)"
                    text-color="gray"
                    @click:close="deleteChip(item)"
                  >
                    {{ item }}
                  </v-chip>
                </template>
              </v-select>
            </v-col>
            <v-col class="mx-3">
              <v-select
                v-model="direction"
                :items="['next', 'previous']"
                label="Direction"
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
              <p>Nth track</p>
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
            style="border: 1px gray solid; margin:2px"
          >
            <v-col cols="1">
              <div
                class="type-color-box"
                :style="{ backgroundColor: getAttributeColor(item.key) }"
              />
            </v-col>
            <v-col>{{ item.key }}</v-col>
            <v-col>{{ item.item.op }}</v-col>
            <v-col>{{ item.item.val }}</v-col>
            <v-col cols="1">
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
        <v-row dense>
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
              @change="changeAttributeType"
            />
          </v-row>
          <v-row dense>
            <v-text-field
              v-if="!['range', 'in'].includes(editingAtrOp)"
              v-model="editingAtrVal"
              :type="attributeTypes[editingAtrKey] === 'text' ? 'text' : 'number'"
            />
            <div
              v-else-if="'in' === editingAtrOp"
            >
              <v-combobox
                v-model="editingAtrVal"
                chips
                deletable-chips
                :type="attributeTypes[editingAtrKey] === 'text' ? 'text' : 'number'"
              />
            </div>
            <div
              v-else-if="'range' === editingAtrOp && editingAtrVal.length > 0"
            >
              <v-text-field
                v-model="editingAtrVal[0]"
                :type="'number'"
                label="low"
              />
              <v-text-field
                v-model="editingAtrVal[1]"
                :type="'number'"
                label="high"
              />
            </div>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-row dense>
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
  .type-color-box {
    margin: 7px;
    margin-top: 4px;
    min-width: 15px;
    max-width: 15px;
    min-height: 15px;
    max-height: 15px;
  }
  .action-editor {
    width: 100%;
    border: 1px solid gray;
  }

</style>
