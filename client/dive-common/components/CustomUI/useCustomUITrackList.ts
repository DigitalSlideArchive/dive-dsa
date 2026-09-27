import {
  computed, Ref, ref, watch,
} from 'vue';
import { intersection } from 'lodash';
import { CustomUITrackListSettings } from 'vue-media-annotator/ConfigurationManager';
import { AnnotationId } from 'vue-media-annotator/BaseAnnotation';
import Track from 'vue-media-annotator/track';
import {
  useHandler,
  useReadOnlyMode,
  useSelectedTrackId,
  useTrackFilters,
  useEditingMode,
  useTime,
} from 'vue-media-annotator/provides';

export interface CustomUITrackListEntry {
  track: Track;
  trackId: AnnotationId;
  trackType: string;
}

function trackMatchesCurrentFrame(track: Track, frame: number): boolean {
  return frame >= track.begin && frame <= track.end;
}

function trackMatchesTypeFilter(track: Track, typeFilter: string[]): boolean {
  if (!typeFilter.length) {
    return false;
  }
  const types = track.confidencePairs.map((item) => item[0]);
  return intersection(types, typeFilter).length > 0;
}

function resolveSettings(settings: CustomUITrackListSettings | undefined) {
  return {
    enabled: settings?.enabled !== false,
    title: settings?.title || 'Tracks',
    defaultExpanded: settings?.defaultExpanded ?? false,
    typeFilter: settings?.typeFilter || [],
    filterCurrentFrame: settings?.filterCurrentFrame ?? false,
    maxHeight: settings?.maxHeight ?? 240,
    actions: {
      select: settings?.actions?.select !== false,
      edit: settings?.actions?.edit !== false,
      delete: settings?.actions?.delete !== false,
    },
    display: {
      showType: settings?.display?.showType !== false,
      showFrameRange: settings?.display?.showFrameRange !== false,
      showTrackId: settings?.display?.showTrackId !== false,
    },
    showEditingStatus: settings?.showEditingStatus !== false,
    editingStatusTitle: settings?.editingStatusTitle || 'Current Mode',
    returnToTrackId: settings?.returnToTrackId,
  };
}

export default function useCustomUITrackList(settingsRef: Ref<CustomUITrackListSettings | undefined>) {
  const trackFilters = useTrackFilters();
  const handler = useHandler();
  const selectedTrackIdRef = useSelectedTrackId();
  const editingModeRef = useEditingMode();
  const readOnlyMode = useReadOnlyMode();
  const { frame: frameRef } = useTime();
  const resolvedSettings = computed(() => resolveSettings(settingsRef.value));
  const filterCurrentFrame = ref(resolvedSettings.value.filterCurrentFrame);

  watch(
    () => resolvedSettings.value.filterCurrentFrame,
    (enabled) => {
      filterCurrentFrame.value = enabled;
    },
  );

  const filteredTracks = computed((): CustomUITrackListEntry[] => {
    const { typeFilter } = resolvedSettings.value;
    if (!typeFilter.length) {
      return [];
    }
    const frame = frameRef.value;
    return trackFilters.filteredAnnotations.value
      .filter((item) => {
        if (!trackMatchesTypeFilter(item.annotation, typeFilter)) {
          return false;
        }
        if (filterCurrentFrame.value) {
          return trackMatchesCurrentFrame(item.annotation, frame);
        }
        return true;
      })
      .map((item) => {
        const confidencePair = item.annotation.getType(item.context.confidencePairIndex);
        return {
          track: item.annotation,
          trackId: item.annotation.id,
          trackType: confidencePair[0],
        };
      });
  });

  const isSelected = (trackId: AnnotationId) => selectedTrackIdRef.value === trackId;

  const isEditing = (trackId: AnnotationId) => (
    isSelected(trackId) && !!editingModeRef.value
  );

  const selectTrack = (trackId: AnnotationId) => {
    handler.trackSeek(trackId);
  };

  const selectReturnToTrackIfConfigured = () => {
    const { returnToTrackId } = resolvedSettings.value;
    if (returnToTrackId != null) {
      selectTrack(returnToTrackId);
      return true;
    }
    return false;
  };

  const onRowClick = (trackId: AnnotationId) => {
    if (!resolvedSettings.value.actions.select) {
      return;
    }
    if (isSelected(trackId)) {
      if (!selectReturnToTrackIfConfigured()) {
        handler.trackSelect(null, false);
      }
      return;
    }
    selectTrack(trackId);
  };

  const editTrack = (trackId: AnnotationId) => {
    const { returnToTrackId } = resolvedSettings.value;
    const options = returnToTrackId != null && returnToTrackId !== trackId
      ? { returnToTrackId }
      : undefined;
    handler.trackEdit(trackId, options);
  };

  const deleteTrack = (trackId: AnnotationId) => {
    const { returnToTrackId } = resolvedSettings.value;
    const options = returnToTrackId != null && returnToTrackId !== trackId
      ? { returnToTrackId }
      : undefined;
    handler.removeTrack([trackId], false, '', options);
  };

  return {
    resolvedSettings,
    filteredTracks,
    filterCurrentFrame,
    readOnlyMode,
    isSelected,
    isEditing,
    selectTrack,
    onRowClick,
    editTrack,
    deleteTrack,
  };
}
