import type { SamDevicePreference } from './samModels';

/** ONNX Runtime execution providers used for SAM. */
export type SamDevice = 'webgpu' | 'wasm';

export type GpuAccess = {
  requestAdapter(): Promise<{ info?: { isFallbackAdapter?: boolean }; isFallbackAdapter?: boolean } | null>;
};

export function navigatorGpu(): GpuAccess | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { gpu?: GpuAccess }).gpu;
}

/** True when the browser exposes a hardware WebGPU adapter (not SwiftShader). */
export async function samHardwareGpuAvailable(gpu?: GpuAccess): Promise<boolean> {
  try {
    const adapter = await (gpu ?? navigatorGpu())?.requestAdapter();
    return !!(adapter && !adapter.info?.isFallbackAdapter && !adapter.isFallbackAdapter);
  } catch {
    return false;
  }
}

/** Software WebGPU (e.g. SwiftShader) can spend minutes compiling the encoder,
 * so WebGPU is reserved for a hardware adapter. Preference can force CPU,
 * force GPU (when hardware exists), or prefer GPU with a CPU fallback. */
export async function samDevices(
  gpu?: GpuAccess,
  preference: SamDevicePreference = 'auto',
): Promise<SamDevice[]> {
  if (preference === 'cpu') return ['wasm'];
  const hardware = await samHardwareGpuAvailable(gpu);
  if (!hardware) return ['wasm'];
  return preference === 'gpu' ? ['webgpu'] : ['webgpu', 'wasm'];
}
