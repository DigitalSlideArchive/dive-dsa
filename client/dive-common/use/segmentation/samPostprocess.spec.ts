/// <reference types="jest" />
import { bestCandidate, samPostprocess } from './samPostprocess';

const scores = (...values: number[]) => ({ data: new Float32Array(values) });

describe('samPostprocess', () => {
  it('selects the highest-scoring candidate, first on ties', () => {
    expect(bestCandidate(new Float32Array([0.1, 0.9, 0.3]))).toBe(1);
    expect(bestCandidate(new Float32Array([0.5, 0.5]))).toBe(0);
  });

  it('thresholds the chosen candidate at the original size', () => {
    const logits = new Float32Array(3 * 8 * 8).fill(-1);
    for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) logits[64 + y * 8 + x] = 1;
    const { mask, score } = samPostprocess(
      { data: logits, dims: [1, 1, 3, 8, 8] },
      scores(0.1, 0.9, 0.3),
      [8, 8],
      [8, 8],
      [8, 8],
    );
    expect(score).toBeCloseTo(0.9);
    expect(mask.reduce((sum, v) => sum + v, 0)).toBe(16);
    expect(mask[2 * 8 + 2]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it('ignores the padded region of the model input', () => {
    // 4x4 low-res logits; only the bottom (padding) rows are positive.
    const logits = new Float32Array(16).fill(-1);
    logits.fill(1, 8);
    const { mask } = samPostprocess(
      { data: logits, dims: [1, 1, 1, 4, 4] },
      scores(0.5),
      [3, 7],
      [2, 4],
      [4, 4],
    );
    expect(mask).toEqual(new Uint8Array(21));
  });

  it('upsamples low-resolution logits to a larger image', () => {
    // Left half positive in a 2x2 grid -> left half of a 10x6 image.
    const logits = new Float32Array([1, -1, 1, -1]);
    const { mask } = samPostprocess(
      { data: logits, dims: [1, 1, 1, 2, 2] },
      scores(1),
      [6, 10],
      [6, 10],
      [6, 10],
    );
    for (let y = 0; y < 6; y += 1) {
      expect(Array.from(mask.slice(y * 10, y * 10 + 10))).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    }
  });

  it('treats zero as background', () => {
    const { mask } = samPostprocess(
      { data: new Float32Array([0, 1, 1, 1]), dims: [1, 1, 1, 2, 2] },
      scores(1),
      [2, 2],
      [2, 2],
      [2, 2],
    );
    expect(Array.from(mask)).toEqual([0, 1, 1, 1]);
  });

  it('rejects malformed tensors and sizes', () => {
    const logits = { data: new Float32Array(4), dims: [1, 1, 1, 2, 2] };
    expect(() => samPostprocess(logits, scores(1, 2), [2, 2], [2, 2], [2, 2])).toThrow('Invalid SAM');
    expect(() => samPostprocess(logits, scores(1), [2, 2], [3, 2], [2, 2])).toThrow('Invalid SAM');
    expect(() => samPostprocess(logits, scores(1), [0, 2], [2, 2], [2, 2])).toThrow('Invalid SAM');
    expect(() => samPostprocess({ data: new Float32Array(3), dims: [1, 1, 1, 2, 2] }, scores(1), [2, 2], [2, 2], [2, 2]))
      .toThrow('Invalid SAM');
  });
});
