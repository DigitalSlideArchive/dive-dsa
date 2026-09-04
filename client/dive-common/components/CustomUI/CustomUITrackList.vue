<script lang="ts">
import {
  defineComponent, PropType, ref, toRef, watch,
} from 'vue';
import { CustomUITrackListSettings } from 'vue-media-annotator/ConfigurationManager';
import { AnnotationId } from 'vue-media-annotator/BaseAnnotation';
import { useTrackStyleManager } from 'vue-media-annotator/provides';
import useCustomUITrackList from './useCustomUITrackList';

export default defineComponent({
  name: 'CustomUITrackList',
  props: {
    settings: {
      type: Object as PropType<CustomUITrackListSettings>,
      default: () => ({}),
    },
  },
  setup(props) {
    const settingsRef = toRef(props, 'settings');
    const panelExpanded = ref<number | undefined>(undefined);
    const typeStylingRef = useTrackStyleManager().typeStyling;
    const {
      resolvedSettings,
      filteredTracks,
      readOnlyMode,
      isSelected,
      isEditing,
      selectTrack,
      editTrack,
      deleteTrack,
    } = useCustomUITrackList(settingsRef);

    watch(
      () => resolvedSettings.value.defaultExpanded,
      (expanded) => {
        panelExpanded.value = expanded ? 0 : undefined;
      },
      { immediate: true },
    );

    const onRowClick = (trackId: AnnotationId) => {
      if (resolvedSettings.value.actions.select) {
        selectTrack(trackId);
      }
    };

    return {
      panelExpanded,
      resolvedSettings,
      filteredTracks,
      readOnlyMode,
      typeStylingRef,
      isSelected,
      isEditing,
      selectTrack,
      editTrack,
      deleteTrack,
      onRowClick,
    };
  },
});
</script>

<template>
  <v-expansion-panels
    v-model="panelExpanded"
    flat
    class="custom-ui-track-list mb-3"
  >
    <v-expansion-panel>
      <v-expansion-panel-header class="py-2">
        <span>{{ resolvedSettings.title }} ({{ filteredTracks.length }})</span>
      </v-expansion-panel-header>
      <v-expansion-panel-content>
        <p
          v-if="!resolvedSettings.typeFilter.length"
          class="text-caption grey--text mb-2"
        >
          Configure track types in Custom UI settings to populate this list.
        </p>
        <div
          class="custom-ui-track-list__rows"
          :style="{ maxHeight: `${resolvedSettings.maxHeight}px` }"
        >
          <div
            v-for="entry in filteredTracks"
            :key="entry.trackId"
            class="custom-ui-track-list__row d-flex align-center"
            :class="{
              'custom-ui-track-list__row--selected': isSelected(entry.trackId),
              'custom-ui-track-list__row--editing': isEditing(entry.trackId),
            }"
            @click="onRowClick(entry.trackId)"
          >
            <div
              class="custom-ui-track-list__type-color mr-2"
              :style="{ backgroundColor: typeStylingRef.color(entry.trackType) }"
            />
            <div class="custom-ui-track-list__info flex-grow-1 text-truncate">
              <span
                v-if="resolvedSettings.display.showTrackId"
                class="custom-ui-track-list__id mr-2"
              >
                {{ entry.trackId }}
              </span>
              <span
                v-if="resolvedSettings.display.showType"
                class="custom-ui-track-list__type mr-2"
              >
                {{ entry.trackType }}
              </span>
              <span
                v-if="resolvedSettings.display.showFrameRange"
                class="custom-ui-track-list__frames text-caption grey--text"
              >
                f:{{ entry.track.begin }}–{{ entry.track.end }}
              </span>
            </div>
            <div
              class="custom-ui-track-list__actions"
              @click.stop
            >
              <v-btn
                v-if="resolvedSettings.actions.edit"
                icon
                x-small
                :disabled="readOnlyMode"
                @click="editTrack(entry.trackId)"
              >
                <v-icon small>
                  mdi-pencil
                </v-icon>
              </v-btn>
              <v-btn
                v-if="resolvedSettings.actions.delete"
                icon
                x-small
                color="error"
                :disabled="readOnlyMode"
                @click="deleteTrack(entry.trackId)"
              >
                <v-icon small>
                  mdi-delete
                </v-icon>
              </v-btn>
            </div>
          </div>
        </div>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<style scoped lang="scss">
.custom-ui-track-list__rows {
  overflow-y: auto;
}

.custom-ui-track-list__row {
  min-height: 40px;
  padding: 4px 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-bottom: 4px;
  cursor: pointer;

  &:hover:not(.custom-ui-track-list__row--selected) {
    background-color: rgba(255, 255, 255, 0.04);
  }
}

.custom-ui-track-list__row--selected {
  background-color: var(--v-accentBackground-base, rgba(255, 255, 255, 0.08));
}

.custom-ui-track-list__row--editing {
  border-color: var(--v-primary-base, #1976d2);
}

.custom-ui-track-list__type-color {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.custom-ui-track-list__actions {
  display: flex;
  flex-shrink: 0;
}
</style>
