<script lang="ts">
import { defineComponent, PropType } from 'vue';
import {
  getCustomUIDisplayValueStyle,
  getCustomUIValueDisplayContent,
  getTruncatedCustomUIDisplayValue,
  LONG_VALUE_EXPAND_THRESHOLD,
  ResolvedAttributeCustomUI,
  shouldShowCustomUIValueTooltip,
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
    inline: {
      type: Boolean,
      default: false,
    },
    headerValueOffset: {
      type: Number,
      default: 4,
    },
    reserveSpace: {
      type: Boolean,
      default: true,
    },
  },
  setup() {
    return {
      LONG_VALUE_EXPAND_THRESHOLD,
      getCustomUIDisplayValueStyle,
      getCustomUIValueDisplayContent,
      getTruncatedCustomUIDisplayValue,
      shouldShowCustomUIValueTooltip,
      shouldUseCustomUIValueExpansion,
    };
  },
  computed: {
    displayValueText(): string {
      return getCustomUIValueDisplayContent(this.entry.value, this.reserveSpace);
    },
    truncatedDisplayValueText(): string {
      return getTruncatedCustomUIDisplayValue(
        this.displayValueText,
        this.entry.rawLength,
        this.entry.longValueMode,
      );
    },
    isEmptyDisplayValue(): boolean {
      return this.entry.value.length === 0;
    },
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
    showValueTooltip(entry: CustomUIValueEntry) {
      return shouldShowCustomUIValueTooltip(
        entry.inherited,
        entry.rawLength,
        entry.longValueMode,
      );
    },
  },
});
</script>

<template>
  <div
    class="custom-ui-attribute-value-display"
    :class="{
      'custom-ui-attribute-value-display--inline': inline,
      'custom-ui-attribute-value-display--reserve-space': reserveSpace,
      'custom-ui-attribute-value-display--scroll': entry.longValueMode === 'scroll',
    }"
    :style="inline
      ? { ...getCustomUIDisplayValueStyle(entry.valueFontSizeScale, entry.valueAlign), marginLeft: `${headerValueOffset}px` }
      : getCustomUIDisplayValueStyle(entry.valueFontSizeScale, entry.valueAlign)"
  >
    <span v-if="entry.valuePrepend">{{ entry.valuePrepend }}</span>
    <template v-if="shouldUseCustomUIValueExpansion(entry.rawLength, entry.longValueMode)">
      <v-expansion-panels :value="panelExpanded" class="custom-ui-attribute-value-display__panel">
        <v-expansion-panel class="border" @change="onPanelChange">
          <v-expansion-panel-header>{{ attributeName }} Value</v-expansion-panel-header>
          <v-expansion-panel-content>
            <v-tooltip bottom :disabled="!showValueTooltip(entry)">
              <template #activator="{ on }">
                <span
                  class="custom-ui-attribute-value-display__text"
                  :class="{ 'custom-ui-attribute-value-display__text--empty': isEmptyDisplayValue }"
                  :style="getValueTextStyle(entry)"
                  v-on="showValueTooltip(entry) ? on : undefined"
                >
                  {{ displayValueText }}
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
      <v-tooltip bottom :disabled="!showValueTooltip(entry)">
        <template #activator="{ on }">
          <span
            class="custom-ui-attribute-value-display__text"
            :class="{ 'custom-ui-attribute-value-display__text--empty': isEmptyDisplayValue }"
            :style="getValueTextStyle(entry)"
            v-on="showValueTooltip(entry) ? on : undefined"
          >
            {{ displayValueText }}
          </span>
        </template>
        <span>{{ entry.tooltip }}</span>
      </v-tooltip>
    </span>
    <v-tooltip v-else bottom :disabled="!showValueTooltip(entry)">
      <template #activator="{ on }">
        <span
          class="custom-ui-attribute-value-display__text"
          :class="{ 'custom-ui-attribute-value-display__text--empty': isEmptyDisplayValue }"
          :style="getValueTextStyle(entry)"
          v-on="showValueTooltip(entry) ? on : undefined"
        >
          {{ truncatedDisplayValueText }}
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

.custom-ui-attribute-value-display--inline {
  display: inline-block;
  width: auto;
  vertical-align: baseline;
}

.custom-ui-attribute-value-display--reserve-space {
  min-height: 1.25em;
}

.custom-ui-attribute-value-display--reserve-space.custom-ui-attribute-value-display--scroll {
  min-height: 120px;
}

.custom-ui-attribute-value-display__text--empty {
  visibility: hidden;
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
