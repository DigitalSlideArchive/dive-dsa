/* eslint-disable max-len */
import { Ref, computed, ref } from 'vue';
import BaseAnnotation, { AnnotationId, StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import { AnnotationWithContext } from 'vue-media-annotator/BaseFilterControls';
import { TypeStyling } from 'vue-media-annotator/StyleManager';
import { intersection } from 'lodash';
import { AttributeMatch, AttributeSelectAction } from '../../dive-common/use/useActions';
import { Track } from '..';
import { EventChartData } from './useEventChart';

export interface FilterTimeline{
    name: string;
    enabled: boolean;
    typeFilter?: string[];
    frameRange?: number[];
    confidenceFilter?: number;
    attributes?: AttributeSelectAction;
    type: 'swimlane' | 'detection';
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface TimelineFilterParams<T extends BaseAnnotation> {
    enabledTracks: Readonly<Ref<AnnotationWithContext<Track>[]>>;
    selectedTrackIds: Ref<AnnotationId[]>;
    typeStyling: Ref<TypeStyling>;
    checkAttributes: (attributeMatch: Record<string, AttributeMatch>, attributes: StringKeyObject) => boolean;
}

function filterFromTimeline(trackList: AnnotationWithContext<Track>[], filter: FilterTimeline, checkAttributes: TimelineFilterParams<BaseAnnotation>['checkAttributes']) {
  const tracksFound: AnnotationWithContext<Track>[] = [];
  const skipRest = false;
  let foundFrame = -1;
  let startFrame: number | undefined; let
    endFrame: number | undefined;
  trackList.forEach((context) => {
    const track = context.annotation;
    if (skipRest) {
      return;
    }
    // Find a track which matches the specifications
    const vals: boolean[] = [];
    if (filter.frameRange) {
      [startFrame, endFrame] = filter.frameRange;
      if (startFrame !== undefined && endFrame !== undefined) {
        if (track.begin > startFrame && track.end < endFrame) {
          vals.push(true);
        }
      }
    }
    if (filter.typeFilter !== undefined) {
      const types = track.confidencePairs.map((item) => item[0]);
      vals.push(intersection(types, filter.typeFilter).length > 0);
    }
    if (filter.confidenceFilter !== undefined) {
      const confidenceVals = track.confidencePairs.map((item) => item[1]);
      vals.push(confidenceVals[0] > filter.confidenceFilter);
    }
    //attribute checking
    if (filter.attributes) {
      if (filter.attributes.track) {
        vals.push(checkAttributes(filter.attributes.track, track.attributes));
      }
      //Need a separate check for detection attributes
      if (filter.attributes.detection) {
        for (let i = 0; i < (track as Track).features.length; i += 1) {
          const feature = (track as Track).features[i];
          if (startFrame !== undefined) {
            if (feature.frame >= startFrame) {
              // eslint-disable-next-line no-continue
              continue;
            } else if (feature.frame <= startFrame) {
              // eslint-disable-next-line no-continue
              continue;
            }
          }
          if (feature.attributes) {
            const result = checkAttributes(filter.attributes.detection, feature.attributes);
            if (result) {
              vals.push(result);
              if (startFrame) {
                if (foundFrame < startFrame) {
                  foundFrame = feature.frame;
                }
              } else {
                foundFrame = feature.frame;
                break;
              }
            }
          }
        }
      }
    }
    if (vals.filter((item) => item).length === vals.length) {
      tracksFound.push(context);
    }
  });
  return tracksFound;
}

export default function UseTimelineFilters<T extends BaseAnnotation>(
  {
    enabledTracks, selectedTrackIds, typeStyling, checkAttributes,
  }: TimelineFilterParams<T>,
) {
  const timelines: Ref<FilterTimeline[]> = ref([]);

  const loadFilterTimelines = (data: FilterTimeline[]) => {
    timelines.value = data;
  };

  const enabledTimelines = computed(() => (timelines.value.filter((item) => (item.enabled))));

  // Create a mapping between timeline name and eventChart data for the timeline
  const eventChartDataMap = computed(() => {
    const eventChartMap: Record<string, {muted: boolean; values: EventChartData[]}> = {};
    const mapfunc = typeStyling.value.color;
    const selectedTrackIdsValue = selectedTrackIds.value;
    timelines.value.forEach((timeline) => {
      if (timeline.enabled) {
        // we calculate which tracks meet the criteria
        eventChartMap[timeline.name] = { muted: false, values: [] };
        const filteredTracks = filterFromTimeline(enabledTracks.value, timeline, checkAttributes);
        filteredTracks.forEach((filtered) => {
          // We only want to use Tracks that match the filter specified for the timelines that exist.
          const { annotation: track } = filtered;
          const { confidencePairs } = track;
          let markers: [number, boolean][] = [];
          if ('featureIndex' in track) {
            markers = track.featureIndex.map((i) => (
              [i, track.features[i].interpolate || false]));
          }
          if (confidencePairs.length) {
            const trackType = track.getType(filtered.context.confidencePairIndex)[0];
            eventChartMap[timeline.name].values.push({
              id: track.id,
              name: `Track ${track.id}`,
              type: trackType,
              color: mapfunc(trackType),
              selected: selectedTrackIdsValue.includes(track.id),
              range: [track.begin, track.end],
              markers,
            });
          }
        });
      }
    });
    return eventChartMap;
  });

  return {
    eventChartDataMap, timelines, loadFilterTimelines, enabledTimelines,
  };
}
