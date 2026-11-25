// Prepend the compiled Tailwind output to the library stylesheet so that the
// single file consumers import (dist/vue-girder-slicer-cli-ui.css) carries both
// the Tailwind utilities and the components' own styles.
//
// src/index.ts deliberately does not import tailwind.css (a host app's PostCSS
// cannot compile Tailwind v4 source), so `vite build` alone emits only the
// component styles. dist/tailwind.css is kept as a separate file as well.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const tailwindPath = path.join(dist, 'tailwind.css');
const libraryPath = path.join(dist, 'vue-girder-slicer-cli-ui.css');
const marker = '/* vue-girder-slicer-cli-ui: component styles */';

const tailwind = readFileSync(tailwindPath, 'utf8');
let library = readFileSync(libraryPath, 'utf8');
// Re-running the merge must not stack a second copy of Tailwind.
const markerIndex = library.indexOf(marker);
if (markerIndex !== -1) {
  library = library.slice(markerIndex + marker.length).trimStart();
}
// Tailwind first: its utilities and the component rules are both unlayered, so
// component styles need to come later to win ties.
writeFileSync(libraryPath, `${tailwind.trimEnd()}\n\n${marker}\n${library}`);
console.log(`Merged tailwind.css into ${path.basename(libraryPath)}`);
