/**
 * Shared 2D context for measuring label text. Layers measure text while formatting every
 * frame, and creating a canvas and context for each track on each frame adds up during
 * playback. Callers must set `font` before measuring, since the context is shared.
 */
let measureContext: CanvasRenderingContext2D | null = null;

export function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureContext) {
    // Not cached when unavailable (e.g. jsdom), so a later call can still get one
    measureContext = document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

const lineHeightCache = new Map<string, number>();

/**
 * Line height for a font: the ascent of 'A!' plus 30%. Cached per font string, since it
 * only depends on the font. Returns `fallback` when no canvas context is available.
 */
export function getLineHeight(font: string, fallback: number): number {
  const cached = lineHeightCache.get(font);
  if (cached !== undefined) {
    return cached;
  }
  const context = getMeasureContext();
  if (!context) {
    return fallback;
  }
  context.font = font;
  const lineHeight = context.measureText('A!').actualBoundingBoxAscent * 1.30;
  lineHeightCache.set(font, lineHeight);
  return lineHeight;
}
