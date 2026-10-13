import { ref, Ref } from 'vue';
import { LaunchConfig } from 'vue-media-annotator/ConfigurationManager';
import { normalizeLaunchConfigs } from 'vue-media-annotator/launchConfigs';
import { getDiveConfiguration } from '../api/dataset.service';

// Cache per browse context (folder id) so list views never fetch per row
const cache = new Map<string, Promise<LaunchConfig[]>>();

export function resolveLaunchConfigs(folderId: string): Promise<LaunchConfig[]> {
  let pending = cache.get(folderId);
  if (!pending) {
    pending = getDiveConfiguration(folderId)
      .then((resp) => normalizeLaunchConfigs(resp.data?.launchConfigs))
      .catch(() => [] as LaunchConfig[]);
    cache.set(folderId, pending);
  }
  return pending;
}

export function invalidateLaunchConfigs(folderId?: string) {
  if (folderId) {
    cache.delete(folderId);
  } else {
    cache.clear();
  }
}

export function useLaunchConfigs() {
  const launchConfigs: Ref<LaunchConfig[]> = ref([]);
  const load = async (id?: string | null) => {
    launchConfigs.value = id ? await resolveLaunchConfigs(id) : [];
  };
  return { launchConfigs, load };
}
