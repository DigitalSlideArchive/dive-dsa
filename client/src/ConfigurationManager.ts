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

export interface Configuration {
  general?: {
    configurationMerge? : 'merge up' | 'merge down' | 'disabled';
    baseConfiguration?: string;
    disableConfigurationEditing?: boolean;
    configurationSettings?: ConfigurationSettings;
  };
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
}
