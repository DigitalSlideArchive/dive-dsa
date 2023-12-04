<script lang="ts">
import {
  computed,
  defineComponent, onMounted, PropType, Ref, ref, watch, nextTick
} from 'vue';
import * as d3 from 'd3';
import { useCameraStore } from 'vue-media-annotator/provides';
import { Attribute } from 'vue-media-annotator/use/AttributeTypes';
/*
  This Component will be mounted indepedently of the main Vue App
  on a GeoJS canvas element.  To ensure reactivity between the main Vue App
  and this element the props are passed in the initalization function instead of on a template.
  This is why reactivate data in this component is utilizing PropType<Ref<data>>.
  All references to reactive PropType<Ref<data>> need to be dereferenced in the template as well.
 */
export default defineComponent({
  name: 'AttributeColorKey',
  props: {
    attributes: {
      type: Array as PropType<Attribute[]>,
      required: true,
    },
    maxHeight: {
      type: Number,
      required: true,
    },
    selectedTrackId: {
      type: null as unknown as PropType<number | null>,
      required: true,
    },
  },
  setup(props) {
    const camStore = useCameraStore();
    const stringValueColors = computed(() => {
      const data: { displayName: string; name: string; values: [string, string][]}[] = [];
      props.attributes.forEach((attribute) => {
        // First we filter on the colorKey Settings
        if (attribute.colorKeySettings !== undefined && attribute.colorKeySettings.display !== 'static') {
          // We check to see if the selected Track has the type
          if (props.selectedTrackId === null) {
            return;
          }
          const track = camStore.getAnyTrack(props.selectedTrackId);
          if (!attribute.colorKeySettings.trackFilter.includes('all')) {
            if (!attribute.colorKeySettings.trackFilter.includes(track.getType()[0])) {
              return;
            }
          }
        }
        if (attribute.datatype === 'text' && attribute.colorKey && attribute.valueColors) {
          const displayName = attribute.render?.displayName || attribute.name;
          const values = Object.entries(attribute.valueColors);
          values.sort((a, b) => {
            if (attribute.valueOrder && attribute.valueOrder[a[0]] && attribute.valueOrder[b[0]]) {
              return attribute.valueOrder[a[0]] - attribute.valueOrder[b[0]];
            }
            return 0;
          });
          data.push({
            displayName,
            name: attribute.name,
            values,
          });
        }
      });
      return data;
    });
    const numberValueColors = computed(() => {
      const data: { displayName: string;
        name: string; values: Record<string, string>; range: [number, number];
      }[] = [];
      let min = Infinity;
      let max = -Infinity;
      props.attributes.forEach((attribute) => {
        if (attribute.colorKeySettings !== undefined && attribute.colorKeySettings.display !== 'static') {
          // We check to see if the selected Track has the type
          if (props.selectedTrackId === null) {
            return;
          }
          const track = camStore.getAnyTrack(props.selectedTrackId);
          if (!attribute.colorKeySettings.trackFilter.includes('all')) {
            if (!attribute.colorKeySettings.trackFilter.includes(track.getType()[0])) {
              return;
            }
          }
        }
        if (attribute.datatype === 'number' && attribute.colorKey && attribute.valueColors) {
          Object.keys(attribute.valueColors).forEach((item) => {
            const num = parseFloat(item);
            min = Math.min(min, num);
            max = Math.max(max, num);
          });
          const displayName = attribute.render?.displayName || attribute.name;
          data.push({
            displayName,
            name: attribute.name,
            values: attribute.valueColors,
            range: [min, max],
          });
        }
      });
      return data;
    });
    const itemRefs: Ref<{element: SVGElement; name: string}[]> = ref([]);
    const recalculateGradient = (name: string) => {
      const found = numberValueColors.value.find((item) => item.name === name);
      if (found) {
        const linearGradient = d3.select(`#color-gradient_${name}`);
        const domain = Object.keys(found.values).map((value) => parseFloat(value));
        const colorScale = d3.scaleLinear()
          .domain(domain)
        // D3 allows color strings but says it requires numbers for type definitions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .range(Object.values(found.values).map((item) => item) as any[]);
        // Recalculate percentage of width for gradient
        const max = domain[domain.length - 1];
        const percent = domain.map((item) => (max === 0 ? 0 : (item / max)));
        // Append multiple color stops using data/enter step
        linearGradient.selectAll('stop').remove();
        linearGradient.selectAll('stop')
          .data(colorScale.range())
          .enter().append('stop')
          .attr('offset', (d, i) => percent[i])
          .attr('stop-color', (d) => d);
      }
    };
    const drawGradients = () => {
      numberValueColors.value.forEach((item) => {
        const svg = d3.select(`#gradientImage_${item.name}`);
        svg
          .append('defs')
          .append('linearGradient')
          .attr('id', `color-gradient_${item.name}`)
          .attr('x1', '0%')
          .attr('y1', '0%')
          .attr('x2', '100%')
          .attr('y2', '0%');
        svg.append('rect')
          .attr('width', 200)
          .attr('height', 30)
          .style('fill', `url(#color-gradient_${item.name})`);
        recalculateGradient(item.name);
      });
    };

    watch(numberValueColors, () => {
      nextTick(() => drawGradients());
    });
    onMounted(() => {
      drawGradients();
    });
    return {
      stringValueColors,
      numberValueColors,
      itemRefs,
    };
  },
});
</script>

<template>
  <v-card
    v-if="numberValueColors.length || stringValueColors.length"
    dark
    :style="`max-height:${maxHeight}px;
     overflow-y:scroll; z-index:20; min-width:250px; border: 3px white solid;`"
  >
    <v-container
      v-for="(item, index) in numberValueColors"
      :key="`${item.name}_${index}`"
    >
      <v-row
        dense
        align="center"
        justify="center"
      >
        <b>
          {{ item.displayName }}
        </b>
      </v-row>
      <v-row
        dense
        align="center"
        justify="center"
      >
        <span class="mx-2">{{ item.range[0] }}</span>
        <svg
          :id="`gradientImage_${item.name}`"
          width="200"
          height="30"
          class="ml-3"
        />
        <span class="mx-2">{{ item.range[1] }}</span>
      </v-row>
    </v-container>
    <v-container
      v-for="(item, index) in stringValueColors"
      :key="`${item.name}_${index}`"
    >
      <v-row
        dense
        align="center"
        justify="center"
      >
        <b>
          {{ item.displayName }}
        </b>
      </v-row>
      <v-row
        v-for="[value, color] in item.values"
        :key="`${value}_${color}`"
        dense
        justify="center"
      >
        <v-col
          cols="4"
          class=" d-flex justify-center align-center"
        >
          <span> {{ value }}</span>
        </v-col>
        <v-col
          cols="4"
          class=" d-flex justify-center align-center"
        >
          <span
            :style="{ color: color }"
            class="pb-1"
          >
            █
          </span>
        </v-col>
      </v-row>
    </v-container>
  </v-card>
</template>
