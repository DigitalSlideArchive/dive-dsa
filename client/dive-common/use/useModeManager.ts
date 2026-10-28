/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-syntax */
import {
  computed, Ref, reactive, ref, onBeforeUnmount, toRef, watch,
} from 'vue';
import {
  uniq, flatMapDeep, flattenDeep, cloneDeep,
} from 'lodash';
import Track, { TrackId } from 'vue-media-annotator/track';
import { RectBounds, updateBounds } from 'vue-media-annotator/utils';
import { EditAnnotationTypes, VisibleAnnotationTypes } from 'vue-media-annotator/layers';
import { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';

import Recipe from 'vue-media-annotator/recipe';
import type { AnnotationId } from 'vue-media-annotator/BaseAnnotation';
import type TrackFilterControls from 'vue-media-annotator/TrackFilterControls';
import BaseAnnotation from 'vue-media-annotator/BaseAnnotation';

import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { clientSettings } from 'dive-common/store/settings';
import GroupFilterControls from 'vue-media-annotator/GroupFilterControls';
import CameraStore from 'vue-media-annotator/CameraStore';
import {
  CreateFullFrameTrackAction,
  CreateTrackAction,
  DIVEAction,
  DIVEMetadataAction,
  normalizeCreateTrackAfterSelection,
} from 'dive-common/use/useActions';
import { deleteDiveDatasetMetadataKey, setDiveDatasetMetadataKey } from 'platform/web-girder/api/divemetadata.service';
import { computeEditingDetails } from 'dive-common/use/editingModeInstructions';
import PolygonBase from 'dive-common/recipes/polygonbase';
import SegmentationPointClick, {
  SegmentationPointsState, SegmentationPredictionResult,
} from 'dive-common/recipes/segmentationpointclick';
import {
  applySegmentation, applySegmentationMask, applySegmentationMaskPreview,
  restoreFeature, snapshotFeature, SegmentationSnapshot,
} from 'dive-common/use/segmentation/segmentationTrack';
import type { SegmentationMask } from 'dive-common/use/segmentation/types';

type SupportedFeature = GeoJSON.Feature<GeoJSON.Point | GeoJSON.Polygon | GeoJSON.LineString>;

/* default to index + 1
 * call with -1 to select previous, or pass any other delta
 */
function selectNext<T extends BaseAnnotation>(filtered: Readonly<T>[], selected: Readonly<AnnotationId | null>, delta = 1): AnnotationId | null {
  if (filtered.length > 0) {
    if (selected === null) {
      // if no track is selected, return the first trackId
      return filtered[0].id;
    }
    // return the trackId by the delta offset if it exists
    const index = filtered.findIndex((t) => t.id === selected);
    const newIndex = index + delta;
    if (newIndex >= 0 && newIndex < filtered.length) {
      // if we are not at the end
      return filtered[newIndex].id;
    }
  }
  //Return null if no other conditions are met
  return null;
}

interface SetAnnotationStateArgs {
  visible?: VisibleAnnotationTypes[];
  editing?: EditAnnotationTypes;
  key?: string;
  recipeName?: string;
}
/**
 * The point of this composition function is to define and manage the transition betwee
 * different UI states within the program.  States and state transitions can be modified
 * based on settings, blocked if it tries to go to incompatible state or provide feedback
 *
 * Mostly allows us to inject additional logic into transitions.
 */
export default function useModeManager({
  cameraStore,
  trackFilterControls,
  groupFilterControls,
  aggregateController,
  readonlyState,
  recipes,
  datasetId,
}: {
    cameraStore: CameraStore;
    trackFilterControls: TrackFilterControls;
    groupFilterControls: GroupFilterControls;
    aggregateController: Ref<AggregateMediaController>;
    readonlyState: Readonly<Ref<boolean>>;
    recipes: Recipe[];
    datasetId: Ref<string | null>;
}) {
  let creating = false;
  /* Point-click segmentation session state (see the handlers below) */
  const segmentationRecipe = recipes.find(
    (r): r is SegmentationPointClick => r instanceof SegmentationPointClick,
  );
  const segmentationPoints = ref<SegmentationPointsState>({ points: [], labels: [], frameNum: -1 });
  /**
   * Unconfirmed mask-mode predictions, exposed so the annotator can render
   * the binary mask itself (at preview opacity) instead of a polygon outline.
   * Kept in sync with `segmentationPredictions` below.
   */
  interface SegmentationPreviewMask {
    trackId: AnnotationId; camera: string; frameNum: number; mask: SegmentationMask;
  }
  const segmentationPreviewMasks = ref<SegmentationPreviewMask[]>([]);

  let segmentationTarget: { trackId: AnnotationId; camera: string } | null = null;
  const segmentationSnapshots = new Map<number, SegmentationSnapshot>();
  /** Latest previewed prediction per frame, kept so accepting (e.g. by
   * switching tools) can still turn a mask-mode preview into a mask. */
  const segmentationPredictions = new Map<number, SegmentationPredictionResult>();
  /**
   * Accepted or confirmed masks still being stored. They stay previewed
   * until the upload settles, so the frame never shows neither the preview
   * nor the stored mask.
   */
  let persistingPreviewMasks: SegmentationPreviewMask[] = [];

  function syncSegmentationPreviewMasks() {
    const target = segmentationTarget;
    const session = target
      ? Array.from(segmentationPredictions.values())
        .filter((result) => result.outputMode === 'mask' && !!result.mask)
        .map((result) => ({
          trackId: target.trackId,
          camera: target.camera,
          frameNum: result.frameNum,
          mask: result.mask as SegmentationMask,
        }))
      : [];
    // A live preview of the same track and frame wins over one being stored.
    segmentationPreviewMasks.value = [...session, ...persistingPreviewMasks];
  }
  /** Platform hook that stores a confirmed binary mask (web: RLE upload). */
  let createSegmentationMask: ((trackId: AnnotationId, frameNum: number, mask: SegmentationMask) => Promise<void>) | null = null;

  function setSegmentationMaskCreator(
    fn: (trackId: AnnotationId, frameNum: number, mask: SegmentationMask) => Promise<void>,
  ) {
    createSegmentationMask = fn;
  }

  const { prompt, inputValue } = usePrompt();
  const annotationModes = reactive({
    visible: ['rectangle', 'Polygon', 'LineString', 'VisualMask', 'text', 'Time'] as VisibleAnnotationTypes[],
    editing: 'rectangle' as EditAnnotationTypes,
  });
  const trackSettings = toRef(clientSettings, 'trackSettings');
  const groupSettings = toRef(clientSettings, 'groupSettings');
  const selectedCamera = ref('singleCam');

  const linkingState = ref(false);
  const linkingTrack: Ref<AnnotationId| null> = ref(null);
  const linkingCamera = ref('');

  // Meaning of this value varies based on the editing mode.  When in
  // polygon edit mode, this corresponds to a polygon point.  Ditto in line mode.
  const selectedFeatureHandle = ref(-1);
  //The Key of the selected type, for now mostly ''
  const selectedKey = ref('');

  // the currently selected Track
  const selectedTrackId = ref(null as AnnotationId | null);

  // the currently editing Group
  const editingGroupId = ref(null as AnnotationId | null);

  // boolean whether or not selectedTrackId is also being edited.
  const editingTrack = ref(false);

  // which type is currently being edited, if any
  const editingMode = computed(() => editingTrack.value && annotationModes.editing);
  const editingCanary = ref(false);

  // Track Multi-select state
  const multiSelectList = ref([] as AnnotationId[]);
  const multiSelectActive = computed(() => multiSelectList.value.length > 0);

  const diveMetadataRootId: Ref<string | null> = ref(null);

  const _filteredTracks = computed(
    () => trackFilterControls.filteredAnnotations.value.map((filtered) => filtered.annotation),
  );

  const _filteredGroups = computed(
    () => groupFilterControls.filteredAnnotations.value.map((filtered) => filtered.annotation),
  );

  const selectNextTrack = (delta = 1) => selectNext(_filteredTracks.value, selectedTrackId.value, delta);

  const selectNextGroup = (delta = 1) => selectNext(_filteredGroups.value, editingGroupId.value, delta);

  type AfterCreateTrackActionState =
    | { mode: 'previousTrack'; trackId: AnnotationId }
    | { mode: 'none' }
    | null;

  let afterCreateTrackAction: AfterCreateTrackActionState = null;

  let pendingTrackRestore: AnnotationId | null = null;

  function setPendingTrackRestore(trackId: AnnotationId | null) {
    pendingTrackRestore = trackId;
  }

  function applyAfterCreateTrackAction(): boolean {
    if (!afterCreateTrackAction) {
      return false;
    }
    if (afterCreateTrackAction.mode === 'previousTrack') {
      selectTrack(afterCreateTrackAction.trackId, false);
    } else if (afterCreateTrackAction.mode === 'none') {
      handleSelectTrack(null, false);
    }
    afterCreateTrackAction = null;
    return true;
  }

  function applyPendingTrackRestore(): boolean {
    if (pendingTrackRestore === null) {
      return false;
    }
    const trackId = pendingTrackRestore;
    pendingTrackRestore = null;
    const track = cameraStore.getAnyPossibleTrack(trackId);
    if (track) {
      selectTrack(trackId, false);
      seekNearest(track);
    }
    return true;
  }

  function applyPendingSelectionRestore(): boolean {
    if (applyAfterCreateTrackAction()) {
      return true;
    }
    return applyPendingTrackRestore();
  }

  function selectTrack(trackId: AnnotationId | null, edit = false) {
    selectedTrackId.value = trackId;
    if (edit && readonlyState.value) {
      prompt({ title: 'Read Only Mode', text: 'This Dataset is in Read Only mode, no edits can be made.' });
    } else {
      editingTrack.value = trackId !== null && edit;
    }
  }

  /** end  */
  function _depend(): boolean {
    return editingCanary.value;
  }
  function _nudgeEditingCanary() {
    editingCanary.value = !editingCanary.value;
  }

  // What is occuring in editing mode
  const editingDetails = computed(() => {
    _depend();
    if (!editingMode.value || selectedTrackId.value === null) {
      return 'disabled' as const;
    }
    try {
      const { frame } = aggregateController.value;
      return computeEditingDetails(
        true,
        selectedTrackId.value,
        annotationModes.editing,
        frame.value,
        (trackId) => cameraStore.getPossibleTrack(trackId, selectedCamera.value),
      );
    } catch {
      return 'disabled' as const;
    }
  });

  let deleteLocalMasks: (((trackId: AnnotationId, frameList: number[]) => void) | null) = null;

  function setDeleteLocalMasks(func: (trackId: AnnotationId, frameList: number[]) => void) {
    deleteLocalMasks = func;
  }

  // which types are currently visible, always including the editingType
  const visibleModes = computed(() => (
    uniq(annotationModes.visible.concat(editingMode.value || []))
  ));

  /**
   * Figure out if a new feature should enable interpolation
   * based on current state and the result of canInterpolate.
   */
  function _shouldInterpolate(canInterpolate: boolean) {
    // if this is a track, then whether to interpolate
    // is determined by newTrackSettings (if new track)
    // or canInterpolate (if existing track)
    const interpolateTrack = creating
      ? trackSettings.value.newTrackSettings.modeSettings.Track.interpolate
      : canInterpolate;
    // if detection, interpolate is always false
    return trackSettings.value.newTrackSettings.mode === 'Detection'
      ? false
      : interpolateTrack;
  }

  function seekNearest(track: Track) {
    // Seek to the nearest point in the track.
    const { frame } = aggregateController.value;
    if (frame.value < track.begin) {
      aggregateController.value.seek(track.begin);
    } else if (frame.value > track.end) {
      aggregateController.value.seek(track.end);
    }
  }

  async function _setLinkingTrack(trackId: TrackId) {
    //Confirm that there is no track for other cameras.
    const trackList = cameraStore.getTrackAll(trackId);
    if (trackList.length > 1) {
      prompt({
        title: 'Linking Error',
        text: [`TrackId: ${trackId} has tracks on other cameras besides the selected camera ${linkingCamera.value}`,
          `You need to select a track that only exists on camera: ${linkingCamera.value} `,
          'You can split of the track you were trying to select by clicking OK and hitting Escape to exit Linking Mode and using the split tool',
        ],
        positiveButton: 'OK',
      });
    } else {
      linkingTrack.value = trackId;
    }
  }

  function _selectKey(key: string | undefined) {
    if (typeof key === 'string') {
      selectedKey.value = key;
    } else {
      selectedKey.value = '';
    }
  }

  function handleSelectFeatureHandle(i: number, key = '') {
    if (i !== selectedFeatureHandle.value) {
      selectedFeatureHandle.value = i;
    } else {
      selectedFeatureHandle.value = -1;
    }
    _selectKey(key);
  }

  function handleSelectTrack(trackId: TrackId | null, edit = false) {
    // Leaving the segmented detection (or its edit mode) discards an unconfirmed mask.
    if (trackId !== selectedTrackId.value || !edit) {
      cancelSegmentation();
    }
    /**
     * If creating mode and editing and selectedTrackId is the same,
     * don't kick out of creating mode.  This happens when moving between
     * rect/poly/line during continuous creation.
     */
    if (!(creating && edit && trackId === selectedTrackId.value)) {
      creating = false;
    }
    /**
     * If merge is in progress, add selected tracks to the merge list
     */
    if (trackId !== null && multiSelectActive.value) {
      multiSelectList.value = Array.from((new Set(multiSelectList.value).add(trackId)));
      /**
       * If editing group, then the newly selected track should be added to the group
       */
      if (editingGroupId.value !== null && !edit) {
        const track = cameraStore.getAnyTrack(trackId);
        const groupStore = cameraStore.camMap.value.get(selectedCamera.value)?.groupStore;
        if (groupStore) {
          groupStore.get(editingGroupId.value).addMembers({
            [trackId]: { ranges: [[track.begin, track.end]] },
          });
        }
      } else if (edit) {
        editingGroupId.value = null;
        multiSelectList.value = [];
      }
    } else if (linkingState.value) {
      // Only use the first non-null track with is clicked on to link
      if (trackId !== null) {
        _setLinkingTrack(trackId);
      }
      return;
    }
    /* Do not allow editing when merge is in progress */
    selectTrack(trackId, edit && !multiSelectActive.value);
    if (edit && !multiSelectActive.value && annotationModes.editing !== 'Time' && selectedTrackId.value !== null) {
      const track = cameraStore.getTrack(selectedTrackId.value, selectedCamera.value);
      if (track.meta?.time) {
        annotationModes.editing = 'Time';
      }
    }
  }

  /** Put UI into group editing mode. */
  function handleGroupEdit(groupId: AnnotationId | null) {
    creating = false;
    editingTrack.value = false;
    editingGroupId.value = groupId;
    if (groupId !== null) {
      /** When moving into a group edit mode, multi-select all track members */
      const groupStore = cameraStore.camMap.value.get(selectedCamera.value)?.groupStore;
      if (groupStore) {
        const group = groupStore.get(groupId);
        multiSelectList.value = group.memberIds;
        selectedTrackId.value = null;
        seekNearest(cameraStore.getAnyTrack(multiSelectList.value[0]));
      }
    }
  }

  //Handles deselection or hitting escape including while editing
  function handleEscapeMode(options?: { applyTrackRestore?: boolean }) {
    // Restore before the empty-track check so an unconfirmed mask is not kept.
    cancelSegmentation();
    if (selectedTrackId.value !== null) {
      const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
      if (track && track.begin === track.end) {
        const features = track.featureIndex.length ? track.getFeature(track.begin) : [];
        // If no features exist we remove the empty track
        if (!features.filter((item) => item !== null).length) {
          const trackStore = cameraStore.camMap.value.get(selectedCamera.value)?.trackStore;
          if (trackStore) {
            trackStore.remove(selectedTrackId.value);
          }
        }
      }
    }
    linkingState.value = false;
    linkingCamera.value = '';
    linkingTrack.value = null;
    multiSelectList.value = [];
    handleGroupEdit(null);
    if (options?.applyTrackRestore !== false && applyPendingSelectionRestore()) {
      return;
    }
    handleSelectTrack(null, false);
  }

  function handleAddTrackOrDetection(overrideTrackId?: number): TrackId {
    // Handles adding a new track with the NewTrack Settings
    handleEscapeMode({ applyTrackRestore: false });
    const { frame } = aggregateController.value;
    let trackType = trackSettings.value.newTrackSettings.type;
    if (overrideTrackId !== undefined) {
      const track = cameraStore.getAnyPossibleTrack(overrideTrackId);
      if (track !== undefined) {
        // eslint-disable-next-line prefer-destructuring
        trackType = track.confidencePairs[0][0];
      }
    } else {
      // eslint-disable-next-line no-param-reassign
      overrideTrackId = cameraStore.getNewTrackId();
    }
    const trackStore = cameraStore.camMap.value.get(selectedCamera.value)?.trackStore;
    if (trackStore) {
      const newTrackId = trackStore.add(
        frame.value,
        trackType,
        selectedTrackId.value || undefined,
        overrideTrackId,
      ).trackId;
      selectTrack(newTrackId, true);
      creating = true;
      return newTrackId;
    }
    throw Error(`Could not find trackStore for Camera: ${selectedCamera.value}`);
  }

  function newTrackSettingsAfterLogic(addedTrack: Track) {
    // Default settings which are updated by the TrackSettings component
    let newCreatingValue = false; // by default, disable creating at the end of this function
    if (creating) {
      if (addedTrack && (afterCreateTrackAction || pendingTrackRestore !== null)) {
        applyPendingSelectionRestore();
      } else if (addedTrack && trackSettings.value.newTrackSettings !== null) {
        if (trackSettings.value.newTrackSettings.mode === 'Track'
        && trackSettings.value.newTrackSettings.modeSettings.Track.autoAdvanceFrame
        ) {
          aggregateController.value.nextFrame();
          newCreatingValue = true;
        } else if (trackSettings.value.newTrackSettings.mode === 'Detection') {
          if (
            trackSettings.value.newTrackSettings.modeSettings.Detection.continuous) {
            handleAddTrackOrDetection(cameraStore.getNewTrackId());
            newCreatingValue = true; // don't disable creating mode
          }
        }
      }
    }
    _nudgeEditingCanary();
    creating = newCreatingValue;
  }

  function handleUpdateRectBounds(frameNum: number, flickNum: number, bounds: RectBounds, forceInterpolate = false, maskValue: undefined | boolean = undefined) {
    if (selectedTrackId.value !== null) {
      const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
      if (track) {
        // Determines if we are creating a new Detection
        const { interpolate } = track.canInterpolate(frameNum);
        track.setFeature({
          frame: frameNum,
          flick: flickNum,
          bounds,
          keyframe: true,
          interpolate: _shouldInterpolate(interpolate) || forceInterpolate,
        });
        newTrackSettingsAfterLogic(track);
        if (maskValue !== undefined) {
          track.setHasMask(frameNum, maskValue);
        }
      }
    }
  }

  function handleUpdateGeoJSON(
    eventType: 'in-progress' | 'editing',
    frameNum: number,
    flickNum: number,
    // Type alias this
    data: SupportedFeature,
    key?: string,
    preventInterrupt?: () => void,
  ) {
    /**
     * Declare aggregate update collector. Each recipe
     * will have the opportunity to modify this object.
     */
    const update = {
      // Geometry data to be applied to the feature
      geoJsonFeatureRecord: {} as Record<string, SupportedFeature[]>,
      // Ploygons to be unioned with existing bounds (update)
      union: [] as GeoJSON.Polygon[],
      // Polygons to be unioned without existing bounds (overwrite)
      unionWithoutBounds: [] as GeoJSON.Polygon[],
      // If the editor mode should change types
      newType: undefined as EditAnnotationTypes | undefined,
      // If the selected key should change
      newSelectedKey: undefined as string | undefined,
      // If the recipe has completed
      done: [] as (boolean|undefined)[],
    };

    if (selectedTrackId.value !== null) {
      const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
      if (track) {
        // newDetectionMode is true if there's no keyframe on frameNum
        const { features, interpolate } = track.canInterpolate(frameNum);
        const [real] = features;

        // Give each recipe the opportunity to make changes
        recipes.forEach((recipe) => {
          const changes = recipe.update(eventType, frameNum, track, [data], key);
          // Prevent key conflicts among recipes
          Object.keys(changes.data).forEach((key_) => {
            if (key_ in update.geoJsonFeatureRecord) {
              throw new Error(`Recipe ${recipe.name} tried to overwrite key ${key_} when it was already set`);
            }
          });
          Object.assign(update.geoJsonFeatureRecord, changes.data);
          // Collect unions
          update.union.push(...changes.union);
          update.unionWithoutBounds.push(...changes.unionWithoutBounds);
          update.done.push(changes.done);
          // Prevent more than 1 recipe from changing a given mode/key
          if (changes.newType) {
            if (update.newType) {
              throw new Error(`Recipe ${recipe.name} tried to modify type when it was already set`);
            }
            update.newType = changes.newType;
          }
          if (changes.newSelectedKey) {
            if (update.newSelectedKey) {
              throw new Error(`Recipe ${recipe.name} tried to modify selectedKey when it was already set`);
            }
            update.newSelectedKey = changes.newSelectedKey;
          }
        });

        // somethingChanged indicates whether there will need to be a redraw
        // of the geometry currently displayed
        const somethingChanged = (
          update.union.length !== 0
          || update.unionWithoutBounds.length !== 0
          || Object.keys(update.geoJsonFeatureRecord).length !== 0
        );

        // If a drawable changed, but we aren't changing modes
        // prevent an interrupt within EditAnnotationLayer
        if (
          somethingChanged
          && !update.newSelectedKey
          && !update.newType
          && preventInterrupt
        ) {
          preventInterrupt();
        } else {
          // Otherwise, one of these state changes will trigger an interrupt.
          if (update.newSelectedKey) {
            selectedKey.value = update.newSelectedKey;
          }
          if (update.newType) {
            annotationModes.editing = update.newType;
            recipes.forEach((r) => r.deactivate());
          }
        }
        // Update the state of the track in the trackstore.
        if (somethingChanged) {
          track.setFeature({
            frame: frameNum,
            flick: flickNum,
            keyframe: true,
            bounds: updateBounds(real?.bounds, update.union, update.unionWithoutBounds),
            interpolate,
          }, flatMapDeep(
            update.geoJsonFeatureRecord,
            (geomlist, key_) => geomlist.map((geom) => ({
              type: geom.type,
              geometry: geom.geometry,
              properties: { key: key_ },
            })),
          ));

          // Only perform "initialization" after the first shape.
          // Treat this as a completed annotation if eventType is editing
          // Or none of the recieps reported that they were unfinished.
          if (eventType === 'editing' || update.done.every((v) => v !== false)) {
            newTrackSettingsAfterLogic(track);
          }
        }
      } else {
        throw new Error(`${selectedTrackId.value} missing from trackMap`);
      }
    } else {
      throw new Error('Cannot call handleUpdateGeojson without a selected Track ID');
    }
  }

  /* If any recipes are active, allow them to remove a point */
  function handleRemovePoint() {
    if (selectedTrackId.value !== null && selectedFeatureHandle.value !== -1) {
      const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
      if (track) {
        recipes.forEach((r) => {
          if (r.active.value) {
            const { frame } = aggregateController.value;
            r.deletePoint(
              frame.value,
              track,
              selectedFeatureHandle.value,
              selectedKey.value,
              annotationModes.editing,
            );
          }
        });
      }
    }
    handleSelectFeatureHandle(-1);
  }

  /* If any recipes are active, remove the geometry they added */
  function handleRemoveAnnotation() {
    if (selectedTrackId.value !== null) {
      const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
      if (track) {
        const { frame } = aggregateController.value;
        if (track.meta?.time && annotationModes.editing === 'Time') {
          track.setTimeMode(false);
          handleSetAnnotationState({ editing: 'rectangle' });
        }
        if (annotationModes.editing === 'Mask') {
          const [feature] = track.getFeature(frame.value);
          if (feature?.hasMask) {
            track.setHasMask(frame.value, false);
          }
        }
        recipes.forEach((r) => {
          if (r.active.value) {
            r.delete(frame.value, track, selectedKey.value, annotationModes.editing);
          }
        });
        _nudgeEditingCanary();
      }
    }
  }

  /**
   * Unstage a track from the merge list
   */
  function handleUnstageFromMerge(trackIds: TrackId[]) {
    multiSelectList.value = multiSelectList.value.filter((trackId) => !trackIds.includes(trackId));
    /* Unselect a track when it is unstaged */
    if (selectedTrackId.value !== null && trackIds.includes(selectedTrackId.value)) {
      handleSelectTrack(null);
    }
    /** Remove members from group if group editing */
    if (editingGroupId.value !== null) {
      const groupStore = cameraStore.camMap.value.get(selectedCamera.value)?.groupStore;
      if (groupStore) {
        const group = groupStore.annotationMap.get(editingGroupId.value);
        if (group) group.removeMembers(trackIds);
      }
    }
    /** Exit group editing mode if last track is removed */
    if (multiSelectList.value.length === 0) {
      handleEscapeMode();
    }
  }

  async function handleRemoveTrack(
    trackIds: TrackId[],
    forcePromptDisable = false,
    cameraName = '',
    options?: { returnToTrackId?: AnnotationId },
  ) {
    /* Figure out next track ID */
    const maybeNextTrackId = selectNextTrack(1);
    const previousOrNext = maybeNextTrackId !== null
      ? maybeNextTrackId
      : selectNextTrack(-1);
    /* Delete track */
    if (!forcePromptDisable && trackSettings.value.deletionSettings.promptUser) {
      const trackStrings = trackIds.map((track) => track.toString());
      const groups = flattenDeep(
        trackIds.map((trackId) => cameraStore.lookupGroups(trackId)),
      );
      const text = (['Would you like to delete the following tracks:']).concat(trackStrings);
      if (groups.length > 0) {
        text.push('');
        text.push(`This track will be removed from ${groups.length} groups.`);
      }
      text.push('');
      text.push('This setting can be changed under the Track Settings');
      const result = await prompt({
        title: 'Delete Confirmation',
        text,
        positiveButton: 'OK',
        negativeButton: 'Cancel',
        confirm: true,
      });
      if (!result) {
        return;
      }
    }
    trackIds.forEach((trackId) => {
      const track = cameraStore.getPossibleTrack(trackId, selectedCamera.value);
      if (track?.hasAnyMask() && deleteLocalMasks) {
        deleteLocalMasks(trackId, track.getMaskFrameList());
      }
      cameraStore.remove(trackId, cameraName);
    });
    handleUnstageFromMerge(trackIds);
    const returnToTrackId = options?.returnToTrackId != null
      && !trackIds.includes(options.returnToTrackId)
      ? options.returnToTrackId
      : null;
    if (returnToTrackId !== null) {
      const returnTrack = cameraStore.getAnyPossibleTrack(returnToTrackId);
      if (returnTrack) {
        selectTrack(returnToTrackId, false);
        seekNearest(returnTrack);
        return;
      }
    }
    selectTrack(previousOrNext, false);
  }

  /** Toggle editing mode for track */
  function handleTrackEdit(
    trackId: TrackId,
    options?: { returnToTrackId?: AnnotationId },
  ) {
    const track = cameraStore.getPossibleTrack(trackId, selectedCamera.value);
    if (track) {
      seekNearest(track);
      const togglingOff = trackId === selectedTrackId.value && editingTrack.value;
      const editing = trackId === selectedTrackId.value ? (!editingTrack.value) : true;
      if (!togglingOff && editing
        && options?.returnToTrackId != null
        && options.returnToTrackId !== trackId) {
        setPendingTrackRestore(options.returnToTrackId);
      }
      if (togglingOff && !editing && applyPendingTrackRestore()) {
        return;
      }
      handleSelectTrack(trackId, editing);
    } else if (cameraStore.getAnyTrack(trackId) !== undefined) {
      //track exists in other cameras we create in the current map using override
      handleAddTrackOrDetection(trackId);
      if (options?.returnToTrackId != null && options.returnToTrackId !== trackId) {
        setPendingTrackRestore(options.returnToTrackId);
      }
      const camTrack = cameraStore.getPossibleTrack(trackId, selectedCamera.value);
      // now that we have a new track we select it for editing
      if (camTrack) {
        const editing = trackId === selectedTrackId.value;
        handleSelectTrack(trackId, editing);
      }
    }
  }

  function handleTrackClick(trackId: TrackId) {
    const track = cameraStore.getTracksMerged(trackId);
    seekNearest(track);
    handleSelectTrack(trackId, editingTrack.value);
  }

  function handleSelectNext(delta: number) {
    const newTrack = selectNextTrack(delta);
    /** Only allow selectNext when not in group editing mode. */
    if (newTrack !== null && editingGroupId.value === null) {
      handleSelectTrack(newTrack, false);
      seekNearest(cameraStore.getAnyTrack(newTrack));
    }
  }

  function handleSetAnnotationState({
    visible, editing, key, recipeName,
  }: SetAnnotationStateArgs) {
    if (visible) {
      annotationModes.visible = visible;
    }
    if (editing && recipeName !== segmentationRecipe?.name) {
      // Switching tools keeps the segmentation preview as the detection's shape.
      acceptSegmentation();
    }
    if (editing) {
      annotationModes.editing = editing;
      _selectKey(key);
      handleSelectTrack(selectedTrackId.value, true);
      if (editing !== 'Time' && selectedTrackId.value !== null) {
        const track = cameraStore.getTrack(selectedTrackId.value, selectedCamera.value);
        if (track.meta?.time) {
          annotationModes.editing = 'Time';
        }
      }
      recipes.forEach((r) => {
        if (recipeName !== r.name) {
          r.deactivate();
        }
      });
    }
  }

  /**
   * Merge: Enabled whenever there are candidates in the merge list
   */
  function handleToggleMerge(): TrackId[] {
    if (!multiSelectActive.value && selectedTrackId.value !== null) {
      /* If no merge in progress and there is a selected track id */
      multiSelectList.value = [selectedTrackId.value];
      /* no editing in merge mode */
      selectTrack(selectedTrackId.value, false);
    } else {
      multiSelectList.value = [];
      handleGroupEdit(null);
    }
    return multiSelectList.value;
  }

  /**
   * Merge: Commit the multi-select list to merge
   */
  function handleCommitMerge() {
    if (multiSelectList.value.length >= 2) {
      const track = cameraStore.getTrack(multiSelectList.value[0], selectedCamera.value);
      const otherTrackIds = multiSelectList.value.slice(1);
      track.merge(otherTrackIds.map(
        (trackId) => cameraStore.getTrack(trackId, selectedCamera.value),
      ));
      handleRemoveTrack(otherTrackIds, true);
      handleToggleMerge();
      handleSelectTrack(track.trackId, false);
    }
  }

  function handleStartLinking(camera: string) {
    if (!linkingState.value && selectedTrackId.value !== null) {
      linkingState.value = true;
      if (cameraStore.camMap.value.has(camera)) {
        linkingCamera.value = camera;
      } else {
        throw Error(`Camera: ${camera} does not exist in the system for linking`);
      }
    } else if (selectedTrackId.value === null) {
      throw Error('Cannot start Linking without a track selected');
    }
  }

  function handleStopLinking() {
    linkingState.value = false;
    linkingTrack.value = null;
    linkingCamera.value = '';
  }
  /**
   * Group: Add the currently selected track to a new group and
   * enter group editing mode.
   */
  function handleAddGroup() {
    if (selectedTrackId.value !== null) {
      const members = [cameraStore.getTrack(selectedTrackId.value, selectedCamera.value)];
      const groupStore = cameraStore.camMap.value.get(selectedCamera.value)?.groupStore;
      if (groupStore) {
        const newGrp = groupStore.add(members, groupSettings.value.newGroupSettings.type);
        handleGroupEdit(newGrp.id);
      }
    }
  }

  /**
   * Group: Remove group ids and unselect everything.
   */
  function handleRemoveGroup(ids: AnnotationId[]) {
    ids.forEach((groupId) => {
      const groupStore = cameraStore.camMap.value.get(selectedCamera.value)?.groupStore;
      if (groupStore) {
        groupStore.remove(groupId);
      }
    });
    /* Figure out next track ID */
    const maybeNextGroupId = selectNextGroup(1);
    const previousOrNext = maybeNextGroupId !== null
      ? maybeNextGroupId
      : selectNextGroup(-1);
    handleEscapeMode({ applyTrackRestore: false });
    handleGroupEdit(previousOrNext);
  }

  /**
   * Point-click segmentation. Each prediction is written to the selected
   * detection as a preview; the keyframe from before the first prediction on
   * each frame is kept so Reset/Escape can restore it.
   */
  function segmentationTrack() {
    return segmentationTarget
      ? cameraStore.getPossibleTrack(segmentationTarget.trackId, segmentationTarget.camera)
      : undefined;
  }

  /** Write an unconfirmed result onto the track as its preview. */
  function previewSegmentation(track: Track, result: SegmentationPredictionResult) {
    if (result.outputMode === 'mask' && result.mask) {
      // Mask results are previewed as the mask itself (rendered from
      // `segmentationPreviewMasks` at preview opacity), not as a traced
      // polygon outline; the binary mask is only stored on confirm, so
      // cancelling needs no cleanup beyond restoring the snapshot.
      applySegmentationMaskPreview(track, result.frameNum, result.bounds);
    } else {
      applySegmentation(track, result.frameNum, result.polygons, result.bounds);
    }
  }

  function handleSegmentationPoints(state: SegmentationPointsState) {
    segmentationPoints.value = state;
  }

  function handleSegmentationPrediction(result: SegmentationPredictionResult) {
    if (selectedTrackId.value === null) return;
    const track = cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value);
    if (!track) return;
    if (segmentationTarget?.trackId !== track.id || segmentationTarget.camera !== selectedCamera.value) {
      // Put the previous target back before dropping its snapshots, or its
      // unconfirmed preview would become permanent.
      if (segmentationSnapshots.size) restoreSegmentation();
      segmentationTarget = { trackId: track.id, camera: selectedCamera.value };
    }
    if (!segmentationSnapshots.has(result.frameNum)) {
      segmentationSnapshots.set(result.frameNum, snapshotFeature(track, result.frameNum));
    }
    segmentationPredictions.set(result.frameNum, result);
    previewSegmentation(track, result);
    syncSegmentationPreviewMasks();
    _nudgeEditingCanary();
  }

  function isMaskResult(result: SegmentationPredictionResult) {
    return result.outputMode === 'mask' && !!result.mask && !!createSegmentationMask;
  }

  /**
   * Write a confirmed result onto the track: a mask (flagged `hasMask`, no
   * polygons) in mask mode, otherwise its polygons.
   */
  function applyConfirmedSegmentation(track: Track, result: SegmentationPredictionResult) {
    if (isMaskResult(result)) {
      applySegmentationMask(track, result.frameNum, result.bounds);
      if (!annotationModes.visible.includes('Mask')) {
        annotationModes.visible = [...annotationModes.visible, 'Mask'];
      }
    } else {
      applySegmentation(track, result.frameNum, result.polygons, result.bounds);
    }
  }

  /**
   * Store confirmed binary masks through the platform hook, if any.
   *
   * Resolves with the mask results that could not be persisted (and reports
   * the first failure). Callers must await this before flagging `hasMask`:
   * flagging first and persisting fire-and-forget left the track pointing at
   * a mask that does not exist whenever the upload failed (or the tab closed
   * mid-upload and a manual Save landed first), so every reload warned
   * "Missing RLE mask". `createSegmentationMask` (see
   * `useMasks.createMaskFromBinary`) registers the mask locally before its
   * upload, so by the time this resolves the render that `hasMask` triggers
   * already finds the mask data.
   */
  async function persistSegmentationMasks(
    trackId: AnnotationId,
    frames: SegmentationPredictionResult[],
  ): Promise<Set<SegmentationPredictionResult>> {
    const failed = new Set<SegmentationPredictionResult>();
    const masks = frames.filter(isMaskResult);
    if (!masks.length || !createSegmentationMask) return failed;
    const create = createSegmentationMask;
    let firstError: unknown;
    await Promise.all(masks.map(async (result) => {
      try {
        await create(trackId, result.frameNum, result.mask as SegmentationMask);
      } catch (error) {
        failed.add(result);
        if (firstError === undefined) firstError = error;
      }
    }));
    if (failed.size) {
      handleSegmentationError(firstError instanceof Error ? firstError.message : 'Could not save the segmentation mask.');
    }
    return failed;
  }

  /**
   * Persist any mask results, then write the confirmed results onto the
   * track. A frame whose mask could not be stored is put back exactly as it
   * was before the session (its snapshot), never flagged `hasMask`; frames
   * that persisted (and plain polygon results) are applied. Returns the
   * results that were applied.
   */
  async function applyConfirmedSegmentationFrames(
    track: Track,
    camera: string,
    frames: SegmentationPredictionResult[],
    snapshots: Map<number, SegmentationSnapshot>,
  ): Promise<SegmentationPredictionResult[]> {
    // Keep showing the masks while they upload (the session preview is gone).
    const persisting: SegmentationPreviewMask[] = frames.filter(isMaskResult).map((result) => ({
      trackId: track.id,
      camera,
      frameNum: result.frameNum,
      mask: result.mask as SegmentationMask,
    }));
    persistingPreviewMasks = [...persistingPreviewMasks, ...persisting];
    syncSegmentationPreviewMasks();
    let failed: Set<SegmentationPredictionResult>;
    try {
      failed = await persistSegmentationMasks(track.id, frames);
    } finally {
      persistingPreviewMasks = persistingPreviewMasks.filter((p) => !persisting.includes(p));
      syncSegmentationPreviewMasks();
    }
    const applied: SegmentationPredictionResult[] = [];
    frames.forEach((result) => {
      // The user may have started segmenting this frame again during the
      // upload. Writing now would erase that preview, so update the new
      // session's snapshot instead and keep previewing on top of it.
      const resegmenting = segmentationTarget?.trackId === track.id
        && segmentationTarget.camera === camera
        && segmentationSnapshots.has(result.frameNum);
      const preview = resegmenting ? segmentationPredictions.get(result.frameNum) : undefined;
      if (failed.has(result)) {
        const snapshot = snapshots.get(result.frameNum);
        if (!snapshot) return;
        if (resegmenting) {
          segmentationSnapshots.set(result.frameNum, snapshot);
        } else {
          restoreFeature(track, result.frameNum, snapshot);
        }
      } else {
        applyConfirmedSegmentation(track, result);
        if (resegmenting) {
          segmentationSnapshots.set(result.frameNum, snapshotFeature(track, result.frameNum));
          if (preview) previewSegmentation(track, preview);
        }
        applied.push(result);
      }
    });
    _nudgeEditingCanary();
    return applied;
  }

  function clearSegmentationSession() {
    segmentationSnapshots.clear();
    segmentationPredictions.clear();
    segmentationTarget = null;
    syncSegmentationPreviewMasks();
  }

  /** Keep the previewed result; nothing left to restore. */
  function acceptSegmentation() {
    const track = segmentationTrack();
    const camera = segmentationTarget?.camera ?? selectedCamera.value;
    const pending = Array.from(segmentationPredictions.values());
    // Capture the snapshots before clearing the session: they are the only
    // way to put a frame back if its mask cannot be persisted.
    const snapshots = new Map(segmentationSnapshots);
    clearSegmentationSession();
    if (!track || !pending.length) return;
    if (!pending.some(isMaskResult)) {
      pending.forEach((result) => applyConfirmedSegmentation(track, result));
      return;
    }
    // Await persistence before flagging `hasMask` (see
    // persistSegmentationMasks), so a Save while an upload is pending or
    // after it failed cannot persist a mask flag with no mask behind it.
    // The masks stay previewed until then, and a failure reports itself.
    applyConfirmedSegmentationFrames(track, camera, pending, snapshots);
  }

  /** Put every frame the session changed back as it was. */
  function restoreSegmentation() {
    const track = segmentationTrack();
    if (track) {
      segmentationSnapshots.forEach((snapshot, frameNum) => restoreFeature(track, frameNum, snapshot));
    }
    segmentationSnapshots.clear();
    segmentationPredictions.clear();
    segmentationTarget = null;
    syncSegmentationPreviewMasks();
    _nudgeEditingCanary();
  }

  /** Leave point placement for a mode that edits normally. */
  function leaveSegmentationMode() {
    if (annotationModes.editing === 'Point') {
      annotationModes.editing = 'rectangle';
    }
  }

  /** Abandon an unconfirmed segmentation, e.g. on selection change. */
  function cancelSegmentation() {
    if (!segmentationRecipe) return;
    const hadSession = segmentationRecipe.active.value || segmentationRecipe.loading.value
      || segmentationSnapshots.size > 0;
    if (segmentationSnapshots.size) restoreSegmentation();
    if (segmentationRecipe.active.value || segmentationRecipe.loading.value) {
      segmentationRecipe.deactivate();
    }
    if (hadSession) leaveSegmentationMode();
  }

  /** Post-confirm bookkeeping for the results that were actually applied. */
  function finishSegmentationConfirmed(track: Track, applied: SegmentationPredictionResult[]) {
    const madeMask = applied.some(isMaskResult);
    const trackId = track.id;
    newTrackSettingsAfterLogic(track);
    if (creating && segmentationRecipe) {
      // Continuous creation (next detection or auto-advanced frame): keep segmenting.
      segmentationRecipe.activate();
    } else if (!madeMask && selectedTrackId.value === trackId && editingTrack.value) {
      // Refine the result like any drawn polygon.
      const polygonRecipe = recipes.find((r): r is PolygonBase => r instanceof PolygonBase);
      if (polygonRecipe) {
        polygonRecipe.activate();
      } else {
        leaveSegmentationMode();
      }
    } else {
      // A mask has no polygon vertices to refine; return to box editing
      // with the Mask layer visible so the result shows.
      leaveSegmentationMode();
    }
  }

  function handleSegmentationConfirmed(frames: SegmentationPredictionResult[]) {
    const track = segmentationTrack()
      ?? (selectedTrackId.value !== null
        ? cameraStore.getPossibleTrack(selectedTrackId.value, selectedCamera.value)
        : undefined);
    const camera = segmentationTarget?.camera ?? selectedCamera.value;
    // Capture the snapshots before clearing the session: they are the only
    // way to put a frame back if its mask cannot be persisted.
    const snapshots = new Map(segmentationSnapshots);
    // Clear the session first (listeners may restart it), then re-apply:
    // polygon results are already previewed, mask results replace the
    // preview mask with a stored mask.
    clearSegmentationSession();
    if (!track) return;
    if (!frames.some(isMaskResult)) {
      frames.forEach((result) => applyConfirmedSegmentation(track, result));
      finishSegmentationConfirmed(track, frames);
      return;
    }
    // Await persistence before flagging `hasMask` (see acceptSegmentation):
    // frames whose mask upload failed are restored from their snapshots
    // instead of being left flagged with no mask stored.
    (async () => {
      const applied = await applyConfirmedSegmentationFrames(track, camera, frames, snapshots);
      if (!applied.length) {
        // Nothing was confirmed: the detection is back as it was, so there
        // is no result to refine or advance from.
        leaveSegmentationMode();
        return;
      }
      finishSegmentationConfirmed(track, applied);
    })();
  }

  function handleSegmentationReset() {
    restoreSegmentation();
  }

  function handleSegmentationCancelled() {
    restoreSegmentation();
    leaveSegmentationMode();
    _nudgeEditingCanary();
  }

  function handleSegmentationError(message: string) {
    prompt({
      title: 'Segmentation Error',
      text: [message],
    });
  }

  function confirmSegmentation() {
    segmentationRecipe?.confirm();
  }

  if (segmentationRecipe) {
    const currentFrame = () => {
      try {
        return aggregateController.value.frame.value;
      } catch {
        // No camera controllers until the media has loaded.
        return undefined;
      }
    };
    watch(currentFrame, (frame) => {
      if (frame !== undefined) segmentationRecipe.handleFrameChange(frame);
    });
  }

  /* Subscribe to recipe activation events */
  recipes.forEach((r) => r.bus.$on('activate', handleSetAnnotationState));
  const segmentationEvents: [string, (...args: any[]) => void][] = [
    ['points-updated', handleSegmentationPoints],
    ['prediction-ready', handleSegmentationPrediction],
    ['prediction-confirmed', handleSegmentationConfirmed],
    ['prediction-reset', handleSegmentationReset],
    ['prediction-cancelled', handleSegmentationCancelled],
    ['prediction-error', handleSegmentationError],
  ];
  segmentationEvents.forEach(([event, fn]) => segmentationRecipe?.bus.$on(event, fn));
  /* Unsubscribe before unmount */
  onBeforeUnmount(() => {
    recipes.forEach((r) => r.bus.$off('activate', handleSetAnnotationState));
    segmentationEvents.forEach(([event, fn]) => segmentationRecipe?.bus.$off(event, fn));
  });

  function addFullFrameTrack(type: string, trackLength = -1) {
    handleEscapeMode({ applyTrackRestore: false });
    const {
      frame, frameSize, flick, length,
    } = aggregateController.value;
    const trackType = type;

    // eslint-disable-next-line no-param-reassign
    const overrideTrackId = cameraStore.getNewTrackId();
    const trackStore = cameraStore.camMap.value.get(selectedCamera.value)?.trackStore;
    if (trackStore) {
      const newTrackId = trackStore.add(
        frame.value,
        trackType,
        selectedTrackId.value || undefined,
        overrideTrackId,
      ).trackId;
      selectTrack(newTrackId, true);
      const newbounds: RectBounds = [0, 0, frameSize.value[0], frameSize.value[1]];
      // We add a frame for the length starting at current value if trackLength != -1
      const start = trackLength === -1 ? 0 : frame.value;
      const computedLength = trackLength === -1 ? length.value : trackLength;
      for (let i = start; i < computedLength; i += 1) {
        handleUpdateRectBounds(i, flick.value, newbounds);
      }
      creating = true;
      selectTrack(null);
      return newTrackId;
    }
    return null;
  }

  async function processAction(
    actionRoot: DIVEAction,
    shortcut = false,
    data?: {frame?: number; selectedTrack?: number},
    user?: string,
    options?: { returnToTrackId?: AnnotationId },
  ) {
    const action = cloneDeep(actionRoot);
    if (action.action.type === 'GoToFrame') {
      if (action.action.track) {
        if (shortcut) { //if Frame/is -1 we use currently selected as basis
          if (action.action.track.startFrame === -1 && data?.frame !== undefined) {
            // eslint-disable-next-line no-param-reassign
            action.action.track.startFrame = data.frame;
          }
        }
        const frame = cameraStore.getFrameFomAction(action.action.track, user);
        if (frame !== -1) {
          aggregateController.value.seek(frame);
        }
      } else if (action.action.frame !== undefined) {
        aggregateController.value.seek(action.action.frame);
      }
    } else if (action.action.type === 'TrackSelection') {
      if (action.action.startTrack === -1) {
        // eslint-disable-next-line no-param-reassign
        action.action.startTrack = selectedTrackId.value || -1;
      }

      const track = cameraStore.getTrackFromAction(action.action, user);
      if (track) {
        selectTrack(track.id, false);
      }
    } else if (action.action.type === 'CreateTrackAction') {
      const createtrackAction = action.action as CreateTrackAction;
      let trackType = trackSettings.value.newTrackSettings.type;
      if (createtrackAction.editableType) {
        const title = createtrackAction.editableTitle || 'Track Type';
        const text = createtrackAction.editableText || 'Enter the Track Type:';
        const typeList = createtrackAction.editableTypeList;
        const result = await inputValue({
          title,
          text,
          positiveButton: 'OK',
          valueType: 'text',
          valueList: typeList,
          lockedValueList: !!typeList?.length,
          allowNullValueList: false,
          confirm: true,
        });
        trackType = result as string || trackSettings.value.newTrackSettings.type;
      } else if (createtrackAction.trackType) {
        trackType = createtrackAction.trackType;
      }

      const currentlySelectedTrackId = selectedTrackId.value;
      const afterSelection = normalizeCreateTrackAfterSelection(createtrackAction.selectTrackAfter);
      handleEscapeMode({ applyTrackRestore: false });
      if (options?.returnToTrackId != null) {
        setPendingTrackRestore(options.returnToTrackId);
      } else if (afterSelection === 'previousTrack' && currentlySelectedTrackId !== null) {
        afterCreateTrackAction = { mode: 'previousTrack', trackId: currentlySelectedTrackId };
      } else if (afterSelection === 'none') {
        afterCreateTrackAction = { mode: 'none' };
      }

      const { frame } = aggregateController.value;

      const overrideTrackId = cameraStore.getNewTrackId();
      const trackStore = cameraStore.camMap.value.get(selectedCamera.value)?.trackStore;
      if (trackStore) {
        annotationModes.editing = createtrackAction.geometryType || 'rectangle';
        const newTrackId = trackStore.add(
          frame.value,
          trackType,
          selectedTrackId.value || undefined,
          overrideTrackId,
        ).trackId;
        selectTrack(newTrackId, true);
        creating = true;
      }
    } else if (action.action.type === 'CreateFullFrameTrackAction') {
      const createFullFrameTrackAction = action.action as CreateFullFrameTrackAction;
      const {
        trackType, geometryType, useExisting, selectTrackAfter,
      } = createFullFrameTrackAction;
      if (options?.returnToTrackId != null) {
        setPendingTrackRestore(options.returnToTrackId);
      }
      const trackStore = cameraStore.camMap.value.get(selectedCamera.value)?.trackStore;
      if (trackStore) {
        const trackVals = Array.from(trackStore?.annotationMap.values());
        const found = trackVals.find((track) => (track.getType()[0] === trackType));
        if (found && useExisting) {
        // Track exists we don't need to create it
          if (selectTrackAfter) {
            selectTrack(found.id, false);
          }
          return;
        }
        const newTrackId = addFullFrameTrack(trackType, -1);
        selectTrack(newTrackId, true);
        if (geometryType !== 'rectangle') {
          selectTrack(newTrackId, true);
          if (newTrackId !== null) {
            const found = trackStore.getPossible(newTrackId);
            if (found) {
              found.meta = { time: true };
            }
          }
          handleSetAnnotationState({ editing: 'Time' });
          selectTrack(newTrackId, false);
        }
        if (!selectTrackAfter) {
          handleEscapeMode();
        }
      }
    } else if (action.action.type === 'Metadata') {
      const diveMetadataAction = action.action as DIVEMetadataAction;
      if (diveMetadataAction.actionType === 'set' && diveMetadataAction.key && diveMetadataRootId.value && datasetId.value) {
        try {
          await setDiveDatasetMetadataKey(
            datasetId.value,
            diveMetadataRootId.value,
            diveMetadataAction.key,
            diveMetadataAction.value || '',
          );
        } catch (error: any) {
          prompt({
            title: 'Metadata Error',
            text: `Failed to set metadata key: ${diveMetadataAction.key}. Error: ${error?.response?.data?.message || error}`,
            positiveButton: 'OK',
          });
        }
      } else if (diveMetadataAction.actionType === 'remove' && diveMetadataAction.key && diveMetadataRootId.value && datasetId.value) {
        try {
          await deleteDiveDatasetMetadataKey(
            datasetId.value,
            diveMetadataRootId.value,
            diveMetadataAction.key,
          );
        } catch (error: any) {
          prompt({
            title: 'Metadata Error',
            text: `Failed to set metadata key: ${diveMetadataAction.key}. Error: ${error?.response?.data?.message || error}`,
            positiveButton: 'OK',
          });
        }
      } else if (diveMetadataAction.actionType === 'dialog' && diveMetadataAction.key && diveMetadataRootId.value && datasetId.value) {
        const promptTypeMap: Record<string, 'text' | 'number' | 'boolean'> = { string: 'text', number: 'number', boolean: 'boolean' };
        const result = await inputValue({
          title: 'Metadata Value',
          text: `Enter value for key: ${diveMetadataAction.key}`,
          positiveButton: 'OK',
          valueType: promptTypeMap[diveMetadataAction.dataType],
        });
        if (result !== null) {
          const value = result;
          try {
            await setDiveDatasetMetadataKey(
              datasetId.value,
              diveMetadataRootId.value,
              diveMetadataAction.key,
              value,

            );
          } catch (error: any) {
            prompt({
              title: 'Metadata Error',
              text: `Failed to set metadata key: ${diveMetadataAction.key}. Error: ${error?.response?.data?.message || error}`,
              positiveButton: 'OK',
            });
          }
        }
      }
    }
  }

  function seekFrame(frame: number) {
    aggregateController.value.seek(frame);
  }

  function toggleKeyFrame(track?: number) {
    const selectedTrack = selectedTrackId.value !== null ? selectedTrackId.value : track;
    if (selectedTrack !== null && selectedTrack !== undefined) {
      const track = cameraStore.getPossibleTrack(selectedTrack, selectedCamera.value);
      if (track) {
        const {
          frame,
        } = aggregateController.value;
        track.toggleKeyframe(frame.value);
      }
    }
  }

  function setDiveMetadataRootId(id: string | null) {
    diveMetadataRootId.value = id;
  }

  function getDiveMetadataRootId() {
    return diveMetadataRootId.value;
  }

  async function setMetadataKeyValue(datasetId: string, key: string, value: string) {
    if (diveMetadataRootId.value === null) {
      console.error('Dive metadata root ID is not set');
    }

    return setDiveDatasetMetadataKey(datasetId, key, value);
  }

  return {
    selectedTrackId,
    editingGroupId,
    editingMode,
    editingTrack,
    editingDetails,
    linkingTrack,
    linkingState,
    linkingCamera,
    multiSelectList,
    multiSelectActive,
    visibleModes,
    selectedFeatureHandle,
    selectedKey,
    selectedCamera,
    diveMetadataRootId,
    selectNextTrack,
    setDeleteLocalMasks,
    setSegmentationMaskCreator,
    segmentationPoints,
    segmentationPreviewMasks,
    confirmSegmentation,
    cancelSegmentation,
    handler: {
      commitMerge: handleCommitMerge,
      groupAdd: handleAddGroup,
      groupEdit: handleGroupEdit,
      toggleMerge: handleToggleMerge,
      trackAdd: handleAddTrackOrDetection,
      trackAbort: handleEscapeMode,
      trackEdit: handleTrackEdit,
      setPendingTrackRestore,
      trackSeek: handleTrackClick,
      trackSelect: handleSelectTrack,
      trackSelectNext: handleSelectNext,
      updateRectBounds: handleUpdateRectBounds,
      updateGeoJSON: handleUpdateGeoJSON,
      removeTrack: handleRemoveTrack,
      removePoint: handleRemovePoint,
      removeAnnotation: handleRemoveAnnotation,
      removeGroup: handleRemoveGroup,
      selectFeatureHandle: handleSelectFeatureHandle,
      setAnnotationState: handleSetAnnotationState,
      unstageFromMerge: handleUnstageFromMerge,
      startLinking: handleStartLinking,
      stopLinking: handleStopLinking,
      processAction,
      addFullFrameTrack,
      seekFrame,
      toggleKeyFrame,
      setMetadataKeyValue,
      setDiveMetadataRootId,
      getDiveMetadataRootId,
    },
  };
}
