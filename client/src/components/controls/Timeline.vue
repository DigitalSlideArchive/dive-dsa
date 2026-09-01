<script>
import { throttle } from 'lodash';
import * as d3 from 'd3';

export default {
  name: 'Timeline',
  props: {
    maxFrame: {
      type: Number,
      default: 0,
    },
    frame: {
      type: Number,
      default: 0,
    },
    timelineHeight: {
      type: Number,
      default: 175,
    },
    display: {
      type: Boolean,
      default: true,
    },
    keyInset: {
      type: Number,
      default: 0,
    },
    chartRightInset: {
      type: Number,
      default: 0,
    },
  },
  data() {
    return {
      init: !!this.maxFrame,
      mounted: false,
      startFrame: 0,
      endFrame: this.maxFrame,
      timelineScale: null,
      clientWidth: 0,
      clientHeight: 0,
      margin: 20,
      resizeObserver: null,
    };
  },
  computed: {
    minimapFillStyle() {
      return {
        left: `${(this.startFrame / this.maxFrame) * 100}%`,
        width: `${((this.endFrame - this.startFrame) / this.maxFrame) * 100}%`,
      };
    },
    handLeftPosition() {
      if (
        !this.mounted
        || this.frame < this.startFrame
        || this.frame > this.endFrame
      ) {
        return null;
      }
      const chartLeft = this.getChartLeft();
      const chartWidth = this.getChartWidth();
      if (chartWidth <= 0) {
        return null;
      }
      return Math.round(
        chartLeft + chartWidth
          * ((this.frame - this.startFrame) / (this.endFrame - this.startFrame)),
      );
    },
  },
  watch: {
    timelineHeight() {
      this.$nextTick(() => {
        this.initialize();
      });
    },
    maxFrame(value) {
      this.endFrame = value;
      this.init = true;
      this.update();
    },
    startFrame() {
      this.update();
    },
    endFrame() {
      this.update();
    },
    handLeftPosition(value) {
      this.$refs.hand.style.left = `${value || '-10'}px`;
    },
    frame(frame) {
      const range = this.endFrame - this.startFrame;
      if (range <= 0) {
        return;
      }
      const edgePadding = Math.max(1, Math.round(range * 0.1));
      if (frame > this.endFrame) {
        this.endFrame = Math.min(frame + edgePadding, this.maxFrame);
        this.startFrame = Math.max(0, this.endFrame - range);
      } else if (frame < this.startFrame) {
        this.startFrame = Math.max(frame - edgePadding, 0);
        this.endFrame = Math.min(this.maxFrame, this.startFrame + range);
      }
    },
    display(val) {
      if (!val) {
        this.clientHeight = 0;
      } else {
        this.initialize();
      }
    },
    keyInset() {
      this.$nextTick(() => {
        this.updateLayout();
      });
    },
    chartRightInset() {
      this.$nextTick(() => {
        this.updateLayout();
      });
    },
  },
  created() {
    this.update = throttle(this.update, 30);
    // Only resize when finished dragging the window
    window.addEventListener('resize', this.resizeHandler);
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.resizeObserver && this.$refs.workarea) {
      this.resizeObserver.unobserve(this.$refs.workarea);
      this.resizeObserver.disconnect();
    }
  },
  mounted() {
    this.initialize();
  },
  methods: {
    getChartLeft() {
      return this.margin + (this.keyInset || 0);
    },
    getChartRight() {
      return this.clientWidth + (this.chartRightInset || 0);
    },
    getChartWidth() {
      return Math.max(0, this.getChartRight() - this.getChartLeft());
    },
    initialize() {
      if (!this.$refs.workarea) {
        return;
      }
      if (this.$refs.workarea && !this.resizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          this.resizeHandler();
        });
        this.resizeObserver.observe(this.$refs.workarea);
      }
      if (!this.svg) {
        this.svg = d3
          .select(this.$refs.workarea)
          .append('svg');
        this.g = this.svg.append('g');
        this.timelineScale = d3.scaleLinear();
        this.axis = d3
          .axisTop()
          .scale(this.timelineScale)
          .tickSizeOuter(0);
      }
      this.updateLayout();
      this.mounted = true;
    },
    updateLayout() {
      if (!this.$refs.workarea || !this.timelineScale) {
        return;
      }
      const width = this.$refs.workarea.clientWidth || 0;
      const height = this.$refs.workarea.clientHeight || 0;
      // clientWidth and clientHeight are properties used to resize child elements
      this.clientWidth = width - this.margin;
      // Timeline height needs to offset so it doesn't overlap the frame number
      this.clientHeight = height - 15;
      const chartLeft = this.getChartLeft();
      this.timelineScale.range([chartLeft, this.getChartRight()]);
      this.axis.tickSize(height - 30);
      this.svg.style('display', 'block')
        .attr('width', this.clientWidth)
        .attr('height', height);
      this.g.attr('transform', `translate(0,${height - 15})`);
      this.update();
    },
    resizeHandler() {
      // Debounces resize to prevent it from be calling continuously.
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(this.updateLayout, 200);
      this.$nextTick(() => this.$emit('resize'));
    },
    onwheel(e) {
      if (e.shiftKey) {
        return;
      }
      const extend = Math.round((this.endFrame - this.startFrame) * 0.2)
        * Math.sign(e.deltaY);
      const chartLeft = this.getChartLeft();
      const chartWidth = this.getChartWidth();
      if (chartWidth <= 0) {
        return;
      }
      const workareaLeft = this.$refs.workarea.getBoundingClientRect().left;
      const ratio = Math.max(0, Math.min(1, (e.clientX - workareaLeft - chartLeft) / chartWidth));
      let startFrame = this.startFrame - extend * ratio;
      let endFrame = this.endFrame + extend * (1 - ratio);
      startFrame = Math.max(0, startFrame);
      endFrame = Math.min(this.maxFrame, endFrame);
      if (startFrame >= endFrame - 10) {
        return;
      }
      this.startFrame = startFrame;
      this.endFrame = endFrame;
    },
    updateAxis() {
      if (!this.g || !this.axis) {
        return;
      }
      this.g.call(this.axis).call((g) => g
        .selectAll('.tick text')
        .attr('y', 0)
        .attr('dy', 13)
        .style('user-select', 'none')
        .style('-webkit-user-select', 'none'));
    },
    update() {
      if (!this.timelineScale || !this.axis || !this.g) {
        return;
      }
      this.timelineScale.domain([this.startFrame, this.endFrame]);
      this.axis.scale(this.timelineScale);
      this.updateAxis();
    },
    emitSeek(e) {
      const chartLeft = this.getChartLeft();
      const workareaLeft = this.$refs.workarea.getBoundingClientRect().left;
      const leftBounds = workareaLeft + chartLeft;
      const rightBounds = workareaLeft + this.getChartRight();
      if (e.clientX > leftBounds && e.clientX < rightBounds) {
        const frame = Math.round(
          ((e.clientX - leftBounds)
          / (rightBounds - leftBounds))
          * (this.endFrame - this.startFrame)
          + this.startFrame,
        );
        this.$emit('seek', frame);
      }
    },
    workareaMouseup(e) {
      if (this.dragging) {
        this.emitSeek(e);
      }
      this.dragging = false;
    },
    workareaMousedown(e) {
      this.dragging = true;
      e.preventDefault();
    },
    workareaMousemove(e) {
      if (this.dragging) {
        this.emitSeek(e);
      }
      e.preventDefault();
    },
    workareaMouseleave() {
      this.dragging = false;
    },
    minimapFillMousedown(e) {
      e.preventDefault();
      this.minimapDragging = true;
      this.minimapDraggingStartClientX = e.clientX;
      this.minimapDraggingStartFrame = this.startFrame;
      this.minimapDraggingEndFrame = this.endFrame;
    },
    containerMousemove(e) {
      e.preventDefault();
      if (!this.minimapDragging) {
        return;
      }
      if (!e.which) {
        this.minimapDragging = false;
        return;
      }
      const delta = this.minimapDraggingStartClientX - e.clientX;
      const frameDelta = (delta / this.clientWidth) * this.maxFrame;
      const startFrame = this.minimapDraggingStartFrame - frameDelta;
      if (startFrame < 0) {
        return;
      }
      const endFrame = this.minimapDraggingEndFrame - frameDelta;
      if (endFrame > this.maxFrame) {
        return;
      }
      this.startFrame = startFrame;
      this.endFrame = endFrame;
    },
    containerMouseup() {
      this.minimapDragging = false;
    },
  },
};
</script>

<template>
  <div
    class="timeline"
    :style="`height: ${timelineHeight}px`"
    @wheel="onwheel"
    @mouseup="containerMouseup"
    @mousemove="containerMousemove"
  >
    <div
      ref="workarea"
      class="work-area"
      @mouseup="workareaMouseup"
      @mousedown="workareaMousedown"
      @mousemove="workareaMousemove"
      @mouseleave="workareaMouseleave"
    >
      <div
        ref="hand"
        class="hand"
      />
      <div
        v-if="init && mounted"
        class="child"
      >
        <slot
          name="child"
          :start-frame="startFrame"
          :end-frame="endFrame"
          :max-frame="maxFrame"
          :client-width="clientWidth"
          :client-height="clientHeight"
          :margin="margin"
        />
      </div>
    </div>
    <div
      ref="minimap"
      class="minimap"
    >
      <div
        class="fill"
        :style="minimapFillStyle"
        @mousedown="minimapFillMousedown"
      >
        <!-- {{ rendered() }} -->
      </div>
    </div>
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.timeline {
  min-height: 175px;
  position: relative;
  display: flex;
  flex-direction: column;

  .work-area {
    flex: 1;
    position: relative;
    overflow: visible;
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;

    svg {
      -webkit-user-select: none;
      -ms-user-select: none;
      user-select: none;
    }

    .hand {
      position: absolute;
      top: 0;
      width: 0;
      height: 100%;
      border-left: 1px solid #299be3;
      z-index:1;
    }

    .child {
      position: absolute;
      top: 0;
      bottom: 17px;
      left: 0;
      right: 0;
    }
  }

  .minimap {
    height: 10px;

    .fill {
      position: relative;
      height: 100%;
      background-color: #80c6e8;
    }
  }
}
</style>

<style lang="scss">
.timeline {
  .tick {
    shape-rendering: crispEdges;
    font-size: 12px;
    stroke-opacity: 0.5;
    stroke-dasharray: 2, 2;
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;

    text {
      -webkit-user-select: none;
      -ms-user-select: none;
      user-select: none;
      pointer-events: none;
    }
  }
}
</style>
