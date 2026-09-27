<script>
import Vue from 'vue';
import { throttle } from 'lodash';
import * as d3 from 'd3';
import {
  TIMELINE_TOOLTIP_BASE_CLASS,
  TIMELINE_TOOLTIP_GAP_PX,
  TIMELINE_TOOLTIP_Z_INDEX,
} from './timelineTooltip';

export default Vue.extend({
  name: 'LineChart',
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
    yRange: {
      type: Array,
      default: () => [-1, -1],
    },
    ticks: {
      type: Number,
      default: () => -1,
    },
    margin: {
      type: Number,
      default: 0,
    },
    data: {
      type: Array,
      required: true,
      validator(data) {
        return !data.find((datum) => !Array.isArray(datum.values));
      },
    },
    // Adds Linear charts, changes scale, highlighting of lines
    atrributesChart: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      chartTop: 0,
      adjustRange: false,
      tempRange: [-1, -1],
      currentRange: [-1, -1],
      currentTicks: -1,
    };
  },
  computed: {
    /**
     * Useful way to compute properties together for a single watcher so if either change
     * In the future this can be done easily with compositionAPI
     */
    clientDimensions() {
      return { width: this.clientWidth, height: this.clientHeight };
    },
  },
  watch: {
    startFrame() {
      this.update();
    },
    endFrame() {
      this.update();
    },
    clientDimensions() {
      this.initialize();
      this.update();
    },
    data() {
      this.initialize();
      this.update();
    },
    yRange() {
      this.initialize();
      this.update();
    },
    ticks() {
      this.initialize();
      this.update();
    },
    currentRange() {
      this.initialize();
      this.update();
    },
    currentTicks() {
      this.initialize();
      this.update();
    },
  },
  created() {
    this.update = throttle(this.update, 30);
  },
  mounted() {
    this.initialize();
    this.currentTicks = this.ticks;
    if (this.$refs.chart) {
      this.chartTop = this.$refs.chart.offsetTop;
    }
  },
  beforeDestroy() {
    if (this.lineChartTooltip) {
      this.lineChartTooltip.remove();
      this.lineChartTooltip = null;
    }
  },
  methods: {
    initialize() {
      this.currentRange = this.yRange;
      d3.select(this.$el)
        .select('svg')
        .remove();
      if (this.lineChartTooltip) {
        this.lineChartTooltip.remove();
      }
      const tooltip = d3
        .select(document.body)
        .append('div')
        .attr('class', `${TIMELINE_TOOLTIP_BASE_CLASS} line-chart-tooltip`)
        .style('display', 'none')
        .style('background', 'black')
        .style('color', 'white')
        .style('border', '1px solid white')
        .style('padding', '0px 5px')
        .style('font-size', '14px')
        .style('width', 'fit-content')
        .style('max-width', 'fit-content')
        .style('white-space', 'nowrap')
        .style('pointer-events', 'none');
      this.lineChartTooltip = tooltip;
      const width = this.clientWidth;
      const height = this.clientHeight;
      const x = d3
        .scaleLinear()
        .domain([this.startFrame, this.endFrame])
        .range([this.margin, width]);
      this.x = x;
      const maxVal = d3.max(this.data, (datum) => d3.max(datum.values, (d) => d[1]));
      const minVal = d3.min(this.data, (datum) => d3.min(datum.values, (d) => d[1]));
      let max = maxVal * 1.10;
      let min = minVal;
      if (this.currentRange !== undefined) {
        if (this.currentRange[0] !== -1) {
          [min] = this.currentRange;
        }
        if (this.currentRange[1] !== -1) {
          [, max] = this.currentRange;
        }
      }
      this.tempRange = [min, max];
      let y = d3
        .scaleLinear()
        .domain([0, Math.max(max + max * 0.2, 2)])
        .range([height, 0]);
      if (this.atrributesChart) {
        y = d3
          .scaleLinear()
          .domain([min, Math.max(max * 1.0, 1.0)])
          .range([height, 0]);
      }

      this.generateLineAreas(minVal, maxVal, x, y);

      const svg = d3
        .select(this.$el)
        .append('svg')
        .style('display', 'block')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', 'translate(0,-1)');

      const axis = d3.axisRight(y).tickSize(width);
      if (this.currentTicks > 0) {
        axis.tickValues(d3.ticks(min, max, this.currentTicks));
      }
      svg
        .append('g')
        .attr('class', 'axis-y')
        .call(axis)
        .call((g) => g
          .selectAll('.tick text')
          .attr('x', -5)
          .attr('dx', 13)
          .style('user-select', 'none')
          .style('-webkit-user-select', 'none')
          .style('pointer-events', 'none'));

      let highlightedLine = null;
      let highlightedColor = null;
      let tooltipTimeoutHandle = null;
      const path = svg
        .selectAll()
        .data(this.data)
        .enter()
        .append('path')
        .attr('class', 'line')
        .attr('d', (d) => this.getCurveType(d, 'line', d.max))
        .style('stroke', (d) => (d.color ? d.color : '#4c9ac2'))
        .attr('class', (d) => `${d.name} line `)
        .style('opacity', (d) => (d.lineOpacity !== undefined ? d.lineOpacity : 1.0))
        // Non-Arrow function to preserve the 'this' context for d3.pointer
        .on('mouseenter', function mouseEnterHandler(event, d) {
          tooltipTimeoutHandle = setTimeout(() => {
            tooltip
              .style('left', `${event.clientX}px`)
              .style('top', `${event.clientY}px`)
              .style('position', 'fixed')
              .style('transform', `translate(-50%, calc(-100% - ${TIMELINE_TOOLTIP_GAP_PX}px))`)
              .style('z-index', String(TIMELINE_TOOLTIP_Z_INDEX))
              .text(d.name)
              .style('display', 'block');
            d3.select(this).style('stroke', 'cyan').style('stroke-width', 3);
            highlightedColor = d.color;
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            highlightedLine = this;
          }, 50);
        })
        // eslint-disable-next-line prefer-arrow-callback
        .on('mouseout', function mouseExitHandler() {
          clearTimeout(tooltipTimeoutHandle);
          tooltip.style('display', 'none');
          if (highlightedLine !== null) {
            d3.select(highlightedLine).style('stroke', highlightedColor).style('stroke-width', 1);
          }
        });
      this.path = path;
      this.area = svg
        .selectAll()
        .data(this.data)
        .enter()
        .append('path')
        .attr('class', 'area')
        .attr('d', (d) => this.getCurveType(d, 'area', d.max))
        .style('fill', (d) => (d.areaColor ? d.areaColor : '#4c9ac2'))
        .style('opacity', (d) => (d.areaOpacity !== undefined ? d.areaOpacity : 0.2));

      this.update();
    },
    generateLineAreas(min, max, x, y) {
      this.d3Map = {
        linear: d3.curveLinear,
        step: d3.curveStep,
        stepBefore: d3.curveStepBefore,
        stepAfter: d3.curveStepAfter,
        natural: d3.curveNatural,
      };
      const lineTypes = ['linear', 'step', 'stepBefore', 'stepAfter', 'natural'];
      // eslint-disable-next-line func-names
      lineTypes.forEach((lineType) => {
        this[lineType] = d3.line()
          .curve(this.d3Map[lineType])
          .x((d) => x(d[0]))
          .y((d) => y(d[1]));

        this[`${lineType}Max`] = d3.line()
          .curve(this.d3Map[lineType])
          .x((d) => x(d[0]))
          .y((d) => y(d[1] ? max : min));

        this[`${lineType}Area`] = d3.area()
          .curve(this.d3Map[lineType])
          .x((d) => x(d[0]))
          .y1((d) => y(d[1]))
          .y0(y(min));
        this[`${lineType}AreaMax`] = d3.area()
          .curve(this.d3Map[lineType])
          .x((d) => x(d[0]))
          .y1((d) => y(d[1] ? max : min))
          .y0(y(min));
      });
    },
    /** Index of the first point at or after `frame`; values are frame-ordered. */
    findFrameIndex(values, frame) {
      let low = 0;
      let high = values.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (values[mid][0] < frame) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    },
    /**
     * Restrict a series to the visible frame window and, when silhouette is true, reduce it to
     * at most two points per pixel column (that column's min and max). A column cannot render
     * more than its extremes, so the drawn silhouette is unchanged while the path shrinks by
     * orders of magnitude on long videos. One point beyond each edge is kept so the line still
     * enters and exits the viewport at the correct slope. Silhouette collapse is skipped for
     * Natural curves, which depend on interior control points and would otherwise distort.
     */
    decimateValues(values, silhouette = true) {
      if (!Array.isArray(values) || values.length < 4 || !this.x) {
        return values;
      }
      const startIndex = Math.max(0, this.findFrameIndex(values, this.startFrame) - 1);
      const endIndex = Math.min(
        values.length - 1,
        this.findFrameIndex(values, this.endFrame) + 1,
      );
      if (endIndex <= startIndex || !silhouette) {
        return values.slice(startIndex, endIndex + 1);
      }
      const decimated = [];
      let column = NaN;
      let lowest = null;
      let highest = null;
      const flushColumn = () => {
        if (lowest === null) {
          return;
        }
        if (lowest === highest) {
          decimated.push(lowest);
        } else if (lowest[0] <= highest[0]) {
          decimated.push(lowest, highest);
        } else {
          decimated.push(highest, lowest);
        }
      };
      for (let i = startIndex; i <= endIndex; i += 1) {
        const point = values[i];
        const pixel = Math.round(this.x(point[0]));
        if (pixel !== column) {
          flushColumn();
          column = pixel;
          lowest = point;
          highest = point;
        } else {
          if (point[1] < lowest[1]) {
            lowest = point;
          }
          if (point[1] > highest[1]) {
            highest = point;
          }
        }
      }
      flushColumn();
      return decimated;
    },
    getCurveType(d, lineArea, max) {
      let add = '';
      if (lineArea === 'area') {
        add = 'Area';
        if (!d.area) {
          return this[`linear${add}`]([]);
        }
      }
      // Natural splines need interior points; only cull to the visible window for them.
      const values = this.decimateValues(d.values, d.type !== 'Natural');
      if (d.type) {
        if (max) {
          add = `${add}Max`;
        }
        if (d.type === 'Step') {
          return this[`step${add}`](values);
        }
        if (d.type === 'StepBefore') {
          return this[`stepBefore${add}`](values);
        }
        if (d.type === 'StepAfter') {
          return this[`stepAfter${add}`](values);
        }
        if (d.type === 'Natural') {
          return this[`natural${add}`](values);
        }
      }
      if (!this.atrributesChart) {
        return this[`stepAfter${add}`](values);
      }
      return this[`linear${add}`](values);
    },
    updateCurves() {
      const lineTypes = ['linear', 'step', 'stepBefore', 'stepAfter', 'natural'];
      lineTypes.forEach((item) => {
        this[`${item}`].x((d) => this.x(d[0]));
        this[`${item}Max`].x((d) => this.x(d[0]));
        this[`${item}Area`].x((d) => this.x(d[0]));
      });
    },
    update() {
      this.x.domain([this.startFrame, this.endFrame]);
      this.updateCurves();
      this.path.attr('d', (d) => this.getCurveType(d, 'line', d.max));
      this.area.attr('d', (d) => this.getCurveType(d, 'area', d.max));
    },
    doubleClick() {
      this.tempRange = this.currentRange;
      this.adjustRange = true;
    },
    saveRange() {
      this.adjustRange = false;
      this.currentRange = this.tempRange;
      this.initialize();
    },
    cancelRange() {
      this.adjustRange = false;
      this.currentRange = this.tempRange;
      this.initialize();
    },
  },
});
</script>

<template>
  <div
    ref="chart"
    class="line-chart"
    :style="`height: ${clientHeight}px;`"
  >
    <v-tooltip
      v-if="atrributesChart"
      open-delay="100"
      top
    >
      <template #activator="{ on }">
        <div
          class="yaxisclick"
          :style="`height: ${clientHeight}px; top:${chartTop}px`"
          v-on="on"
          @dblclick="doubleClick"
        />
      </template>
      <span
        class="ma-0 pa-1"
      >
        Double Click to adjust the Y-Axis
      </span>
    </v-tooltip>
    <v-dialog
      v-model="adjustRange"
      width="400"
    >
      <v-card>
        <v-card-title>Y-Axis Range</v-card-title>
        <v-card-text>
          <v-row>
            <v-text-field
              v-model.number="currentRange[0]"
              type="number"
              label="Min"
              hint="-1 will auto calculate"
              persistent-hint
            />
            <v-text-field
              v-model.number="currentRange[1]"
              type="number"
              label="Max"
              hint="-1 will auto calculate"
              persistent-hint
            />
          </v-row>
          <v-row>
            <v-text-field
              v-model.number="currentTicks"
              type="number"
              label="Tick Count"
              hint="-1 will auto calculate"
              persistent-hint
            />
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-btn
            depressed
            text
            @click="cancelRange"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="saveRange"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style lang="scss">
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
.line-chart {
  height: 100%;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;

  .line {
    fill: none;
    stroke-width: 1.5px;
  }

  .axis-y {
    font-size: 12px;
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;

    .tick text {
      -webkit-user-select: none;
      -ms-user-select: none;
      user-select: none;
      pointer-events: none;
    }

    g:first-of-type,
    g:last-of-type {
      display: none;
    }
  }

}
.area {
    fill: rgba(234, 255, 0, 0.2);
    stroke-width: 0;
}
</style>
