import { computed } from 'vue';
import {
  useCameraStore,
  useEditingGroupId,
  useEditingMode,
  useMultiSelectList,
  useSelectedCamera,
  useSelectedTrackId,
  useTime,
} from 'vue-media-annotator/provides';
import {
  computeEditingDetails,
  getEditingInstruction,
  GROUP_EDIT_INSTRUCTION,
  IDLE_INSTRUCTION,
  MULTI_SELECT_INSTRUCTION,
} from 'dive-common/use/editingModeInstructions';

export default function useEditingStatus() {
  const selectedTrackIdRef = useSelectedTrackId();
  const editingModeRef = useEditingMode();
  const cameraStore = useCameraStore();
  const selectedCamera = useSelectedCamera();
  const { frame } = useTime();
  const editingGroupIdRef = useEditingGroupId();
  const multiSelectList = useMultiSelectList();

  const groupEditActive = computed(() => editingGroupIdRef.value !== null);
  const multiSelectActive = computed(() => multiSelectList.value.length > 0);

  const editingDetails = computed(() => computeEditingDetails(
    !!editingModeRef.value,
    selectedTrackIdRef.value,
    editingModeRef.value,
    frame.value,
    (trackId) => cameraStore.getPossibleTrack(trackId, selectedCamera.value),
  ));

  const statusHeader = computed(() => {
    if (groupEditActive.value) {
      return { text: 'Group Edit Mode', icon: 'mdi-group', color: 'primary' };
    }
    if (multiSelectActive.value) {
      return { text: 'Multi-select Mode', icon: 'mdi-call-merge', color: 'error' };
    }
    if (editingDetails.value !== 'disabled' && editingModeRef.value) {
      return {
        text: `${editingDetails.value} ${editingModeRef.value}`,
        icon: editingDetails.value === 'Creating' ? 'mdi-pencil-plus' : 'mdi-pencil',
        color: editingDetails.value === 'Creating' ? 'success' : 'primary',
      };
    }
    return { text: 'Not editing', icon: 'mdi-pencil-off-outline', color: '' };
  });

  const instructionText = computed(() => {
    if (groupEditActive.value) {
      return GROUP_EDIT_INSTRUCTION;
    }
    if (multiSelectActive.value) {
      return MULTI_SELECT_INSTRUCTION;
    }
    return getEditingInstruction(editingDetails.value, editingModeRef.value);
  });

  const isActive = computed(() => (
    groupEditActive.value
    || multiSelectActive.value
    || editingDetails.value !== 'disabled'
  ));

  return {
    statusHeader,
    instructionText,
    isActive,
    idleInstruction: IDLE_INSTRUCTION,
  };
}
