import { ref, Ref } from 'vue';
import { DIVEAction, DIVEActionShortcut } from 'dive-common/use/useActions';
import { isArray } from 'lodash';
import type { FilterTimeline } from './use/useTimelineFilters';

export interface DiveConfiguration {
  prevNext?: {
    previous?: { id: string; name: string};
    next?: { id: string; name: string};
  };
  hierarchy?: {name: string; id: string}[];
  metadata: {
    configuration?: Configuration;
  };
  configOwners: {users: {name: string; id: string}[]; groups: {name: string; id: string}[]};
}

interface ConfigurationSettings {
  addTypes?: boolean;
  editTypes?: boolean;
  addTracks?: boolean;
  editTracks?: boolean;
  addTrackAttributes?: boolean;
  editTrackAttributes?: boolean;
  addDetectionAttributes?: boolean;
  editDetectionAttributes?: boolean;

}

interface UITopBar {
    UIData? : boolean;
    UIJobs? : boolean;
    UINextPrev? : boolean;
    UIToolBox? : boolean;
    UISlicerCLI? : boolean;
    UIImport? : boolean;
    UIExport? : boolean;
    UIClone? : boolean;
    UIConfiguration? : boolean;
    UIKeyboardShortcuts? : boolean;
    UISave? : boolean;
}

interface UIToolBar {
    UIEditingInfo? : boolean;
    UIEditingTypes? : boolean[]; // Rectangle, Polygon, Line by default
    UIVisibility? : boolean[]; // Rectnagle, Polygon, Line by default
    UITrackTrails? : boolean;
}

interface UISideBar {
    UITrackTypes? : boolean;
    UIConfidenceThreshold? : boolean;
    UITrackList? : boolean;
    UITrackDetails? : boolean;
    UIAttributeSettings? : boolean;
    UIAttributeAdding? : boolean;
}

interface UIContextBar {
    UIContextBarDefaultNotOpen?: boolean;
    UIContextBarNotStatic?: boolean;
    UIThresholdControls? : boolean;
    UIImageEnhancements? : boolean;
    UIGroupManager? : boolean;
    UIAttributeDetails? : boolean;
    UIRevisionHistory? : boolean;
    UITrackList? : boolean;
    UIDatasetInfo?: boolean;
    UIAttributeUserReview?: boolean;
}

interface UITrackDetails {
    UITrackBrowser? : boolean;
    UITrackMerge? : boolean;
    UIConfidencePairs? : boolean;
    UITrackAttributes? : boolean;
    UIDetectionAttributes? : boolean;
}

interface UIControls {
    UILegendControls?: boolean;
    UITimelineSelection?: boolean;
    UIPlaybackControls? : boolean;
    UIAudioControls? : boolean;
    UISpeedControls? : boolean;
    UITimeDisplay? : boolean;
    UIFrameDisplay? : boolean;
    UIImageNameDisplay? : boolean;
    UILockCamera? : boolean;
    UIResetCamera?: boolean;
}

interface UITimeline {
    UIDetections? : boolean;
    UIEvents? : boolean;
}

interface UIInteractions {
  UISelection?: boolean;
  UIEditing?: boolean;
}

export interface UISettings {
    UITopBar?: boolean | UITopBar;
    UIToolBar?: boolean | UIToolBar;
    UISideBar?: boolean | UISideBar;
    UIContextBar?: boolean | UIContextBar;
    UITrackDetails?: boolean | UITrackDetails;
    UIControls?: boolean | UIControls;
    UITimeline?: boolean | UITimeline;
    UIInteractions?: boolean | UIInteractions;

}
export type UISettingsKey = keyof UISettings | keyof UITopBar | keyof UIToolBar
| keyof UISideBar | keyof UIContextBar | keyof UITrackDetails | keyof UIControls
| keyof UITimeline | keyof UIInteractions;

type UIValue = UITopBar | UIToolBar
| UISideBar | UIContextBar | UITrackDetails | UIControls | UITimeline | UIInteractions;

export interface TimelineDisplay {
  maxHeight: number;
  order: number;
  name: string;
  dismissable: boolean;
  type: 'event' | 'detections' | 'filter' | 'swimlane' | 'graph';
}

export interface TimelineConfiguration {
  name?: string;
  maxHeight: number;
  timelines: TimelineDisplay[];
}

export interface CustomUISettings {
  title?: string;
  information?: string[]; // multiple markdown pages of information to be displayed if it exists
  width? : number;
  }

export interface Configuration {
  general?: {
    configurationMerge? : 'merge up' | 'merge down' | 'disabled';
    baseConfiguration?: string | null;
    disableConfigurationEditing?: boolean;
    configurationSettings?: ConfigurationSettings;
  };
  UISettings?: UISettings;
  actions?: DIVEAction[];
  shortcuts?: DIVEActionShortcut[];
  filterTimelines?: FilterTimeline[];
  timelineConfigs?: TimelineConfiguration[];
  customUI?: CustomUISettings;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flatMapGenerator(data: any, rootKey = '') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flatMap: Record<string, any> = {};
  Object.entries(data).forEach(([key, subData]) => {
    if (typeof (subData) === 'object') {
      if (rootKey === '') {
        flatMap[key] = flatMapGenerator(subData);
      } else {
        flatMap = { ...flatMap, ...flatMapGenerator(subData, key) };
      }
    } else if (isArray(subData)) {
      flatMap[key] = subData;
    } else {
      flatMap[key] = subData;
    }
  });
  if (rootKey !== '') {
    if (typeof (data[rootKey]) === 'object') {
      flatMap[rootKey] = true;
    }
  }
  return flatMap;
}

export default class ConfigurationManager {
  hierarchy: Ref<DiveConfiguration['hierarchy'] | null>;

  configuration: Ref<DiveConfiguration['metadata']['configuration'] | null>;

  prevNext: Ref<DiveConfiguration['prevNext'] | null>;

  setConfigurationId: (id: string) => void;

  _saveConfiguration: (id: string, config?: Configuration) => Promise<unknown>;

  transferConfiguration: (source: string, dest: string) => void;

  configurationId: Ref<Readonly<string>>;

  configOwners: Ref<Readonly<{
    users: {name: string; id: string}[];
    groups: {name: string; id: string}[];
  }>>;

  activeTimelineConfigIndex: Ref<number>;

  constructor(
    {
      configurationId,
      setConfigurationId,
      saveConfiguration,
      transferConfiguration,
    }: {
    configurationId: Ref<Readonly<string>>;
    setConfigurationId: (id: string) => void;
    saveConfiguration: (id: string, config?: Configuration) => Promise<unknown>;
    transferConfiguration: (source: string, dest: string) => void;
    },
  ) {
    this.configurationId = configurationId;
    this.setConfigurationId = setConfigurationId;
    this._saveConfiguration = saveConfiguration;
    this.transferConfiguration = transferConfiguration;
    this.hierarchy = ref(null);
    this.configuration = ref(null);
    this.prevNext = ref(null);
    this.configOwners = ref({ users: [], groups: [] });
    this.activeTimelineConfigIndex = ref(-1); // Start with no selection
  }

  async saveConfiguration(id: string, config?: Configuration, serverSave = true) {
    const updateConfig = { ...this.configuration.value, ...config };
    if (serverSave) {
      await this._saveConfiguration(id, updateConfig);
    }
  }

  setHierarchy(data: DiveConfiguration['hierarchy']) {
    this.hierarchy.value = data;
  }

  setConfigOwners(data: {
    users: {name: string; id: string}[];
    groups: {name: string; id: string}[];
  }) {
    this.configOwners.value = data;
  }

  setPrevNext(data: DiveConfiguration['prevNext']) {
    this.prevNext.value = data;
  }

  setConfiguration(data?: DiveConfiguration['metadata']['configuration']) {
    if (data) {
      // Convert timelineConfigs from single object to list for backward compatibility
      const normalizedData = { ...data };
      if (normalizedData.timelineConfigs !== undefined && !isArray(normalizedData.timelineConfigs)) {
        normalizedData.timelineConfigs = [normalizedData.timelineConfigs];
      }
      // Ensure timeline configs have names (default to 'Timeline' if only one, otherwise index)
      if (normalizedData.timelineConfigs && normalizedData.timelineConfigs.length > 0) {
        const configCount = normalizedData.timelineConfigs.length;
        normalizedData.timelineConfigs = normalizedData.timelineConfigs.map((config, index) => ({
          ...config,
          name: config.name || (configCount === 1 ? 'Timeline' : `${index}`),
        }));
        this.activeTimelineConfigIndex.value = 0;
      } else {
        // Allow empty timeline configs - don't auto-create
        normalizedData.timelineConfigs = [];
      }
      // Ensure active index is valid (but allow -1 for no selection)
      if (this.activeTimelineConfigIndex.value >= (normalizedData.timelineConfigs?.length || 0)) {
        this.activeTimelineConfigIndex.value = -1; // Reset to no selection if invalid
      }
      this.configuration.value = normalizedData;
    }
  }

  getActiveTimelineConfig(): TimelineConfiguration | null {
    const configs = this.configuration.value?.timelineConfigs;
    if (!configs || configs.length === 0) {
      return null;
    }
    const index = this.activeTimelineConfigIndex.value;
    // Return null if index is -1 (no selection)
    if (index === -1) {
      return null;
    }
    if (index >= 0 && index < configs.length) {
      return configs[index];
    }
    return null;
  }

  getTimelineConfigByIndex(configIndex: number): TimelineConfiguration | null {
    const configs = this.configuration.value?.timelineConfigs;
    if (!configs || configs.length === 0) {
      return null;
    }
    if (configIndex >= 0 && configIndex < configs.length) {
      return configs[configIndex];
    }
    return null;
  }

  setActiveTimelineConfigIndex(index: number) {
    const configs = this.configuration.value?.timelineConfigs;
    // Allow -1 to deselect
    if (index === -1) {
      this.activeTimelineConfigIndex.value = -1;
    } else if (configs && index >= 0 && index < configs.length) {
      this.activeTimelineConfigIndex.value = index;
    }
  }

  addTimelineConfig(name?: string): number {
    if (!this.configuration.value) {
      this.configuration.value = {};
    }
    if (!this.configuration.value.timelineConfigs) {
      this.configuration.value.timelineConfigs = [];
    }
    const configs = this.configuration.value.timelineConfigs;
    const newIndex = configs.length;
    // If this is the first config and no name provided, use 'Timeline'
    // Otherwise use index or provided name
    const configName = name || (newIndex === 0 ? 'Timeline' : `${newIndex}`);
    configs.push({
      name: configName,
      maxHeight: 300,
      timelines: [],
    });
    // If this was the first config and it didn't have a name, update it
    if (newIndex === 0 && !name && configs[0].name !== 'Timeline') {
      configs[0].name = 'Timeline';
    }
    // If we now have only one config, ensure it's named 'Timeline'
    if (configs.length === 1 && !name) {
      configs[0].name = 'Timeline';
    }
    this.activeTimelineConfigIndex.value = newIndex;
    return newIndex;
  }

  removeTimelineConfig(index: number) {
    const configs = this.configuration.value?.timelineConfigs;
    if (configs && index >= 0 && index < configs.length) {
      configs.splice(index, 1);
      // Allow empty timeline configs - don't auto-create
      if (configs.length === 1 && !configs[0].name) {
        // If only one config remains and it has no name, set it to 'Timeline'
        configs[0].name = 'Timeline';
      }
      // Adjust active index if needed
      if (configs.length === 0) {
        this.activeTimelineConfigIndex.value = -1; // No selection when empty
      } else if (this.activeTimelineConfigIndex.value >= configs.length) {
        this.activeTimelineConfigIndex.value = Math.max(-1, configs.length - 1);
      } else if (this.activeTimelineConfigIndex.value > index) {
        this.activeTimelineConfigIndex.value -= 1;
      }
    }
  }

  updateTimelineConfigName(index: number, name: string) {
    const configs = this.configuration.value?.timelineConfigs;
    if (configs && index >= 0 && index < configs.length) {
      configs[index].name = name;
    }
  }

  getConfigurationSetting(key: keyof ConfigurationSettings) {
    if (this.configuration.value?.general?.configurationSettings) {
      const { configurationSettings } = this.configuration.value.general;
      return (configurationSettings && configurationSettings[key]);
    }
    return true;
  }

  getFlatUISettingMap(addRoots = false) {
    if (this.configuration.value?.UISettings) {
      const { UISettings } = this.configuration.value;
      if (UISettings) {
        let flatIndex: Record<UISettingsKey | string,
        boolean | boolean[] | undefined | UIValue> = {};
        Object.entries(UISettings).forEach(([subKey, val]) => {
          if (typeof val === 'object') {
            flatIndex = { ...flatIndex, ...flatMapGenerator(val) };
            if (addRoots) {
              flatIndex[subKey] = true;
            }
          } else if (isArray(val)) {
            flatIndex[subKey as UISettingsKey] = val;
          } else {
            flatIndex[subKey as UISettingsKey] = val;
          }
        });
        return flatIndex;
      }
    }
    return {};
  }

  getUISetting(key: UISettingsKey) {
    if (this.configuration.value?.UISettings) {
      const val = this.getFlatUISettingMap(true)[key];
      if (val !== undefined) {
        return val;
      }
    }
    return true;
  }

  setCustomUI(customUI: CustomUISettings | undefined) {
    if (this.configuration.value) {
      this.configuration.value.customUI = customUI;
    }
  }

  getUISettingValue(key: UISettingsKey) {
    if (this.configuration.value?.UISettings) {
      const { UISettings } = this.configuration.value;
      if (UISettings) {
        const flatIndex: Record<UISettingsKey | string, boolean | boolean[]
        | UIValue | undefined> = {};
        Object.entries(UISettings).forEach(([subKey, val]) => {
          if (typeof val === 'object') {
            flatIndex[subKey as UISettingsKey] = val;
          } else {
            flatIndex[subKey as UISettingsKey] = val;
          }
        });
        if (flatIndex[key] !== undefined) {
          return flatIndex[key];
        }
      }
    }
    return true;
  }

  setUISettings(key: keyof UISettings, val: UIValue) {
    if (this.configuration.value && !this.configuration.value.UISettings) {
      this.configuration.value.UISettings = {
        UITopBar: true,
        UIToolBar: true,
        UISideBar: true,
        UIContextBar: true,
        UITrackDetails: true,
        UIControls: true,
        UITimeline: true,
        UIInteractions: true,
      };
    }
    if (this.configuration.value?.UISettings) {
      const { UISettings } = this.configuration.value;
      if (UISettings) {
        UISettings[key] = val;
      }
    }
  }

  setRootUISettings(val: UISettings) {
    if (this.configuration.value?.UISettings) {
      this.configuration.value.UISettings = val;
    }
  }

  updateAction(val: DIVEAction, index: number) {
    if (this.configuration.value && !this.configuration.value?.actions) {
      this.configuration.value.actions = [];
    }
    if (this.configuration.value?.actions) {
      const { actions } = this.configuration.value;
      if (actions[index]) {
        actions[index] = val;
      } else {
        actions.push(val);
      }
      this.configuration.value.actions = actions;
    }
  }

  removeAction(index: number) {
    if (this.configuration.value && !this.configuration.value?.actions) {
      this.configuration.value.actions = [];
    }
    if (this.configuration.value?.actions) {
      const { actions } = this.configuration.value;
      if (actions.length === 1) {
        this.configuration.value.actions = [];
      } else if (actions[index]) {
        const newActions = actions.splice(index, 1);
        this.configuration.value.actions = newActions;
      }
    }
  }

  updateShortcut(val: DIVEActionShortcut, index: number) {
    if (!this.configuration.value) {
      this.configuration.value = {};
    }
    if (this.configuration.value && !this.configuration.value?.shortcuts) {
      this.configuration.value.shortcuts = [];
    }
    if (this.configuration.value?.shortcuts) {
      const { shortcuts } = this.configuration.value;
      if (shortcuts[index]) {
        shortcuts[index] = val;
      } else {
        shortcuts.push(val);
      }
      this.configuration.value.shortcuts = shortcuts;
    }
  }

  removeShortCut(index: number) {
    if (this.configuration.value && !this.configuration.value?.shortcuts) {
      this.configuration.value.shortcuts = [];
    }
    if (this.configuration.value?.shortcuts) {
      const { shortcuts } = this.configuration.value;
      if (shortcuts.length === 1) {
        this.configuration.value.shortcuts = [];
      } else if (shortcuts[index]) {
        const newShortcuts = shortcuts.splice(index, 1);
        this.configuration.value.shortcuts = newShortcuts;
      }
    }
  }

  updateFilterTimeline(val: FilterTimeline, index: number) {
    if (this.configuration.value && !this.configuration.value?.filterTimelines) {
      this.configuration.value.filterTimelines = [];
    }
    if (this.configuration.value?.filterTimelines) {
      const { filterTimelines } = this.configuration.value;
      if (filterTimelines && filterTimelines[index]) {
        filterTimelines[index] = val;
      } else {
        filterTimelines.push(val);
      }
      this.configuration.value.filterTimelines = filterTimelines;
    }
  }

  removeFilterTimeline(index: number) {
    if (this.configuration.value && !this.configuration.value?.filterTimelines) {
      this.configuration.value.filterTimelines = [];
    }
    if (this.configuration.value?.filterTimelines) {
      const { filterTimelines } = this.configuration.value;
      if (filterTimelines.length === 1) {
        this.configuration.value.filterTimelines = [];
      } else if (filterTimelines[index]) {
        const newFilterTimelines = filterTimelines.splice(index, 1);
        this.configuration.value.filterTimelines = newFilterTimelines;
      }
    }
  }

  updateTimelineDisplay(val: TimelineDisplay, timelineIndex: number, configIndex?: number) {
    const targetConfigIndex = configIndex !== undefined ? configIndex : this.activeTimelineConfigIndex.value;
    const configs = this.configuration.value?.timelineConfigs;
    if (!configs || configs.length === 0) {
      // Create default config if none exists
      if (!this.configuration.value) {
        this.configuration.value = {};
      }
      if (!this.configuration.value.timelineConfigs) {
        this.configuration.value.timelineConfigs = [{
          name: 'Timeline',
          maxHeight: 300,
          timelines: [],
        }];
        if (configIndex === undefined) {
          this.activeTimelineConfigIndex.value = 0;
        }
      }
      // Re-fetch configs after creation
      const updatedConfigs = this.configuration.value.timelineConfigs;
      if (updatedConfigs && updatedConfigs.length > 0) {
        const timelineConfig = updatedConfigs[0];
        const { timelines } = timelineConfig;
        if (timelines && timelines[timelineIndex]) {
          timelines[timelineIndex] = val;
        } else {
          timelines.push(val);
        }
        timelineConfig.timelines = timelines;
        updatedConfigs[0] = timelineConfig;
        this.configuration.value = { ...this.configuration.value };
      }
      return;
    }
    if (targetConfigIndex >= 0 && targetConfigIndex < configs.length) {
      const timelineConfig = configs[targetConfigIndex];
      const { timelines } = timelineConfig;
      if (timelines && timelines[timelineIndex]) {
        timelines[timelineIndex] = val;
      } else {
        timelines.push(val);
      }
      timelineConfig.timelines = timelines;
      configs[targetConfigIndex] = timelineConfig;
      this.configuration.value = { ...this.configuration.value };
    }
  }

  removeTimelineDisplay(timelineIndex: number, configIndex?: number) {
    const configs = this.configuration.value?.timelineConfigs;
    if (!configs || configs.length === 0) {
      return;
    }
    const targetConfigIndex = configIndex !== undefined ? configIndex : this.activeTimelineConfigIndex.value;
    if (targetConfigIndex < 0 || targetConfigIndex >= configs.length) {
      return;
    }
    const timelineConfig = configs[targetConfigIndex];
    const { timelines } = timelineConfig;
    if (!timelines || timelines.length === 0) {
      return;
    }
    // Validate the timeline index
    if (timelineIndex < 0 || timelineIndex >= timelines.length) {
      return;
    }
    // Remove the timeline
    if (timelines.length === 1) {
      // If it's the last timeline, clear the array
      timelineConfig.timelines = [];
      timelineConfig.maxHeight = 175;
    } else {
      // Remove the specific timeline
      timelines.splice(timelineIndex, 1);
      timelineConfig.timelines = timelines;
    }
    configs[targetConfigIndex] = timelineConfig;
    this.configuration.value = { ...this.configuration.value };
  }
}
