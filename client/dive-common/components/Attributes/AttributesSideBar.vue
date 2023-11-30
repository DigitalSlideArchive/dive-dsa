<script lang="ts">
import {
  defineComponent, ref, watch, PropType,
} from 'vue';

import StackedVirtualSidebarContainer from 'dive-common/components/StackedVirtualSidebarContainer.vue';
import { useReadOnlyMode } from 'vue-media-annotator/provides';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import AttributeFilters from 'vue-media-annotator/components/AttributeFilters.vue';
import AttributeTimelineNumeric from 'vue-media-annotator/components/AttributeTimelineNumeric.vue';
import AttributeTimelineString from 'vue-media-annotator/components/AttributeTimelineString.vue';
import TooltipBtn from 'vue-media-annotator/components/TooltipButton.vue';

export default defineComponent({
  name: 'AttributesSideBar',

  components: {
    StackedVirtualSidebarContainer,
    AttributeFilters,
    AttributeTimelineNumeric,
    AttributeTimelineString,
    TooltipBtn,
  },

  props: {
    width: {
      type: Number,
      default: 300,
    },
    subCategory: {
      type: String as PropType<'Timeline' | 'Filtering' | 'Swimlane'>,
      required: false,
    },
  },

  setup(props) {
    const readOnlyMode = useReadOnlyMode();
    const { visible } = usePrompt();
    const currentMode = ref(props.subCategory);
    const modes = ref(['Filtering', 'Timeline', 'Swimlane']);
    watch(() => props.subCategory, () => {
      if (props.subCategory !== undefined) {
        currentMode.value = props.subCategory;
      }
    });
    return {
      readOnlyMode,
      currentMode,
      modes,
      visible,
    };
  },
});
</script>

<template>
  <StackedVirtualSidebarContainer
    :width="width"
    :enable-slot="false"
  >
    <template #default="{ bottomHeight }">
      <v-container>
        <h3> {{ currentMode }} </h3>
        <v-row class="px-3">
          <div class="mx-1">
            <tooltip-btn
              icon="mdi-filter"
              tooltip-text="Filter Attributes displayed"
              size="large"
              :color="currentMode === 'Filtering'? 'primary' : 'default'"
              outlined
              tile
              @click="currentMode = 'Filtering'"
            />
          </div>
          <div class="mx-1">
            <tooltip-btn
              icon="mdi-chart-line-variant"
              tooltip-text="Chart Numeric Attributes"
              size="large"
              outlined
              :color="currentMode === 'Timeline'? 'primary' : 'default'"

              tile
              @click="currentMode = 'Timeline'"
            />
          </div>
          <div class="mx-1">
            <tooltip-btn
              icon="mdi-chart-timeline"
              tooltip-text="Chart String/Boolean Attributes"
              size="large"
              outlined
              :color="currentMode === 'Swimlane'? 'primary' : 'default'"

              tile
              @click="currentMode = 'Swimlane'"
            />
          </div>
        </v-row>
        <v-divider />
        <attribute-filters
          v-if="currentMode === 'Filtering'"
          class="flex-grow-0 flex-shrink-0"
          :height="bottomHeight"
          :hotkeys-disabled="visible() || readOnlyMode"
        />
        <attribute-timeline-numeric
          v-if="currentMode === 'Timeline'"
          class="flex-grow-0 flex-shrink-0"
          :height="bottomHeight"
        />
        <attribute-timeline-string
          v-if="currentMode === 'Swimlane'"
          class="flex-grow-0 flex-shrink-0"
          :height="bottomHeight"
        />
      </v-container>
    </template>
  </StackedVirtualSidebarContainer>
</template>
