import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const docsDir = path.join(__dirname, 'docs'); // GitHub Pages serves from /docs
fs.mkdirSync(distDir, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  logLevel: 'info',
  // Preserved even after minification (leading '!'): attribution banner.
  banner: {
    js: '/*! HyperDict — ultra-fast StarDict engine for the browser | (c) 2026 Shakeeb Ahmad (https://shakeeb.in) | Apache-2.0 | https://github.com/ShakesVision/hyperdict */',
  },
};

// fflate is bundled into the core browser bundle so consumers need no <script>.
const builds = [
  // Core engine — browser global `HyperDict`
  { ...common, entryPoints: ['src/index.ts'], format: 'iife', globalName: 'HyperDict', outfile: 'dist/hyperdict.min.js' },
  // Core engine — ESM
  { ...common, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/hyperdict.esm.js' },
  // UI layer — browser global `HyperDictUI`
  { ...common, entryPoints: ['src/ui.ts'], format: 'iife', globalName: 'HyperDictUI', outfile: 'dist/hyperdict-ui.min.js' },
  // UI layer — ESM
  { ...common, entryPoints: ['src/ui.ts'], format: 'esm', outfile: 'dist/hyperdict-ui.esm.js' },
];

console.log('📦 Building HyperDict bundles…');
await Promise.all(builds.map((b) => esbuild.build(b)));

// Copy the browser bundles into docs/ so the GitHub Pages demo runs as-is.
const copyToDocs = [
  'hyperdict.min.js',
  'hyperdict.min.js.map',
  'hyperdict-ui.min.js',
  'hyperdict-ui.min.js.map',
];
for (const file of copyToDocs) {
  fs.copyFileSync(path.join(distDir, file), path.join(docsDir, file));
}

console.log('✅ Built core + UI bundles and copied browser globals into docs/.');
console.log('   dist/hyperdict.min.js (global HyperDict, fflate bundled)');
console.log('   dist/hyperdict-ui.min.js (global HyperDictUI)');
console.log('   + matching .esm.js for npm/bundler consumers');
