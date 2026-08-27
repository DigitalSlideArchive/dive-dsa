<script lang="ts">
import { defineComponent, PropType } from 'vue';
import {
  getTruncatedCustomUIDisplayValue,
  LONG_VALUE_EXPAND_THRESHOLD,
  ResolvedAttributeCustomUI,
  shouldUseCustomUIValueExpansion,
} from 'vue-media-annotator/use/attributeCustomUI';

export interface CustomUIValueEntry {
  attribute: string;
  value: string;
  rawLength: number;
  longValueMode: ResolvedAttributeCustomUI['longValueMode'];
  inherited: boolean;
  indicatorStyle: Record<string, string>;
  tooltip: string;
}

export default defineComponent({
  name: 'CustomUIAttributeValueDisplay',
  props: {
    entry: {
      type: Object as PropType<CustomUIValueEntry>,
      required: true,
    },
    attributeName: {
      type: String,
      required: true,
    },
    panelExpanded: {
      type: Number as PropType<number | undefined>,
      default: undefined,
    },
  },
  setup() {
    return {
      LONG_VALUE_EXPAND_THRESHOLD,
      getTruncatedCustomUIDisplayValue,
      shouldUseCustomUIValueExpansion,
    };
  },
  methods: {
    onPanelChange() {
      this.$emit('toggle-panel', this.attributeName);
    },
  },
});
</script>

<template>
  <div>
    <template v-if="shouldUseCustomUIValueExpansion(entry.rawLength, entry.longValueMode)">
      <v-expansion-panels :value="panelExpanded">
        <v-expansion-panel class="border" @change="onPanelChange">
          <v-expansion-panel-header>{{ attributeName }} Value</v-expansion-panel-header>
          <v-expansion-panel-content>
            <v-tooltip bottom :disabled="!entry.inherited">
              <template #activator="{ on }">
                <span :style="entry.indicatorStyle" v-on="entry.inherited ? on : undefined">
                  {{ entry.value }}
                </span>
              </template>
              <span>{{ entry.tooltip }}</span>
            </v-tooltip>
          </v-expansion-panel-content>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>
    <span
      v-else-if="entry.longValueMode === 'scroll'"
      class="custom-ui-attribute-value--scroll"
    >
      <v-tooltip bottom :disabled="!entry.inherited">
        <template #activator="{ on }">
          <span :style="entry.indicatorStyle" v-on="entry.inherited ? on : undefined">
            {{ entry.value }}
          </span>
        </template>
        <span>{{ entry.tooltip }}</span>
      </v-tooltip>
    </span>
    <v-tooltip v-else bottom :disabled="!entry.inherited">
      <template #activator="{ on }">
        <span :style="entry.indicatorStyle" v-on="entry.inherited ? on : undefined">
          {{ getTruncatedCustomUIDisplayValue(entry.value, entry.rawLength, entry.longValueMode) }}
        </span>
      </template>
      <span>{{ entry.tooltip }}</span>
    </v-tooltip>
  </div>
</template>

<style scoped lang="scss">
.custom-ui-attribute-value--scroll {
  display: block;
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
