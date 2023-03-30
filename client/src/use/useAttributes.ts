
import {
  ref, Ref, computed, set as VueSet, del as VueDel,
} from '@vue/composition-api';
import { cloneDeep } from 'lodash';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import { StyleManager, Track } from '..';
import CameraStore from '../CameraStore';
import { LineChartData } from './useLineChart';

export interface TimelineGraphSettings {
  type: LineChartData['type'];
  area: boolean;
  areaOpacity: number;
  areaColor: string;
  lineOpacity: number;
  max: boolean;
}

export interface TimelineGraph {
  name: string;
  filter: AttributeKeyFilter;
  enabled: boolean;
  default?: boolean;
  settings?: Record<string, TimelineGraphSettings>;
}

export interface NumericAttributeEditorOptions {
  type: 'combo'| 'slider';
  range?: number[];
  steps?: number;
}
export interface StringAttributeEditorOptions {
  type: 'locked'| 'freeform';
}

export interface AttributeShortcut {
  key: string;
  type: 'set' | 'dialog' | 'remove';
  modifiers?: string[];
  value: number | boolean | string;
  description?: string;
}

export interface Attribute {
  belongs: 'track' | 'detection';
  datatype: 'text' | 'number' | 'boolean';
  values?: string[];
  name: string;
  key: string;
  color?: string;
  user?: boolean;
  editor?: NumericAttributeEditorOptions | StringAttributeEditorOptions;
  shortcuts?: AttributeShortcut[];
}

export type Attributes = Record<string, Attribute>;
type ValueOf<T> = T[keyof T];

export interface AttributeNumberFilter {
  type: 'range' | 'top'; // range filters for number values, top will show highest X values
  comp: '>' | '<' | '>=' | '<=';
  value: number; //current value
  active: boolean; // if this filter is active
  // Settings for Number Fitler
  range: [number, number]; // Pairs of number indicating start/stop ranges
  appliedTo: string[];
}

export type TimeLineFilter =
  AttributeKeyFilter & { settings? : Record<string, TimelineGraphSettings> };

export interface AttributeStringFilter {
  comp: '=' | '!=' | 'contains' | 'starts';
  value: string[]; //Compares with array of items
  appliedTo: string[];
  active: boolean; // if this filter is active
}

export interface AttributeKeyFilter {
  appliedTo: string[];
  active: boolean; // if this filter is active
  value: boolean;
  type: 'key';
}
export interface AttributeBoolFilter {
  value: boolean;
  type: 'is' | 'not';
  appliedTo: string[];
  active: boolean; // if this filter is active
}
export interface AttributeFilter {
  dataType: Attribute['datatype'] | 'key';
  belongsTo: 'track' | 'detection';
  filterData:
  AttributeNumberFilter
  | AttributeStringFilter
  | AttributeBoolFilter
  | AttributeKeyFilter;
}

export interface TimelineAttribute {
  data: LineChartData;
  minFrame: number;
  maxFrame: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
  type: Attribute['datatype'];
}
/**
 * Modified markChangesPending for attributes specifically
 */
interface UseAttributesParams {
  markChangesPending: (
    {
      action,
      attribute,
    }: {
      action: 'upsert' | 'delete';
      attribute?: Attribute;
      timeline?: TimelineGraph;
      filter?: AttributeFilter;
    }
  ) => void;
  selectedTrackId: Ref<number | null>;
  trackStyleManager: StyleManager;
  cameraStore: CameraStore;
  pendingSaveCount: Ref<number>;
}

export default function UseAttributes(
  {
    markChangesPending,
    trackStyleManager,
    selectedTrackId,
    cameraStore,
    pendingSaveCount,
  }: UseAttributesParams,
) {
  const attributes: Ref<Record<string, Attribute>> = ref({});
  const attributeFilters: Ref<AttributeFilter[]> = ref([]);
  const timelineGraphs: Ref<Record<string, TimelineGraph>> = ref({});

  function loadAttributes(metadataAttributes: Record<string, Attribute>) {
    attributes.value = metadataAttributes;
    Object.values(attributes.value).forEach((attribute) => {
      if (attribute.color === undefined) {
        // eslint-disable-next-line no-param-reassign
        attribute.color = trackStyleManager.typeStyling.value.color(attribute.name);
      }
    });
  }

  function loadTimelines(timelines: Record<string, TimelineGraph>) {
    Object.entries(timelines).forEach(([key, item]) => {
      timelineGraphs.value[key] = item;
    });
  }

  function loadFilters(filters: Record<string, AttributeFilter>) {
    Object.entries(filters).forEach(([, item]) => {
      attributeFilters.value.push(item);
    });
  }

  const attributesList = computed(() => Object.values(attributes.value));

  function setAttribute({ data, oldAttribute }:
     {data: Attribute; oldAttribute?: Attribute }, updateAllTracks = false) {
    if (oldAttribute && data.key !== oldAttribute.key) {
      // Name change should delete the old attribute and create a new one with the updated id
      VueDel(attributes.value, oldAttribute.key);
      markChangesPending({ action: 'delete', attribute: oldAttribute });
      // Create a new attribute to replace it
    }
    if (oldAttribute === undefined && data.color === undefined) {
      // eslint-disable-next-line no-param-reassign
      data.color = trackStyleManager.typeStyling.value.color(data.name);
    }
    if (updateAllTracks && oldAttribute) {
      // TODO: Lengthy track/detection attribute updating function
    }
    VueSet(attributes.value, data.key, data);
    markChangesPending({ action: 'upsert', attribute: attributes.value[data.key] });
  }


  function deleteAttribute({ data }: {data: Attribute}, removeFromTracks = false) {
    if (attributes.value[data.key] !== undefined) {
      markChangesPending({ action: 'delete', attribute: attributes.value[data.key] });
      VueDel(attributes.value, data.key);
    }
    if (removeFromTracks) {
      // TODO: Lengthty track/detection attribute deletion function
    }
  }

  function addAttributeFilter(index: number, type: Attribute['belongs'], filter: AttributeFilter) {
    const filterList = attributeFilters.value;
    filterList.push(filter);
    attributeFilters.value = filterList;
    markChangesPending({
      action: 'upsert', filter,
    });
  }

  function deleteAttributeFilter(index: number, type: Attribute['belongs']) {
    const filterList = attributeFilters.value;

    if (index < filterList.length) {
      markChangesPending({
        action: 'delete', filter: filterList[index],
      });
      filterList.splice(index, 1);
    } else {
      throw Error(`Index: ${index} is out of range for the ${type} filter list of length ${filterList.length}`);
    }
  }
  function modifyAttributeFilter(index: number, type: Attribute['belongs'], filter: AttributeFilter) {
    const filterList = attributeFilters.value;
    if (index < filterList.length) {
      filterList[index] = filter;
      markChangesPending({
        action: 'delete', filter: filterList[index],
      });
      attributeFilters.value = filterList;
      markChangesPending({
        action: 'upsert', filter,
      });
    } else {
      throw Error(`Index: ${index} is out of range for the ${type} filter list of length ${filterList.length}`);
    }
  }

  function sortAttributes(attributeList: Attribute[], mode: Attribute['belongs'], attribVals: StringKeyObject, sortingMode: number) {
    const filteredAttributes = Object.values(attributeList).filter(
      (attribute: Attribute) => attribute.belongs === mode,
    );
    return filteredAttributes.sort((a, b) => {
      if (sortingMode === 0) {
        return (a.key.toLowerCase().localeCompare(b.key.toLowerCase()));
      }
      const aVal = attribVals[a.name];
      const bVal = attribVals[b.name];
      if (aVal === undefined && bVal === undefined) {
        return 0;
      } if (aVal === undefined && bVal !== undefined) {
        return 1;
      } if (aVal !== undefined && bVal === undefined) {
        return -1;
      }
      if (a.datatype === 'number' && b.datatype === 'number') {
        return (bVal as number) - (aVal as number);
      } if (a.datatype === 'number' && b.datatype !== 'number') {
        return -1;
      }
      if (a.datatype !== 'number' && b.datatype === 'number') {
        return 1;
      }
      return (a.key.toLowerCase().localeCompare(b.key.toLowerCase()));
    });
  }

  function applyStringFilter(
    filter: AttributeStringFilter,
    item: Attribute,
    val: string,
  ) {
    if (filter.comp === '=') {
      return filter.value.includes(val);
    } if (filter.comp === '!=') {
      return !filter.value.includes(val);
    } if (filter.comp === 'contains') {
      return filter.value.reduce((prev, str) => prev || str.includes(val), false);
    } if (filter.comp === 'starts') {
      return filter.value.reduce((prev, str) => prev || str.startsWith(val), false);
    }
    return true;
  }
  function applyNumberFilter(
    filter: AttributeNumberFilter,
    item: Attribute,
    val: number,
    index: number,
  ) {
    if (filter.type === 'range') {
      if (filter.comp === '>') {
        return (val > filter.value);
      } if (filter.comp === '<') {
        return (val < filter.value);
      } if (filter.comp === '<=') {
        return (val <= filter.value);
      } if (filter.comp === '>=') {
        return (val >= filter.value);
      }
      return true;
    }
    if (filter.type === 'top') {
      return index < filter.value;
    }
    return true;
  }

  function applyKeyFilter(filter: AttributeKeyFilter,
    item: Attribute) {
    if (filter.appliedTo.includes(item.name) || filter.appliedTo.includes('all')) {
      return true;
    }
    return false;
  }

  function filterAttributes(attributeList: Attribute[], mode: Attribute['belongs'], attribVals: StringKeyObject, filters: AttributeFilter[]) {
    let sortedFilteredAttributes = attributeList;
    filters.forEach((filter) => {
      if (filter.filterData.active) {
        sortedFilteredAttributes = sortedFilteredAttributes.filter((item, index) => {
          // Filter on appliedTo list of attributes or 'all'
          if (filter.dataType !== 'key' && (filter.filterData.appliedTo.includes(item.name) || filter.filterData.appliedTo[0] === 'all')) {
            if (filter.dataType === 'number' && item.datatype === 'number') {
              const numberFilter = filter.filterData as AttributeNumberFilter;
              return applyNumberFilter(numberFilter, item, attribVals[item.name] as number, index);
            }
            if (filter.dataType === 'text' && item.datatype === 'text') {
              const stringFilter = filter.filterData as AttributeStringFilter;
              return applyStringFilter(stringFilter, item, attribVals[item.name] as string);
            }
            return true;
          } if (filter.dataType === 'key') {
            const keyFilter = filter.filterData as AttributeKeyFilter;
            return applyKeyFilter(keyFilter, item);
          }
          return true;
        });
      }
      return sortedFilteredAttributes;
    });
    return sortedFilteredAttributes;
  }

  /**
   * Used for display purposes of the Attributes in the sideBar. If you are rendering
   * Attributes for track  and want the filters applied it may be better to filter
   * only on existing values in AttribVals instead of the entire object This takes
   * the Attributes built in Sorts them by Name or Numeric value and then filters them
   * based on the filters that have are active.
   * @param attributeList list of tempalated attributes
   * @param mode - detection or tack
   * @param attribVals - the attribute values for the track/detection
   * @param sortingMode - 0 = alphabetical, 1 = numeric
   * @param filters - list of filters to applie
   * @returns - sorted list of attributes
   */
  function sortAndFilterAttributes(attributeList: Attribute[], mode: Attribute['belongs'], attribVals: StringKeyObject, sortingMode: number, filters: AttributeFilter[]) {
    const sortedAttributes = sortAttributes(attributeList, mode, attribVals, sortingMode);
    const filteredAttributes = filterAttributes(sortedAttributes, mode, attribVals, filters);
    return filteredAttributes;
  }

  function generateDetectionTimelineData(
    track: Track,
    filter: TimeLineFilter,
    settings?: Record<string, TimelineGraphSettings>,
  ) {
    // So we need to generate a list of all of the attributres for the length of the track
    const valueMap: Record<string, TimelineAttribute> = { };
    track.features.forEach((feature) => {
      const { frame } = feature;
      if (feature.attributes) {
        Object.keys(feature.attributes).forEach((key) => {
          if (feature.attributes && (filter.appliedTo.includes(key) || filter.appliedTo.includes('all'))) {
            const val = feature.attributes[key] as string | number | boolean | undefined;
            if (val === undefined) {
              return;
            }
            if (valueMap[key] === undefined) {
              let dataType: Attribute['datatype'] = 'text';
              const data: LineChartData = {
                values: [],
                name: key,
                color: attributes.value[`detection_${key}`]?.color || 'white',
              };
              if (settings && settings[key]) {
                data.area = settings[key].area;
                data.areaColor = settings[key].areaColor;
                data.areaOpacity = settings[key].areaOpacity;
                data.lineOpacity = settings[key].lineOpacity;
                data.type = settings[key].type;
                data.max = settings[key].max;
              }

              if (typeof (val) === 'number') {
                dataType = 'number';
              } else if (typeof (val) === 'boolean') {
                dataType = 'boolean';
              }

              valueMap[key] = {
                data,
                maxFrame: -Infinity,
                minFrame: Infinity,
                type: dataType,

              };
            }
            if (valueMap[key].type === 'number') {
              valueMap[key].data.values.push([
                frame,
              val as number,
              ]);
            }
            if (valueMap[key].type === 'number') {
              if (valueMap[key].minValue === undefined || valueMap[key].maxValue === undefined) {
                valueMap[key].minValue = Infinity;
                valueMap[key].maxValue = -Infinity;
              }
              valueMap[key].minValue = Math.min(valueMap[key].minValue as number, val as number);
              valueMap[key].maxValue = Math.max(valueMap[key].maxValue as number, val as number);
            }
            valueMap[key].minFrame = Math.min(valueMap[key].minFrame, frame);
            valueMap[key].maxFrame = Math.max(valueMap[key].maxFrame, frame);
          }
        });
      }
    });
    return { valueMap, begin: track.begin, end: track.end };
  }

  const attributeTimelineData = computed(() => {
    const results: Record<string, { data: TimelineAttribute[]; begin: number; end: number}> = {};
    const val = pendingSaveCount.value; // depends on pending save count so it updates in real time
    if (val !== undefined && selectedTrackId.value !== null) {
      const vals = Object.entries(timelineGraphs.value);
      vals.forEach(([key, graph]) => {
        if (graph.enabled) {
          if (val !== undefined && selectedTrackId.value !== null) {
            const selectedTrack = cameraStore.getAnyPossibleTrack(selectedTrackId.value);
            if (selectedTrack) {
              const timelineData = generateDetectionTimelineData(
                selectedTrack, graph.filter, graph.settings,
              );
              // Need to convert any Number types to Line Chart data;
              const numberVals = Object.values(timelineData.valueMap).filter((item) => item.type === 'number');
              results[key] = {
                data: numberVals,
                begin: timelineData.begin,
                end: timelineData.end,
              };
            }
          }
        }
      });
      return results;
    }
    return {};
  });

  function setTimelineEnabled(name: string, val: boolean) {
    if (timelineGraphs.value[name]) {
      timelineGraphs.value[name].enabled = val;
      markChangesPending({
        action: 'upsert',
        timeline: timelineGraphs.value[name],
      });
    }
  }

  function setTimelineGraph(name: string, val: TimelineGraph) {
    VueSet(timelineGraphs.value, name, val);
    markChangesPending({
      action: 'upsert',
      timeline: timelineGraphs.value[name],
    });
  }

  function removeTimelineFilter(name: string) {
    if (timelineGraphs.value[name]) {
      const copy = cloneDeep(timelineGraphs.value[name]);
      VueDel(timelineGraphs.value, name);
      markChangesPending({
        action: 'delete',
        timeline: copy,
      });
    }
  }

  function setTimelineDefault(name: string) {
    if (timelineGraphs.value[name]) {
      timelineGraphs.value[name].default = true;
      VueSet(timelineGraphs.value, name, timelineGraphs.value[name]);
      markChangesPending({
        action: 'upsert',
        timeline: timelineGraphs.value[name],
      });
    }
    // Unset other default Timelines
    Object.entries(timelineGraphs.value).forEach(([disableName, graph]) => {
      if (disableName !== name) {
        markChangesPending({
          action: 'upsert',
          timeline: graph,
        });
      }
    });
  }


  const timelineEnabled = computed(() => {
    const filters: Record<string, boolean> = {};
    Object.entries(timelineGraphs.value).forEach(([key, graph]) => {
      filters[key] = graph.enabled;
    });
    return filters;
  });

  const timelineDefault = computed(() => {
    const defVal = Object.entries(timelineGraphs.value).find(([_key, item]) => item.default);
    if (defVal) {
      return defVal[0];
    }
    return null;
  });

  return {
    loadAttributes,
    loadTimelines,
    loadFilters,
    attributesList,
    setAttribute,
    deleteAttribute,
    addAttributeFilter,
    deleteAttributeFilter,
    modifyAttributeFilter,
    attributeFilters,
    sortAndFilterAttributes,
    setTimelineEnabled,
    setTimelineGraph,
    setTimelineDefault,
    removeTimelineFilter,
    attributeTimelineData,
    timelineGraphs,
    timelineEnabled,
    timelineDefault,
  };
}
