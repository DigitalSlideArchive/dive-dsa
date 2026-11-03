/**
 * The only module that imports transformers.js. Its type declarations need a
 * newer TypeScript than this project builds with, so callers use the minimal
 * shapes in samTypes.ts, and tests mock this loader instead of the package.
 */
import type { TransformersModule } from './samTypes';

export default async function loadTransformers(): Promise<TransformersModule> {
  return (await import('@huggingface/transformers')) as unknown as TransformersModule;
}
