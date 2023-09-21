<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, Ref, watch, del as VueDel,
} from '@vue/composition-api';
import { useStore } from 'platform/web-girder/store/types';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import { useCameraStore, useTrackStyleManager } from 'vue-media-annotator/provides';
import { Attribute } from 'vue-media-annotator/use/AttributeTypes';

import { isHexColorCode } from 'vue-media-annotator/utils';


export default defineComponent({
  name: 'AttributeValueColors',
  props: {
    attribute: {
      type: Object as PropType<Attribute>,
      required: true,
    },

  },
  setup(props, { emit }) {
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const cameraStore = useCameraStore();
    const store = useStore();
    const user = (store.state.User.user?.login || '') as string;


    const predeterminedValues = ref(props.attribute.values || []);

    const attributeColors = ref(props.attribute.valueColors || {});
    const attributeOrder = ref(props.attribute.valueOrder || {});
    const editingColor = ref(false);
    const currentEditColor = ref('white');
    const currentEditKey: Ref<null | string> = ref(null);

    const colorKey = ref(props.attribute.colorKey || false);

    const getActualValues = () => {
      // Need to go through all tracks with the attribute and get their values.
      const valueMap: Record<string, boolean> = {};
      cameraStore.camMap.value.forEach((camera) => {
        camera.trackStore.annotationMap.forEach((track) => {
          if (props.attribute.belongs === 'track') {
            if (!props.attribute.user && track.attributes[props.attribute.name]) {
              valueMap[track.attributes[props.attribute.name] as string] = true;
            } else if (props.attribute.user && track.attributes.userAttributes) {
              const userAttr = (track.attributes.userAttributes[user]) as StringKeyObject;
              if (userAttr[props.attribute.name]) {
                valueMap[userAttr[props.attribute.name] as string] = true;
              }
            }
          } else if (props.attribute.belongs === 'detection') {
            track.features.forEach((feature) => {
              if (feature.attributes) {
                if (!props.attribute.user && feature.attributes[props.attribute.name]) {
                  valueMap[feature.attributes[props.attribute.name] as string] = true;
                } else if (props.attribute.user && feature.attributes.userAttributes) {
                  const userAttr = (feature.attributes.userAttributes[user]) as StringKeyObject;
                  if (userAttr[props.attribute.name]) {
                    valueMap[userAttr[props.attribute.name] as string] = true;
                  }
                }
              }
            });
          }
        });
      });
      const existingValues = Object.keys(attributeColors.value);
      const finalValues = attributeColors.value;
      predeterminedValues.value.forEach((key) => {
        if (!existingValues.includes(key)) {
          finalValues[key] = typeStylingRef.value.color(key);
        }
      });
      const finalKeys = Object.keys(finalValues);
      Object.keys(valueMap).forEach((key) => {
        if (!finalKeys.includes(key)) {
          finalValues[key] = typeStylingRef.value.color(key);
        }
      });
      attributeColors.value = finalValues;
    };
    getActualValues();
    const setEditingColor = (key: string) => {
      editingColor.value = true;
      currentEditKey.value = key;
      currentEditColor.value = attributeColors.value[key];
    };

    const updateColors = () => {
      const data: { colorValues: Record<string, string>; colorKey?: boolean; valueOrder?: Record<string, number> } = {
        colorValues: attributeColors.value,
        valueOrder: attributeOrder.value,
      };
      if (colorKey.value) {
        data.colorKey = true;
      }
      emit('save', data);
    };

    const saveEditingColor = () => {
      if (currentEditKey.value !== null) {
        attributeColors.value[currentEditKey.value] = currentEditColor.value;
        currentEditKey.value = null;
        currentEditColor.value = 'white';
        editingColor.value = false;
        updateColors();
      }
    };
    const saveColorHex = (key: string, hex: string) => {
      if (isHexColorCode(hex)) {
        attributeColors.value[key] = hex;
        updateColors();
      }
    };

    const setOrder = (key: string, order: number) => {
      if (order === -1) {
        VueDel(attributeColors.value, key);
        updateColors();
      } else {
        attributeOrder.value[key] = order;
        updateColors();
      }
    };

    const deleteValue = (key: string) => {
      VueDel(attributeColors.value, key);
      if (attributeOrder.value[key]) {
        VueDel(attributeColors.value, key);
      }
      updateColors();
    };


    watch(colorKey, () => updateColors());
    return {
      attributeColors,
      editingColor,
      currentEditColor,
      attributeOrder,
      colorKey,
      setEditingColor,
      saveEditingColor,
      getActualValues,
      saveColorHex,
      setOrder,
      deleteValue,
    };
  },
});
</script>
<template>
  <div>
    <h3> Attribute Value Colors</h3>
    <v-container class="attribute-colors">
      <v-row
        align="center"
        justify="center"
        style="border: 2px solid white;"
      >
        <v-spacer />
        <v-col
          cols="3"
          class="column"
        >
          Attribute Value
        </v-col>
        <v-col
          cols="2"
          class="column"
        >
          Color
        </v-col>
        <v-col
          class="column"
        >
          Hex Value
        </v-col>
        <v-col
          class="column"
        >
          Order
        </v-col>
        <v-col
          cols="1"
          class="column"
        >
          Remove
        </v-col>
        <v-spacer />
      </v-row>
      <v-row
        v-for="(val,key) in attributeColors"
        :key="val"
        align="center"
        justify="center"
        style="border: 1px solid white;"
      >
        <v-spacer />
        <v-col
          cols="3"
          class="column"
        >
          <div class="value-text">
            {{ key }}:
          </div>
        </v-col>
        <v-col
          cols="2"
          class="column"
        >
          <div>
            <div
              class="color-box mx-2 mt-2 edit-color-box"
              :style="{
                backgroundColor: val,
              }"
              @click="setEditingColor(key)"
            />
          </div>
        </v-col>
        <v-col>
          <v-text-field
            :value="val"
            label="Hex Color"
            @change="saveColorHex(key, $event)"
          />
        </v-col>
        <v-col>
          <v-text-field
            type="number"
            :value="attributeOrder[key] || -1"
            :rules="[v => v >= -1 || 'Value must be greater than -1']"
            label="Order"
            @change="setOrder(key, $event)"
          />
        </v-col>
        <v-col cols="1">
          <v-icon
            color="error"
            @click="deleteValue(key)"
          >
            mdi-delete
          </v-icon>
        </v-col>

        <v-spacer />
      </v-row>
      <v-row dense>
        <v-checkbox
          v-model="colorKey"
          label="Color Key"
          hint="Render a key for the color values"
          persistent-hint
        />
      </v-row>
    </v-container>

    <v-dialog
      v-model="editingColor"
      max-width="300"
    >
      <v-card>
        <v-card-title>
          Edit color
        </v-card-title>
        <v-card-text>
          <v-color-picker
            v-model="currentEditColor"
            hide-inputs
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="editingColor = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="saveEditingColor"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
.column {
  height: 100%;
}
.value-text {
  font-size: 18px;
}
.attribute-colors {
  overflow-y:auto;
  max-height: 600px;
}
.color-box {
  display: inline-block;
  margin-left: 10px;
  min-width: 20px;
  max-width: 20px;
  min-height: 20px;
  max-height: 20px;
}
.edit-color-box {
  &:hover {
    cursor: pointer;
    border: 2px solid white
  }
}
.border {
  border: 2px solid gray;
}

</style>
