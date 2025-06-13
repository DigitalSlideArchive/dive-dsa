/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
import { readonly, ref, Ref } from 'vue';

import Track, { TrackId } from 'vue-media-annotator/track';
import {
  Attribute, AttributeFilter, SwimlaneGraph, TimelineGraph,
} from 'vue-media-annotator/use/AttributeTypes';

import { useApi, DatasetMetaMutable, SaveStylingArgs } from 'dive-common/apispec';
import { AnnotationId } from 'vue-media-annotator/BaseAnnotation';
import Group from 'vue-media-annotator/Group';

interface ChangeMap {
  upsert: Map<TrackId, Track>;
  delete: Set<TrackId>;
  attributeUpsert: Map<string, Attribute>;
  attributeDelete: Set<string>;
  groupUpset: Map<AnnotationId, Group>;
  groupDelete: Set<AnnotationId>;
  timelineUpsert: Map<string, TimelineGraph>;
  timelineDelete: Set<string>;
  swimlaneUpsert: Map<string, SwimlaneGraph>;
  swimlaneDelete: Set<string>;
  filterUpsert: Map<string, AttributeFilter>;
  filterDelete: Set<string>;
  meta: number;
}
function _updatePendingChangeMap<K, V>(
  key: K,
  value: V,
  action: 'upsert' | 'delete',
  upsert: Map<K, V>,
  del: Set<K>,
) {
  if (action === 'delete') {
    del.add(key);
    upsert.delete(key);
  } else if (action === 'upsert') {
    del.delete(key);
    upsert.set(key, value);
  }
}

export default function useSave(
  datasetId: Ref<Readonly<string>>,
  readonlyMode: Ref<Readonly<boolean>>,
  updatedConfigurationId?: string,
) {
  const pendingSaveCount = ref(0);
  const configurationId = ref(datasetId.value);
  if (updatedConfigurationId) {
    configurationId.value = updatedConfigurationId;
  }
  const pendingChangeMaps: Record<string, ChangeMap> = {
    singleCam: {
      upsert: new Map<TrackId, Track>(),
      delete: new Set<TrackId>(),
      attributeUpsert: new Map<string, Attribute>(),
      attributeDelete: new Set<string>(),
      groupUpset: new Map<AnnotationId, Group>(),
      groupDelete: new Set<AnnotationId>(),
      timelineUpsert: new Map<string, TimelineGraph>(),
      timelineDelete: new Set<string>(),
      swimlaneUpsert: new Map<string, SwimlaneGraph>(),
      swimlaneDelete: new Set<string>(),
      filterUpsert: new Map<string, AttributeFilter>(),
      filterDelete: new Set<string>(),
      meta: 0,
    },
  };
  const {
    saveDetections, saveMetadata, saveAttributes, saveTimelines, saveFilters, saveSwimlanes, saveStyling,
  } = useApi();

  async function save(
    datasetMeta?: DatasetMetaMutable,
  ) {
    if (readonlyMode.value) {
      throw new Error('attempted to save in read only mode');
    }
    const promiseList: Promise<unknown>[] = [];
    let globalMetadataUpdated = false;
    Object.entries(pendingChangeMaps).forEach(([camera, pendingChangeMap]) => {
      const saveId = camera === 'singleCam' ? datasetId.value : `${datasetId.value}/${camera}`;
      if (
        pendingChangeMap.upsert.size
      || pendingChangeMap.delete.size
      || pendingChangeMap.groupUpset.size
      || pendingChangeMap.groupDelete.size
      ) {
        promiseList.push(saveDetections(saveId, {
          tracks: {
            upsert: Array.from(pendingChangeMap.upsert).map((pair) => pair[1].serialize()),
            delete: Array.from(pendingChangeMap.delete),
          },
          groups: {
            upsert: Array.from(pendingChangeMap.groupUpset).map((pair) => pair[1].serialize()),
            delete: Array.from(pendingChangeMap.groupDelete),
          },
        }).then(() => {
          pendingChangeMap.upsert.clear();
          pendingChangeMap.delete.clear();
        }));
      }
      if (datasetMeta && pendingChangeMap.meta > 0) {
        // Save once for each camera into their own metadata file
        promiseList.push(saveMetadata(saveId, datasetMeta).then(() => {
          // eslint-disable-next-line no-param-reassign
          pendingChangeMap.meta = 0;
        }));
        // Only update global if there are multiple cameras
        if (saveId !== datasetId.value) {
          globalMetadataUpdated = true;
        }
      }
      if (pendingChangeMap.attributeUpsert.size || pendingChangeMap.attributeDelete.size) {
        promiseList.push(saveAttributes(configurationId.value, {
          upsert: Array.from(pendingChangeMap.attributeUpsert).map((pair) => pair[1]),
          delete: Array.from(pendingChangeMap.attributeDelete),
        }).then(() => {
          pendingChangeMap.attributeUpsert.clear();
          pendingChangeMap.attributeDelete.clear();
        }));
      }
      // TODO:  Figure out how to integrate styling changes to the parent configuration ID
      // const stylingData: SaveStylingArgs = {
      //   customGroupStyling: datasetMeta?.customGroupStyling,
      //   customTypeStyling: datasetMeta?.customTypeStyling,
      //   confidenceFilters: datasetMeta?.confidenceFilters,
      // };
      // promiseList.push(saveStyling(configurationId.value, stylingData));
      // if (pendingChangeMap.timelineUpsert.size || pendingChangeMap.timelineDelete.size) {
      //   promiseList.push(saveTimelines(configurationId.value, {
      //     upsert: Array.from(pendingChangeMap.timelineUpsert).map((pair) => pair[1]),
      //     delete: Array.from(pendingChangeMap.timelineDelete),
      //   }).then(() => {
      //     pendingChangeMap.timelineUpsert.clear();
      //     pendingChangeMap.timelineDelete.clear();
      //   }));
      // }
      if (pendingChangeMap.swimlaneUpsert.size || pendingChangeMap.swimlaneDelete.size) {
        promiseList.push(saveSwimlanes(configurationId.value, {
          upsert: Array.from(pendingChangeMap.swimlaneUpsert).map((pair) => pair[1]),
          delete: Array.from(pendingChangeMap.swimlaneDelete),
        }).then(() => {
          pendingChangeMap.swimlaneUpsert.clear();
          pendingChangeMap.swimlaneDelete.clear();
        }));
      }
      if (pendingChangeMap.filterUpsert.size || pendingChangeMap.filterDelete.size) {
        promiseList.push(saveFilters(configurationId.value, {
          upsert: Array.from(pendingChangeMap.filterUpsert).map((pair) => pair[1]),
          delete: Array.from(pendingChangeMap.filterDelete),
        }).then(() => {
          pendingChangeMap.filterUpsert.clear();
          pendingChangeMap.filterDelete.clear();
        }));
      }
    });
    // Final save into the multi-cam metadata if multiple cameras exists
    if (globalMetadataUpdated && datasetMeta && pendingChangeMaps) {
      promiseList.push(saveMetadata(configurationId.value, datasetMeta));
    }
    await Promise.all(promiseList);
    pendingSaveCount.value = 0;
  }

  function markChangesPending(
    {
      action,
      track,
      attribute,
      group,
      timeline,
      swimlane,
      filter,
      cameraName = 'singleCam',
    }: {
      action: 'upsert' | 'delete' | 'meta';
      track?: Track;
      attribute?: Attribute;
      group?: Group;
      timeline?: TimelineGraph;
      swimlane?: SwimlaneGraph;
      filter?: AttributeFilter;
      cameraName?: string;
    } = { action: 'meta' },
  ) {
    // For meta changes we need to indicate to all cameras that there is change.
    // Meta changes are global across all cameras
    if (action === 'meta') {
      Object.values(pendingChangeMaps).forEach((pendingChangeMap) => {
        // eslint-disable-next-line no-param-reassign
        pendingChangeMap.meta += 1;
      });
      pendingSaveCount.value += 1;
    } else if (pendingChangeMaps[cameraName]) {
      const pendingChangeMap = pendingChangeMaps[cameraName];

      if (!readonlyMode.value) {
        if (track !== undefined) {
          _updatePendingChangeMap(
            track.trackId,
            track,
            action,
            pendingChangeMap.upsert,
            pendingChangeMap.delete,
          );
        } else if (attribute !== undefined) {
          _updatePendingChangeMap(
            attribute.key,
            attribute,
            action,
            pendingChangeMap.attributeUpsert,
            pendingChangeMap.attributeDelete,
          );
        } else if (group !== undefined) {
          _updatePendingChangeMap(
            group.id,
            group,
            action,
            pendingChangeMap.groupUpset,
            pendingChangeMap.groupDelete,
          );
        } else if (timeline !== undefined) {
          _updatePendingChangeMap(
            timeline.name,
            timeline,
            action,
            pendingChangeMap.timelineUpsert,
            pendingChangeMap.timelineDelete,
          );
        } else if (swimlane !== undefined) {
          _updatePendingChangeMap(
            swimlane.name,
            swimlane,
            action,
            pendingChangeMap.swimlaneUpsert,
            pendingChangeMap.swimlaneDelete,
          );
        } else if (filter !== undefined) {
          _updatePendingChangeMap(
            `${filter.belongsTo}_${filter.dataType}_${filter.filterData.appliedTo.join('-')}`,
            filter,
            action,
            pendingChangeMap.filterUpsert,
            pendingChangeMap.filterDelete,
          );
        } else {
          throw new Error(`Arguments inconsistent with pending change type: ${action} cannot be performed without additional arguments`);
        }
        pendingSaveCount.value += 1;
      }
    }
  }

  function discardChanges() {
    Object.values(pendingChangeMaps).forEach((pendingChangeMap) => {
      pendingChangeMap.upsert.clear();
      pendingChangeMap.delete.clear();
      pendingChangeMap.attributeUpsert.clear();
      pendingChangeMap.attributeDelete.clear();
      pendingChangeMap.groupUpset.clear();
      pendingChangeMap.groupDelete.clear();
      pendingChangeMap.timelineUpsert.clear();
      pendingChangeMap.timelineDelete.clear();
      pendingChangeMap.filterUpsert.clear();
      pendingChangeMap.filterDelete.clear();
      // eslint-disable-next-line no-param-reassign
      pendingChangeMap.meta = 0;
    });
    pendingSaveCount.value = 0;
  }

  function addCamera(cameraName: string) {
    pendingChangeMaps[cameraName] = {
      upsert: new Map<TrackId, Track>(),
      delete: new Set<TrackId>(),
      attributeUpsert: new Map<string, Attribute>(),
      attributeDelete: new Set<string>(),
      groupUpset: new Map<AnnotationId, Group>(),
      groupDelete: new Set<AnnotationId>(),
      timelineUpsert: new Map<string, TimelineGraph>(),
      timelineDelete: new Set<string>(),
      swimlaneUpsert: new Map<string, SwimlaneGraph>(),
      swimlaneDelete: new Set<string>(),
      filterUpsert: new Map<string, AttributeFilter>(),
      filterDelete: new Set<string>(),
      meta: 0,
    };
  }

  function removeCamera(cameraName: string) {
    if (pendingChangeMaps[cameraName]) {
      delete pendingChangeMaps[cameraName];
    }
  }
  const setConfigurationId = (id: string) => {
    configurationId.value = id;
  };

  return {
    save,
    markChangesPending,
    discardChanges,
    pendingSaveCount: readonly(pendingSaveCount),
    configurationId: readonly(configurationId),
    setConfigurationId,
    addCamera,
    removeCamera,
  };
}
