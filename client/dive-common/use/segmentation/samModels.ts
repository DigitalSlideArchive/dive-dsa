/** Browser SAM models offered for point-click segmentation. */
export type SamModel = 'sam2' | 'sam2-small';
/** User preference for where the SAM ONNX session runs. */
export type SamDevicePreference = 'auto' | 'gpu' | 'cpu';

/** Hugging Face Hub repositories with transformers.js-compatible ONNX exports. */
export const SAM_MODELS: Record<SamModel, string> = {
  sam2: 'onnx-community/sam2.1-hiera-tiny-ONNX',
  'sam2-small': 'onnx-community/sam2.1-hiera-small-ONNX',
};
export const SAM_LABELS: Record<SamModel, string> = {
  sam2: 'SAM2.1 Tiny',
  'sam2-small': 'SAM2.1 Small',
};

export function isSamModel(value: unknown): value is SamModel {
  return value === 'sam2' || value === 'sam2-small';
}

export function isSamDevicePreference(value: unknown): value is SamDevicePreference {
  return value === 'auto' || value === 'gpu' || value === 'cpu';
}
