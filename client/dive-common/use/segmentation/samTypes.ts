/**
 * Minimal structural types for the parts of transformers.js the SAM runtime
 * uses (see transformersLoader.ts for why the package types are not used).
 */
export interface SamTensor {
  data: unknown;
  dims: number[];
  dispose(): void;
}

export interface SamProcessorInputs {
  pixel_values: SamTensor;
  original_sizes: [number, number][];
  reshaped_input_sizes: [number, number][];
}

export interface SamProcessor {
  (image: unknown): Promise<SamProcessorInputs>;
  reshape_input_points(
    points: number[][][][],
    originalSizes: [number, number][],
    reshapedSizes: [number, number][],
  ): SamTensor;
}

export interface SamModelOutput {
  pred_masks: SamTensor;
  iou_scores: SamTensor;
  object_score_logits?: SamTensor;
}

export interface SamModelInstance {
  (inputs: Record<string, SamTensor>): Promise<SamModelOutput>;
  get_image_embeddings(inputs: SamProcessorInputs): Promise<Record<string, SamTensor>>;
  dispose(): Promise<unknown>;
}

export interface SamProgressInfo {
  status: string;
  progress?: number;
  file?: string;
  loaded?: number;
  total?: number;
}

export interface Pretrained<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from_pretrained(id: string, options?: Record<string, any>): Promise<T>;
}

export interface TransformersEnv {
  remoteHost: string;
  allowLocalModels: boolean;
  useBrowserCache: boolean;
  backends: { onnx: { wasm?: { proxy?: boolean } } };
}

export interface TransformersModule {
  Sam2Model: Pretrained<SamModelInstance>;
  AutoProcessor: Pretrained<SamProcessor>;
  RawImage: new (data: Uint8ClampedArray | Uint8Array, width: number, height: number, channels: number) => unknown;
  Tensor: new (type: string, data: BigInt64Array, dims: number[]) => SamTensor;
  env: TransformersEnv;
}
