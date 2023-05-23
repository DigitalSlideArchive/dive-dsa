<!-- eslint-disable max-len -->
<script lang="ts">
import { defineComponent, PropType } from '@vue/composition-api';
import { SwimlaneAttribute } from 'vue-media-annotator/use/AttributeTypes';

export default defineComponent({
  name: 'TimelineKey',
  props: {
    clientHeight: {
      type: Number,
      default: 0,
    },
    clientTop: {
      type: Number,
      default: 0,
    },
    clientWidth: {
      type: Number,
      default: 0,
    },
    data: {
      type: Object as PropType<Record<string, SwimlaneAttribute>>,
      required: true,
    },
  },
  setup() {
    return {
    };
  },
});
</script>

<template>
  <div
    class="key"
    :style="{top: `${clientTop}px`, height: `${clientHeight-10}px`, right: `${clientWidth}px`}"
  >
    <v-row
      v-for="(item, key, index) in data"
      :key="`${key}_${index}`"
      style="margin-top:3px"
      dense
    >
      <v-tooltip
        open-delay="100"
        top
        max-width="200"
        content-class="customTooltip"
      >
        <template #activator="{ on }">
          <div
            class="key-item"
            :style="{color: item.color, border: `2px solid ${item.color}`, height:'20px', marginTop: '6px'}"
            v-on="on"
          >
            <span
              class="key-text"
            > {{ key }}</span>
          </div>
        </template>
        <div>
          <v-row
            v-for="subData in item.data"
            :key="subData.value"
            dense
          >
            <span
              class="key-subitem"
              :style="{color: subData.color, border: `1px solid ${subData.color}`, height:'20px', marginTop: '8px'}"
            >
              {{ subData.value }}</span>
          </v-row>
        </div>
      </v-tooltip>
    </v-row>
  </div>
</template>

<style scoped lang="scss">
.border-radius {
  border: 1px solid #888888;
  padding: 2px 5px;
  border-radius: 5px;
}
.key-item {
    padding: 0px 3px;
    width: 100%;
    text-align: center;
    &:hover {
        cursor: pointer;
    }
}
.key-text {
    width: 100%;
    height:100%;
}
.customTooltip {
    background: black;
    border: 1px solid white;
}

.key-subitem {
    width: 100%;
    padding: 0px 3px;
    text-align: center;
}
.key {
    position: absolute;
    background: black;
    border: 1px solid white;
    padding: 0px 10px;
    font-size: 15px;
    font-weight: bolder;
    z-index: 2;
    overflow-y:auto;
  }

</style>
