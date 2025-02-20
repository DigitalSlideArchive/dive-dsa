<!-- eslint-disable max-len -->
<script>
import Vue from 'vue';
import { throttle, debounce } from 'lodash';
import * as d3 from 'd3';

function intersect(range1, range2) {
  const min = range1[0] < range2[0] ? range1 : range2;
  const max = min === range1 ? range2 : range1;
  if (min[1] < max[0]) {
    return null;
  }
  return [max[0], min[1] < max[1] ? min[1] : max[1]];
}

export default Vue.extend({
  name: 'AttributeSwimlaneGraph',
  props: {
    startFrame: {
      type: Number,
      required: true,
    },
    endFrame: {
      type: Number,
      required: true,
    },
    maxFrame: {
      type: Number,
      required: true,
    },
    clientWidth: {
      type: Number,
      required: true,
    },
    clientHeight: {
      type: Number,
      required: true,
    },
    margin: {
      type: Number,
      default: 0,
    },
    data: {
      type: Object,
      required: true,
    },
    displayFrameIndicators: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    console.log(this.displayFrameIndicators);
    return {
      chartTop: 0,
      x: null,
      tooltip: null,
      startFrame_: this.startFrame,
      endFrame_: this.endFrame,
      hoverTrack: null,
      scrollPos: 0,
      showSymbols: this.displayFrameIndicators,
      symbolGenerator: null,
    };
  },
  computed: {
    tooltipComputed() {
      if (this.tooltip !== null) {
        return {
          style: {
            left: `${this.tooltip.left + 15}px`,
            top: `${this.tooltip.top + 0}px`,
          },
          ...this.tooltip,
        };
      }
      return null;
    },
    barData() {
      const bars = [];
      Object.keys(this.data).forEach((key) => {
        const bar = this.data[key];
        const list = bar.data;
        bars.push({
          name: bar.name,
          startPosition: bar.start,
          color: bar.color,
          endPosition: bar.end,
          subSections: list,
        });
      });
      return bars;
    },
    bars() {
      if (!this.x) {
        return [];
      }
      const { startFrame_ } = this;
      const { endFrame_ } = this;
      const { x } = this;
      const bars = [];
      this.barData
        .filter((barData) => intersect(
          [startFrame_, endFrame_],
          [barData.startPoisiton, barData.endPosition],
        ))
        .forEach((barData, i) => {
          const frameWidth = (x(this.startFrame_ + 1) - x(this.startFrame_)) * 0.6;
          bars.push({
            left: x(barData.startPosition),
            right: x(barData.endPosition),
            name: barData.name,
            minWidth: frameWidth,
            top: i * 30 + 3,
            color: barData.color,
            length: barData.endPosition - barData.startPosition,
            subSections: barData.subSections,
          });
        });
      return bars;
    },
  },
  watch: {
    startFrame() {
      this.update();
    },
    endFrame() {
      this.update();
    },
    clientWidth() {
      this.initialize();
      this.update();
    },
    data() {
      this.update();
    },
  },
  created() {
    this.update = throttle(this.update, 20);
    this.detectBarHovering = debounce(this.detectBarHovering, 20);
    this.tooltipTimeoutHandle = null;
  },
  mounted() {
    this.initialize();
    this.update();
    if (this.$refs.chart) {
      this.chartTop = this.$refs.chart.offsetTop;
    }
  },
  methods: {
    recordScroll(ev) {
      this.recordScroll = ev.target.scrollTop;
      this.$emit('scroll-swimlane', this.recordScroll);
    },
    initialize() {
      const width = this.clientWidth;
      const x = d3
        .scaleLinear()
        .domain([this.startFrame_, this.endFrame_])
        .range([this.margin, width]);
      this.x = x;
      this.symbolGenerator = d3.symbol().type(d3.symbolDiamond).size(50);
    },
    update() {
      this.startFrame_ = this.startFrame;
      this.endFrame_ = this.endFrame;
      this.x.domain([this.startFrame_, this.endFrame_]);
      const { canvas } = this.$refs;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { bars } = this;
      if (!bars.length) {
        return;
      }
      canvas.width = this.clientWidth + this.margin;
      canvas.height = bars.slice(-1)[0].top + 30;
      const barHeight = 20;
      bars.forEach((bar) => {
        const barWidth = Math.max(bar.right - bar.left, bar.minWidth);
        // If this bar is not selected
        ctx.strokeStyle = bar.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(bar.left, bar.top, barWidth, barHeight);
        bar.subSections.forEach((subSection) => {
          const left = this.x(subSection.begin);
          const right = this.x(subSection.end);
          const width = right - left;
          ctx.fillStyle = subSection.color;
          ctx.fillRect(left, bar.top, width, barHeight);
          if (this.showSymbols) {
            // Draw symbols at the midpoint of each subSection
            const path = new Path2D(this.symbolGenerator());
            ctx.save();
            ctx.translate(left, bar.top + barHeight / 2);
            ctx.fillStyle = 'white';
            ctx.fill(path);
            // Outline the symbol
            ctx.strokeStyle = 'black'; // Set the outline color
            ctx.lineWidth = 1; // Set the outline width
            ctx.stroke(path);

            ctx.restore();
          }
        });
      });
    },
    scrollToElement(selectedBar) {
      const eventChart = this.$refs.canvas.parentNode;
      const { offsetHeight } = eventChart;
      const { scrollTop } = eventChart;
      const { top } = selectedBar;
      if (top > offsetHeight + scrollTop || top < scrollTop) {
        eventChart.scrollTop = top - offsetHeight / 2.0;
      } else if (scrollTop > top) {
        eventChart.scrollTop = 0.0;
      }
    },
    mousemove(e) {
      this.tooltip = null;
      this.detectBarHovering(e);
    },
    mousedown() {
      if (this.hoverTrack !== null) {
        this.$emit('select-track', this.hoverTrack);
      }
    },
    mouseout() {
      this.detectBarHovering.cancel();
      this.hoverTrack = null;
    },
    detectBarHovering(e) {
      const { offsetX, offsetY } = e;
      const remainder = offsetY % 30;
      if (remainder > 20) {
        return;
      }
      const top = offsetY - (offsetY % 30) + 3;
      const bar = this.bars
        .filter((b) => b.top === top)
        .reverse()
        .find((b) => b.left < offsetX
        && (b.right > offsetX || b.left + b.minWidth > offsetX));
      if (!bar) {
        this.hoverTrack = null;
        return;
      }
      const subSection = bar.subSections.find((b) => offsetX > this.x(b.begin) && offsetX < this.x(b.end));
      const subDisplay = subSection ? subSection.value : 'None';
      const subDisplayColor = subSection ? subSection.color : 'transparent';
      this.hoverTrack = bar.id;
      this.tooltip = {
        left: offsetX,
        top: offsetY,
        contentColor: bar.color,
        subColor: subDisplayColor,
        name: bar.name,
        subDisplay,
      };
    },
  },
});
</script>

<template>
  <div style="position: relative;">
    <div
      class="event-chart"
      :style="`height: ${clientHeight - 10}px;`"
      @mousewheel.prevent
      @scroll="recordScroll"
    >
      <v-tooltip
        open-delay="100"
        top
      >
        <template #activator="{ on }">
          <div
            class="yaxisclick"
            :style="`height: ${clientHeight}px !important; top:${chartTop}px`"
            v-on="on"
            @click="showSymbols = !showSymbols; update()"
          />
        </template>
        <span
          class="ma-0 pa-1"
        >
          Click to toggle Symbols for set Values
        </span>
      </v-tooltip>
      <canvas
        ref="canvas"
        @mousemove="mousemove"
        @mouseout="mouseout"
        @mousedown="mousedown"
      />
    </div>
    <div
      v-if="tooltipComputed"
      class="tooltip"
      :style="tooltipComputed.style"
    >
      <v-row
        dense
        class="fill-height"
        align="center"
        justify="center"
      >
        <v-col>
          <span> {{ tooltipComputed.name }}</span>
        </v-col>
        <span
          class="type-color-box"
          :style="{ backgroundColor: tooltipComputed.contentColor }"
        />
        <v-col>
          <span>:</span>
        </v-col>
        <v-col>
          <span> {{ tooltipComputed.subDisplay }}</span>
        </v-col>
        <span
          class="type-color-box"
          :style="{ backgroundColor: tooltipComputed.subColor }"
        />
      </v-row>
    </div>
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
    background-color: rgba(144,238,144,0.20);

  }
}

</style>
