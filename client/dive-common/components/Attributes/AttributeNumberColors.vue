<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, ref, PropType, Ref, watch, onMounted, computed,
} from 'vue';
import * as d3 from 'd3';
import { useTrackFilters, useTrackStyleManager } from 'vue-media-annotator/provides';
import { Attribute } from 'vue-media-annotator/use/AttributeTypes';
import { isHexColorCode } from 'vue-media-annotator/utils';

export default defineComponent({
  name: 'AttributeNumberValueColors',
  props: {
    attribute: {
      type: Object as PropType<Attribute>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const attributeColors: Ref<{key: number; val: string}[]> = ref([]);
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const trackFilterControls = useTrackFilters();
    const types = computed(() => ['all', ...trackFilterControls.allTypes.value]);

    const recalculateGradient = () => {
      const linearGradient = d3.select('#color-gradient');
      const domain = attributeColors.value.map((item) => item.key);
      const colorScale = d3.scaleLinear()
        .domain(domain)
        // D3 allows color strings but says it requires numbers for type definitions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .range(attributeColors.value.map((item) => item.val) as any[]);
      // Recalculate percentage of width for gradient
      const max = domain[domain.length - 1];
      const percent = domain.map((item, index) => (max === 0 ? 0 : (index / max)));
      // Append multiple color stops using data/enter step
      linearGradient.selectAll('stop').remove();
      linearGradient.selectAll('stop')
        .data(colorScale.range())
        .enter().append('stop')
        .attr('offset', (d, i) => percent[i])
        .attr('stop-color', (d) => d);
    };
    const updateAttributes = () => {
      const output: {key: number; val: string }[] = [];
      const base = props.attribute.valueColors || {};
      Object.entries(base).forEach(([key, val]) => {
        output.push({ key: parseFloat(key), val });
      });
      output.sort((a, b) => a.key - b.key);
      attributeColors.value = output;
      if (output.length) {
        recalculateGradient();
      }
    };
    onMounted(() => updateAttributes());
    watch(() => props.attribute.valueColors, () => updateAttributes());
    const editingColor = ref(false);
    const currentEditColor = ref('#FF0000');
    const currentEditIndex: Ref<number> = ref(0);
    const currentEditKey: Ref<number> = ref(0);
    const colorKey = ref(props.attribute.colorKey || false);
    const staticColor = ref(props.attribute.staticColor || false);
    const noneColor = ref(props.attribute.noneColor ?? false);
    const colorKeySettings = ref(props.attribute.colorKeySettings || undefined);
    const toggleKeySettings = ref(false);
    const editNoneColor = ref(false);

    const setEditingColor = (index: number) => {
      editingColor.value = true;
      currentEditIndex.value = index;
      if (index < attributeColors.value.length) {
        currentEditKey.value = attributeColors.value[index].key;
        currentEditColor.value = attributeColors.value[index].val;
      } else {
        currentEditKey.value = !attributeColors.value.length ? 0 : attributeColors.value[attributeColors.value.length - 1].key + 1;
        currentEditColor.value = '#FF0000';
      }
    };

    const updateColors = () => {
      const mapper: Record<string, string> = {};
      attributeColors.value.forEach((item) => {
        mapper[item.key] = item.val;
      });

      const data: { colorValues: Record<string, string>; colorKey?: boolean; staticColor?: boolean; colorKeySettings?: Attribute['colorKeySettings'], noneColor?: false | string } = {
        colorValues: mapper,
      };
      if (colorKey.value) {
        data.colorKey = true;
      }
      if (colorKeySettings.value) {
        data.colorKeySettings = colorKeySettings.value;
      }
      if (staticColor.value) {
        data.staticColor = true;
      }
      data.noneColor = noneColor.value;
      emit('save', data);
    };
    const saveEditingColor = () => {
      if (currentEditIndex.value !== null) {
        if (!attributeColors.value[currentEditIndex.value]) {
          attributeColors.value.push({ key: currentEditKey.value, val: currentEditColor.value });
        } else {
          attributeColors.value[currentEditIndex.value] = { key: currentEditKey.value, val: currentEditColor.value };
        }
        attributeColors.value.sort((a, b) => a.key - b.key);
        currentEditIndex.value = 0;
        currentEditColor.value = 'white';
        editingColor.value = false;
        updateColors();
        if (attributeColors.value.length) {
          recalculateGradient();
        }
      }
    };
    const addColor = () => {
      setEditingColor(attributeColors.value.length);
    };
    const gradientSVG: Ref<SVGElement | null> = ref(null);
    watch(gradientSVG, () => {
      const svg = d3.select('#gradient-image');
      svg
        .append('defs')
        .append('linearGradient')
        .attr('id', 'color-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%');
      svg.append('rect')
        .attr('width', 300)
        .attr('height', 30)
        .style('fill', 'url("#color-gradient")');
      if (attributeColors.value.length) {
        recalculateGradient();
      }
    });
    const deleteGradient = (index: number) => {
      attributeColors.value.splice(index, 1);
      attributeColors.value.sort((a, b) => a.key - b.key);
      currentEditIndex.value = 0;
      currentEditColor.value = 'white';
      editingColor.value = false;
      updateColors();
      if (attributeColors.value.length) {
        recalculateGradient();
      }
    };

    const saveColorHex = (index: number, hex: string) => {
      if (isHexColorCode(hex)) {
        attributeColors.value[index] = { key: index, val: hex };
        updateColors();
        if (attributeColors.value.length) {
          recalculateGradient();
        }
      }
    };

    const validForm = ref(false);
    watch(colorKey, () => updateColors());
    watch(staticColor, () => updateColors());
    watch(noneColor, () => updateColors());
    watch(colorKeySettings, () => updateColors(), { deep: true });

    const setKeySettings = () => {
      toggleKeySettings.value = !toggleKeySettings.value;
      if (toggleKeySettings.value) {
        if (props.attribute.colorKeySettings === undefined) {
          colorKeySettings.value = {
            display: 'static',
            trackFilter: ['all'],
          };
        }
      } else {
        colorKeySettings.value = undefined;
      }
    };

    const deleteChip = (item: string) => {
      if (colorKeySettings.value) {
        colorKeySettings.value.trackFilter.splice(colorKeySettings.value.trackFilter.findIndex((data) => data === item));
      }
    };

    const toggleEditNoneColor = () => {
      if (!noneColor.value) {
        noneColor.value = '#000000';
      } else {
        noneColor.value = false;
      }
    };

    return {
      attributeColors,
      editingColor,
      currentEditColor,
      currentEditIndex,
      currentEditKey,
      gradientSVG,
      validForm,
      colorKey,
      colorKeySettings,
      toggleKeySettings,
      typeStylingRef,
      types,
      setEditingColor,
      saveEditingColor,
      addColor,
      deleteGradient,
      saveColorHex,
      setKeySettings,
      deleteChip,
      toggleEditNoneColor,
      staticColor,
      noneColor,
      editNoneColor,
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
          Value
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

        <v-spacer />
        <v-col />
      </v-row>
      <v-row
        v-for="(item, index) in attributeColors"
        :key="`${item.key}_${item.val}`"
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
            {{ item.key }}
          </div>
        </v-col>
        <v-col
          cols="2"
          class="column"
        >
          <div>
            <div
              class="small-color-box mx-2 mt-2"
              :style="{
                backgroundColor: item.val,
              }"
              @click="setEditingColor(index)"
            />
          </div>
        </v-col>
        <v-col>
          <v-text-field
            :value="item.val"
            label="Hex Color"
            @change="saveColorHex(index, $event)"
          />
        </v-col>
        <v-spacer />
        <v-col>
          <v-btn
            icon
            @click="deleteGradient(index)"
          >
            <v-icon color="error">
              mdi-delete
            </v-icon>
          </v-btn>
        </v-col>
      </v-row>
      <v-row
        dense
        align="center"
      >
        <v-btn
          color="success"
          class="mt-2"
          @click="addColor"
        >
          Add Color
        </v-btn>
        <svg
          id="gradient-image"
          ref="gradientSVG"
          width="300"
          height="30"
          class="ml-3"
        />
      </v-row>
      <v-row dense>
        <v-checkbox
          v-model="colorKey"
          label="Color Key"
          hint="Render a key for the color values"
          persistent-hint
          dense
        />
        <v-btn
          icon
          :color="toggleKeySettings ? 'primary' : ''"
          @click="setKeySettings()"
        >
          <v-icon>
            mdi-cog
          </v-icon>
        </v-btn>
        <v-checkbox
          v-model="staticColor"
          label="Static Color"
          hint="Use Attribute color"
          persistent-hint
          dense
        />
        <v-checkbox
          :input-value="!!noneColor"
          label="None Color"
          hint="Set None Color"
          dense
          @click="toggleEditNoneColor()"
        />
        <div
          v-if="noneColor"
          class="small-color-box mx-2 mt-2"
          :style="{
            backgroundColor: noneColor,
          }"
          @click="editNoneColor = true"
        />
      </v-row>
      <v-row
        v-if="toggleKeySettings && colorKeySettings"
        dense
      >
        <v-radio-group
          v-model="colorKeySettings.display"
          class="pr-2"
          editing-color
        >
          <v-radio
            label="Static"
            value="static"
            hint="Always display key"
            persistent-hint
          />
          <v-radio
            value="selected"
            label="Selected"
            hint="Only show when track is selected"
            persistent-hint
          />
        </v-radio-group>
        <v-select
          v-model="colorKeySettings.trackFilter"
          :items="types"
          multiple
          clearable
          deletable-chips
          chips
          label="Filter Types"
          class="mx-2"
          style="max-width:250px"
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
      </v-row>
    </v-container>

    <v-dialog
      v-model="editNoneColor"
      max-width="300"
    >
      <v-card v-if="noneColor">
        <v-card-title>
          Edit None color
        </v-card-title>
        <v-card-text>
          <v-color-picker
            v-model="noneColor"
            hide-inputs
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            text
            @click="editNoneColor = false"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="editingColor"
      max-width="300"
    >
      <v-card>
        <v-card-title>
          Edit color
        </v-card-title>
        <v-card-text>
          <v-form v-model="validForm">
            <v-row dense>
              <v-text-field
                v-model="currentEditKey"
                :rules="[
                  val => attributeColors.findIndex((item) => item.key.toString() === val) === -1 || 'Values need to be unique',
                ]"

                type="number"
                label="Value"
              />
            </v-row>
            <v-row>
              <v-color-picker
                v-model="currentEditColor"
                hide-inputs
              />
            </v-row>
          </v-form>
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
            :disabled="!validForm"
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
.small-color-box {
  display: inline-block;
  margin-left: 10px;
  min-width: 20px;
  max-width: 20px;
  min-height: 20px;
  max-height: 20px;
  &:hover {
    cursor: pointer;
    border: 2px solid white
  }

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
