/**
 * Create an RLE decoding worker.
 *
 * Kept in its own module because the `import.meta.url` worker construction
 * only parses in ESM builds (Vite); unit tests (CommonJS) mock this module
 * instead of loading it.
 */
export default function createRLEWorker(): Worker {
  return new Worker(new URL('../workers/rleWorker.js', import.meta.url), { type: 'module' });
}
