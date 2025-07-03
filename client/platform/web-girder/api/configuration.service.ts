import girderRest from 'platform/web-girder/plugins/girder';

export interface BrandData {
  vuetify?: unknown;
  favicon?: string;
  logo?: string;
  name?: string;
  loginMessage?: string;
  alertMessage?: string;
  trainingMessage?: string;
}

export interface SAM2Model {
  config: string;
  checkpoint: string;
}

export interface SAM2Config {
  celeryQueue: string;
  models: Record<string, SAM2Model>;
}

export interface SAM2ClientConfig {
  models: string[];
  queues: string[];
}

export interface AnnotatorFeatures {
  sam2MaskTracking?: boolean;
}

export interface EnabledFeatures {
  annotator: AnnotatorFeatures;
}
export interface DIVEGirderConfig {
  SAM2Config?: SAM2ClientConfig;
  EnabledFeatures? :EnabledFeatures;
}

export type AddOns = [string, string, string, boolean][];

function getBrandData() {
  return girderRest.get<BrandData>('dive_configuration/brand_data');
}

function putBrandData(brandData: BrandData) {
  return girderRest.put('dive_configuration/brand_data', brandData);
}

function getDIVEGirderConfig() {
  return girderRest.get<DIVEGirderConfig>('dive_configuration/dive_config');
}
function putDIVEGirderConfig(diveGirderConfig: DIVEGirderConfig) {
  return girderRest.put('dive_configuration/dive_config', diveGirderConfig);
}

function getSAM2Config() {
  return girderRest.get<SAM2Config>('dive_configuration/sam2_configs');
}

function putSAM2Config(sam2Config: SAM2Config, forceDownload = false) {
  const params = new URLSearchParams();
  if (forceDownload) {
    params.set('force', 'true');
  }
  return girderRest.put(`dive_configuration/sam2_configs?${params.toString()}`, {
    ...sam2Config,
  });
}

export {
  getBrandData,
  putBrandData,
  getDIVEGirderConfig,
  putDIVEGirderConfig,
  getSAM2Config,
  putSAM2Config,
};
