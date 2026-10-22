/**
 * Read the native-resolution pixels of the frame an annotator is showing.
 *
 * ImageAnnotator and VideoAnnotator draw their media through a GeoJS quad
 * feature whose datum carries the `image` or `video` element. Reading that
 * element (instead of a map screenshot) gives unscaled pixels without any
 * annotation overlays or brightness filters.
 */
import type { RgbaImage } from './SamOnnx';

/** GeoJS objects are untyped. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeoObject = any;

export interface QuadMedia {
  kind: 'image' | 'video';
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
  width: number;
  height: number;
}

function quadDatum(layer: GeoObject): GeoObject | undefined {
  if (typeof layer?.features !== 'function') return undefined;
  return layer.features()
    .map((feature: GeoObject) => {
      const data = typeof feature.data === 'function' ? feature.data() : undefined;
      return Array.isArray(data) ? data[0] : undefined;
    })
    .find((datum: GeoObject) => datum?.image || datum?.video);
}

/** First quad image/video texture on a GeoJS map, or null when none is drawn yet. */
export function findQuadMedia(viewer: GeoObject): QuadMedia | null {
  if (!viewer || typeof viewer.layers !== 'function') return null;
  const layers: GeoObject[] = viewer.layers();
  for (let i = 0; i < layers.length; i += 1) {
    const datum = quadDatum(layers[i]);
    if (datum?.image) {
      const image = datum.image as HTMLImageElement | HTMLCanvasElement;
      const width = 'naturalWidth' in image && image.naturalWidth ? image.naturalWidth : image.width;
      const height = 'naturalHeight' in image && image.naturalHeight ? image.naturalHeight : image.height;
      return {
        kind: 'image', source: image, width, height,
      };
    }
    if (datum?.video) {
      const video = datum.video as HTMLVideoElement;
      return {
        kind: 'video', source: video, width: video.videoWidth, height: video.videoHeight,
      };
    }
  }
  return null;
}

/** True when the media element holds a decoded frame that can be read. */
export function mediaReady(media: QuadMedia): boolean {
  if (!media.width || !media.height) return false;
  if (media.kind === 'video') {
    const video = media.source as HTMLVideoElement;
    return !video.seeking && video.readyState >= 2;
  }
  const image = media.source as HTMLImageElement;
  return !('complete' in image) || image.complete;
}

/**
 * Copy the current media frame into RGBA pixels.
 * Throws when the frame is not ready, or the browser blocks reading it
 * (cross-origin media without CORS headers taints the canvas).
 */
export function captureQuadMedia(media: QuadMedia): RgbaImage {
  if (!mediaReady(media)) throw new Error('The image or video frame is not ready for segmentation.');
  const canvas = document.createElement('canvas');
  canvas.width = media.width;
  canvas.height = media.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas to read the frame.');
  context.drawImage(media.source, 0, 0, media.width, media.height);
  try {
    return context.getImageData(0, 0, media.width, media.height);
  } catch (err) {
    throw new Error(`The browser blocked reading this frame's pixels: ${String(err)}`);
  }
}
