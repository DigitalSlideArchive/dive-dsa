<script lang="ts">
import { defineComponent, PropType } from 'vue';
import {
  getCustomUIDisplayValueStyle,
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
  valuePrepend?: string;
  valueAppend?: string;
  valueFontSizeScale: number;
  valueAlign: NonNullable<ResolvedAttributeCustomUI['valueAlign']>;
  valueColorStyle: Record<string, string>;
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
      getCustomUIDisplayValueStyle,
      getTruncatedCustomUIDisplayValue,
      shouldUseCustomUIValueExpansion,
    };
  },
  methods: {
    onPanelChange() {
      this.$emit('toggle-panel', this.attributeName);
    },
    getValueTextStyle(entry: CustomUIValueEntry) {
      return {
        ...entry.valueColorStyle,
        ...entry.indicatorStyle,
      };
    },
  },
});
</script>

<template>
  <div
    class="custom-ui-attribute-value-display"
    :style="getCustomUIDisplayValueStyle(entry.valueFontSizeScale, entry.valueAlign)"
  >
    <span v-if="entry.valuePrepend">{{ entry.valuePrepend }}</span>
    <template v-if="shouldUseCustomUIValueExpansion(entry.rawLength, entry.longValueMode)">
      <v-expansion-panels :value="panelExpanded" class="custom-ui-attribute-value-display__panel">
        <v-expansion-panel class="border" @change="onPanelChange">
          <v-expansion-panel-header>{{ attributeName }} Value</v-expansion-panel-header>
          <v-expansion-panel-content>
            <v-tooltip bottom :disabled="!entry.inherited">
              <template #activator="{ on }">
                <span :style="getValueTextStyle(entry)" v-on="entry.inherited ? on : undefined">
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
          <span :style="getValueTextStyle(entry)" v-on="entry.inherited ? on : undefined">
            {{ entry.value }}
          </span>
        </template>
        <span>{{ entry.tooltip }}</span>
      </v-tooltip>
    </span>
    <v-tooltip v-else bottom :disabled="!entry.inherited">
      <template #activator="{ on }">
        <span :style="getValueTextStyle(entry)" v-on="entry.inherited ? on : undefined">
          {{ getTruncatedCustomUIDisplayValue(entry.value, entry.rawLength, entry.longValueMode) }}
        </span>
      </template>
      <span>{{ entry.tooltip }}</span>
    </v-tooltip>
    <span v-if="entry.valueAppend">{{ entry.valueAppend }}</span>
  </div>
</template>

<style scoped lang="scss">
.custom-ui-attribute-value-display {
  display: block;
  width: 100%;
  word-break: break-word;
}

.custom-ui-attribute-value-display__panel {
  display: inline-block;
  vertical-align: top;
  width: 100%;
  max-width: 100%;
}

.custom-ui-attribute-value--scroll {
  display: inline-block;
  max-height: 120px;
  max-width: 100%;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  vertical-align: top;
}
</style>
