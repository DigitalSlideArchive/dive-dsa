import girderRest from 'platform/web-girder/plugins/girder';

/** A model repository served by the dive_hf_models Girder plugin. */
export interface HFModelRepo {
  repoId: string;
  folderId: string;
  revision?: string | null;
  updated?: string;
}

/**
 * Where browsers load transformers.js models from:
 * - auto: DIVE-DSA when it has the model, else the Hugging Face Hub
 * - huggingface: always the Hub
 * - local: only DIVE-DSA (models must be imported with dive-hf-models)
 * - custom: `customHost`, a mirror in the Hub's `<org>/<repo>/resolve/<rev>/<file>` layout
 */
export type HFModelSourceKind = 'auto' | 'huggingface' | 'local' | 'custom';
export interface HFModelSource {
  source: HFModelSourceKind;
  customHost?: string | null;
}

export const HUGGING_FACE_HOST = 'https://huggingface.co/';

function listHFModelRepos() {
  return girderRest.get<HFModelRepo[]>('dive_hf_models/repos');
}

function getHFModelSource() {
  return girderRest.get<HFModelSource>('dive_hf_models/config');
}

function putHFModelSource(config: HFModelSource) {
  return girderRest.put<HFModelSource>('dive_hf_models/config', config);
}

/** Absolute URL of this server's dive_hf_models route (ends with a slash). */
function localModelHost(): string {
  const apiRoot = girderRest.apiRoot.replace(/\/*$/, '/');
  return new URL(`${apiRoot}dive_hf_models/`, window.location.href).href;
}

interface Lookup { source: HFModelSource; repoIds: Set<string> }
let lookup: Promise<Lookup> | null = null;

/** Forget the cached source and model list (after an admin changes them). */
function resetSamModelHostCache() {
  lookup = null;
}

function loadLookup(): Promise<Lookup> {
  if (lookup === null) {
    lookup = Promise.all([
      getHFModelSource().then(({ data }) => data).catch((): HFModelSource => ({ source: 'auto' })),
      listHFModelRepos()
        .then(({ data }) => new Set(data.map((repo) => repo.repoId)))
        .catch(() => new Set<string>()),
    ]).then(([source, repoIds]) => ({ source, repoIds }));
  }
  return lookup;
}

/** Resolve the host for `modelId` under a given source setting and local model list. */
function modelHostFor(source: HFModelSource, repoIds: Set<string>, modelId: string): string | null {
  switch (source.source) {
    case 'huggingface':
      return null;
    case 'local':
      // Even when missing, so the browser never falls back to the Hub.
      return localModelHost();
    case 'custom':
      return source.customHost || null;
    default:
      return repoIds.has(modelId) ? localModelHost() : null;
  }
}

/**
 * Base URL to load browser model `modelId` from, per the admin's model source
 * setting, or null for the Hugging Face Hub. Looked up once per page load.
 */
async function getSamModelHost(modelId: string): Promise<string | null> {
  const { source, repoIds } = await loadLookup();
  return modelHostFor(source, repoIds, modelId);
}

export {
  listHFModelRepos,
  getHFModelSource,
  putHFModelSource,
  localModelHost,
  modelHostFor,
  getSamModelHost,
  resetSamModelHostCache,
};
