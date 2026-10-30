/// <reference types="jest" />
import SamOnnx, {
  SAM_MODELS, configureSamOrtProxy, isOrtProxyWorkerError, samDevices, samDownloadPercent,
} from './SamOnnx';
import type { SamModelProgress } from './SamOnnx';
import type { SamProgressInfo, TransformersModule } from './samTypes';

class FakeTensor {
  dispose = jest.fn();

  constructor(public type: string, public data: unknown, public dims: number[]) { /* Test tensor. */ }
}

/** 8x8 image; the "decoder" returns a 4x4 square of positive logits on candidate 1. */
function fakeTransformers() {
  const encode = jest.fn(async () => ({ image_embeddings: new FakeTensor('float32', new Float32Array(1), [1]) }));
  const decode = jest.fn();
  const dispose = jest.fn(async () => undefined);
  const logits = new Float32Array(3 * 8 * 8).fill(-1);
  for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) logits[64 + y * 8 + x] = 1;
  const makeModel = () => Object.assign(async (inputs: Record<string, FakeTensor>) => {
    decode(inputs);
    return {
      pred_masks: new FakeTensor('float32', logits, [1, 1, 3, 8, 8]),
      iou_scores: new FakeTensor('float32', new Float32Array([0.1, 0.9, 0.3]), [1, 1, 3]),
    };
  }, { get_image_embeddings: encode, dispose });
  const processor = Object.assign(async () => ({
    pixel_values: new FakeTensor('float32', new Float32Array(1), [1, 3, 8, 8]),
    original_sizes: [[8, 8]],
    reshaped_input_sizes: [[8, 8]],
  }), {
    reshape_input_points: jest.fn(() => new FakeTensor('float32', new Float32Array(2), [1, 1, 1, 2])),
  });
  type LoadOptions = { progress_callback?: (info: SamProgressInfo) => void };
  const fromPretrained = jest.fn<Promise<unknown>, [string, LoadOptions?]>(async () => makeModel());
  const onnx = { wasm: { proxy: false as boolean } };
  const module = {
    Sam2Model: { from_pretrained: fromPretrained },
    AutoProcessor: { from_pretrained: async () => processor },
    RawImage: jest.fn(),
    Tensor: FakeTensor,
    env: {
      remoteHost: 'https://huggingface.co/', allowLocalModels: true, useBrowserCache: true, backends: { onnx },
    },
  } as unknown as TransformersModule;
  return {
    module, encode, decode, dispose, fromPretrained, makeModel, onnx, processor,
  };
}

const image = { data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 };
const request = { points: [[4, 4]] as [number, number][], pointLabels: [1] };

function setup(onStatus?: ConstructorParameters<typeof SamOnnx>[0]) {
  const fake = fakeTransformers();
  const sam = new SamOnnx(onStatus, async () => fake.module);
  return { sam, ...fake };
}

describe('device selection', () => {
  it('uses CPU for unavailable/software GPUs, and keeps CPU as a hardware-GPU fallback', async () => {
    expect(await samDevices()).toEqual(['wasm']);
    expect(await samDevices({ requestAdapter: async () => ({ info: { isFallbackAdapter: true } }) })).toEqual(['wasm']);
    expect(await samDevices({ requestAdapter: async () => ({ info: { isFallbackAdapter: false } }) })).toEqual(['webgpu', 'wasm']);
    expect(await samDevices({ requestAdapter: async () => { throw new Error('denied'); } })).toEqual(['wasm']);
  });

  it('honors an explicit CPU or GPU preference against hardware capability', async () => {
    const hardware = { requestAdapter: async () => ({ info: { isFallbackAdapter: false } }) };
    const software = { requestAdapter: async () => ({ info: { isFallbackAdapter: true } }) };
    expect(await samDevices(hardware, 'cpu')).toEqual(['wasm']);
    expect(await samDevices(hardware, 'gpu')).toEqual(['webgpu']);
    expect(await samDevices(hardware, 'auto')).toEqual(['webgpu', 'wasm']);
    expect(await samDevices(software, 'gpu')).toEqual(['wasm']);
  });

  it('enables the ORT wasm proxy only for CPU sessions when still allowed', () => {
    const onnx = { wasm: { proxy: false } };
    configureSamOrtProxy('wasm', onnx);
    expect(onnx.wasm.proxy).toBe(true);
    configureSamOrtProxy('webgpu', onnx);
    expect(onnx.wasm.proxy).toBe(false);
    configureSamOrtProxy('wasm', onnx, false);
    expect(onnx.wasm.proxy).toBe(false);
    expect(() => configureSamOrtProxy('wasm', undefined)).not.toThrow();
    expect(isOrtProxyWorkerError(new Error('no available backend found. ERR: [wasm] Error: worker not ready'))).toBe(true);
    expect(isOrtProxyWorkerError(new Error('unrelated'))).toBe(false);
  });
});

it('aggregates per-file download bytes into a percent', () => {
  expect(samDownloadPercent([{ loaded: 25, total: 100 }, { loaded: 50, total: 100 }])).toBe(37.5);
  expect(samDownloadPercent([])).toBe(0);
});

it('loads the tiny model with q4 weights and never looks for local model files', async () => {
  const { sam, fromPretrained, module } = setup();
  await sam.ready();
  expect(sam.loaded).toBe(true);
  expect(fromPretrained).toHaveBeenCalledWith(
    SAM_MODELS.sam2,
    expect.objectContaining({ device: 'wasm', dtype: 'q4' }),
  );
  expect(module.env.allowLocalModels).toBe(false);
  await sam.dispose();
  expect(sam.loaded).toBe(false);
});

it('segments a frame and reuses its encoding for later clicks', async () => {
  const { sam, encode, decode } = setup();
  const getImage = jest.fn(() => image);
  const first = await sam.predict('ds:cam:0', getImage, request);
  expect(first.success).toBe(true);
  expect(first.score).toBeCloseTo(0.9);
  expect(first.bounds).toEqual([2, 2, 6, 6]);
  expect(first.polygons).toHaveLength(1);
  await sam.predict('ds:cam:0', getImage, { points: [[4, 4], [0, 0]], pointLabels: [1, 0] });
  expect(encode).toHaveBeenCalledTimes(1);
  // The frame's pixels are only read when it needs encoding.
  expect(getImage).toHaveBeenCalledTimes(1);
  expect(decode.mock.calls[1][0].input_labels.data).toEqual(BigInt64Array.from([BigInt(1), BigInt(0)]));
  await sam.predict('ds:cam:1', image, request);
  expect(encode).toHaveBeenCalledTimes(2);
  await sam.dispose();
});

it('returns the binary mask only when mask output is requested', async () => {
  const { sam } = setup();
  const polygonResult = await sam.predict('f', image, request);
  expect(polygonResult.mask).toBeUndefined();
  const maskResult = await sam.predict('f', image, { ...request, outputMode: 'mask' });
  expect(maskResult.success).toBe(true);
  expect(maskResult.mask?.width).toBe(8);
  expect(maskResult.mask?.height).toBe(8);
  // The 4x4 square of positive logits at [2,6) x [2,6).
  expect(maskResult.mask?.data.filter((v) => v === 1)).toHaveLength(16);
  expect(maskResult.mask?.data[2 * 8 + 2]).toBe(1);
  expect(maskResult.mask?.data[0]).toBe(0);
  // Polygons/bounds are still returned alongside the mask (polygon mode, fallback).
  expect(maskResult.polygons).toHaveLength(1);
  expect(maskResult.bounds).toEqual([2, 2, 6, 6]);
  await sam.dispose();
});

it('evicts the oldest frame encoding beyond its small cache', async () => {
  const { sam, encode } = setup();
  await sam.predict('f0', image, request);
  await sam.predict('f1', image, request);
  await sam.predict('f2', image, request);
  await sam.predict('f0', image, request);
  expect(encode).toHaveBeenCalledTimes(4);
  await sam.dispose();
});

it('rejects invalid prompts and mismatched image data', async () => {
  const { sam } = setup();
  await expect(sam.predict('f', image, { points: [], pointLabels: [] })).rejects.toThrow('Invalid segmentation prompts');
  await expect(sam.predict('f', image, { points: [[1, 1]], pointLabels: [2] })).rejects.toThrow('Invalid segmentation prompts');
  await expect(sam.predict('f', { ...image, width: 9 }, request)).rejects.toThrow('Invalid image data');
  // A failed request does not wedge the queue.
  expect((await sam.predict('f', image, request)).success).toBe(true);
  await sam.dispose();
});

it('releases the previous model and embeddings when switching models', async () => {
  const {
    sam, fromPretrained, dispose, encode,
  } = setup();
  await sam.predict('f', image, request);
  await sam.setModel('sam2-small');
  await sam.predict('f', image, request);
  expect(fromPretrained.mock.calls.map(([id]) => id)).toEqual([SAM_MODELS.sam2, SAM_MODELS['sam2-small']]);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(encode).toHaveBeenCalledTimes(2);
  await sam.dispose();
});

it('discards a prediction when the model changes while it is queued', async () => {
  const { sam, encode } = setup();
  let finish!: (value: object) => void;
  encode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve as (value: object) => void; }));
  const pending = sam.predict('f', image, request);
  const rejected = expect(pending).rejects.toThrow('Segmentation model changed');
  while (!finish) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const switched = sam.setModel('sam2-small');
  finish({ image_embeddings: new FakeTensor('float32', new Float32Array(1), [1]) });
  await rejected;
  await switched;
});

it('retries a CPU load without the proxy when ORT reports the worker is not ready', async () => {
  const { sam, fromPretrained, onnx } = setup();
  await sam.setDevice('cpu');
  fromPretrained.mockImplementationOnce(async () => {
    throw new Error('no available backend found. ERR: [wasm] Error: worker not ready');
  });
  await sam.ready();
  expect(fromPretrained).toHaveBeenCalledTimes(2);
  expect(onnx.wasm.proxy).toBe(false);
  await sam.dispose();
});

it('reports a readable error when no device can load the model', async () => {
  const { sam, fromPretrained } = setup();
  fromPretrained.mockImplementation(async () => { throw new Error('network down'); });
  await expect(sam.ready()).rejects.toThrow('Could not load SAM2.1 Tiny: Error: network down');
});

it('reports download, prepare, encode and predict phases then clears the status', async () => {
  const updates: { message: string | null; progress?: SamModelProgress }[] = [];
  const { sam, fromPretrained, makeModel } = setup((message, progress) => updates.push({ message, progress }));
  fromPretrained.mockImplementationOnce(async (_id, options) => {
    options?.progress_callback?.({ status: 'progress_total', progress: 40 });
    options?.progress_callback?.({
      status: 'progress', file: 'a.onnx', loaded: 100, total: 100,
    });
    options?.progress_callback?.({ status: 'progress_total', progress: 100 });
    return makeModel();
  });
  await sam.predict('f', image, request);
  const phases = updates.map((u) => u.progress?.phase);
  expect(updates.filter((u) => u.progress?.phase === 'download').map((u) => u.progress?.percent)).toEqual([0, 40, 100]);
  expect(phases).toEqual(expect.arrayContaining(['prepare', 'encode', 'predict']));
  expect(updates.every((u) => !u.progress || u.progress.device === 'cpu')).toBe(true);
  expect(updates[updates.length - 1]).toEqual({ message: null, progress: undefined });
  await sam.dispose();
});

it('loads models from VUE_APP_SAM_MODEL_HOST when it is set', async () => {
  process.env.VUE_APP_SAM_MODEL_HOST = 'https://models.example.org';
  try {
    const { sam, module } = setup();
    await sam.ready();
    expect(module.env.remoteHost).toBe('https://models.example.org/');
    await sam.dispose();
  } finally {
    delete process.env.VUE_APP_SAM_MODEL_HOST;
  }
});
