/**
 * SAM mask post-processing in plain TypeScript.
 *
 * The decoder returns low-resolution logits (typically 256x256) for each
 * candidate mask, in the model's padded input frame. The reference pipeline
 * (transformers `post_process_masks`) upsamples to the padded size, crops the
 * padding, resizes to the original image and thresholds at zero. Here those
 * steps are folded into one bilinear lookup per output pixel, which keeps the
 * work proportional to the output image and needs no extra model or runtime.
 */

export interface LogitsTensor {
  data: Float32Array;
  /** [batch, pointBatch, candidates, height, width] */
  dims: readonly number[];
}

export interface ScoresTensor {
  data: Float32Array;
}

/** Index of the highest score; the first wins a tie. */
export function bestCandidate(scores: Float32Array): number {
  let best = 0;
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] > scores[best]) best = i;
  }
  return best;
}

/**
 * Per-output-index source sample positions for a chain of align_corners=false
 * resizes: output -> reshaped (the unpadded region of the padded frame) -> low-res.
 */
function axisSamples(outSize: number, reshaped: number, padded: number, lowRes: number) {
  const lo = new Int32Array(outSize);
  const hi = new Int32Array(outSize);
  const weight = new Float32Array(outSize);
  const toReshaped = reshaped / outSize;
  const toLowRes = lowRes / padded;
  for (let i = 0; i < outSize; i += 1) {
    const inReshaped = (i + 0.5) * toReshaped - 0.5;
    const inLowRes = Math.min(lowRes - 1, Math.max(0, (inReshaped + 0.5) * toLowRes - 0.5));
    const floor = Math.floor(inLowRes);
    lo[i] = floor;
    hi[i] = Math.min(lowRes - 1, floor + 1);
    weight[i] = inLowRes - floor;
  }
  return { lo, hi, weight };
}

/**
 * Choose the best-scoring candidate and produce a binary mask (1 = object)
 * at the original image size.
 * @param original [height, width] of the source image
 * @param reshaped [height, width] the image was resized to before padding
 * @param padded [height, width] of the padded model input
 */
export function samPostprocess(
  logits: LogitsTensor,
  scores: ScoresTensor,
  original: [number, number],
  reshaped: [number, number],
  padded: [number, number],
): { mask: Uint8Array; score: number } {
  const { dims } = logits;
  if (dims.length !== 5 || dims[0] !== 1 || dims[1] !== 1
    || dims[2] !== scores.data.length || !scores.data.length
    || [...original, ...reshaped, ...padded].some((v) => !Number.isInteger(v) || v <= 0)
    || reshaped[0] > padded[0] || reshaped[1] > padded[1]
    || logits.data.length !== dims[2] * dims[3] * dims[4]) {
    throw new Error('Invalid SAM mask output or image dimensions.');
  }
  const [, , , lowHeight, lowWidth] = dims;
  const candidate = bestCandidate(scores.data);
  const offset = candidate * lowHeight * lowWidth;
  const source = logits.data;
  const [height, width] = original;
  const xs = axisSamples(width, reshaped[1], padded[1], lowWidth);
  const ys = axisSamples(height, reshaped[0], padded[0], lowHeight);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const top = offset + ys.lo[y] * lowWidth;
    const bottom = offset + ys.hi[y] * lowWidth;
    const wy = ys.weight[y];
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const x0 = xs.lo[x]; const x1 = xs.hi[x]; const wx = xs.weight[x];
      const upper = source[top + x0] + (source[top + x1] - source[top + x0]) * wx;
      const lower = source[bottom + x0] + (source[bottom + x1] - source[bottom + x0]) * wx;
      if (upper + (lower - upper) * wy > 0) mask[row + x] = 1;
    }
  }
  return { mask, score: scores.data[candidate] };
}
