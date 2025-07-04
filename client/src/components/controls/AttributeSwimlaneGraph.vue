<!-- eslint-disable no-param-reassign -->
<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script lang="ts">
import {
  defineComponent, ref, computed, onMounted, watch, PropType,
  Ref,
  nextTick,
  onUnmounted,
} from 'vue';
import { throttle } from 'lodash';
import * as d3 from 'd3';
import {
  useAttributes, useCameraStore, useSelectedTrackId, useTime,
} from 'vue-media-annotator/provides';
import { SwimlaneAttribute, SwimlaneData, SwimlaneGraph } from 'vue-media-annotator/use/AttributeTypes';
import { mdiArrowLeftRightBold } from '@mdi/js';
import { useStore } from 'platform/web-girder/store/types';
import { injectAggregateController } from '../annotators/useMediaController';

function intersect(range1: number[], range2: number[]): number[] | null {
  const min = range1[0] < range2[0] ? range1 : range2;
  const max = min === range1 ? range2 : range1;
  if (min[1] < max[0]) {
    return null;
  }
  return [max[0], Math.min(min[1], max[1])];
}

export interface DragData {
  isDragging: boolean;
  draggedFrame: number | null;
  draggedSubsectionIndex: number | null;
  dragTarget:'begin' | 'end' | null;
  dragBarName: string | null;
  draggingCurrentLocation: number| null;
  draggingValue: string | number | boolean | null;

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
    displaySettings: {
      type: Object as PropType<SwimlaneGraph['displaySettings']>,
      default: () => ({
        display: 'static',
        trackFilter: [],
        displayFrameIndicators: false,
        renderMode: 'classic',
        editSegments: false,
        minSegmentSize: 0,
      }),
    },
  },
  emits: ['scroll-swimlane', 'select-track'],
  setup(props, { emit }) {
    const attributes = useAttributes();
    const cameraStore = useCameraStore();
    const selectedTrackIdRef = useSelectedTrackId();
    const store = useStore();
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
    const showSymbols = ref(props.displaySettings?.displayFrameIndicators);
    const symbolGenerator = ref<any>(null);
    const canvas = ref<HTMLCanvasElement | null>(null);
    const chart = ref<HTMLDivElement | null>(null);
    const hoveredZone = ref<number | null>(null);
    const hoveredAttributeType = ref<string | null>(null);

    const startFrame_ = ref(props.startFrame);
    const endFrame_ = ref(props.endFrame);
    const dragData: DragData = {
      isDragging: false,
      draggedFrame: null,
      draggedSubsectionIndex: null,
      dragTarget: null,
      dragBarName: null,
      draggingCurrentLocation: null,
      draggingValue: null,
    };

    function getAttributeUser({ name, belongs }: { name: string; belongs: 'track' | 'detection' }) {
      const attribute = attributes.value.find((attr) => attr.name === name && attr.belongs === belongs);
      if (attribute?.user) {
        return store.state.User.user?.login || null;
      }
      return null;
    }

    function updateAttribute({
      name, updateFrame, value, belongs,
    }: { name: string; updateFrame: number, value: unknown; belongs: 'track' | 'detection' }) {
      if (selectedTrackIdRef.value !== null) {
        // Tracks across all cameras get the same attributes set if they are linked
        const tracks = cameraStore.getTrackAll(selectedTrackIdRef.value);
        const user = getAttributeUser({ name, belongs });
        if (tracks.length) {
          if (belongs === 'track') {
            tracks.forEach((track) => track.setAttribute(name, value, user));
          } else if (belongs === 'detection' && updateFrame !== undefined) {
            tracks.forEach((track) => track.setFeatureAttribute(updateFrame, name, value, user));
          }
        }
      }
    }

    const tooltipComputed = computed(() => {
      if (!props.displaySettings?.displayTooltip) {
        return null;
      }
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
    function skipEveryOtherSection(subsections: SwimlaneData[]): SwimlaneData[] {
      const filtered = subsections.filter((data, index) => index % 2 === 0);
      return filtered;
    }

    const barData = computed(() => Object.entries(props.data).map(([_key, bar]) => {
      if (props.displaySettings?.renderMode === 'segments') {
        const updatedSubSections = skipEveryOtherSection(bar.data);
        return {
          name: bar.name,
          startPosition: bar.start,
          endPosition: bar.end,
          color: bar.color,
          subSections: updatedSubSections,

        };
      }
      return {
        name: bar.name,
        startPosition: bar.start,
        endPosition: bar.end,
        color: bar.color,
        subSections: bar.data,
      };
    }));

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
      const barFrames: Record<string, number[]> = {};
      const barList = bars.value;
      if (!barList.length) {
        return barFrames;
      }
      barList.forEach((bar) => {
        barFrames[bar.id] = [];
        bar.subSections.forEach((sub) => {
          barFrames[bar.id].push(sub.begin);
          if (props.displaySettings?.renderMode === 'segments') {
            barFrames[bar.id].push(sub.end);
          }
        });
      });
      return barFrames;
    });

    const interactiveZones = computed(() => {
      const zones: Record<string, {frame: number, start: number; end:number}[]> = {};
      Object.keys(iconFrames.value).forEach((key) => {
        zones[key] = [];
        const iconFramesVal = iconFrames.value[key];

        const frames = [...iconFramesVal].sort((a, b) => a - b);
        const baseWidth = Math.round((props.endFrame - props.startFrame) * 0.01) || 1; // Number of frames to extend on each side

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

          zones[key].push({
            frame: current,
            start: current - leftWidth,
            end: current + rightWidth,
          });
        }
      });
      return zones;
    });

    const getSymbolPath = (type: 'diamond' | 'arrows', size: number) => {
      if (type === 'arrows') {
        return new Path2D(mdiArrowLeftRightBold);
      }
      return new Path2D(symbolGenerator.value.size(size)());
    };

    const drawIcon = (ctx: CanvasRenderingContext2D, xFrame: number, xPosition: number, yPosition: number, symbol: 'diamond' | 'arrows' = 'diamond') => {
      let fillColor = xFrame === frame.value ? 'cyan' : 'white';
      let symbolSize = xFrame === frame.value ? 100 : 50;
      let thickness = xFrame === frame.value ? 2 : 1;
      if (symbol === 'arrows') {
        fillColor = 'cyan';
      }
      if (dragData.isDragging) {
        fillColor = 'yellow';
      }

      if (hoveredZone.value !== null && xFrame === hoveredZone.value) {
        if (props.displaySettings?.renderMode === 'segments' && props.displaySettings.editSegments) {
          symbol = 'arrows';
        }
        if (xFrame !== frame.value) {
          fillColor = 'yellow';
        }
        symbolSize = 100;
        thickness = 2;
      }
      const path = getSymbolPath(symbol, symbolSize);
      ctx.save();
      const updatedYPos = symbol === 'diamond' ? yPosition : yPosition - 10;
      const updatedXPos = symbol === 'diamond' ? xPosition : xPosition - 10;
      ctx.translate(updatedXPos, updatedYPos);
      ctx.fillStyle = fillColor;
      ctx.fill(path);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = thickness;
      ctx.stroke(path);
      ctx.restore();
    };

    const baseUpdate = () => {
      if (dragData.isDragging) {
        hoveredState.value = 'hover-grabbing';
      }
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

        bar.subSections.forEach((sub, index) => {
          let left = x.value(sub.begin);
          let right = x.value(sub.end);
          if (dragData.isDragging && index === dragData.draggedSubsectionIndex && dragData.draggingCurrentLocation !== null) {
            if (sub.begin === dragData.draggedFrame) {
              left = x.value(dragData.draggingCurrentLocation);
            } else if (sub.end === dragData.draggedFrame) {
              right = x.value(dragData.draggingCurrentLocation);
            }
          }
          const width = right - left;
          ctx.fillStyle = sub.color || 'white';
          ctx.fillRect(left, bar.top, width, barHeight);
          if (showSymbols.value) {
            const symbol = dragData.isDragging && sub.begin === dragData.draggedFrame ? 'arrows' : 'diamond';
            if (!sub.singleVal || props.displaySettings?.renderMode !== 'segments') {
              drawIcon(ctx, sub.begin, left, bar.top + barHeight / 2, symbol);
            }
            if (props.displaySettings?.renderMode === 'segments') {
              const symbol = dragData.isDragging && sub.end === dragData.draggedFrame ? 'arrows' : 'diamond';
              drawIcon(ctx, sub.end, right, bar.top + barHeight / 2, symbol);
            }
          }
        });
      });
    };

    const update = throttle(baseUpdate, 20);

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
      const dragSubSectionIndex = bar.subSections.findIndex((s) => hoveredZone.value === s.begin || hoveredZone.value === s.end);
      if (dragData.isDragging && dragSubSectionIndex !== -1 && dragData.draggedSubsectionIndex === null) {
        dragData.draggedSubsectionIndex = dragSubSectionIndex;
        const sub = bar.subSections[dragSubSectionIndex];
        dragData.dragBarName = bar.name;
        dragData.draggingValue = sub.value || 'None';
      }
      const subIndex = bar.subSections.findIndex((s) => offsetX >= x.value(s.begin) && offsetX <= x.value(s.end));
      if (subIndex !== -1) {
        const sub = bar.subSections[subIndex];
        tooltip.value = {
          left: offsetX,
          top: offsetY,
          contentColor: bar.color,
          subColor: sub?.color || 'transparent',
          name: bar.name,
          subDisplay: sub?.value || 'None',
        };
        hoverTrack.value = bar.id;
      }
      return true;
    }, 200);

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

      if (dragData.draggedFrame !== null && dragData.dragTarget != null) {
        dragData.draggingCurrentLocation = frameAtCursor;
        update();
      }

      hoveredZone.value = null;
      hoveredAttributeType.value = null;
      if (showSymbols.value) {
        const zoneKeys = Object.keys(interactiveZones.value);

        let found = dragData.isDragging;
        for (let i = 0; i < zoneKeys.length; i += 1) {
          const zones = interactiveZones.value[zoneKeys[i]];
          for (let k = 0; k < zones.length; k += 1) {
            const zone = zones[k];
            if (frameAtCursor >= zone.start && frameAtCursor <= zone.end) {
              hoveredZone.value = zone.frame;
              hoveredAttributeType.value = zoneKeys[i];
              if (!dragData.isDragging && props.displaySettings?.renderMode === 'segments' && props.displaySettings.editSegments) {
                hoveredState.value = 'hover-grab';
              }
              found = true;
              break;
            }
          }
          if (found) {
            break;
          }
        }
        if (!found && !dragData.isDragging) {
          hoveredState.value = 'hover-cursor';
        }
      } else {
        hoveredState.value = 'hover-cursor';
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
      if (hoveredZone.value !== null && props.displaySettings?.renderMode === 'segments' && props.displaySettings?.editSegments) {
        dragData.isDragging = true;
        hoveredState.value = 'hover-grabbing';
        dragData.draggedFrame = hoveredZone.value;
        // Need to know if we are dragging a being or end for the section
        const bar = bars.value.find((bar) => bar.name === hoveredAttributeType.value);
        if (bar) {
          const subsection = bar.subSections.find((sub) => sub.begin === hoveredZone.value || sub.end === hoveredZone.value);
          if (subsection) {
            if (subsection.begin === dragData.draggedFrame) {
              dragData.dragTarget = 'begin';
            } else if (subsection.end === dragData.draggedFrame) {
              dragData.dragTarget = 'end';
            }
          }
        }
      }
    };

    watch(frame, () => {
      if (dragData.isDragging && dragData.draggedFrame !== null && dragData.dragTarget !== null) {
        dragData.draggingCurrentLocation = frame.value;
        update();
      } else if (props.displaySettings?.renderMode !== 'segments') {
        update();
      }
    });

    const mouseclick = (e: MouseEvent) => {
      if (showSymbols.value && hoveredZone.value !== null) {
        e.preventDefault();
        e.stopPropagation();
        mediaController.seek(hoveredZone.value);
        // Trigger highlighting after clicking
        nextTick(() => baseUpdate());
      }
    };
    const mouseout = () => {
    };

    const getDragSubsection = (name: string, subsectionIndex: number) => {
      const foundBar = bars.value.find((bar) => (bar.name === name));
      if (foundBar) {
        const subSection = foundBar.subSections[subsectionIndex];
        if (subSection) {
          return subSection;
        }
      }
      return null;
    };

    const dragEndRemoveExtraPoints = (name: string, begin: number, end: number) => {
      const bar = bars.value.find((b) => b.name === name);
      if (!bar) return;
      // get all values that are within the range of begin and end
      const valuesToRemove = bar.subSections.filter((sub) => ((sub.begin > begin && sub.begin <= end) || (sub.end < end && sub.end > begin)));
      let newBegin = begin;
      let newEnd = end;
      valuesToRemove.forEach((sub) => {
        // Removes frames from intersections
        if (sub.begin > begin && sub.begin < end) {
          updateAttribute({
            name,
            updateFrame: sub.begin,
            value: undefined,
            belongs: 'detection',
          });
        }
        if (sub.end < end && sub.end > begin) {
          updateAttribute({
            name,
            updateFrame: sub.end,
            value: undefined,
            belongs: 'detection',
          });
        }
        // Find the new begin and end values
        newBegin = Math.min(newBegin, sub.begin);
        newEnd = Math.max(newEnd, sub.end);
      });
      // Now we have an encompassing range, we can Remove any data inside of it
      const encompassingRemoval = bar.subSections.filter((sub) => ((sub.begin > newBegin && sub.begin <= newEnd) || (sub.end < newEnd && sub.end > newBegin)));
      encompassingRemoval.forEach((sub) => {
        // Removes frames from intersections
        if (sub.begin > newBegin && sub.begin < newEnd) {
          updateAttribute({
            name,
            updateFrame: sub.begin,
            value: undefined,
            belongs: 'detection',
          });
        }
        if (sub.end < newEnd && sub.end > newBegin) {
          updateAttribute({
            name,
            updateFrame: sub.end,
            value: undefined,
            belongs: 'detection',
          });
        }
      });
      // Remove new point if it is inside the new range
      if (begin > newBegin && begin < newEnd) {
        updateAttribute({
          name,
          updateFrame: begin,
          value: undefined,
          belongs: 'detection',
        });
      }
      if (end > newBegin && end < newEnd) {
        updateAttribute({
          name,
          updateFrame: end,
          value: undefined,
          belongs: 'detection',
        });
      }
    };

    const systemMouseUp = (e: MouseEvent) => {
      if (dragData.isDragging && dragData.dragBarName && dragData.draggedFrame !== null) {
        // Unset the previous value
        if (dragData.draggedSubsectionIndex !== null) {
          const subSection = getDragSubsection(dragData.dragBarName, dragData.draggedSubsectionIndex);
          // Updated Frame Size is zero and minSegmentSize supports zero we delete the segment
          if (((subSection?.begin === frame.value && dragData.dragTarget === 'end') || (subSection?.end === frame.value && dragData.dragTarget === 'begin'))) {
            updateAttribute({
              name: dragData.dragBarName,
              updateFrame: dragData.draggedFrame,
              value: undefined,
              belongs: 'detection',
            });
            updateAttribute({
              name: dragData.dragBarName,
              updateFrame: subSection.begin,
              value: undefined,
              belongs: 'detection',
            });
            dragData.isDragging = false;
            dragData.dragBarName = null;
            dragData.draggedFrame = null;
            dragData.draggedSubsectionIndex = null;
            dragData.dragTarget = null;
            dragData.draggingCurrentLocation = null;
            hoveredState.value = 'hover-cursor';
            return;
          }
          const newSize = dragData.dragTarget === 'end' ? Math.abs(frame.value - (subSection?.begin || 0)) : Math.abs(frame.value - (subSection?.end || 0));
          if (newSize < (props.displaySettings?.minSegmentSize || 0)) {
            const anchorFrame = dragData.dragTarget === 'end' && subSection?.begin !== undefined ? subSection?.begin : subSection?.end;
            if (anchorFrame !== undefined) {
              updateAttribute({
                name: dragData.dragBarName,
                updateFrame: anchorFrame,
                value: dragData.draggingValue,
                belongs: 'detection',
              });
              updateAttribute({
                name: dragData.dragBarName,
                updateFrame: anchorFrame + (props.displaySettings?.minSegmentSize || 0),
                value: dragData.draggingValue,
                belongs: 'detection',
              });
            }
          }
          updateAttribute({
            name: dragData.dragBarName,
            updateFrame: dragData.draggedFrame,
            value: undefined,
            belongs: 'detection',
          });
          // Set the new value
          updateAttribute({
            name: dragData.dragBarName,
            updateFrame: frame.value,
            value: dragData.draggingValue,
            belongs: 'detection',
          });
          if (subSection?.begin !== undefined && subSection.end !== undefined) {
            const begin = dragData.dragTarget === 'begin' ? frame.value : subSection.begin;
            const end = dragData.dragTarget === 'end' ? frame.value : subSection.end;
            dragEndRemoveExtraPoints(dragData.dragBarName, begin, end);
          }
        }
        update();
      }
      dragData.isDragging = false;
      dragData.dragBarName = null;
      dragData.draggedFrame = null;
      dragData.draggedSubsectionIndex = null;
      dragData.dragTarget = null;
      dragData.draggingCurrentLocation = null;
      hoveredState.value = 'hover-cursor';
    };

    onMounted(() => {
      initialize();
      window.addEventListener('mouseup', systemMouseUp);
      update();
      if (chart.value) {
        chartTop.value = chart.value.offsetTop;
      }
    });

    onUnmounted(() => {
      window.removeEventListener('mouseup', systemMouseUp);
    });

    watch(() => props.startFrame, update);
    watch(() => props.endFrame, update);
    watch(() => props.clientWidth, () => {
      initialize();
      update();
    });
    watch(() => props.data, update);

    const hoveredState: Ref<'hover-grabbing' | 'hover-grab' | 'hover-pointer' | 'hover-cursor'> = ref('hover-cursor');
    return {
      chartTop,
      canvas,
      chart,
      tooltipComputed,
      mousemove,
      mouseout,
      mousedown,
      mouseclick,
      recordScroll,
      showSymbols,
      update,
      hoveredState,
    };
  },
});
</script>

<template>
  <div style="position: relative;" :class="hoveredState">
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
            :style="`height: ${clientHeight - 10}px !important; top:${chartTop}px`"
            v-on="on"
            @click="showSymbols = !showSymbols; update()"
          />
        </template>
        <span class="ma-0 pa-1">Click to toggle Symbols for set Values</span>
      </v-tooltip>
      <canvas ref="canvas" @mousemove="mousemove" @click="mouseclick" @mouseout="mouseout" @mousedown="mousedown" />
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

.hover-grab {
  cursor: grab;
}

.hover-grabbing {
  cursor: default;
}
.hover-pointer {
  cursor: pointer;
}

.hover-cursor {
  cursor: unset;
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
