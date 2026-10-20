/**
 * Connects the point-click segmentation recipe to the browser SAM2 runtime:
 * reads the selected camera's current frame and runs the model on it.
 */
import {
  onBeforeUnmount, ref, Ref, watch,
} from 'vue';
import type { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import type SegmentationPointClick from 'dive-common/recipes/segmentationpointclick';
import type { SegmentationPredictRequest } from 'dive-common/use/segmentation/types';
import SamOnnx from 'dive-common/use/segmentation/SamOnnx';
import type { RgbaImage, SamModelProgress, SamStatusCallback } from 'dive-common/use/segmentation/SamOnnx';
import { captureQuadMedia, findQuadMedia } from 'dive-common/use/segmentation/frameCapture';
import { clientSettings } from 'dive-common/store/settings';

interface FrameUrl { url: string }

/** Load an image URL and read its pixels. */
async function urlToRgba(url: string): Promise<RgbaImage> {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
  return captureQuadMedia({
    kind: 'image', source: img, width: img.naturalWidth, height: img.naturalHeight,
  });
}

function sameUrl(a: string, b: string) {
  try {
    return new URL(a, window.location.href).href === new URL(b, window.location.href).href;
  } catch {
    return a === b;
  }
}

export default function useSamSegmentation({
  recipe,
  aggregateController,
  selectedCamera,
  datasetId,
  imageData,
  createSam = (onStatus) => new SamOnnx(onStatus),
}: {
  recipe: SegmentationPointClick;
  aggregateController: Ref<AggregateMediaController>;
  selectedCamera: Ref<string>;
  datasetId: Ref<string | null>;
  /** Image-sequence frame URLs per camera; empty for video */
  imageData: Ref<Record<string, FrameUrl[]>>;
  /** Override for tests */
  createSam?: (onStatus: SamStatusCallback) => SamOnnx;
}) {
  /** Human readable model status (download, encode, predict), or null when idle */
  const status = ref<string | null>(null);
  const progress = ref<SamModelProgress | null>(null);
  const sam = createSam((message, next) => {
    status.value = message;
    progress.value = message ? (next ?? null) : null;
  });

  /** Pixels for `frameNum` on `camera`, or an error if that frame is not on screen. */
  async function readFrame(camera: string, frameNum: number): Promise<RgbaImage> {
    const controller = aggregateController.value.getController(camera);
    if (controller.frame.value !== frameNum) {
      throw new Error('The frame changed before segmentation could read it.');
    }
    const media = findQuadMedia(controller.geoViewerRef.value);
    const expectedUrl = imageData.value[camera]?.[frameNum]?.url;
    // While the next image is loading, the map may still show the previous one.
    if (expectedUrl && (!media || media.kind !== 'image'
      || !sameUrl((media.source as HTMLImageElement).src, expectedUrl))) {
      return urlToRgba(expectedUrl);
    }
    if (!media) throw new Error('The image or video frame is not ready for segmentation.');
    return captureQuadMedia(media);
  }

  function predict(request: SegmentationPredictRequest, frameNum: number) {
    const camera = selectedCamera.value;
    return sam.predict(
      `${datasetId.value}:${camera}:${frameNum}`,
      () => readFrame(camera, frameNum),
      // Read the point budget at call time so a settings change applies to
      // the next (or refreshed) prediction without reloading the model.
      { ...request, polygonPoints: clientSettings.segmentationSettings.polygonPoints },
    );
  }

  recipe.initialize({
    initializeServiceFn: () => sam.ready(),
    predictFn: predict,
  });

  // Changing either releases the loaded session; the next click loads the new one.
  watch(
    () => [clientSettings.segmentationSettings.model, clientSettings.segmentationSettings.device],
    () => Promise.all([
      sam.setModel(clientSettings.segmentationSettings.model),
      sam.setDevice(clientSettings.segmentationSettings.device),
    ]),
    { immediate: true },
  );

  onBeforeUnmount(() => {
    recipe.disable();
    sam.dispose().catch(() => { /* already released */ });
  });

  return { status, progress, sam };
}
