import { EditAnnotationTypes } from 'vue-media-annotator/layers';
import Track from 'vue-media-annotator/track';
import { AnnotationId } from 'vue-media-annotator/BaseAnnotation';

export type EditingDetailsState = 'disabled' | 'Creating' | 'Editing';

export const EDITING_MODE_INSTRUCTIONS = {
  Creating: {
    rectangle: 'Drag to draw rectangle. Press ESC to exit.',
    Polygon: 'Click to place vertices. Right click to close.',
    LineString: 'Click to place head/tail points.',
    Time: 'Automatically creating Time',
    Mask: 'Create a Segmentation Mask',
    Point: 'Click to place a point. Press ESC to exit.',
  },
  Editing: {
    rectangle: 'Drag vertices to resize the rectangle',
    Polygon: 'Drag midpoints to create new vertices. Click vertices to select for deletion.',
    LineString: 'Click endpoints to select for deletion.',
    Time: 'Use the keyframe indicator to modify the time annotation, Delete to return to rectangle annotations',
    Mask: 'Edit the Segmentation Mask',
    Point: 'Drag to move the point',
  },
} as const;

export const IDLE_INSTRUCTION = 'Right click on an annotation to edit';
export const GROUP_EDIT_INSTRUCTION = 'Editing group. Add or remove tracks. Esc. to exit.';
export const MULTI_SELECT_INSTRUCTION = 'Multi-select in progress. Editing is disabled. Select additional tracks to merge or group.';

export function computeEditingDetails(
  isEditingMode: boolean,
  selectedTrackId: AnnotationId | null,
  editingType: false | EditAnnotationTypes,
  frame: number,
  getTrack: (trackId: AnnotationId) => Track | undefined,
): EditingDetailsState {
  if (!isEditingMode || selectedTrackId === null || !editingType) {
    return 'disabled';
  }
  try {
    const track = getTrack(selectedTrackId);
    if (!track) {
      return 'disabled';
    }
    const [feature] = track.getFeature(frame);
    if (feature) {
      if (!feature?.bounds?.length) {
        return 'Creating';
      }
      if (editingType === 'rectangle' || editingType === 'Time') {
        return 'Editing';
      }
      return (feature.geometry?.features.filter((item) => item.geometry.type === editingType).length
        ? 'Editing'
        : 'Creating');
    }
    return 'Creating';
  } catch {
    return 'disabled';
  }
}

export function getEditingInstruction(
  editingDetails: EditingDetailsState,
  editingMode: false | EditAnnotationTypes,
): string {
  if (editingDetails === 'disabled' || !editingMode) {
    return IDLE_INSTRUCTION;
  }
  const modeInstructions = EDITING_MODE_INSTRUCTIONS[editingDetails];
  const instruction = modeInstructions[editingMode as keyof typeof modeInstructions];
  return instruction || `${editingDetails} ${editingMode}`;
}
