import { ref, Ref } from '@vue/composition-api';

export interface DiveConfiguration {
  prevNext?: {
    previous?: { id: string; name: string};
    next?: { id: string; name: string};
  };
  hierarchy?: {name: string; id: string}[];
  metadata: {
    configuration?: Configuration;
  };
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
    UIData? :  boolean;
    UIJobs? :  boolean;
    UINextPrev? :  boolean;
    UIToolBox? :  boolean;
    UIImport? :  boolean;
    UIExport? :  boolean;
    UIClone? :  boolean;
    UIKeyboardShortcuts? :  boolean;
    UISave? :  boolean;
}

interface UIToolBar {
    UIEditingInfo? :  boolean;
    UIEditingTypes? :  boolean[];  // Rectangle, Polygon, Line by default
    UIVisibility? :  boolean[];  // Rectnagle, Polygon, Line by default
    UIToolTip? :  boolean;
    UITrackTrails? :  boolean;
}

interface UISideBar {
    UITrackTypes? :  boolean;
    UIConfidenceThreshold? :  boolean;
    UITrackList? :  boolean;
    UITrackDetails? :  boolean;
}

interface UIContextBar {
    UIThresholdControls? :  boolean;
    UIImageEnchancements? :  boolean;
    UIGroupManager? :  boolean;
    UIAttributeDetails? :  boolean;
    UIRevisionHistory? :  boolean;
    UITrackList? :  boolean;
}

interface UITrackDetails {
    UITrackBrowser? :  boolean;
    UITrackMerge? :  boolean;
    UIConfidencePairs? :  boolean;
    UITrackAttributes? :  boolean;
    UIDetectionAttributes? :  boolean;
}

interface UIControls {
    UIPlaybackControls? :  boolean;
    UIAudioControls? :  boolean;
    UITimeDisplay? :  boolean;
    UIFrameDisplay? :  boolean;
    UIImageNameDisplay? :  boolean;
    UILockCamera? :  boolean;
}

interface UITimeline {
    UIDetections? :  boolean;
    UIEvents? :  boolean;
}

interface UISettings {
    UITopBar?: boolean | UITopBar;
    UIToolBar?: boolean | UIToolBar;
    UISideBar?: boolean | UISideBar;
    UIContextBar?: boolean | UIContextBar;
    UITrackDetails?: boolean | UITrackDetails;
    UIControls?: boolean | UIControls;
    UITimeline?: boolean | UITimeline;

}

export interface Configuration {
  general?: {
    configurationMerge? : 'merge up' | 'merge down' | 'disabled';
    baseConfiguration?: string;
    disableConfigurationEditing?: boolean;
    configurationSettings?: ConfigurationSettings;
  };
  uiSettings?: UISettings;
}

export default class ConfigurationManager {
  hierarchy: Ref<DiveConfiguration['hierarchy'] | null>;

  configuration: Ref<DiveConfiguration['metadata']['configuration'] | null>;

  prevNext: Ref<DiveConfiguration['prevNext'] | null>;

  setConfigurationId: (id: string) => void;

  saveConfiguration: (id: string, config?: Configuration) => void;

  configurationId: Ref<Readonly<string>>;


  constructor(
    {
      configurationId,
      setConfigurationId,
      saveConfiguration,
    }: {
    configurationId: Ref<Readonly<string>>;
    setConfigurationId: (id: string) => void;
    saveConfiguration: (id: string, config?: Configuration) => void;
    },
  ) {
    this.configurationId = configurationId;
    this.setConfigurationId = setConfigurationId;
    this.saveConfiguration = saveConfiguration;
    this.hierarchy = ref(null);
    this.configuration = ref(null);
    this.prevNext = ref(null);
  }

  setHierarchy(data: DiveConfiguration['hierarchy']) {
    this.hierarchy.value = data;
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
    const configurationSettings = this.configuration.value.general.configurationSettings;
      return (configurationSettings && configurationSettings[key]) 
  }

  getUISetting(key:string) {
    const splits = key.split('.');
    const exists = false;
    const uiSettings = this.configuration.value.uiSettings;
    let base = uiSettings;
    for (let i = 0; i < splits.length; i += 1) {
      if (uiSettings[splits[i]] !== undefined) {
          if (typeof uiSettings[splits[i]] === 'object') {
            base = uiSettings[splits[i]]
          } else {
            return uiSettings[splits[i]]
          }
      }
    }
    return true;
  }

}
