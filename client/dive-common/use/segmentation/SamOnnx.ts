/**
 * Browser SAM2 point-prompt segmentation through transformers.js / ONNX Runtime Web.
 *
 * The model is downloaded from the Hugging Face Hub (or VUE_APP_SAM_MODEL_HOST)
 * on first use and kept in the browser Cache API, so later sessions load it
 * from disk. Each frame is encoded once; further clicks on the same frame only
 * run the small prompt decoder.
 */
import loadTransformers from './transformersLoader';
import type {
  SamModelInstance, SamProcessor, SamProgressInfo, SamTensor, TransformersModule,
} from './samTypes';
import type { SegmentationPredictRequest, SegmentationPredictResponse } from './types';
import { maskGeometry } from './maskGeometry';
import { samPostprocess } from './samPostprocess';

import {
  SAM_LABELS, SAM_MODELS, SamDevicePreference, SamModel,
} from './samModels';

import { navigatorGpu, samDevices, SamDevice } from './samDevices';

export * from './samModels';
export * from './samDevices';

/** RGBA pixel source (ImageData satisfies this). */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** UI phases: download is determinate; prepare/encode/predict are indeterminate. */
export type SamLoadPhase = 'download' | 'prepare' | 'encode' | 'predict';
export interface SamModelProgress {
  phase: SamLoadPhase;
  /** Present only while aggregating Hugging Face file downloads. */
  percent?: number;
  /** Runtime actually used for this status update (preference may differ under auto). */
  device?: 'gpu' | 'cpu';
}
export type SamStatusCallback = (message: string | null, progress?: SamModelProgress) => void;

type EncodedFrame = {
  embeddings: Record<string, SamTensor>;
  original: [number, number][];
  reshaped: [number, number][];
  padded: [number, number];
};

type FileBytes = { loaded: number; total: number };

/** Mask components smaller than this fraction of the largest are dropped as speckles. */
const MIN_COMPONENT_FRACTION = 0.01;

/** Encoded frames kept for quick re-prompting (current frame plus one neighbor). */
const FRAME_CACHE_SIZE = 2;

/** Aggregate per-file download bytes into a 0–100 download percent. */
export function samDownloadPercent(files: Iterable<FileBytes>): number {
  let loaded = 0;
  let total = 0;
  Array.from(files).forEach((file) => {
    loaded += file.loaded;
    total += file.total;
  });
  return total > 0 ? Math.min(100, (100 * loaded) / total) : 0;
}

/**
 * Transformers.js forces `wasm.proxy = false` on import. Re-enable it for CPU
 * so encode/decode run in ORT's worker and the UI thread keeps painting.
 * WebGPU cannot use the proxy worker, and once ORT has initialized WASM on the
 * main thread (any WebGPU session) the proxy can never be created, so callers
 * pass allowProxy=false after that happens.
 */
export function configureSamOrtProxy(
  device: SamDevice,
  onnxEnv: { wasm?: { proxy?: boolean } } | undefined,
  allowProxy = true,
) {
  const wasm = onnxEnv?.wasm;
  if (wasm) wasm.proxy = device === 'wasm' && allowProxy;
}

/** ORT surfaces this when wasm.proxy=true after WASM already initialized without a worker. */
export function isOrtProxyWorkerError(err: unknown): boolean {
  const text = String(err);
  return text.includes('worker not ready') || text.includes('no available backend');
}

/** Let Vue paint status/spinner before a long synchronous stretch of work. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { setTimeout(resolve, 0); });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Decoder outputs are float32 for the published exports; widen anything else. */
function toFloat32(data: unknown): Float32Array {
  if (data instanceof Float32Array) return data;
  if (ArrayBuffer.isView(data)) return Float32Array.from(data as unknown as ArrayLike<number>);
  throw new Error('Unexpected SAM output tensor type.');
}

function validPrompts(points: number[][], labels: number[]) {
  return points.length > 0 && points.length === labels.length
    && points.every((p) => p.length === 2 && p.every((v) => Number.isFinite(v)))
    && labels.every((label) => label === 0 || label === 1);
}

/** One lazily loaded model and a small cache of encoded frames. Work is
 * serialized: switching models cannot release a session inference is using. */
export default class SamOnnx {
  private model: SamModelInstance | null = null;

  private processor: SamProcessor | null = null;

  private kind: SamModel = 'sam2';

  private devicePreference: SamDevicePreference = 'auto';

  private loadedDevice: SamDevice | null = null;

  /** False after any WebGPU attempt: ORT WASM is then stuck on the main thread. */
  private allowOrtWasmProxy = true;

  private version = 0;

  private queue: Promise<unknown> = Promise.resolve();

  private frames = new Map<string, EncodedFrame>();

  constructor(
    private onStatus: SamStatusCallback = () => { /* no status display */ },
    private loader: () => Promise<TransformersModule> = loadTransformers,
  ) { /* Lazily initialized. */ }

  get loaded(): boolean {
    return this.model !== null;
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => { /* reported to the caller */ });
    return result;
  }

  private clearFrames() {
    this.frames.forEach((frame) => Object.values(frame.embeddings).forEach((tensor) => tensor.dispose()));
    this.frames.clear();
  }

  setModel(kind: SamModel): Promise<void> {
    if (kind === this.kind) return Promise.resolve();
    this.kind = kind;
    return this.dispose();
  }

  setDevice(preference: SamDevicePreference): Promise<void> {
    if (preference === this.devicePreference) return Promise.resolve();
    this.devicePreference = preference;
    return this.dispose();
  }

  /** Forget the encoding for one frame key (e.g. after the image changed). */
  forgetFrame(key: string): Promise<void> {
    return this.run(async () => {
      const frame = this.frames.get(key);
      if (frame) {
        Object.values(frame.embeddings).forEach((tensor) => tensor.dispose());
        this.frames.delete(key);
      }
    });
  }

  dispose(): Promise<void> {
    this.version += 1;
    return this.run(async () => {
      this.clearFrames();
      const { model } = this;
      this.model = null;
      this.processor = null;
      this.loadedDevice = null;
      await model?.dispose();
    });
  }

  private async load() {
    if (this.model) return;
    const transformers = await this.loader();
    const { env } = transformers;
    // Replaced at build time (vite `define`), so read it as written.
    const host = process.env.VUE_APP_SAM_MODEL_HOST;
    if (host) env.remoteHost = host.endsWith('/') ? host : `${host}/`;
    env.allowLocalModels = false;
    const id = SAM_MODELS[this.kind];
    const label = SAM_LABELS[this.kind];
    const devices = await samDevices(navigatorGpu(), this.devicePreference);
    let lastError: unknown;
    const release = async () => {
      const failed = this.model as SamModelInstance | null;
      this.model = null;
      this.processor = null;
      this.loadedDevice = null;
      await failed?.dispose();
    };
    try {
      // Providers must be tried sequentially; release a failed session first.
      for (let i = 0; i < devices.length; i += 1) {
        const device = devices[i];
        // WebGPU initializes WASM on the main thread; proxy can never be enabled after that.
        if (device === 'webgpu') this.allowOrtWasmProxy = false;
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.loadOnDevice(transformers, id, label, device);
          return;
        } catch (err) {
          // eslint-disable-next-line no-await-in-loop
          await release();
          lastError = err;
          // GPU->CPU after a prior WebGPU session: the ORT proxy worker was never created.
          if (device === 'wasm' && this.allowOrtWasmProxy && isOrtProxyWorkerError(err)) {
            this.allowOrtWasmProxy = false;
            try {
              // eslint-disable-next-line no-await-in-loop
              await this.loadOnDevice(transformers, id, label, device);
              return;
            } catch (retryErr) {
              // eslint-disable-next-line no-await-in-loop
              await release();
              lastError = retryErr;
            }
          }
        }
      }
      throw new Error(`Could not load ${label}: ${String(lastError)}`);
    } finally { this.onStatus(null); }
  }

  private async loadOnDevice(
    transformers: TransformersModule,
    id: string,
    label: string,
    device: SamDevice,
  ) {
    const onnxEnv = transformers.env.backends.onnx;
    configureSamOrtProxy(device, onnxEnv, this.allowOrtWasmProxy);
    const runtime: 'gpu' | 'cpu' = device === 'webgpu' ? 'gpu' : 'cpu';
    const deviceLabel = runtime.toUpperCase();
    // Cache hits report 100% immediately; prepare covers the silent session compile.
    this.onStatus(`Downloading ${label}…`, { phase: 'download', percent: 0, device: runtime });
    await yieldToUi();
    const files = new Map<string, FileBytes>();
    let sawTotal = false;
    let prepared = false;
    const prepare = () => {
      if (prepared) return;
      prepared = true;
      this.onStatus(`Preparing ${label} (${deviceLabel})…`, { phase: 'prepare', device: runtime });
    };
    const reportDownload = (percent: number) => {
      if (prepared) return;
      this.onStatus(`Downloading ${label}…`, {
        phase: 'download',
        percent: Math.min(100, Math.round(percent)),
        device: runtime,
      });
      if (percent >= 100) prepare();
    };
    // WASM compiles with little or no download progress once files are cached.
    const prepareSoon = setTimeout(prepare, device === 'wasm' ? 300 : 5000);
    try {
      this.model = await transformers.Sam2Model.from_pretrained(id, {
        device,
        dtype: 'q4',
        progress_callback: (info: SamProgressInfo) => {
          if (info.status === 'progress_total') {
            sawTotal = true;
            reportDownload(info.progress ?? 0);
          } else if (info.status === 'progress' && !sawTotal && info.file != null
            && info.loaded != null && info.total != null) {
            files.set(info.file, { loaded: info.loaded, total: info.total });
            reportDownload(samDownloadPercent(files.values()));
          }
        },
      });
    } finally {
      clearTimeout(prepareSoon);
    }
    prepare();
    this.processor = await transformers.AutoProcessor.from_pretrained(id);
    this.loadedDevice = device;
  }

  /** Download (or read from cache) and compile the model. */
  ready(): Promise<void> { return this.run(() => this.load()); }

  /**
   * Segment a frame from point prompts.
   * @param key identifies the frame; its image encoding is reused for later clicks
   * @param image the frame's pixels, or a getter only called when `key` is not encoded yet
   */
  predict(
    key: string,
    image: RgbaImage | (() => RgbaImage | Promise<RgbaImage>),
    request: SegmentationPredictRequest,
  ): Promise<SegmentationPredictResponse> {
    const { version } = this;
    // Copy the prompts: the recipe may receive another click while queued.
    const points = request.points.map((p) => [...p]);
    const labels = [...request.pointLabels];
    return this.run(async () => {
      if (version !== this.version) throw new Error('Segmentation model changed.');
      if (!validPrompts(points, labels)) throw new Error('Invalid segmentation prompts.');
      await this.load();
      const transformers = await this.loader();
      if (this.loadedDevice) {
        configureSamOrtProxy(this.loadedDevice, transformers.env.backends.onnx, this.allowOrtWasmProxy);
      }
      const processor = this.processor as SamProcessor;
      const model = this.model as SamModelInstance;
      let frame = this.frames.get(key);
      const runtime: 'gpu' | 'cpu' = this.loadedDevice === 'wasm' ? 'cpu' : 'gpu';
      try {
        if (!frame) {
          const pixels = typeof image === 'function' ? await image() : image;
          if (pixels.data.length !== pixels.width * pixels.height * 4) throw new Error('Invalid image data.');
          this.onStatus(
            runtime === 'cpu' ? 'Encoding image on CPU (this can take a while)…' : 'Encoding image…',
            { phase: 'encode', device: runtime },
          );
          await yieldToUi();
          const inputs = await processor(new transformers.RawImage(pixels.data, pixels.width, pixels.height, 4));
          try {
            frame = {
              embeddings: await model.get_image_embeddings(inputs),
              original: inputs.original_sizes,
              reshaped: inputs.reshaped_input_sizes,
              padded: [inputs.pixel_values.dims[2], inputs.pixel_values.dims[3]],
            };
          } finally { inputs.pixel_values.dispose(); }
          if (this.frames.size >= FRAME_CACHE_SIZE) {
            const oldest = this.frames.keys().next().value as string;
            Object.values((this.frames.get(oldest) as EncodedFrame).embeddings).forEach((tensor) => tensor.dispose());
            this.frames.delete(oldest);
          }
          this.frames.set(key, frame);
        }
        this.onStatus(
          runtime === 'cpu' ? 'Computing segmentation on CPU…' : 'Computing segmentation…',
          { phase: 'predict', device: runtime },
        );
        await yieldToUi();
        const promptInputs: Record<string, SamTensor> = {
          input_points: processor.reshape_input_points([[points]], frame.original, frame.reshaped),
          input_labels: new transformers.Tensor('int64', BigInt64Array.from(labels, (l) => BigInt(l)), [1, 1, points.length]),
        };
        try {
          const output = await model({ ...frame.embeddings, ...promptInputs });
          try {
            const { mask, score } = samPostprocess(
              { data: toFloat32(output.pred_masks.data), dims: output.pred_masks.dims },
              { data: toFloat32(output.iou_scores.data) },
              frame.original[0],
              frame.reshaped[0],
              frame.padded,
            );
            if (version !== this.version) throw new Error('Segmentation model changed.');
            const [height, width] = frame.original[0];
            const geometry = maskGeometry(mask, width, height, request.polygonPoints, MIN_COMPONENT_FRACTION);
            // Mask output keeps the traced polygons for previewing; the
            // binary mask itself is what confirming will store.
            return request.outputMode === 'mask' && geometry.success
              ? { ...geometry, score, mask: { data: mask, width, height } }
              : { ...geometry, score };
          } finally {
            output.pred_masks.dispose();
            output.iou_scores.dispose();
            output.object_score_logits?.dispose();
          }
        } finally { Object.values(promptInputs).forEach((tensor) => tensor.dispose()); }
      } finally {
        this.onStatus(null);
      }
    });
  }
}
