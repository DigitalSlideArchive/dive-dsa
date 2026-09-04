import { computed, Ref } from 'vue';
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
} from 'vue-media-annotator/provides';

export interface CustomUITrackListEntry {
  track: Track;
  trackId: AnnotationId;
  trackType: string;
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
  };
}

export default function useCustomUITrackList(settingsRef: Ref<CustomUITrackListSettings | undefined>) {
  const trackFilters = useTrackFilters();
  const handler = useHandler();
  const selectedTrackIdRef = useSelectedTrackId();
  const editingModeRef = useEditingMode();
  const readOnlyMode = useReadOnlyMode();
  const resolvedSettings = computed(() => resolveSettings(settingsRef.value));

  const filteredTracks = computed((): CustomUITrackListEntry[] => {
    const { typeFilter } = resolvedSettings.value;
    if (!typeFilter.length) {
      return [];
    }
    return trackFilters.filteredAnnotations.value
      .filter((item) => trackMatchesTypeFilter(item.annotation, typeFilter))
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

  const editTrack = (trackId: AnnotationId) => {
    handler.trackEdit(trackId);
  };

  const deleteTrack = (trackId: AnnotationId) => {
    handler.removeTrack([trackId]);
  };

  return {
    resolvedSettings,
    filteredTracks,
    readOnlyMode,
    isSelected,
    isEditing,
    selectTrack,
    editTrack,
    deleteTrack,
  };
}
