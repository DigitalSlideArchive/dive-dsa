import { ref, watch, Ref } from 'vue';

type MaskItem = {
  filename: string;
  id: string;
  metadata?: {
    frameId?: number;
    trackId?: number;
  };
  url: string;
};

export interface UseMaskInterface {
    getMask: (trackId: number, frameId: number) => HTMLImageElement | undefined;
}

export default function useMasks(frame: Readonly<Ref<number>>) {
  const frameRate = ref(30);
  const masks = ref<MaskItem[]>([]);
  const cache = new Map<string, HTMLImageElement>();
  const inFlightRequests = new Map<string, { image: HTMLImageElement, controller: AbortController }>();

  function setFrameRate(newRate: number) {
    frameRate.value = newRate;
  }

  function initializeMaskData(maskData: { masks: Readonly<MaskItem[]> }) {
    masks.value = [...maskData.masks];
    preloadWindow(frame.value);
  }

  function getFrameWindow(currentFrame: number) {
    const minFrame = Math.max(0, Math.floor(currentFrame - frameRate.value * 2));
    const maxFrame = Math.floor(currentFrame + frameRate.value * 5);
    return { minFrame, maxFrame };
  }

  function frameKey(frameId: number, trackId: number) {
    return `${frameId}_${trackId}`;
  }

  function clearOutOfWindow(minFrame: number, maxFrame: number) {
    Array.from(inFlightRequests.entries()).forEach(([key, { controller }]) => {
      const [frameIdStr] = key.split('_');
      const frameId = Number(frameIdStr);
      if (frameId < minFrame || frameId > maxFrame) {
        controller.abort();
        inFlightRequests.delete(key);
      }
    });
  }

  function preloadWindow(currentFrame: number) {
    const { minFrame, maxFrame } = getFrameWindow(currentFrame);

    clearOutOfWindow(minFrame, maxFrame);
    masks.value.forEach((mask) => {
      if (!mask.metadata || !mask.metadata.frameId || !mask.metadata.trackId) {
        console.warn(`Mask ${mask.filename} does not have metadata`);
        return;
      }
      const frameId = Number(mask.metadata?.frameId);
      const { trackId } = mask.metadata;
      const key = frameKey(mask.metadata.frameId, trackId);
      if (frameId >= minFrame && frameId <= maxFrame && !cache.has(key) && !inFlightRequests.has(key)) {
        const img = new Image();
        const controller = new AbortController();

        img.onload = () => {
          cache.set(key, img);
          inFlightRequests.delete(key);
        };
        img.onerror = () => {
          inFlightRequests.delete(key);
        };

        // Attach abort handler
        controller.signal.addEventListener('abort', () => {
          img.src = '';
        });

        inFlightRequests.set(key, { image: img, controller });
        img.src = mask.url;
      }
    });
  }

  function getMask(trackId: number, frameId: number): HTMLImageElement | undefined {
    const key = frameKey(frameId, trackId);

    return cache.get(key);
  }

  watch(frame, (newFrame) => {
    if (typeof newFrame === 'number') {
      preloadWindow(newFrame);
    }
  }, { immediate: true });

  return {
    initializeMaskData,
    setFrameRate,
    getMask,
  };
}
