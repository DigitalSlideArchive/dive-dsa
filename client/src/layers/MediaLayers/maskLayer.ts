import { MediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import { Ref } from 'vue';
import type { CroppedMask } from 'vue-media-annotator/use/rle';
import maskPerf from 'vue-media-annotator/use/maskPerf';
import { TypeStyling } from '../../StyleManager';

/**
 * Opacity (%) for the unconfirmed magic-wand mask preview. Deliberately
 * higher than the stored-mask default (50%, user-adjustable) so the
 * preview reads as a solid mask rather than a faint overlay.
 */
export const SegmentationPreviewOpacity = 75;

export type MaskLayerItem = { trackId: number; mask: CroppedMask };

type QuadDatum = {
  ul: { x: number; y: number };
  lr: { x: number; y: number };
  texture?: { width: number; height: number; data: Uint8Array; type: 'RGBA' };
  image?: HTMLCanvasElement;
};

type CachedDatum = { sizeKey: string; datum: QuadDatum };

/**
 * All stored masks of a camera in ONE geojs feature layer (one canvas / WebGL
 * context) holding one quad per mask. Each quad covers only the mask's
 * bounding box and its texture already carries the type color, so no SVG
 * filter is needed.
 *
 * Quad datums are cached per mask buffer: geojs keeps the built quad and its
 * GPU texture on the datum (`_cachedQuad`), so a mask that is drawn again
 * (paused, scrubbing back, hover/selection redraws) is not uploaded again.
 */
export default class MaskLayer {
  annotator: MediaController;

  typeStyling: Ref<TypeStyling>;

  opacity: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  featureLayer: any = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quads: any = null;

  private datums = new WeakMap<Uint8Array, CachedDatum>();

  private imageDatums = new WeakMap<HTMLImageElement, Map<string, CachedDatum>>();

  private lastData: QuadDatum[] = [];

  private visible = false;

  constructor({
    annotator,
    typeStyling,
  }: { annotator: MediaController; typeStyling: Ref<TypeStyling>}) {
    this.annotator = annotator;
    this.typeStyling = typeStyling;
    this.opacity = 50;
  }

  private ensureLayer() {
    if (!this.featureLayer) {
      // Own canvas (not auto-shared) so layer opacity applies to all masks
      this.featureLayer = this.annotator.geoViewerRef.value.createLayer('feature', {
        features: ['quad.image'],
        autoshareRenderer: false,
      });
      this.quads = this.featureLayer.createFeature('quad');
      this.featureLayer.opacity(this.opacity / 100.0);
      this.visible = true;
    }
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    if (this.featureLayer) {
      this.featureLayer.opacity(this.opacity / 100.0);
    }
  }

  private frameScale() {
    const [frameWidth, frameHeight] = this.annotator.frameSize.value;
    return { frameWidth, frameHeight, sizeKey: `${frameWidth}x${frameHeight}` };
  }

  private maskDatum(mask: CroppedMask, sizeKey: string, frameWidth: number, frameHeight: number) {
    const cached = this.datums.get(mask.data);
    if (cached && cached.sizeKey === sizeKey) {
      return cached.datum;
    }
    // Mask pixels -> frame coordinates (masks may differ from the media size)
    const sx = frameWidth / (mask.frameWidth || frameWidth);
    const sy = frameHeight / (mask.frameHeight || frameHeight);
    const datum: QuadDatum = {
      ul: { x: mask.x * sx, y: mask.y * sy },
      lr: { x: (mask.x + mask.width) * sx, y: (mask.y + mask.height) * sy },
      texture: {
        width: mask.width, height: mask.height, data: mask.data, type: 'RGBA',
      },
    };
    this.datums.set(mask.data, { sizeKey, datum });
    maskPerf.count('layer.newTextures');
    return datum;
  }

  /**
   * Show exactly these masks, drawn in the given order (last on top).
   */
  setMasks(items: MaskLayerItem[]) {
    const { frameWidth, frameHeight, sizeKey } = this.frameScale();
    const data = items
      .filter((item) => item.mask.width > 0 && item.mask.height > 0)
      .map((item) => this.maskDatum(item.mask, sizeKey, frameWidth, frameHeight));
    this.render(data);
  }

  /**
   * Legacy PNG mask path (`useRLE` false): tint each white mask image with
   * its color on a canvas, cached per image and color.
   */
  setImages(items: { trackId: number; image: HTMLImageElement; color: string }[]) {
    const { frameWidth, frameHeight, sizeKey } = this.frameScale();
    const data = items.map(({ image, color }) => {
      let byColor = this.imageDatums.get(image);
      if (!byColor) {
        byColor = new Map();
        this.imageDatums.set(image, byColor);
      }
      const cached = byColor.get(color);
      if (cached && cached.sizeKey === sizeKey) {
        return cached.datum;
      }
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(image, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const datum: QuadDatum = {
        ul: { x: 0, y: 0 },
        lr: { x: frameWidth, y: frameHeight },
        image: canvas,
      };
      byColor.set(color, { sizeKey, datum });
      return datum;
    });
    this.render(data);
  }

  private render(data: QuadDatum[]) {
    if (!data.length) {
      this.disable();
      return;
    }
    this.ensureLayer();
    const unchanged = data.length === this.lastData.length
      && data.every((datum, i) => datum === this.lastData[i]);
    if (!unchanged) {
      this.quads.data(data).draw();
      this.lastData = data;
    }
    if (!this.visible) {
      this.featureLayer.visible(true);
      this.visible = true;
    }
  }

  disable() {
    if (this.featureLayer && this.visible) {
      this.featureLayer.visible(false);
      this.visible = false;
    }
  }
}
