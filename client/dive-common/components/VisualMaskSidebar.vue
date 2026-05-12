<script lang="ts">
import {
  computed, defineComponent, ref,
} from 'vue';
import { useStore } from 'platform/web-girder/store/types';
import {
  useConfiguration,
  useHandler,
  useReadOnlyMode,
  useSelectedCamera,
  useTime,
  useVisualMaskManager,
} from 'vue-media-annotator/provides';
import { injectAggregateController } from 'vue-media-annotator/components/annotators/useMediaController';

export default defineComponent({
  name: 'VisualMaskSidebar',
  props: {
    width: {
      type: Number,
      default: 340,
    },
  },
  setup() {
    const configMan = useConfiguration();
    const aggregateController = injectAggregateController().value;
    const handler = useHandler();
    const readOnlyMode = useReadOnlyMode();
    const selectedCamera = useSelectedCamera();
    const time = useTime();
    const store = useStore();
    const visualMaskManager = useVisualMaskManager();
    const showColorPicker = ref(false);

    const isOwnerAdmin = computed(() => {
      const currentUser = store.state.User.user as ({
        admin?: boolean;
        _id?: string;
        groups?: string[];
      } | null);
      return configMan.isConfigOwnerAdmin(currentUser);
    });
    const canEditMasks = computed(() => isOwnerAdmin.value && !readOnlyMode.value);

    const currentFrame = computed(() => time.frame.value);
    const selectedCameraFrameSize = computed(() => (
      aggregateController.getController(selectedCamera.value).frameSize.value
    ));
    const cameraMasks = computed(() => {
      const revision = visualMaskManager.revisionCounter.value;
      if (revision >= 0) {
        return visualMaskManager.getMasks(selectedCamera.value);
      }
      return [];
    });
    const selectedMask = computed(() => {
      const revision = visualMaskManager.revisionCounter.value;
      if (revision >= 0) {
        return visualMaskManager.getSelectedMask(selectedCamera.value);
      }
      return undefined;
    });
    const keyframes = computed(() => {
      const revision = visualMaskManager.revisionCounter.value;
      if (revision >= 0 && selectedMask.value) {
        return selectedMask.value.getKeyframes();
      }
      return [];
    });
    const isEditingSelected = computed(() => selectedMask.value
      && visualMaskManager.editingMaskId.value === selectedMask.value.id);
    const isExactKeyframe = computed(() => {
      if (!selectedMask.value) {
        return false;
      }
      return visualMaskManager.isExactKeyframe(
        selectedCamera.value,
        selectedMask.value.id,
        currentFrame.value,
      );
    });

    function addMask() {
      handler.trackSelect(null, false);
      visualMaskManager.addMask(selectedCamera.value);
      showColorPicker.value = false;
    }

    function selectMask(id: number) {
      visualMaskManager.selectMask(id);
      showColorPicker.value = false;
    }

    function toggleEditing(id: number) {
      if (visualMaskManager.editingMaskId.value === id) {
        visualMaskManager.stopEditing();
      } else {
        handler.trackSelect(null, false);
        visualMaskManager.startEditing(selectedCamera.value, id);
      }
    }

    function updateStyle(key: 'color' | 'fill' | 'opacity' | 'strokeWidth', value: string | boolean | number) {
      if (!selectedMask.value) {
        return;
      }
      visualMaskManager.setMaskStyle(selectedCamera.value, selectedMask.value.id, {
        [key]: value,
      });
    }

    function setRelativePositioning(value: boolean) {
      if (!selectedMask.value) {
        return;
      }
      visualMaskManager.setMaskRelativePositioning(
        selectedCamera.value,
        selectedMask.value.id,
        value,
        selectedCameraFrameSize.value,
      );
    }

    return {
      addMask,
      cameraMasks,
      canEditMasks,
      currentFrame,
      selectedCameraFrameSize,
      editingMaskId: visualMaskManager.editingMaskId,
      isEditingSelected,
      isExactKeyframe,
      isOwnerAdmin,
      keyframes,
      readOnlyMode,
      selectedCamera,
      selectedMask,
      selectMask,
      showColorPicker,
      toggleEditing,
      setRelativePositioning,
      updateStyle,
      visualMaskManager,
      seekFrame: handler.seekFrame,
    };
  },
});
</script>

<template>
  <div
    class="visual-mask-sidebar d-flex flex-column"
  >
    <div class="sidebar-scroll">
      <v-container
        fluid
        class="pa-3"
      >
        <div class="d-flex align-center mb-3">
          <div>
            <div class="text-h6">
              Visual Masks
            </div>
            <div class="text-caption grey--text">
              Config-backed masks apply to the current camera and stay active until changed.
            </div>
          </div>
        </div>
        <div class="text-caption grey--text mb-3">
          Visual mask changes are stored in the dataset configuration and saved with the standard save button.
        </div>
        <div class="text-caption grey--text mb-2">
          Add Visual Mask
        </div>
        <div class="d-flex mb-3">
          <v-btn
            small
            color="primary"
            class="mr-2"
            :disabled="!canEditMasks"
            @click="addMask()"
          >
            <v-icon left small>
              mdi-vector-square
            </v-icon>
            Add Box
          </v-btn>
        </div>
        <div class="text-caption grey--text mb-2">
          Camera: {{ selectedCamera }}
        </div>
        <v-list
          dense
          two-line
          class="mask-list"
        >
          <v-list-item
            v-for="mask in cameraMasks"
            :key="mask.id"
            :input-value="selectedMask && selectedMask.id === mask.id"
            @click="selectMask(mask.id)"
          >
            <v-list-item-content>
              <v-list-item-title>
                {{ mask.name }}
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ mask.type }} · {{ mask.enabled ? 'enabled' : 'disabled' }}
              </v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action class="d-flex flex-row align-center">
              <v-tooltip
                v-if="isOwnerAdmin"
                top
              >
                <template #activator="{ on, attrs }">
                  <div
                    class="d-flex align-center mr-1"
                    v-bind="attrs"
                    v-on="on"
                    @click.stop
                  >
                    <v-checkbox
                      :input-value="mask.enabled"
                      dense
                      class="mask-visibility-checkbox mt-0 pt-0"
                      hide-details
                      :disabled="readOnlyMode"
                      @change="visualMaskManager.setMaskEnabled(selectedCamera, mask.id, $event)"
                      @click.stop
                    />
                  </div>
                </template>
                <span>Visibility</span>
              </v-tooltip>
              <v-btn
                icon
                small
                :color="editingMaskId === mask.id ? 'primary' : undefined"
                :disabled="!canEditMasks"
                @click.stop="toggleEditing(mask.id)"
              >
                <v-icon small>
                  {{ editingMaskId === mask.id ? 'mdi-pencil' : 'mdi-pencil-outline' }}
                </v-icon>
              </v-btn>
              <v-btn
                icon
                small
                color="error"
                :disabled="!canEditMasks"
                @click.stop="visualMaskManager.removeMask(selectedCamera, mask.id)"
              >
                <v-icon small>
                  mdi-delete
                </v-icon>
              </v-btn>
            </v-list-item-action>
          </v-list-item>
        </v-list>
        <v-alert
          v-if="cameraMasks.length === 0"
          dense
          text
          type="info"
          class="mt-3"
        >
          No visual masks for this camera yet.
        </v-alert>
      </v-container>
      <v-divider v-if="selectedMask" />
      <v-container
        v-if="selectedMask"
        fluid
        class="pa-3"
      >
        <div class="text-subtitle-1 mb-2">
          Selected Mask
        </div>
        <v-text-field
          :value="selectedMask.name"
          label="Name"
          dense
          outlined
          hide-details
          class="mb-3"
          :disabled="!canEditMasks"
          @change="visualMaskManager.renameMask(selectedCamera, selectedMask.id, $event)"
        />
        <v-switch
          :input-value="selectedMask.useRelativePositioning"
          label="Relative positioning"
          dense
          hide-details
          class="mb-1 mt-0"
          :disabled="!canEditMasks"
          @change="setRelativePositioning"
        />
        <div class="text-caption grey--text mb-3">
          Store mask bounds as a percentage of the video size so the mask scales across videos with different resolutions.
        </div>
        <div class="d-flex flex-wrap mb-3">
          <v-btn
            small
            color="primary"
            class="mr-2 mb-2"
            :disabled="!canEditMasks"
            @click="toggleEditing(selectedMask.id)"
          >
            <v-icon left small>
              {{ isEditingSelected ? 'mdi-close' : 'mdi-pencil' }}
            </v-icon>
            {{ isEditingSelected ? 'Stop Editing' : 'Edit Current Frame' }}
          </v-btn>
          <v-btn
            small
            outlined
            class="mb-2"
            :disabled="!canEditMasks || !isExactKeyframe"
            @click="visualMaskManager.removeFrameChange(selectedCamera, selectedMask.id, currentFrame)"
          >
            <v-icon left small>
              mdi-key-remove
            </v-icon>
            Remove Change
          </v-btn>
        </div>
        <div class="text-caption grey--text mb-2">
          Styling
        </div>
        <div class="d-flex align-center mb-2">
          <span class="mr-2">Color</span>
          <div
            class="color-box"
            :style="{ backgroundColor: selectedMask.style.color }"
            @click="showColorPicker = !showColorPicker"
          />
        </div>
        <v-color-picker
          v-if="showColorPicker"
          :value="selectedMask.style.color"
          hide-inputs
          class="mb-3"
          @input="updateStyle('color', $event)"
        />
        <v-switch
          :input-value="selectedMask.style.fill"
          label="Filled"
          dense
          hide-details
          class="mb-3 mt-0"
          :disabled="!canEditMasks"
          @change="updateStyle('fill', $event)"
        />
        <div class="mb-3">
          <div class="text-caption mb-1">
            Opacity: {{ Number(selectedMask.style.opacity || 0).toFixed(2) }}
          </div>
          <v-slider
            :value="selectedMask.style.opacity"
            min="0"
            max="1"
            step="0.05"
            dense
            hide-details
            :disabled="!canEditMasks"
            @input="updateStyle('opacity', $event)"
          />
        </div>
        <div class="mb-4">
          <div class="text-caption mb-1">
            Line Thickness: {{ selectedMask.style.strokeWidth }}
          </div>
          <v-slider
            :value="selectedMask.style.strokeWidth"
            min="1"
            max="12"
            step="1"
            dense
            hide-details
            :disabled="!canEditMasks"
            @input="updateStyle('strokeWidth', $event)"
          />
        </div>
        <div class="text-caption grey--text mb-2">
          Shape changes
        </div>
        <div class="d-flex flex-wrap">
          <v-chip
            v-for="frame in keyframes"
            :key="frame"
            x-small
            outlined
            class="mr-1 mb-1"
            :color="frame === currentFrame ? 'primary' : undefined"
            @click="seekFrame(frame)"
          >
            {{ frame }}
          </v-chip>
        </div>
      </v-container>
    </div>
  </div>
</template>

<style scoped>
.visual-mask-sidebar {
  height: 100%;
  min-height: 0;
}

.sidebar-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.mask-list {
  padding-top: 0;
  padding-bottom: 0;
}

.color-box {
  width: 28px;
  height: 28px;
  border: 1px solid white;
  border-radius: 4px;
  cursor: pointer;
}

.mask-visibility-checkbox {
  margin: 0;
  padding: 0;
}
</style>
