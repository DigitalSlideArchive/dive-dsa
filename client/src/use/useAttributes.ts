/* eslint-disable max-len */

import {
  ref, Ref, computed, set as VueSet, del as VueDel,
} from 'vue';
import { cloneDeep } from 'lodash';
import { StringKeyObject } from 'vue-media-annotator/BaseAnnotation';
import * as d3 from 'd3';
import { StyleManager, Track } from '..';
import CameraStore from '../CameraStore';
import { LineChartData } from './useLineChart';
import {
  Attribute, AttributeFilter, AttributeKeyFilter,
  AttributeStringFilter, AttributeNumberFilter,
  TimelineGraph, TimelineAttribute, TimelineGraphSettings, TimeLineFilter, SwimlaneGraph, SwimlaneFilter, SwimlaneGraphSettings, SwimlaneAttribute,
} from './AttributeTypes';

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
      swimlane?: SwimlaneGraph;
      filter?: AttributeFilter;
    }
  ) => void;
  selectedTrackId: Ref<number | null>;
  trackStyleManager: StyleManager;
  cameraStore: CameraStore;
  pendingSaveCount: Ref<number>;
  login: string;
}

export default function UseAttributes(
  {
    markChangesPending,
    trackStyleManager,
    selectedTrackId,
    cameraStore,
    pendingSaveCount,
    login,
  }: UseAttributesParams,
) {
  const attributes: Ref<Record<string, Attribute>> = ref({});
  const attributeFilters: Ref<AttributeFilter[]> = ref([]);
  const timelineGraphs: Ref<Record<string, TimelineGraph & {filtered?: boolean}>> = ref({});
  const swimlaneGraphs: Ref<Record<string, SwimlaneGraph & {filtered?: boolean}>> = ref({});

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
      VueSet(timelineGraphs.value, key, item);
    });
  }
  function loadSwimlanes(timelines: Record<string, SwimlaneGraph>) {
    Object.entries(timelines).forEach(([key, item]) => {
      VueSet(swimlaneGraphs.value, key, item);
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

  function applyKeyFilter(
    filter: AttributeKeyFilter,
    item: Attribute,
  ) {
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
  function sortAndFilterAttributes(attributeList: Attribute[], mode: Attribute['belongs'], attribVals: StringKeyObject, sortingMode: number, filters: AttributeFilter[], highlightedAttribute: Attribute | null = null) {
    const sortedAttributes = sortAttributes(attributeList, mode, attribVals, sortingMode);
    const filteredAttributes = filterAttributes(sortedAttributes, mode, attribVals, filters);
    if (highlightedAttribute) {
      filteredAttributes.sort((a, b) => {
        if (a.key === highlightedAttribute.key && b.key !== highlightedAttribute.key) {
          return -1;
        }
        if (a.key !== highlightedAttribute.key && b.key === highlightedAttribute.key) {
          return 1;
        }
        return 0; // Keeps the original order for other elements
      });
    }
    return filteredAttributes;
  }

  // Processes attribuets and modifies the valueMap with proper data for timeline
  function processDetectionKey(
    key:string,
    valueMap: Record<string, TimelineAttribute>, //modified in place
    filter: TimeLineFilter,
    frame: number,
    attr?: StringKeyObject,
    settings?: Record<string, TimelineGraphSettings>,
  ) {
    if (attr && (filter.appliedTo.includes(key) || filter.appliedTo.includes('all'))) {
      const val = attr[key] as string | number | boolean | undefined;
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

        // eslint-disable-next-line no-param-reassign
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
          // eslint-disable-next-line no-param-reassign
          valueMap[key].minValue = Infinity;
          // eslint-disable-next-line no-param-reassign
          valueMap[key].maxValue = -Infinity;
        }
        // eslint-disable-next-line no-param-reassign
        valueMap[key].minValue = Math.min(valueMap[key].minValue as number, val as number);
        // eslint-disable-next-line no-param-reassign
        valueMap[key].maxValue = Math.max(valueMap[key].maxValue as number, val as number);
      }
      // eslint-disable-next-line no-param-reassign
      valueMap[key].minFrame = Math.min(valueMap[key].minFrame, frame);
      // eslint-disable-next-line no-param-reassign
      valueMap[key].maxFrame = Math.max(valueMap[key].maxFrame, frame);
    }
  }
  // ATTRIBUTE TIMELINE SECTION
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
        if (feature.attributes.userAttributes && feature.attributes.userAttributes[login]) {
          const userAttr = feature.attributes.userAttributes[login] as StringKeyObject;
          Object.keys(userAttr).forEach((key) => {
            const baseAttribute = attributesList.value.find((item) => item.name === key);
            if (baseAttribute?.user && feature.attributes?.userAttributes && feature.attributes.userAttributes[login] && (userAttr[key] !== undefined)) {
              processDetectionKey(key, valueMap, filter, frame, userAttr, settings);
            }
          });
        }
        Object.keys(feature.attributes).forEach((key) => {
          const baseAttribute = attributesList.value.find((item) => item.name === key);
          if (!baseAttribute?.user) {
            processDetectionKey(key, valueMap, filter, frame, feature.attributes, settings);
          }
        });
      }
    });
    return { valueMap, begin: track.begin, end: track.end };
  }

  const attributeTimelineData = computed(() => {
    const results: Record<string, { data: TimelineAttribute[]; begin: number; end: number; yRange?: number[]; ticks?: number}> = {};
    const val = pendingSaveCount.value; // depends on pending save count so it updates in real time
    if (val !== undefined && selectedTrackId.value !== undefined) {
      const vals = Object.entries(timelineGraphs.value);
      vals.forEach(([key, graph]) => {
        if (graph.enabled) {
          if (val !== undefined && selectedTrackId.value !== null) {
            const selectedTrack = cameraStore.getAnyPossibleTrack(selectedTrackId.value);
            if (selectedTrack) {
              if (graph.displaySettings && graph.displaySettings.display === 'selected') {
                if (!graph.displaySettings.trackFilter.includes(selectedTrack.getType()[0]) && !graph.displaySettings.trackFilter.includes('all')) {
                  timelineGraphs.value[key].filtered = true;
                  return;
                }
                timelineGraphs.value[key].filtered = false;
              }
              const timelineData = generateDetectionTimelineData(selectedTrack, graph.filter, graph.settings);
              // Need to convert any Number types to Line Chart data;
              const numberVals = Object.values(timelineData.valueMap).filter((item) => item.type === 'number');
              results[key] = {
                data: numberVals,
                begin: timelineData.begin,
                end: timelineData.end,
                yRange: graph.yRange,
                ticks: graph.ticks,
              };
            }
          } else if (graph.displaySettings && graph.displaySettings.display === 'selected') {
            timelineGraphs.value[key].filtered = true;
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const nudgeVal = attributeTimelineData.value; // reactive to changes in the data
    Object.entries(timelineGraphs.value).forEach(([key, graph]) => {
      filters[key] = graph.enabled && !graph.filtered;
    });
    return filters;
  });

  const timelineDefault = computed(() => {
    const defVal = Object.entries(timelineGraphs.value).find(([, item]) => item.default);
    if (defVal) {
      return defVal[0];
    }
    return null;
  });

  const getAttributeValueColor = (attribute: Attribute, val: string) => {
    if (attribute.datatype === 'text') {
      if (attribute.valueColors && attribute.valueColors[val]) {
        return attribute.valueColors[val];
      }
    }
    return trackStyleManager.typeStyling.value.color(val);
  };

  const numericalColorScaling = computed(() => {
    const autoColorIndex: Record<string, (data: string | number | boolean) => string> = {};
    Object.entries(attributes.value).forEach(([baseKey, item]) => {
      autoColorIndex[baseKey] = ((data: string | number | boolean) => {
        if (item.datatype === 'number' && item.valueColors && Object.keys(item.valueColors).length) {
          const colorArr = Object.entries(item.valueColors as Record<string, string>)
            .map(([key, val]) => ({ key: parseFloat(key), val }));
          colorArr.sort((a, b) => a.key - b.key);

          const colorNums = colorArr.map((map) => map.key);
          const colorVals = colorArr.map((map) => map.val);
          const colorScale = d3.scaleLinear()
            .domain(colorNums)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .range(colorVals as any);
          return colorScale(data as number)?.toString() || item.color || 'white';
        }
        return item.color || trackStyleManager.typeStyling.value.color(data.toString());
      });
    });
    return autoColorIndex;
  });

  // Processes attributes and user attributes and modifies valueMap while returning a value
  function processSwimlaneKey(
    key:string,
    valueMap: Record<string, SwimlaneAttribute>, // updates valueMap in place
    filter: SwimlaneFilter,
    track: Track,
    frame: number,
    attributes?: StringKeyObject,
    baseAttribute?: Attribute,
    settings?: Record<string, SwimlaneGraphSettings>,
    colorScalingNumbers?: Record<string, (data: string | number | boolean) => string>,
    lastValue?: string | boolean | number,
  ): string | boolean | number | undefined | null {
    if (key === 'userAttributes') {
      return null;
    }
    if (attributes && (filter.appliedTo.includes(key) || filter.appliedTo.includes('all'))) {
      // Get user attribute if it exists:
      const val = attributes[key] as string | number | boolean | undefined;
      if (val === undefined) {
        return null;
      }
      if (valueMap[key] === undefined) {
        let dataType: Attribute['datatype'] = 'text';
        let displayName;
        if (settings && settings[key]) {
          displayName = settings[key].displayName;
        }

        if (typeof (val) === 'number') {
          dataType = 'number';
        } else if (typeof (val) === 'boolean') {
          dataType = 'boolean';
        }
        let baseColor = 'white';
        if (baseAttribute?.color) {
          baseColor = baseAttribute.color;
        } else {
          baseColor = trackStyleManager.typeStyling.value.color(key);
        }
        // eslint-disable-next-line no-param-reassign
        valueMap[key] = {
          data: [],
          name: key,
          color: baseColor,
          type: dataType,
          displayName,
          start: track.begin,
          end: track.end,
          order: baseAttribute?.valueOrder,
        };
      }
      // Now we need to push data in based on values and change only when value changes:
      let color = 'white';
      if (baseAttribute?.datatype === 'number' && colorScalingNumbers && colorScalingNumbers[baseAttribute.key]) {
        color = colorScalingNumbers[baseAttribute.key](val);
      }
      if (typeof val === 'string' && baseAttribute && baseAttribute.datatype === 'text') {
        color = getAttributeValueColor(baseAttribute, val);
      } else if (baseAttribute && baseAttribute.datatype === 'boolean') {
        color = val === 'true' ? 'green' : 'red';
      }
      if (valueMap[key].data.length === 0) {
        // First value
        valueMap[key].data.push({
          begin: frame,
          end: frame + 1,
          value: val,
          color,
        });
      } else if (lastValue !== val && valueMap[key].data.length > 0) {
        // eslint-disable-next-line no-param-reassign
        valueMap[key].data[valueMap[key].data.length - 1].end = frame;
        valueMap[key].data.push({
          begin: frame,
          end: frame + 1,
          value: val,
          color,
        });
      }
      return val;
    }
    return null;
  }

  // SWIMLANE Settings
  function generateDetectionSwimlaneData(
    track: Track,
    filter: SwimlaneFilter,
    settings?: Record<string, SwimlaneGraphSettings>,
    colorScalingNumbers?: Record<string, (data: string | number | boolean) => string>,
  ) {
    // So we need to generate a list of all of the attributres for the length of the track
    const valueMap: Record<string, SwimlaneAttribute> = { };
    track.features.forEach((feature) => {
      const { frame } = feature;
      let lastValue: string | boolean | number | undefined;
      if (feature.attributes) {
        if (feature.attributes.userAttributes && feature.attributes.userAttributes[login]) {
          const userAttr = feature.attributes.userAttributes[login] as StringKeyObject;
          Object.keys(userAttr).forEach((key) => {
            const baseAttribute = attributesList.value.find((item) => item.name === key);
            if (!baseAttribute?.user) {
              return;
            }
            if (feature.attributes?.userAttributes && feature.attributes.userAttributes[login] && (userAttr[key] !== undefined)) {
              const val = processSwimlaneKey(key, valueMap, filter, track, frame, userAttr, baseAttribute, settings, colorScalingNumbers, lastValue);
              if (val !== null) {
                lastValue = val;
              }
            }
          });
        }
        Object.keys(feature.attributes).forEach((key) => {
          const baseAttribute = attributesList.value.find((item) => item.name === key);
          if (baseAttribute?.user) {
            return;
          }
          const val = processSwimlaneKey(key, valueMap, filter, track, frame, feature.attributes, baseAttribute, settings, colorScalingNumbers, lastValue);
          if (val !== null) {
            lastValue = val;
          }
        });
      }
    });
    return valueMap;
  }

  const attributeSwimlaneData = computed(() => {
    const results: Record<string, Record<string, SwimlaneAttribute>> = {};
    const val = pendingSaveCount.value; // depends on pending save count so it updates in real time
    if (val !== undefined) {
      const vals = Object.entries(swimlaneGraphs.value);
      vals.forEach(([key, graph]) => {
        if (graph.enabled) {
          if (val !== undefined && selectedTrackId.value !== null) {
            const selectedTrack = cameraStore.getAnyPossibleTrack(selectedTrackId.value);
            if (selectedTrack) {
              if (graph.displaySettings && graph.displaySettings.display === 'selected') {
                if (!graph.displaySettings.trackFilter.includes(selectedTrack.getType()[0]) && !graph.displaySettings.trackFilter.includes('all')) {
                  swimlaneGraphs.value[key].filtered = true;
                  return;
                }
                swimlaneGraphs.value[key].filtered = false;
              }
              const swimlaneData = generateDetectionSwimlaneData(selectedTrack, graph.filter, graph.settings, numericalColorScaling.value);
              results[key] = swimlaneData;
            }
          } else if (graph.displaySettings && graph.displaySettings.display === 'selected') {
            swimlaneGraphs.value[key].filtered = true;
          }
        }
      });
      return results;
    }
    return {};
  });
  function setSwimlaneEnabled(name: string, val: boolean) {
    if (swimlaneGraphs.value[name]) {
      swimlaneGraphs.value[name].enabled = val;
      markChangesPending({
        action: 'upsert',
        swimlane: swimlaneGraphs.value[name],
      });
    }
  }

  function setSwimlaneGraph(name: string, val: SwimlaneGraph) {
    VueSet(swimlaneGraphs.value, name, val);
    markChangesPending({
      action: 'upsert',
      swimlane: swimlaneGraphs.value[name],
    });
  }

  function removeSwimlaneFilter(name: string) {
    if (swimlaneGraphs.value[name]) {
      const copy = cloneDeep(swimlaneGraphs.value[name]);
      VueDel(swimlaneGraphs.value, name);
      markChangesPending({
        action: 'delete',
        swimlane: copy,
      });
    }
  }

  function setSwimlaneDefault(name: string) {
    if (swimlaneGraphs.value[name]) {
      swimlaneGraphs.value[name].default = true;
      VueSet(swimlaneGraphs.value, name, swimlaneGraphs.value[name]);
      markChangesPending({
        action: 'upsert',
        swimlane: swimlaneGraphs.value[name],
      });
    }
    // Unset other default Timelines
    Object.entries(swimlaneGraphs.value).forEach(([disableName, graph]) => {
      if (disableName !== name) {
        markChangesPending({
          action: 'upsert',
          swimlane: graph,
        });
      }
    });
  }

  const swimlaneEnabled = computed(() => {
    const filters: Record<string, boolean> = {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _nudgeVal = attributeSwimlaneData.value; // reactive to changes in the data
    Object.entries(swimlaneGraphs.value).forEach(([key, graph]) => {
      filters[key] = graph.enabled && !graph.filtered;
    });
    return filters;
  });

  const swimlaneDefault = computed(() => {
    const defVal = Object.entries(swimlaneGraphs.value).find(([, item]) => item.default);
    if (defVal) {
      return defVal[0];
    }
    return null;
  });

  const attributeKeyVisible = computed(() => (
    Object.values(attributes.value).findIndex((attr) => attr.colorKey) !== -1
  ));

  return {
    loadAttributes,
    loadTimelines,
    loadSwimlanes,
    loadFilters,
    attributesList,
    setAttribute,
    deleteAttribute,
    addAttributeFilter,
    deleteAttributeFilter,
    modifyAttributeFilter,
    attributeFilters,
    sortAndFilterAttributes,
    // Timeline Settings
    setTimelineEnabled,
    setTimelineGraph,
    setTimelineDefault,
    removeTimelineFilter,
    attributeTimelineData,
    timelineGraphs,
    timelineEnabled,
    timelineDefault,
    // Swimlane Settings
    setSwimlaneEnabled,
    setSwimlaneGraph,
    setSwimlaneDefault,
    removeSwimlaneFilter,
    attributeSwimlaneData,
    swimlaneGraphs,
    swimlaneEnabled,
    swimlaneDefault,
    // Tools
    getAttributeValueColor,
    // Attribute Key Visislbe
    attributeKeyVisible,
  };
}
