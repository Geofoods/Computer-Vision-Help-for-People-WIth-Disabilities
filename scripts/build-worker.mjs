// Bundles the hand tracking worker into public/hand-worker.js as a classic script.
// MediaPipe loads its WebAssembly runtime with importScripts, which module workers
// don't have, so the worker can't go through Vite's own worker support.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/hand-worker.js'],
  outfile: 'public/hand-worker.js',
  bundle: true,
  format: 'iife',
  minify: true,
  logLevel: 'warning',
});
