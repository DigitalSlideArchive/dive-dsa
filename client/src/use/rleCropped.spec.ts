/// <reference types="jest" />
import {
  binaryMaskToCropped, CroppedMask, DataArray, decode, decodeRLECropped, encode, recolorCropped,
} from './rle';

/** Deterministic PRNG so failures reproduce */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Random row-major mask: a few filled ellipses plus speckle */
function randomMask(width: number, height: number, rand: () => number) {
  const mask = new Uint8Array(width * height);
  const blobs = Math.floor(rand() * 4);
  for (let b = 0; b < blobs; b += 1) {
    const cx = rand() * width;
    const cy = rand() * height;
    const rx = 1 + rand() * width * 0.3;
    const ry = 1 + rand() * height * 0.3;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2 <= 1) mask[row * width + col] = 1;
      }
    }
  }
  const speckle = Math.floor(rand() * 5);
  for (let i = 0; i < speckle; i += 1) {
    mask[Math.floor(rand() * width * height)] = 1;
  }
  return mask;
}

function toCoco(mask: Uint8Array, width: number, height: number) {
  const coco = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      coco[col * height + row] = mask[row * width + col];
    }
  }
  return coco;
}

/** Reference: full decode, then crop, as RGBA */
function referenceCrop(rleMask: Uint8Array, width: number, height: number, rgb: number[]) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let col = 0; col < width; col += 1) {
    for (let row = 0; row < height; row += 1) {
      if (rleMask[col * height + row]) {
        minX = Math.min(minX, col); maxX = Math.max(maxX, col);
        minY = Math.min(minY, row); maxY = Math.max(maxY, row);
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const data = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      if (rleMask[(col + minX) * height + (row + minY)]) {
        data.set([...rgb, 255], (row * w + col) * 4);
      }
    }
  }
  return {
    x: minX, y: minY, width: w, height: h, data,
  };
}

/** Pixels outside the reported box must all be empty in the reference. */
function expectMatches(actual: CroppedMask, rleMask: Uint8Array, width: number, height: number) {
  const ref = referenceCrop(rleMask, width, height, [0x12, 0x34, 0x56]);
  if (!ref) {
    expect(actual.width).toBe(0);
    expect(actual.height).toBe(0);
    return;
  }
  // COCO's bbox may be looser (whole column height when a run wraps a
  // column), so compare every pixel of the actual crop against the frame.
  expect(actual.x).toBeLessThanOrEqual(ref.x);
  expect(actual.y).toBeLessThanOrEqual(ref.y);
  expect(actual.x + actual.width).toBeGreaterThanOrEqual(ref.x + ref.width);
  expect(actual.y + actual.height).toBeGreaterThanOrEqual(ref.y + ref.height);
  for (let row = 0; row < actual.height; row += 1) {
    for (let col = 0; col < actual.width; col += 1) {
      const on = rleMask[(col + actual.x) * height + (row + actual.y)];
      const px = Array.from(actual.data.slice((row * actual.width + col) * 4, (row * actual.width + col + 1) * 4));
      expect(px).toEqual(on ? [0x12, 0x34, 0x56, 255] : [0, 0, 0, 0]);
    }
  }
}

describe('decodeRLECropped', () => {
  it('matches decode() + crop for random masks', () => {
    const rand = rng(42);
    for (let i = 0; i < 60; i += 1) {
      const width = 1 + Math.floor(rand() * 48);
      const height = 1 + Math.floor(rand() * 48);
      const mask = randomMask(width, height, rand);
      const [rleObj] = encode(new DataArray(toCoco(mask, width, height), [height, width, 1]));
      const full = decode([rleObj]).data;
      const cropped = decodeRLECropped(rleObj, '#123456');
      expect(cropped.frameWidth).toBe(width);
      expect(cropped.frameHeight).toBe(height);
      expectMatches(cropped, full, width, height);
    }
  });

  it('returns an empty crop for an empty mask', () => {
    const [rleObj] = encode(new DataArray(new Uint8Array(12), [3, 4, 1]));
    const cropped = decodeRLECropped(rleObj, '#ffffff');
    expect(cropped.width).toBe(0);
    expect(cropped.data.length).toBe(0);
  });
});

describe('binaryMaskToCropped', () => {
  it('crops a row-major mask tightly and bakes the color in', () => {
    const rand = rng(7);
    for (let i = 0; i < 30; i += 1) {
      const width = 1 + Math.floor(rand() * 40);
      const height = 1 + Math.floor(rand() * 40);
      const mask = randomMask(width, height, rand);
      const cropped = binaryMaskToCropped(mask, width, height, '#123456');
      const ref = referenceCrop(toCoco(mask, width, height), width, height, [0x12, 0x34, 0x56]);
      if (!ref) {
        expect(cropped.width).toBe(0);
      } else {
        expect([cropped.x, cropped.y, cropped.width, cropped.height])
          .toEqual([ref.x, ref.y, ref.width, ref.height]);
        expect(Array.from(cropped.data)).toEqual(Array.from(ref.data));
      }
    }
  });
});

describe('recolorCropped', () => {
  it('changes only mask pixels and returns a new buffer', () => {
    const mask = new Uint8Array([1, 0, 1, 1]);
    const red = binaryMaskToCropped(mask, 2, 2, '#ff0000');
    const blue = recolorCropped(red, '#0000ff');
    expect(blue.data).not.toBe(red.data);
    expect(Array.from(blue.data)).toEqual([
      0, 0, 255, 255, 0, 0, 0, 0,
      0, 0, 255, 255, 0, 0, 255, 255,
    ]);
  });
});
