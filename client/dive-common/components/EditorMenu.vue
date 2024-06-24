<script lang="ts">
import { flatten } from 'lodash';
import Vue, { PropType } from 'vue';

import { Mousetrap, OverlayPreferences } from 'vue-media-annotator/types';
import { EditAnnotationTypes, VisibleAnnotationTypes } from 'vue-media-annotator/layers';
import Recipe from 'vue-media-annotator/recipe';
import { hexToRgb } from 'vue-media-annotator/utils';

interface ButtonData {
  id: string;
  icon: string;
  type?: VisibleAnnotationTypes;
  active: boolean;
  mousetrap?: Mousetrap[];
  tooltip?: string;
  click: () => void;
}

export default Vue.extend({
  name: 'EditorMenu',
  props: {
    editingTrack: {
      type: Boolean,
      required: true,
    },
    visibleModes: {
      type: Array as PropType<(VisibleAnnotationTypes)[]>,
      required: true,
    },
    editingMode: {
      type: [String, Boolean] as PropType<false | EditAnnotationTypes>,
      required: true,
    },
    editingDetails: {
      type: String as PropType<'disabled' | 'Creating' | 'Editing'>,
      required: true,
    },
    recipes: {
      type: Array as PropType<Recipe[]>,
      required: true,
    },
    multiSelectActive: {
      type: Boolean,
      default: false,
    },
    groupEditActive: {
      type: Boolean,
      default: false,
    },
    attributeKey: {
      type: Boolean,
      default: false,
    },
    tailSettings: {
      type: Object as PropType<{ before: number; after: number }>,
      default: () => ({ before: 20, after: 10 }),
    },
    overlaySettings: {
      type: Array as PropType<OverlayPreferences[]>,
      default: () => ([{
        name: 'default',
        enabled: true,
        opacity: 0.25,
        colorTransparency: false,
        overrideValue: false,
        overrideColor: 'white',
        overrideVariance: 0,
        colorScale: false,
        blackColorScale: '#FF0000',
        whiteColorScale: '#00FF00',
      }]),
    },
    overlays: {
      type: Array as PropType<{filename: string; url: string; id: string}[]>,
      default: () => [],
    },
    getUISetting: {
      type: Function,
      required: true,
    },
  },
  data() {
    return {
      toolTipForce: false,
      toolTimeTimeout: 0,
      editBlackColorScale: false,
      editWhiteColorScale: false,
      editTransparentcolor: false,
      modeToolTips: {
        Creating: {
          rectangle: 'Drag to draw rectangle. Press ESC to exit.',
          Polygon: 'Click to place vertices. Right click to close.',
          LineString: 'Click to place head/tail points.',
        },
        Editing: {
          rectangle: 'Drag vertices to resize the rectangle',
          Polygon: 'Drag midpoints to create new vertices. Click vertices to select for deletion.',
          LineString: 'Click endpoints to select for deletion.',
        },
      },
      overrideOverlay: false,
    };
  },
  computed: {
    editButtons(): ButtonData[] {
      const em = this.editingMode;
      return [
        {
          id: 'rectangle',
          icon: 'mdi-vector-square',
          active: this.editingTrack && em === 'rectangle',
          mousetrap: [{
            bind: '1',
            handler: () => {
              this.$emit('set-annotation-state', { editing: 'rectangle' });
            },
          }],
          click: () => {
            this.$emit('set-annotation-state', { editing: 'rectangle' });
          },
        },
        /* Include recipes as editing modes if they're toggleable */
        ...this.recipes.filter((r) => r.toggleable.value).map((r, i) => ({
          id: r.name,
          icon: r.icon.value || 'mdi-pencil',
          active: this.editingTrack && r.active.value,
          click: () => r.activate(),
          mousetrap: [
            {
              bind: (i + 2).toString(),
              handler: () => r.activate(),
            },
            ...r.mousetrap(),
          ],
        })),
      ];
    },
    viewButtons(): ButtonData[] {
      /* Only geometry primitives can be visible types right now */
      const buttons: ButtonData[] = [
        {
          id: 'rectangle',
          type: 'rectangle',
          icon: 'mdi-vector-square',
          active: this.isVisible('rectangle'),
          tooltip: 'Bounding Box Annotation',
          click: () => this.toggleVisible('rectangle'),
        },
        {
          id: 'Polygon',
          type: 'Polygon',
          icon: 'mdi-vector-polygon',
          active: this.isVisible('Polygon'),
          tooltip: 'Polygon Annotation',
          click: () => this.toggleVisible('Polygon'),
        },
        {
          id: 'LineString',
          type: 'LineString',
          active: this.isVisible('LineString'),
          icon: 'mdi-vector-line',
          tooltip: '2-Point Line',
          click: () => this.toggleVisible('LineString'),
        },
        {
          id: 'text',
          type: 'text',
          active: this.isVisible('text'),
          icon: 'mdi-format-text',
          tooltip: 'Confidence/Attribute Text Display',
          click: () => this.toggleVisible('text'),
        },
        {
          id: 'tooltip',
          type: 'tooltip',
          active: this.isVisible('tooltip'),
          icon: 'mdi-tooltip-text-outline',
          tooltip: 'Tooltip Information about Hovered over annotations',
          click: () => this.toggleVisible('tooltip'),
        },
      ];
      if (this.attributeKey) {
        buttons.push({
          id: 'attributeKey',
          type: 'attributeKey',
          active: this.isVisible('attributeKey'),
          icon: 'mdi-view-list',
          tooltip: 'Attribute Colors Key',
          click: () => this.toggleVisible('attributeKey'),
        });
      }
      return buttons;
    },
    mousetrap(): Mousetrap[] {
      return flatten(this.editButtons.map((b) => b.mousetrap || []));
    },
    editingHeader() {
      if (this.groupEditActive) {
        return { text: 'Group Edit Mode', icon: 'mdi-group', color: 'primary' };
      }
      if (this.multiSelectActive) {
        return { text: 'Multi-select Mode', icon: 'mdi-call-merge', color: 'error' };
      }
      if (this.editingDetails !== 'disabled') {
        return {
          text: `${this.editingDetails} ${this.editingMode} `,
          icon: this.editingDetails === 'Creating' ? 'mdi-pencil-plus' : 'mdi-pencil',
          color: this.editingDetails === 'Creating' ? 'success' : 'primary',
        };
      }
      return { text: 'Not editing', icon: 'mdi-pencil-off-outline', color: '' };
    },
  },
  watch: {
    editingDetails() {
      clearTimeout(this.toolTimeTimeout);
      if (this.editingDetails !== 'disabled') {
        this.toolTipForce = true;
        this.toolTimeTimeout = setTimeout(() => { this.toolTipForce = false; }, 2000) as unknown as number;
      } else {
        this.toolTipForce = false;
      }
    },
  },
  methods: {
    isVisible(mode: VisibleAnnotationTypes) {
      return this.visibleModes.includes(mode);
    },

    toggleVisible(mode: VisibleAnnotationTypes) {
      if (this.isVisible(mode)) {
        this.$emit('set-annotation-state', {
          visible: this.visibleModes.filter((m) => m !== mode),
        });
      } else {
        this.$emit('set-annotation-state', {
          visible: this.visibleModes.concat([mode]),
        });
      }
    },
    copyJSON(index: number) {
      const variance = this.overlaySettings[index].overrideVariance;
      const rgb = hexToRgb(this.overlaySettings[index].overrideColor || '#000000');
      const colorScale = {
        black: this.overlaySettings[index].blackColorScale,
        white: this.overlaySettings[index].whiteColorScale,
      };
      const obj = {
        transparency: [{
          rgb,
          variance,
        }],
        colorScale: this.overlaySettings[index].colorScale ? colorScale : undefined,
      };
      navigator.clipboard.writeText(JSON.stringify(obj));
    },
    updateOverlaySetting(index: number, key: keyof OverlayPreferences, val: number | boolean | string | undefined) {
      if (index < this.overlaySettings.length) {
        this.overlaySettings[index][key] = val as never;
        this.$emit('update:overlay-settings', this.overlaySettings);
      }
    },
  },
});
</script>

<template>
  <v-row
    v-mousetrap="mousetrap"
    class="pa-0 ma-0 grow"
    no-gutters
  >
    <div class="d-flex align-center grow">
      <div
        v-if="getUISetting('UIEditingInfo')"
        class="pa-1 d-flex"
        style="width: 280px;"
      >
        <v-icon class="pr-1">
          {{ editingHeader.icon }}
        </v-icon>
        <div>
          <div class="text-subtitle-2">
            {{ editingHeader.text }}
          </div>
          <div
            style="line-height: 1.22em; font-size: 10px;"
          >
            <span v-if="groupEditActive">
              Editing group.  Add or remove tracks.  Esc. to exit.
            </span>
            <span v-else-if="multiSelectActive">
              Multi-select in progress.  Editing is disabled.
              Select additional tracks to merge or group.
            </span>
            <span v-else-if="editingDetails !== 'disabled'">
              {{ modeToolTips[editingDetails][editingMode] }}
            </span>
            <span v-else>Right click on an annotation to edit</span>
          </div>
        </div>
      </div>
      <span
        v-for="(button, index) in editButtons"
        :key="button.id + 'view'"
      >
        <v-btn
          v-if="getUISetting('UIEditingTypes') === true || getUISetting('UIEditingTypes')[index]"
          :disabled="!editingMode"
          :outlined="!button.active"
          :color="button.active ? editingHeader.color : ''"
          class="mx-1"
          small
          @click="button.click"
        >
          <pre v-if="button.mousetrap">{{ button.mousetrap[0].bind }}:</pre>
          <v-icon>{{ button.icon }}</v-icon>
        </v-btn>
      </span>
      <slot name="delete-controls" />
      <v-spacer />
      <span class="pb-1">
        <span class="mr-1 px-3 py-1">
          <v-icon class="pr-1">
            mdi-eye
          </v-icon>
          <span class="text-subtitle-2">
            Visibility
          </span>
        </span>
        <span
          v-for="(button, index) in viewButtons"
          :key="button.id"
        >
          <v-tooltip
            v-if="button.tooltip
              && (getUISetting('UIVisibility') === true || getUISetting('UIVisibility')[index])"
          >
            <template #activator="{ on }">
              <v-btn
                :color="button.active ? 'grey darken-2' : ''"
                class="mx-1 mode-button"
                small
                v-on="on"
                @click="button.click"
              >
                <v-icon>{{ button.icon }}</v-icon>
              </v-btn>
            </template>
            <span> {{ button.tooltip }}</span>
          </v-tooltip>
          <v-btn
            v-else-if="getUISetting('UIVisibility') === true || getUISetting('UIVisibility')[index]"
            :color="button.active ? 'grey darken-2' : ''"
            class="mx-1 mode-button"
            small
            @click="button.click"
          >
            <v-icon>{{ button.icon }}</v-icon>
          </v-btn>
        </span>
        <v-menu
          open-on-hover
          bottom
          offset-y
          :close-on-content-click="false"
        >
          <template #activator="{ on, attrs }">
            <v-btn
              v-if="getUISetting('UITrackTrails')"
              v-bind="attrs"
              :color="isVisible('TrackTail') ? 'grey darken-2' : ''"
              class="mx-1 mode-button"
              small
              v-on="on"
              @click="toggleVisible('TrackTail')"
            >
              <v-icon>mdi-navigation</v-icon>
            </v-btn>
          </template>
          <v-card
            class="pa-4 flex-column d-flex"
            outlined
          >
            <label for="frames-before">Frames before: {{ tailSettings.before }}</label>
            <input
              id="frames-before"
              type="range"
              name="frames-before"
              class="tail-slider-width"
              label
              min="0"
              max="100"
              :value="tailSettings.before"
              @input="$emit('update:tail-settings', { ...tailSettings, before: Number.parseFloat($event.target.value) })"
            >
            <div class="py-2" />
            <label for="frames-after">Frames after: {{ tailSettings.after }}</label>
            <input
              id="frames-after"
              type="range"
              name="frames-after"
              class="tail-slider-width"
              min="0"
              max="100"
              :value="tailSettings.after"
              @input="$emit('update:tail-settings', { ...tailSettings, after: Number.parseFloat($event.target.value) })"
            >
          </v-card>
        </v-menu>
        <v-menu
          v-if="overlays.length"
          open-on-hover
          bottom
          offset-y
          :close-on-content-click="false"
          :close-on-click="false"
          min-width="400"
          max-width="400"
        >
          <template #activator="{ on, attrs }">
            <v-btn
              v-bind="attrs"
              :color="isVisible('overlays') ? 'grey darken-2' : ''"
              class="mx-1 mode-button"
              small
              v-on="on"
              @click="toggleVisible('overlays')"
            >
              <v-icon>mdi-layers</v-icon>
            </v-btn>
          </template>
          <v-card
            class="pa-4 flex-column d-flex"
            outlined
          >
            <v-expansion-panels>
              <v-expansion-panel
                v-for="(overlay, index) in overlaySettings"
                :key="`overlay-${index}`"
                :title="`Video Overlay:${index}`"
              >
                <v-expansion-panel-header>
                  <span style="max-width:300px; overflow:hidden; white-space: nowrap; text-overflow: ellipsis">
                    <v-icon v-if="overlay.enabled" color="success" class="pr-2">mdi-check</v-icon>
                    <v-icon v-else color="error" class="pr-2">mdi-close</v-icon>
                    <span>
                      Video: {{ overlay.name }}
                    </span>
                  </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                  <v-row dense>
                    <v-checkbox
                      :input-value="overlay.enabled"
                      label="Enabled"
                      @change="updateOverlaySetting(index, 'enabled', $event)"
                    />
                  </v-row>

                  <v-row dense>
                    <label for="overlay-opacity">Opacity: {{ overlay.opacity }}%</label>
                    <v-tooltip
                      open-delay="100"
                      bottom
                    >
                      <template #activator="{ on }">
                        <v-icon
                          class="ml-2"
                          v-on="on"
                        >
                          mdi-information
                        </v-icon>
                      </template>
                      <span>Change the opacity of the overlay video</span>
                    </v-tooltip>
                  </v-row>
                  <input
                    id="overlay-opacity"
                    type="range"
                    name="overlay-opacity"
                    class="tail-slider-width"
                    label
                    min="0"
                    max="100"
                    :value="overlay.opacity"
                    @change="updateOverlaySetting(index, 'opacity', Number.parseFloat($event.target.value))"
                  >
                  <v-row dense>
                    <v-checkbox
                      :input-value="overlay.colorTransparency"
                      label="Color Transparency"
                      @change="updateOverlaySetting(index, 'colorTransparency', $event)"
                    />
                    <v-tooltip
                      open-delay="100"
                      bottom
                    >
                      <template #activator="{ on }">
                        <v-icon
                          class="ml-2"
                          v-on="on"
                        >
                          mdi-information
                        </v-icon>
                      </template>
                      <span>If the video has color opacity metadat this
                        will replace that color with transparency</span>
                    </v-tooltip>
                  </v-row>
                  <v-row dense>
                    <v-checkbox
                      v-if="overlay.colorTransparency"
                      :input-value="overlay.overrideValue"
                      label="Override"
                      @change="updateOverlaySetting(index, 'overrideValue', $event)"
                    />
                    <v-tooltip
                      v-if="overlay.colorTransparency"
                      open-delay="100"
                      bottom
                    >
                      <template #activator="{ on }">
                        <v-icon
                          class="ml-2"
                          v-on="on"
                        >
                          mdi-information
                        </v-icon>
                      </template>
                      <span>Allows you override the color and transparency set in
                        the metadata for testing new values</span>
                    </v-tooltip>
                  </v-row>
                  <v-row dense>
                    <label
                      v-if="overlay.colorTransparency && overlay.overrideValue"
                      for="overlay-variance"
                    >Variance: {{ overlay.overrideVariance }}</label>
                  </v-row>
                  <input
                    v-if="overlay.colorTransparency && overlay.overrideValue"
                    id="overlay-variance"
                    type="range"
                    name="overlay-variance"
                    class="tail-slider-width"
                    label="Variance"
                    min="0"
                    max="255"
                    :value="overlay.overrideVariance || 0"
                    @change="updateOverlaySetting(index, 'overrideVariance', Number.parseFloat($event.target.value))"
                  >
                  <v-row
                    v-if="overlay.colorTransparency"
                    dense
                    align="center"
                  >
                    <span> Transparency Color:</span>
                    <div
                      class="color-box mx-2 edit-color-box"
                      :style="{
                        backgroundColor: overlay.overrideColor,
                      }"
                      @click="editTransparentcolor = !editTransparentcolor"
                    />

                    <v-color-picker
                      v-if="overlay.colorTransparency
                        && overlay.overrideValue && editTransparentcolor"
                      :value="overlay.overrideColor || 'white'"
                      hide-inputs
                      @input="updateOverlaySetting(index, 'overrideColor', $event)"
                    />
                  </v-row>
                  <v-row dense>
                    <v-checkbox
                      :input-value="overlay.colorScale"
                      label="Color Scaling"
                      @change="updateOverlaySetting(index, 'colorScale', $event)"
                    />
                    <v-tooltip
                      v-if="overlay.colorTransparency"
                      open-delay="100"
                      bottom
                    >
                      <template #activator="{ on }">
                        <v-icon
                          class="ml-2"
                          v-on="on"
                        >
                          mdi-information
                        </v-icon>
                      </template>
                      <span>Create a custom color scale to replace the Black to White defaults</span>
                    </v-tooltip>
                  </v-row>
                  <v-row
                    v-if="overlay.colorScale"
                    dense
                    align="center"
                  >
                    <span> Black Color Replacement:</span>
                    <div
                      class="color-box mx-2 edit-color-box"
                      :style="{
                        backgroundColor: overlay.blackColorScale,
                      }"
                      @click="editBlackColorScale = !editBlackColorScale"
                    />
                    <v-color-picker
                      v-if="editBlackColorScale"
                      :value="overlay.blackColorScale || '#00FF00'"
                      hide-inputs
                      @input="updateOverlaySetting(index, 'blackColorScale', $event)"
                    />

                  </v-row>
                  <v-row
                    v-if="overlay.colorScale"
                    dense
                    class="mt-2"
                    align="center"
                  >
                    <span> White Color Replacement:</span>
                    <div
                      class="color-box mx-2 edit-color-box"
                      :style="{
                        backgroundColor: overlay.whiteColorScale,
                      }"
                      @click="editWhiteColorScale = !editWhiteColorScale"
                    />

                    <v-color-picker
                      v-if="editWhiteColorScale"
                      :value="overlay.whiteColorScale || '#FF0000'"
                      hide-inputs
                      @input="updateOverlaySetting(index, 'whiteColorScale', $event)"
                    />

                  </v-row>

                  <v-row
                    v-if="overlay.colorTransparency && overlay.overrideValue
                      || overlay.colorScale"
                    dense
                  >
                    <v-spacer />
                    <v-tooltip
                      open-delay="100"
                      bottom
                    >
                      <template #activator="{ on }">
                        <v-btn
                          class="ml-2"
                          v-on="on"
                          @click="copyJSON"
                        >
                          Copy:
                          <v-icon>
                            mdi-content-copy
                          </v-icon>
                        </v-btn>
                      </template>
                      <span>Copies the override values to a JSON string to be used in the metadata</span>
                    </v-tooltip>
                    <v-spacer />

                  </v-row>
                </v-expansion-panel-content>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-card>
        </v-menu>

      </span>
    </div>
  </v-row>
</template>

<style scoped>
.modechip {
  border-radius: 16px;
  white-space: nowrap;
  border: 1px solid;
  cursor: default;
}
.mode-group {
  border: 1px solid grey;
  border-radius: 4px;
}
.mode-button{
  border: 1px solid grey;
}
.tail-slider-width {
  width: 240px;
}
.color-box {
  display: inline-block;
  min-width: 40px;
  max-width: 40px;
  min-height: 40px;
  max-height: 40px;
  border: 1px solid white;
}
.edit-color-box {
  &:hover {
    cursor: pointer;
    border: 2px solid white
  }
}

</style>
