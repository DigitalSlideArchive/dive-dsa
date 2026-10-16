import { ref, Ref } from 'vue';
import { LaunchConfig } from 'vue-media-annotator/ConfigurationManager';
import { normalizeLaunchConfigs } from 'vue-media-annotator/launchConfigs';
import { getDiveConfiguration } from '../api/dataset.service';
import { getFolder } from '../api/girder.service';

// Cache per browse context (folder id) so list views never fetch per row
const cache = new Map<string, Promise<LaunchConfig[]>>();

function cacheKey(folderId: string, ownFolderOnly: boolean) {
  return ownFolderOnly ? `${folderId}:own` : folderId;
}

/**
 * Resolve launch configs for a browse context.
 * By default uses the write-base configuration (Data Browser / Annotation Browser).
 * Pass ownFolderOnly to read only this folder's meta.configuration.launchConfigs
 * (metadata folder view).
 */
export function resolveLaunchConfigs(
  folderId: string,
  opts?: { ownFolderOnly?: boolean },
): Promise<LaunchConfig[]> {
  const ownFolderOnly = !!opts?.ownFolderOnly;
  const key = cacheKey(folderId, ownFolderOnly);
  let pending = cache.get(key);
  if (!pending) {
    pending = ownFolderOnly
      ? getFolder(folderId)
        .then((resp) => normalizeLaunchConfigs(resp.data?.meta?.configuration?.launchConfigs))
        .catch(() => [] as LaunchConfig[])
      : getDiveConfiguration(folderId)
        .then((resp) => normalizeLaunchConfigs(resp.data?.launchConfigs))
        .catch(() => [] as LaunchConfig[]);
    cache.set(key, pending);
  }
  return pending;
}

export function invalidateLaunchConfigs(folderId?: string) {
  if (folderId) {
    cache.delete(folderId);
    cache.delete(cacheKey(folderId, true));
  } else {
    cache.clear();
  }
}

export function useLaunchConfigs() {
  const launchConfigs: Ref<LaunchConfig[]> = ref([]);
  const load = async (id?: string | null, opts?: { ownFolderOnly?: boolean }) => {
    launchConfigs.value = id ? await resolveLaunchConfigs(id, opts) : [];
  };
  return { launchConfigs, load };
}
