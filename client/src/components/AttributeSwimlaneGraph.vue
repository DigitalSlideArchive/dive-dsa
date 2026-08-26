<!-- eslint-disable max-len -->
<script lang="ts">
import {
  computed,
  ref,
  defineComponent,
  Ref,
  PropType,
} from 'vue';
import AttributeKeyFilterVue from 'vue-media-annotator/components/AttributeFilter/AttributeKeyFilter.vue';
import {
  SwimlaneGraph,
  SwimlaneFilter,
  SwimlaneGraphSettings,
} from 'vue-media-annotator/use/AttributeTypes';
import {
  useAttributesFilters, useAttributes,
  useTrackStyleManager, useTrackFilters,
} from '../provides';
import TooltipBtn from './TooltipButton.vue';

/* Magic numbers involved in height calculation */
export default defineComponent({
  name: 'AttributeSwimlaneGraphGraph',
  components: {
    TooltipBtn,
    AttributeKeyFilter: AttributeKeyFilterVue,
  },
  props: {
    swimlaneGraph: {
      type: Object as PropType<SwimlaneGraph>,
      required: true,
    },
    isNew: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const {
      setSwimlaneEnabled, setSwimlaneGraph, removeSwimlaneFilter,
    } = useAttributesFilters();
    const attributesList = useAttributes();
    const showGraphSettings = ref(false);
    const showRangeSettings = ref(false);
    const showDisplaySettings = ref(false);
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const trackFilterControls = useTrackFilters();
    const types = computed(() => ['all', ...trackFilterControls.allTypes.value]);

    const editSwimlaneFilter: Ref<SwimlaneFilter> = ref(props.swimlaneGraph.filter);
    const editSwimlaneSettings: Ref<Record<string, SwimlaneGraphSettings>> = ref(props.swimlaneGraph.settings || {});
    const editSwimlaneenabled = ref(props.swimlaneGraph.enabled);
    const editSwimlaneDefault = ref(props.swimlaneGraph.default || false);
    const editSwimlaneDisplay: Ref<SwimlaneGraph['displaySettings']> = ref(
      props.swimlaneGraph.displaySettings
      || {
        display: 'static' as 'static' | 'selected',
        trackFilter: ['all'],
        renderMode: 'classic',
        highlightSegments: true,
        editSegments: true,
        minSegmentSize: 0,
      },
    );
    if (editSwimlaneDisplay.value && editSwimlaneDisplay.value.minSegmentSize === undefined) {
      editSwimlaneDisplay.value.minSegmentSize = 0;
    }

    const originalName = props.swimlaneGraph.name;
    const originalDefault = props.swimlaneGraph.default || false;
    const editSwimlaneName = ref(props.swimlaneGraph.name || 'default');
    const filterNames = computed(() => {
      const data = ['all'];
      return data.concat(attributesList.value.filter((item) => item.belongs === 'detection').map((item) => item.name));
    });

    const editingGraphSettings = ref(false);
    const dialogTitle = computed(() => (props.isNew ? 'Add Swimlane' : 'Edit Swimlane'));
    const renderModeHelp = [
      { title: 'Classic', description: 'Extends each color from the keyframe where a value is set until the value changes.' },
      { title: 'Segments', description: 'Shows explicit start/end regions that can be highlighted and edited in the timeline.' },
      { title: 'Discrete', description: 'Shows color only on keyframes where a value is explicitly set.' },
    ];
    const swimlaneBackgroundColors = computed(() => {
      const applied = editSwimlaneFilter.value.appliedTo;
      const detectionAttributes = attributesList.value.filter((item) => item.belongs === 'detection');
      const names = applied.includes('all')
        ? detectionAttributes.map((attribute) => attribute.name)
        : applied.filter((name) => name !== 'all');
      return names.map((name) => {
        const attribute = detectionAttributes.find((item) => item.name === name);
        return {
          name,
          noneColor: typeof attribute?.noneColor === 'string' ? attribute.noneColor : null,
        };
      });
    });

    const saveChanges = () => {
      if (editSwimlaneName.value !== originalName) {
        removeSwimlaneFilter(originalName);
      }
      let setDefault = false;
      if (editSwimlaneDefault.value && editSwimlaneDefault.value !== originalDefault) {
        // Go through the other timelines and make sure only one is set as the default
        setDefault = true;
      }
      const updateObject = {
        name: editSwimlaneName.value,
        filter: editSwimlaneFilter.value,
        enabled: editSwimlaneenabled.value,
        settings: editSwimlaneSettings.value,
        displaySettings: editSwimlaneDisplay.value,
        default: setDefault,
      };
      setSwimlaneGraph(editSwimlaneName.value, updateObject);
      setSwimlaneEnabled(editSwimlaneName.value, editSwimlaneenabled.value);
      emit('close');
    };

    const deleteChip = (item: string) => {
      if (editSwimlaneDisplay.value) {
        editSwimlaneDisplay.value.trackFilter.splice(editSwimlaneDisplay.value.trackFilter.findIndex((data) => data === item));
      }
    };

    return {
      setSwimlaneEnabled,
      setSwimlaneGraph,
      editSwimlaneDefault,
      editSwimlaneFilter,
      editSwimlaneName,
      editSwimlaneenabled,
      editSwimlaneDisplay,
      filterNames,
      saveChanges,
      deleteChip,
      typeStylingRef,
      types,
      //Graph Settings
      editingGraphSettings,
      editSwimlaneSettings,
      showGraphSettings,
      showRangeSettings,
      showDisplaySettings,
      dialogTitle,
      renderModeHelp,
      swimlaneBackgroundColors,
    };
  },
});
</script>

<template>
  <v-card>
    <v-card-title>{{ dialogTitle }}</v-card-title>
    <v-card-text>
      <v-row>
        <v-text-field
          v-model="editSwimlaneName"
          label="Swimlane Name"
        />
      </v-row>
      <v-row>
        <v-switch
          v-model="editSwimlaneenabled"
          label="Enabled"
        />
      </v-row>
      <v-row>
        <attribute-key-filter
          :attribute-filter="editSwimlaneFilter"
          :filter-names="filterNames"
          timeline
          @save-changes="editSwimlaneFilter = ($event)"
        />
      </v-row>
      <div class="mt-4 pt-4">
        <h2>
          Display Settings <v-icon @click="showDisplaySettings = !showDisplaySettings">
            {{ showDisplaySettings ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </h2>
        <p> Set graphs to display only on selected track types</p>
        <div
          v-if="showDisplaySettings && editSwimlaneDisplay"
          class="graph-settings-area"
        >
          <v-row
            dense
          >
            <v-radio-group
              v-model="editSwimlaneDisplay.display"
              class="pr-2"
            >
              <v-radio
                label="Static"
                value="static"
                hint="Always display key"
                persistent-hint
              />
              <v-radio
                value="selected"
                label="Selected"
                hint="Only show when track is selected"
                persistent-hint
              />
            </v-radio-group>
            <v-select
              v-model="editSwimlaneDisplay.trackFilter"
              :items="types"
              multiple
              clearable
              deletable-chips
              chips
              label="Filter Types"
              class="mx-2"
              style="max-width:250px"
            >
              <template #selection="{ item }">
                <v-chip
                  close
                  :color="typeStylingRef.color(item)"
                  text-color="gray"
                  @click:close="deleteChip(item)"
                >
                  {{ item }}
                </v-chip>
              </template>
            </v-select>
          </v-row>
          <v-row dense>
            <v-checkbox
              v-model="editSwimlaneDisplay.displayFrameIndicators"
              label="Display Set Value Indicators"
              class="mx-2"
            />
          </v-row>
          <v-row dense>
            <v-checkbox
              v-model="editSwimlaneDisplay.displayTooltip"
              label="Display Swimlane Tooltip"
              class="mx-2"
            />
          </v-row>
          <v-row
            dense
            align="center"
          >
            <v-select
              v-model="editSwimlaneDisplay.renderMode"
              style="max-width: 200px"
              outlined
              :items="[
                { value: 'classic', title: 'Classic' },
                { value: 'segments', title: 'Segments' },
                { value: 'discrete', title: 'Discrete' },
              ]"
              item-text="title"
              item-value="value"
              label="Render Mode"
            />
            <v-tooltip
              open-delay="200"
              top
              max-width="340"
            >
              <template #activator="{ on }">
                <v-btn
                  icon
                  small
                  class="ml-1"
                  v-on="on"
                >
                  <v-icon>mdi-help-circle-outline</v-icon>
                </v-btn>
              </template>
              <div class="render-mode-help">
                <div
                  v-for="mode in renderModeHelp"
                  :key="mode.title"
                  class="render-mode-help-item"
                >
                  <strong>{{ mode.title }}:</strong> {{ mode.description }}
                </div>
              </div>
            </v-tooltip>
            <v-checkbox
              v-if="editSwimlaneDisplay.renderMode === 'segments'"
              v-model="editSwimlaneDisplay.highlightSegments"
              label="Highlight Segments"
              class="mx-2"
            />
            <v-checkbox
              v-if="editSwimlaneDisplay.renderMode === 'segments'"
              v-model="editSwimlaneDisplay.editSegments"
              label="Edit Segments"
              class="mx-2"
            />
          </v-row>
          <v-row v-if="editSwimlaneDisplay.renderMode === 'segments'">
            <v-text-field
              v-if="editSwimlaneDisplay.renderMode === 'segments'"
              v-model.number="editSwimlaneDisplay.minSegmentSize"
              type="number"
              label="Minimum Frame Segment Size"
              class="mx-2"
              outlined
              min="0"
              style="max-width: 200px;"
            />
            <v-tooltip
              open-delay="200"
              top
              max-width="200"
            >
              <template #activator="{ on }">
                <v-icon class="ml-2" v-on="on">
                  mdi-information-outline
                </v-icon>
              </template>
              <span>When a segment is resized to 0 if this value is zero it will remove the segment, if the value is greater it will make the segment this minimum size.</span>
            </v-tooltip>
          </v-row>
          <v-row
            v-if="swimlaneBackgroundColors.length"
            dense
            class="mt-2"
          >
            <v-col cols="12">
              <div class="d-flex align-center">
                <span class="text-subtitle-2 mr-2">Swimlane Row Background</span>
                <v-tooltip
                  open-delay="200"
                  top
                  max-width="320"
                >
                  <template #activator="{ on }">
                    <v-btn
                      icon
                      x-small
                      v-on="on"
                    >
                      <v-icon small>
                        mdi-information-outline
                      </v-icon>
                    </v-btn>
                  </template>
                  <div>
                    The swimlane row background uses each attribute's
                    <strong>None Color</strong> from the attribute editor's
                    <strong>Value Colors</strong> tab.
                    Value segment colors are drawn on top of this background.
                  </div>
                </v-tooltip>
              </div>
            </v-col>
            <v-col
              v-for="item in swimlaneBackgroundColors"
              :key="item.name"
              cols="12"
              class="py-1"
            >
              <div class="d-flex align-center swimlane-bg-row">
                <span
                  class="swimlane-bg-preview mr-3"
                  :class="{ 'swimlane-bg-preview-empty': !item.noneColor }"
                  :style="item.noneColor ? { backgroundColor: item.noneColor } : undefined"
                  :title="item.noneColor ? item.noneColor.toString() : 'None Color not set'"
                />
                <span class="swimlane-bg-name">{{ item.name }}</span>
                <span
                  v-if="!item.noneColor"
                  class="text-caption ml-2 swimlane-bg-unset"
                >
                  None Color not set
                </span>
              </div>
            </v-col>
          </v-row>
        </div>
      </div>
      <v-row
        class="pt-2"
      >
        <p>
          One swimlane can be labeled as the default, which will
          automatically be open when loading the dataset
        </p>
        <v-switch
          v-model="editSwimlaneDefault"
          label="Default Visible Swimlane"
          class="pa-0 ma-0"
        />
      </v-row>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn
        depressed
        text
        @click="$emit('close')"
      >
        Cancel
      </v-btn>
      <v-btn
        color="primary"
        @click="saveChanges"
      >
        Save
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped lang='scss'>

.render-mode-help {
  max-width: 320px;
  text-align: left;
}

.render-mode-help-item + .render-mode-help-item {
  margin-top: 8px;
}

.swimlane-bg-row {
  min-height: 24px;
}

.swimlane-bg-preview {
  display: inline-block;
  min-width: 48px;
  max-width: 48px;
  min-height: 18px;
  max-height: 18px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 2px;
}

.swimlane-bg-preview-empty {
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.08),
      rgba(255, 255, 255, 0.08) 4px,
      rgba(255, 255, 255, 0.16) 4px,
      rgba(255, 255, 255, 0.16) 8px
    );
}

.swimlane-bg-name {
  min-width: 120px;
}

.swimlane-bg-unset {
  opacity: 0.7;
}

.border-highlight {
   border-bottom: 1px solid gray;
 }

.type-checkbox {
  max-width: 80%;
  overflow-wrap: anywhere;
}

.hover-show-parent {
  .hover-show-child {
    display: none;
  }

  &:hover {
    .hover-show-child {
      display: inherit;
    }
  }
}
.outlined {
  background-color: gray;
  color: #222;
  font-weight: 600;
  border-radius: 6px;
  padding: 0 5px;
  font-size: 12px;
}

.graph-settings-area {
  padding: 5px;
}

.graph-settings-list{
 border: 1px solid gray;

 .selected-setting {
  background-color: darkgray;
 }
}
.graphsetting {
  font-size:0.75em;
}

.type-color-box {
    margin: 7px;
    margin-top: 4px;
    min-width: 15px;
    max-width: 15px;
    min-height: 15px;
    max-height: 15px;
}

.editGraphCard {
  border: 2px solid gray;
}
</style>
