import { ref, Ref, computed } from '@vue/composition-api';
import IntervalTree from '@flatten-js/interval-tree';
import { checkAttributes, TrackSelectAction } from 'dive-common/use/useActions';
import { intersection } from 'lodash';
import type Track from './track';
import type Group from './Group';
import type { AnnotationId, NotifierFuncParams } from './BaseAnnotation';

export type MarkChangesPending = ({
  action,
  track,
  group,
  cameraName,
}: {
  action: 'upsert' | 'delete';
    track?: Track;
    group?: Group;
    cameraName: string;
}) => void;

export interface InsertArgs {
  imported?: boolean;
  afterId?: AnnotationId;
}

function isTrack(value: Track | Group): value is Track {
  return (value as Track).features !== undefined;
}

/**
 * BaseAnnotationStore performs operations on a collection of annotations, such as
 * add and remove.  Operations on individual annotations, such as setting
 * and deleting detections, should be performed directly on the annotation
 * object.  BaseAnnotationStore will observe these changes and react if necessary.
 */
export default abstract class BaseAnnotationStore<T extends Track | Group> {
  markChangesPending: MarkChangesPending;

  /* Non-reactive state
   *
   * AnnotationMap is provided for lookup by computed functions and templates.
   * Note that an annotation class instance must NEVER be returned in its entirety by
   * a computed function.
   */
  annotationMap: Map<AnnotationId, OneOf<T, [Group, Track]>>;

  intervalTree: IntervalTree;

  /* Reactive state
   *
   * annotationIds is a list of ID keys into annotationMap.  Used to watch for add and remove
   * events that change the quantity of annotations
   *
   * canary is updated whenever an annotation being watched changes.  Used to watch for
   * update events on existing annotations.  If your computed function relies on a property
   * of an annotation, it must depend() on the canary.
   */
  annotationIds: Ref<AnnotationId[]>;

  sorted: Ref<OneOf<T, [Group, Track]>[]>;

  cameraName: string;

  private canary: Ref<number>;

  constructor({ markChangesPending, cameraName }:
    { markChangesPending: MarkChangesPending; cameraName: string }) {
    this.markChangesPending = markChangesPending;
    this.cameraName = cameraName;
    this.annotationMap = new Map();
    this.annotationIds = ref([]);
    this.intervalTree = new IntervalTree();
    this.canary = ref(0);
    this.sorted = computed(() => {
      this.depend();
      return this.annotationIds.value
        .map((trackId) => this.get(trackId))
        .sort((a, b) => a.begin - b.begin);
    });
  }

  /**
   * By accessing the canary.value, depend sets up a dependency
   * on the notifier, allowing dependants to re-compute.
   *
   * Using Vue reactivity hooks naturally debounces updates to the canary.
   */
  private depend() {
    return this.canary.value;
  }

  get(annotationId: AnnotationId) {
    const value = this.annotationMap.get(annotationId);
    if (value === undefined) {
      throw new Error(`Annotation ID ${annotationId} not found in annotationMap.`);
    }
    return value;
  }


  /**
   * Some instances require returning the undefined value for checking purposes
   * That requires setting the error value to false
   */
  getPossible(annotationId: AnnotationId) {
    return this.annotationMap.get(annotationId);
  }

  getFromAction(trackAction: TrackSelectAction) {
    const tracksFound: number[] = [];
    let skipRest = false;
    let foundFrame = -1;
    this.annotationMap.forEach((track) => {
      if (skipRest) {
        return;
      }
      // Find a track which matches the specifications
      const vals: boolean[] = [];
      if (trackAction.startTrack !== undefined) {
        vals.push(track.id > trackAction.startTrack);
      }
      if (trackAction.startFrame !== undefined) {
        if (trackAction.direction && trackAction.direction === 'previous') {
          vals.push(track.begin < trackAction.startFrame);
        } else {
          vals.push(track.end > trackAction.startFrame);
        }
      }
      if (trackAction.typeFilter !== undefined) {
        const types = track.confidencePairs.map((item) => item[0]);
        vals.push(intersection(types, trackAction.typeFilter).length > 0);
      }
      if (trackAction.confidenceFilter !== undefined) {
        const confidenceVals = track.confidencePairs.map((item) => item[1]);
        vals.push(confidenceVals[0] > trackAction.confidenceFilter);
      }
      //attribute checking
      if (trackAction.attributes) {
        if (trackAction.attributes.track) {
          vals.push(checkAttributes(trackAction.attributes.track, track.attributes));
        }
        //Need a separate check for detection attributes
        if (trackAction.attributes.detection) {
          for (let i = 0; i < (track as Track).features.length; i += 1) {
            const feature = (track as Track).features[i];
            if (trackAction.startFrame !== undefined) {
              if (trackAction.direction && trackAction.direction === 'previous') {
                if (feature.frame >= trackAction.startFrame) {
                  // eslint-disable-next-line no-continue
                  continue;
                }
              } else if (feature.frame <= trackAction.startFrame) {
                // eslint-disable-next-line no-continue
                continue;
              }
            }
            if (feature.attributes) {
              const result = checkAttributes(trackAction.attributes.detection, feature.attributes);
              if (result) {
                vals.push(result);
                if (trackAction.direction && trackAction.direction === 'previous' && trackAction.startFrame) {
                  if (foundFrame < trackAction.startFrame) {
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
        tracksFound.push(track.id);
      }

      // Skip full track list if we have the necessary values
      // eslint-disable-next-line max-len
      if ((trackAction.Nth === undefined && tracksFound.length) || (trackAction.Nth !== undefined && trackAction.Nth >= 0 && tracksFound.length >= trackAction.Nth)) {
        skipRest = true;
      }
    });
    if (trackAction.Nth !== undefined) {
      if (trackAction.Nth >= 0 && tracksFound.length) {
        return { track: tracksFound[trackAction.Nth], frame: foundFrame };
      } if (trackAction.Nth < 0 && tracksFound.length) {
        return { track: tracksFound[tracksFound.length + trackAction.Nth], frame: foundFrame };
      }
      return { track: -1, frame: -1 };
    }
    if (tracksFound.length) {
      return { track: tracksFound[0], frame: foundFrame };
    }
    return { track: -1, frame: -1 };
  }


  getNewId() {
    if (this.annotationIds.value.length) {
      return this.annotationIds.value.reduce((prev, current) => Math.max(prev, current)) + 1;
    }
    return 0;
  }

  notify(
    { item, event, oldValue }: {
      item: OneOf<T, [Group, Track]>;
      event: string;
      oldValue: unknown;
    },
  ) {
    if (event === 'bounds') {
      const oldInterval = oldValue as [number, number];
      this.intervalTree.remove(oldInterval, item.id.toString());
      this.intervalTree.insert([item.begin, item.end], item.id.toString());
    }
    this.canary.value += 1;
    if (isTrack(item)) {
      this.markChangesPending({ action: 'upsert', track: item, cameraName: this.cameraName });
    } else {
      this.markChangesPending({ action: 'upsert', group: item, cameraName: this.cameraName });
    }
  }

  insert(value: OneOf<T, [Group, Track]>, args?: InsertArgs) {
    value.setNotifier((params: NotifierFuncParams<OneOf<T, [Group, Track]>>) => {
      this.notify(params);
    });
    this.annotationMap.set(value.id, value);
    this.intervalTree.insert([value.begin, value.end], value.id.toString());
    if (args && args.afterId) {
      /* Insert specifically after another annotationId */
      const insertIndex = this.annotationIds.value.indexOf(args.afterId) + 1;
      this.annotationIds.value.splice(insertIndex, 0, value.id);
    } else {
      this.annotationIds.value.push(value.id);
    }
    if (!args?.imported) {
      if (isTrack(value)) {
        this.markChangesPending({ action: 'upsert', track: value, cameraName: this.cameraName });
      } else {
        this.markChangesPending({ action: 'upsert', group: value, cameraName: this.cameraName });
      }
    }
  }

  remove(annotationId: AnnotationId, disableNotifications = false): void {
    const value = this.get(annotationId);
    const range = [value.begin, value.end];
    if (!this.intervalTree.remove(range, annotationId.toString())) {
      throw new Error(`AnnotationId ${annotationId} with range ${range} not found in tree.`);
    }
    value.setNotifier(undefined);
    this.annotationMap.delete(annotationId);
    const listIndex = this.annotationIds.value.findIndex((v) => v === annotationId);
    if (listIndex === -1) {
      throw new Error(`AnnotationId ${annotationId} not found in annotationIds.`);
    }
    this.annotationIds.value.splice(listIndex, 1);
    if (!disableNotifications) {
      if (isTrack(value)) {
        this.markChangesPending({ action: 'delete', track: value, cameraName: this.cameraName });
      } else {
        this.markChangesPending({ action: 'delete', group: value, cameraName: this.cameraName });
      }
    }
  }

  clearAll() {
    this.annotationMap.clear();
    this.intervalTree.items.forEach((item) => {
      this.intervalTree.remove(item.key);
    });
    this.annotationIds.value = [];
  }
}
