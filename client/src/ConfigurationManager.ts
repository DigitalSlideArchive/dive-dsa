import { ref, Ref } from '@vue/composition-api';
import { DIVEAction, DIVEActionShortcut } from 'dive-common/use/useActions';
import { isArray } from 'lodash';

export interface DiveConfiguration {
  prevNext?: {
    previous?: { id: string; name: string};
    next?: { id: string; name: string};
  };
  hierarchy?: {name: string; id: string}[];
  metadata: {
    configuration?: Configuration;
  };
  baseConfigurationOwner: string;
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
    UIAttributeUserReview?: boolean;

}

interface UIContextBar {
    UIThresholdControls? : boolean;
    UIImageEnhancements? : boolean;
    UIGroupManager? : boolean;
    UIAttributeDetails? : boolean;
    UIRevisionHistory? : boolean;
    UITrackList? : boolean;
}

interface UITrackDetails {
    UITrackBrowser? : boolean;
    UITrackMerge? : boolean;
    UIConfidencePairs? : boolean;
    UITrackAttributes? : boolean;
    UIDetectionAttributes? : boolean;
}

interface UIControls {
    UIPlaybackControls? : boolean;
    UIAudioControls? : boolean;
    UISpeedControls? : boolean;
    UITimeDisplay? : boolean;
    UIFrameDisplay? : boolean;
    UIImageNameDisplay? : boolean;
    UILockCamera? : boolean;
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
}

function flatMapGenerator(data: any, rootKey = '') {
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

  _saveConfiguration: (id: string, config?: Configuration) => void;

  transferConfiguration: (source: string, dest: string) => void;

  configurationId: Ref<Readonly<string>>;

  baseConfigurationOwner: Ref<Readonly<string>>;


  constructor(
    {
      configurationId,
      setConfigurationId,
      saveConfiguration,
      transferConfiguration,
    }: {
    configurationId: Ref<Readonly<string>>;
    setConfigurationId: (id: string) => void;
    saveConfiguration: (id: string, config?: Configuration) => void;
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
    this.baseConfigurationOwner = ref('');
  }

  saveConfiguration(id: string, config?: Configuration) {
    const updateConfig = { ...this.configuration.value, ...config };
    this._saveConfiguration(id, updateConfig);
  }

  setHierarchy(data: DiveConfiguration['hierarchy']) {
    this.hierarchy.value = data;
  }

  setBaseConfigurationOwner(data: string) {
    this.baseConfigurationOwner.value = data;
  }

  setPrevNext(data: DiveConfiguration['prevNext']) {
    this.prevNext.value = data;
  }

  setConfiguration(data?: DiveConfiguration['metadata']['configuration']) {
    if (data) {
      this.configuration.value = data;
    }
  }

  getConfigurationSetting(key: keyof ConfigurationSettings) {
    if (this.configuration.value?.general?.configurationSettings) {
      const { configurationSettings } = this.configuration.value?.general;
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
}
