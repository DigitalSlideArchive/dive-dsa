<script>
import Vue from 'vue';
import { throttle } from 'lodash';
import * as d3 from 'd3';

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
      adjustRange: false,
      tempRange: [-1, -1],
      currentRange: [-1, -1],
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
    currentRange() {
      this.initialize();
      this.update();
    },
  },
  created() {
    this.update = throttle(this.update, 30);
  },
  mounted() {
    this.initialize();
  },
  methods: {
    initialize() {
      this.currentRange = this.yRange;
      d3.select(this.$el)
        .select('svg')
        .remove();
      let tooltipTimeoutHandle = null;
      const tooltip = d3
        .select(this.$el)
        .append('div')
        .attr('class', 'tooltip')
        .style('display', 'none');
      const width = this.clientWidth;
      const height = this.clientHeight;
      const x = d3
        .scaleLinear()
        .domain([this.startFrame, this.endFrame])
        .range([this.margin, width]);
      this.x = x;
      const maxVal = d3.max(this.data, (datum) => d3.max(datum.values, (d) => d[1]));
      const minVal = d3.min(this.data, (datum) => d3.min(datum.values, (d) => d[1]));
      let max = maxVal;
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
          .domain([min, Math.max(max * 1.2, 1.0)])
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
      svg
        .append('g')
        .attr('class', 'axis-y')
        .call(axis)
        .call((g) => g
          .selectAll('.tick text')
          .attr('x', -5)
          .attr('dx', 13));

      let highlightedLine = null;
      let highlightedColor = null;
      const path = svg
        .selectAll()
        .data(this.data)
        .enter()
        .append('path')
        .attr('class', 'line')
        .attr('d', (d) => this.getCurveType(d.values, 'line', d.max))
        .style('stroke', (d) => (d.color ? d.color : '#4c9ac2'))
        .attr('class', (d) => `${d.name} line `)
        .style('opacity', (d) => (d.lineOpacity !== undefined ? d.lineOpacity : 1.0))
        // Non-Arrow function to preserve the 'this' context for d3.mouse(this)
        .on('mouseenter', function mouseEnterHandler(d) {
          const [_x, _y] = d3.mouse(this);
          tooltipTimeoutHandle = setTimeout(() => {
            tooltip
              .style('left', `${_x + 2}px`)
              .style('top', `${_y - 25}px`)
              .text(d.name)
              .style('display', 'block');
            d3.select(this).style('stroke', 'cyan').style('stroke-width', 3);
            highlightedColor = d.color;
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
    getCurveType(d, lineArea, max) {
      let add = '';
      if (lineArea === 'area') {
        add = 'Area';
        if (!d.area) {
          return this[`linear${add}`]([]);
        }
      }
      if (d.type) {
        if (max) {
          add = `${add}Max`;
        }
        if (d.type === 'Step') {
          return this[`step${add}`](d.values);
        }
        if (d.type === 'StepBefore') {
          return this[`stepBefore${add}`](d.values);
        }
        if (d.type === 'StepAfter') {
          return this[`stepAfter${add}`](d.values);
        }
        if (d.type === 'Natural') {
          return this[`natural${add}`](d.values);
        }
      }
      if (!this.atrributesChart) {
        return this[`stepAfter${add}`](d.values);
      }
      return this[`linear${add}`](d.values);
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
          :style="`height: ${clientHeight}px;`"
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
  .line {
    fill: none;
    stroke-width: 1.5px;
  }

  .axis-y {
    font-size: 12px;

    g:first-of-type,
    g:last-of-type {
      display: none;
    }
  }

  .tooltip {
    position: absolute;
    background: black;
    border: 1px solid white;
    padding: 0px 5px;
    font-size: 14px;
  }
}
.area {
    fill: rgba(234, 255, 0, 0.2);
    stroke-width: 0;
}
</style>
