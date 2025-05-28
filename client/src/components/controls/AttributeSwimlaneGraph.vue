<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script lang="ts">
import {
  defineComponent, ref, computed, onMounted, watch, PropType,
  Ref,
  nextTick,
} from 'vue';
import { throttle } from 'lodash';
import * as d3 from 'd3';
import { useTime } from 'vue-media-annotator/provides';
import { SwimlaneAttribute, SwimlaneData } from 'vue-media-annotator/use/AttributeTypes';
import { injectAggregateController } from '../annotators/useMediaController';

function intersect(range1: number[], range2: number[]): number[] | null {
  const min = range1[0] < range2[0] ? range1 : range2;
  const max = min === range1 ? range2 : range1;
  if (min[1] < max[0]) {
    return null;
  }
  return [max[0], Math.min(min[1], max[1])];
}

export default defineComponent({
  name: 'AttributeSwimlaneGraph',
  props: {
    startFrame: { type: Number, required: true },
    endFrame: { type: Number, required: true },
    maxFrame: { type: Number, required: true },
    clientWidth: { type: Number, required: true },
    clientHeight: { type: Number, required: true },
    margin: { type: Number, default: 0 },
    data: { type: Object as PropType<Record<string, SwimlaneAttribute>>, required: true },
    displayFrameIndicators: { type: Boolean, default: false },
  },
  emits: ['scroll-swimlane', 'select-track'],
  setup(props, { emit }) {
    const chartTop = ref(0);
    const x = ref<any>(null);
    const tooltip: Ref<null | {
      left: number;
      top: number;
      contentColor: string;
      subColor: string;
      name: string;
      subDisplay: string | number | boolean | undefined,
    }> = ref(null);
    const hoverTrack = ref<string | null>(null);
    const scrollPos = ref(0);
    const mediaController = injectAggregateController().value;
    const { frame } = useTime();
    const showSymbols = ref(props.displayFrameIndicators);
    const symbolGenerator = ref<any>(null);
    const canvas = ref<HTMLCanvasElement | null>(null);
    const chart = ref<HTMLDivElement | null>(null);
    const hoveredZone = ref<number | null>(null);

    const startFrame_ = ref(props.startFrame);
    const endFrame_ = ref(props.endFrame);

    const tooltipComputed = computed(() => {
      if (tooltip.value !== null) {
        return {
          style: {
            left: `${tooltip.value.left + 15}px`,
            bottom: `${tooltip.value.top}px`,
            'z-index': 9999,
          },
          ...tooltip.value,
        };
      }
      return null;
    });

    const barData = computed(() => Object.entries(props.data).map(([_key, bar]) => ({
      name: bar.name,
      startPosition: bar.start,
      endPosition: bar.end,
      color: bar.color,
      subSections: bar.data,
    })));

    const bars = computed(() => {
      if (!x.value) return [];

      const barsList: {
        left: number;
        right: number;
        name: string;
        minWidth: number;
        top: number;
        color: string;
        length: number;
        id: string;
        subSections: SwimlaneData[]}[] = [];
      barData.value
        .filter((bar) => intersect([startFrame_.value, endFrame_.value], [bar.startPosition, bar.endPosition]))
        .forEach((bar, i) => {
          const frameWidth = (x.value(startFrame_.value + 1) - x.value(startFrame_.value)) * 0.6;
          barsList.push({
            left: x.value(bar.startPosition),
            right: x.value(bar.endPosition),
            name: bar.name,
            minWidth: frameWidth,
            top: i * 30 + 3,
            color: bar.color,
            length: bar.endPosition - bar.startPosition,
            subSections: bar.subSections,
            id: bar.name,
          });
        });
      return barsList;
    });

    const initialize = () => {
      x.value = d3
        .scaleLinear()
        .domain([startFrame_.value, endFrame_.value])
        .range([props.margin, props.clientWidth]);

      symbolGenerator.value = d3.symbol().type(d3.symbolDiamond);
    };

    const iconFrames = computed(() => {
      const barFrames: number[] = [];
      const barList = bars.value;
      if (!barList.length) {
        return barFrames;
      }
      barList.forEach((bar) => {
        bar.subSections.forEach((sub) => {
          barFrames.push(sub.begin);
        });
      });
      return barFrames;
    });

    const interactiveZones = computed(() => {
      const frames = [...iconFrames.value].sort((a, b) => a - b);
      const zones = [];
      const baseWidth = Math.round((props.endFrame - props.startFrame) * 0.03); // Number of frames to extend on each side

      for (let i = 0; i < frames.length; i += 1) {
        const current = frames[i];
        const prev = frames[i - 1] ?? -Infinity;
        const next = frames[i + 1] ?? Infinity;

        // Calculate distance to neighboring frames
        const distPrev = current - prev;
        const distNext = next - current;

        // Adjust width to prevent overlap
        const leftWidth = Math.min(baseWidth, Math.floor(distPrev / 2));
        const rightWidth = Math.min(baseWidth, Math.floor(distNext / 2));

        zones.push({
          frame: current,
          start: current - leftWidth,
          end: current + rightWidth,
        });
      }

      return zones;
    });

    const baseUpdate = () => {
      startFrame_.value = props.startFrame;
      endFrame_.value = props.endFrame;
      x.value?.domain([startFrame_.value, endFrame_.value]);

      const canvasEl = canvas.value;
      if (!canvasEl) return;

      const ctx = canvasEl.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      const barList = bars.value;
      if (!barList.length) return;

      canvasEl.width = props.clientWidth + props.margin;
      canvasEl.height = barList.slice(-1)[0].top + 30;

      const barHeight = 20;
      barList.forEach((bar) => {
        const barWidth = Math.max(bar.right - bar.left, bar.minWidth);
        ctx.strokeStyle = bar.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(bar.left, bar.top, barWidth, barHeight);

        bar.subSections.forEach((sub) => {
          const left = x.value(sub.begin);
          const right = x.value(sub.end);
          const width = right - left;
          ctx.fillStyle = sub.color || 'white';
          ctx.fillRect(left, bar.top, width, barHeight);

          if (showSymbols.value) {
            let fillColor = sub.begin === frame.value ? 'cyan' : 'white';
            let symbolSize = sub.begin === frame.value ? 100 : 50;
            let thickness = sub.begin === frame.value ? 2 : 1;
            if (hoveredZone.value !== null && sub.begin === hoveredZone.value && frame.value !== sub.begin) {
              fillColor = 'yellow';
              symbolSize = 100;
              thickness = 2;
            }
            const path = new Path2D(symbolGenerator.value.size(symbolSize)());
            ctx.save();
            ctx.translate(left, bar.top + barHeight / 2);
            ctx.fillStyle = fillColor;
            ctx.fill(path);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = thickness;
            ctx.stroke(path);
            ctx.restore();
          }
        });
      });
    };

    const update = throttle(baseUpdate, 20);

    watch(frame, (oldVal, newVal) => {
      if (iconFrames.value.includes(oldVal) !== iconFrames.value.includes(newVal)) {
        update();
      }
    });

    const detectBarHovering = throttle((e: MouseEvent) => {
      const { offsetX, offsetY } = e;
      const remainder = offsetY % 30;
      if (remainder > 20) return false;

      const top = offsetY - (offsetY % 30) + 3;
      const bar = bars.value
        .filter((b) => b.top === top)
        .reverse()
        .find((b) => b.left < offsetX && (b.right > offsetX || b.left + b.minWidth > offsetX));
      if (!bar) {
        hoverTrack.value = null;
        return false;
      }
      const sub = bar.subSections.find((s) => offsetX > x.value(s.begin) && offsetX < x.value(s.end));
      tooltip.value = {
        left: offsetX,
        top: offsetY,
        contentColor: bar.color,
        subColor: sub?.color || 'transparent',
        name: bar.name,
        subDisplay: sub?.value || 'None',
      };
      hoverTrack.value = bar.id;
      return true;
    }, 200);

    const scrollToElement = (selectedBar: any) => {
      const chartEl = canvas.value?.parentNode as HTMLElement;
      if (!chartEl) return;
      const { offsetHeight, scrollTop } = chartEl;
      const { top } = selectedBar;
      if (top > offsetHeight + scrollTop || top < scrollTop) {
        chartEl.scrollTop = top - offsetHeight / 2.0;
      } else if (scrollTop > top) {
        chartEl.scrollTop = 0.0;
      }
    };

    const recordScroll = (ev: Event) => {
      const { scrollTop } = (ev.target as HTMLElement);
      scrollPos.value = scrollTop;
      emit('scroll-swimlane', scrollTop);
    };

    const mousemove = (e: MouseEvent) => {
      tooltip.value = null;
      const hovering = detectBarHovering(e);
      const { offsetX } = e;
      const frameAtCursor = x.value.invert(offsetX);

      hoveredZone.value = null;
      // eslint-disable-next-line no-restricted-syntax
      for (const zone of interactiveZones.value) {
        if (frameAtCursor >= zone.start && frameAtCursor <= zone.end) {
          hoveredZone.value = zone.frame;
          break;
        }
      }
    };

    watch(hoveredZone, (oldVal, newVal) => {
      if (oldVal !== newVal) {
        update();
      }
    });

    const mousedown = (e: MouseEvent) => {
      if (hoverTrack.value !== null) {
        emit('select-track', hoverTrack.value);
      }
      if (hoveredZone.value !== null) {
        e.preventDefault();
        e.stopPropagation();
        mediaController.seek(hoveredZone.value);
        // Trigger highlighting after clicking
        nextTick(() => baseUpdate());
      }
    };

    const mouseout = () => {
      detectBarHovering.cancel();
      hoverTrack.value = null;
    };

    onMounted(() => {
      initialize();
      update();
      if (chart.value) {
        chartTop.value = chart.value.offsetTop;
      }
    });

    watch(() => props.startFrame, update);
    watch(() => props.endFrame, update);
    watch(() => props.clientWidth, () => {
      initialize();
      update();
    });
    watch(() => props.data, update);

    return {
      chartTop,
      canvas,
      chart,
      tooltipComputed,
      mousemove,
      mouseout,
      mousedown,
      recordScroll,
      showSymbols,
      update,
    };
  },
});
</script>

<template>
  <div style="position: relative;">
    <div
      ref="chart"
      class="event-chart"
      :style="`height: ${clientHeight - 10}px;`"
      @mousewheel.prevent
      @scroll="recordScroll"
    >
      <v-tooltip open-delay="100" top>
        <template #activator="{ on }">
          <div
            class="yaxisclick"
            :style="`height: ${clientHeight}px !important; top:${chartTop}px`"
            v-on="on"
            @click="showSymbols = !showSymbols; update()"
          />
        </template>
        <span class="ma-0 pa-1">Click to toggle Symbols for set Values</span>
      </v-tooltip>
      <canvas ref="canvas" @mousemove="mousemove" @mouseout="mouseout" @mousedown="mousedown" />
    </div>
    <v-card
      v-if="tooltipComputed && (tooltipComputed.subDisplay?.length ? tooltipComputed.subDisplay.length < 50 : true)"
      class="tooltip"
      :style="tooltipComputed.style"
      outlined
    >
      <v-row dense class="fill-height" align="center" justify="center">
        <v-col><span>{{ tooltipComputed.name }}</span></v-col>
        <span class="type-color-box" :style="{ backgroundColor: tooltipComputed.contentColor }" />
        <v-col><span>:</span></v-col>
        <v-col><span>{{ tooltipComputed.subDisplay }}</span></v-col>
        <span class="type-color-box" :style="{ backgroundColor: tooltipComputed.subColor }" />
      </v-row>
    </v-card>
    <v-card v-else-if="tooltipComputed" class="tooltip" :style="tooltipComputed.style" outlined>
      <v-card-title>{{ tooltipComputed.name }}</v-card-title>
      <v-card-text>{{ tooltipComputed.subDisplay }}</v-card-text>
    </v-card>
  </div>
</template>

<style lang="scss">
.event-chart {
  position: relative;
  height: calc(100% - 10px);
  margin: 0px 0;
  overflow-y: visible;
  overflow-x: hidden;

}

.tooltip {
  position: absolute;
  background: black;
  border: 1px solid white;
  padding: 0px 5px;
  font-size: 20px;
  font-weight: bold;
  z-index: 9999;
}

.type-color-box {
  margin-right: 5px;
  margin-top: 5px;
  min-width: 10px;
  max-width: 10px;
  min-height: 10px;
  max-height: 10px;
}

.yaxisclick {
  width: 20px;
  position: absolute;
  left: 0px;
  bottom: 0px;
  background-color: transparent;

  &:hover {
    cursor: pointer;
    border: lightgreen solid 1px;
    background-color: rgba(144, 238, 144, 0.20);

  }
}
</style>
