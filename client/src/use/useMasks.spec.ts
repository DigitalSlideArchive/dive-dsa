/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any, global-require, class-methods-use-this */
/// <reference types="jest" />
/*
 * `createMaskFromBinary` (used to store confirmed SAM masks): the mask is
 * registered locally before the upload so a render triggered by flagging
 * `hasMask` finds it, and a failed/empty upload rolls that registration back
 * and rejects — callers flag `hasMask` only after this resolves, so a
 * rejection must leave nothing behind that a later Save could point at.
 */
import Vue, {
  computed, ref, shallowRef,
} from 'vue';
// eslint-disable-next-line import/no-extraneous-dependencies
import { mount } from '@vue/test-utils';
import type { AggregateMediaController } from 'vue-media-annotator/components/annotators/mediaControllerType';
import type { Handler } from 'vue-media-annotator/provides';

const mockUploadMask = jest.fn();
const mockBinaryMaskToImage = jest.fn();
/** The last binary mask handed to `binaryMaskToImage`, for canvas stubs. */
let mockMaskImage: { data: Uint8Array; width: number; height: number } | null = null;

jest.mock('platform/web-girder/api/annotation.service', () => ({
  getRLEMaskData: jest.fn(async () => ({ data: {} })),
  uploadMask: (folderId: string, trackId: number, frameId: number, blob: Blob) => mockUploadMask(folderId, trackId, frameId, blob),
  deleteMask: jest.fn(async () => undefined),
}));

// The worker construction (import.meta) and worker pool cannot run under
// Jest's CommonJS transform; the RLE encode/decode path stays real.
jest.mock('./rleWorkerFactory', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null,
  })),
}));
jest.mock('./usePreloadWorkers', () => ({
  createRLEPreloader: () => ({ preloadRLEMasks: jest.fn(), clearQueue: jest.fn() }),
}));
jest.mock('./rle', () => {
  const actual = jest.requireActual('./rle');
  return {
    ...actual,
    binaryMaskToImage: (data: Uint8Array, width: number, height: number) => mockBinaryMaskToImage(data, width, height),
  };
});

/* Canvas plumbing for `getMaskBlobAndBoundsFromImage`, which jsdom lacks. */
function stubCanvas() {
  const rgbaFromMask = (width: number, height: number) => {
    const data = new Uint8ClampedArray(width * height * 4);
    if (mockMaskImage) {
      mockMaskImage.data.forEach((value, i) => {
        if (value) data[i * 4 + 3] = 255;
      });
    }
    return { data, width, height };
  };
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    drawImage: jest.fn(),
    putImageData: jest.fn(),
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4), width, height,
    }),
    getImageData: (x: number, y: number, width: number, height: number) => rgbaFromMask(width, height),
  })) as never;
  HTMLCanvasElement.prototype.toBlob = jest.fn((cb: (b: Blob | null) => void) => {
    cb(new Blob(['mask'], { type: 'image/png' }));
  }) as never;
  (globalThis as any).createImageBitmap = jest.fn(async () => ({
    width: mockMaskImage?.width ?? 0,
    height: mockMaskImage?.height ?? 0,
  }));
  (globalThis as any).OffscreenCanvas = class {
    width: number;

    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return {
        drawImage: jest.fn(),
        getImageData: (x: number, y: number, width: number, height: number) => rgbaFromMask(width, height),
      };
    }
  };
}

// Imported after the mocks/worker stub above are registered.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const useMasks = require('./useMasks').default as typeof import('./useMasks').default;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// 4x2 mask covering columns 1-2 of both rows (row-major).
const maskData = new Uint8Array([0, 1, 1, 0, 0, 1, 1, 0]);
const mask = { data: maskData, width: 4, height: 2 };

function setup(visibleMaskIds: number[] = []) {
  const handler = {
    updateRectBounds: jest.fn(),
    trackSelect: jest.fn(),
    save: jest.fn(),
    removeAnnotation: jest.fn(),
  } as unknown as Handler;
  const aggregateController = shallowRef({
    playing: ref(false),
  } as unknown as AggregateMediaController);
  let api!: ReturnType<typeof useMasks>;
  const wrapper = mount(Vue.extend({
    setup() {
      api = useMasks(
        ref(0),
        ref(0),
        ref('dataset-id'),
        handler,
        computed(() => false),
        ref(visibleMaskIds),
        aggregateController,
        ref(null),
      );
      return {};
    },
    render(h) { return h('div'); },
  }));
  return { api, wrapper };
}

beforeEach(() => {
  stubCanvas();
  mockUploadMask.mockReset();
  mockMaskImage = null;
  mockBinaryMaskToImage.mockReset();
  mockBinaryMaskToImage.mockImplementation(async (data: Uint8Array, width: number, height: number) => {
    mockMaskImage = { data, width, height };
    return { width, height } as HTMLImageElement;
  });
});

afterEach(() => {
  // `useRLE` is module-level state shared between instances.
  setup().api.editorOptions.useRLE.value = true;
});

it('registers the RLE mask locally before the upload and keeps it after', async () => {
  const { api } = setup();
  let resolveUpload!: () => void;
  mockUploadMask.mockImplementation(() => new Promise<void>((resolve) => { resolveUpload = resolve; }));
  const pending = api.editorFunctions.createMaskFromBinary(7, 3, mask);
  // Registered synchronously, before any await: flagging `hasMask` right
  // after confirming triggers a render that must already find the mask.
  expect(api.getRLEMask(7, 3)).toEqual({
    rle: { size: [2, 4], counts: expect.any(String) },
    file_name: '7_3.png',
  });
  const decoded = api.getRLELuminanceMask(7, 3);
  expect(decoded?.width).toBe(4);
  expect(decoded?.height).toBe(2);
  expect(Array.from(decoded!.data.filter((_, i) => i % 2 === 0))).toEqual(
    Array.from(maskData, (v) => (v ? 255 : 0)),
  );
  await flush();
  expect(mockUploadMask).toHaveBeenCalledWith('dataset-id', 7, 3, expect.any(Blob));
  resolveUpload();
  await pending;
  expect(api.getRLEMask(7, 3)).toBeDefined();
  expect(api.editorOptions.loadingFrame.value).toBe(false);
});

it('rolls back the local registration and rejects when the upload fails', async () => {
  const { api } = setup([7]);
  mockUploadMask.mockRejectedValue(new Error('upload failed'));
  await expect(api.editorFunctions.createMaskFromBinary(7, 3, mask)).rejects.toThrow('upload failed');
  // Nothing left behind for a `hasMask` flag (or a Save) to point at.
  expect(api.getRLEMask(7, 3)).toBeUndefined();
  expect(api.getRLELuminanceMask(7, 3)).toBeUndefined();
  expect(api.editorOptions.maskWarningMessage.value).toContain('Missing RLE mask for track 7, frame 3');
  expect(api.editorOptions.hasMasks.value).toBe(false);
  expect(api.editorOptions.loadingFrame.value).toBe(false);
});

it('rejects an empty mask without uploading or registering anything', async () => {
  const { api } = setup();
  const empty = { data: new Uint8Array(8), width: 4, height: 2 };
  await expect(api.editorFunctions.createMaskFromBinary(7, 3, empty)).rejects.toThrow('empty');
  expect(mockUploadMask).not.toHaveBeenCalled();
  expect(api.getRLEMask(7, 3)).toBeUndefined();
});

it('rolls back the cached image and rejects on upload failure without RLE', async () => {
  const { api } = setup();
  api.editorOptions.useRLE.value = false;
  mockUploadMask.mockResolvedValueOnce(undefined);
  await api.editorFunctions.createMaskFromBinary(7, 3, mask);
  expect(api.getMask(7, 3)).toEqual(expect.objectContaining({ width: 4, height: 2 }));
  mockUploadMask.mockRejectedValueOnce(new Error('upload failed'));
  await expect(api.editorFunctions.createMaskFromBinary(7, 4, mask)).rejects.toThrow('upload failed');
  expect(api.getMask(7, 4)).toBeUndefined();
});
