<!-- eslint-disable max-len -->
<script lang="ts">
import {
  defineComponent, PropType, ref, Ref, watch,
} from '@vue/composition-api';
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
    offset: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    const uniqueKeys = (data: SwimlaneAttribute['data']) => {
      const vals: {value: string; color: string}[] = [];
      data.forEach((item) => {
        if (vals.findIndex((findItem) => findItem.value === item.value) === -1) {
          vals.push({ value: item.value.toString(), color: item.color || 'white' });
        }
      });
      return vals;
    };
    const keyRef: Ref<HTMLElement | null> = ref(null);
    watch(() => props.offset, () => {
      if (keyRef.value !== null) {
        keyRef.value.scrollTop = props.offset;
      }
    });
    return {
      uniqueKeys,
      keyRef,
    };
  },
});
</script>

<template>
  <div
    ref="keyRef"
    class="key mb-5"
    :style="{top: `${clientTop}px`, height: `${clientHeight-10}px`, maxHeight: `${clientHeight-10}px`, right: `${clientWidth}px`}"
    @wheel.prevent
    @touchmove.prevent
    @scroll.prevent
  >
    <v-row
      v-for="(item, key, index) in data"
      :key="`${item}_${key}_${index}`"
      style="margin-top:3px"
      align="center"
      justify="center"
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
            v-for="subData in uniqueKeys(item.data)"
            :key="subData.value"
            align="center"
            justify="center"
            dense
          >
            <span
              class="key-subitem"
              :style="{color: subData.color, border: `1px solid ${subData.color}`, height:'20px'}"
            >
              {{ subData.value }}</span>
          </v-row>
        </div>
      </v-tooltip>
    </v-row>
    <v-row class="my-5" />
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
    padding-bottom: 5px;
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
    overflow-y:hidden;
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */

  }
.key::-webkit-scrollbar{
  display:none
}

</style>
