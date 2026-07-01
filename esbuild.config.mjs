import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const demoDir = path.join(__dirname, 'demo');
fs.mkdirSync(distDir, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  logLevel: 'info',
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

// Copy the browser bundles into demo/ so the demo runs without a build step.
const copyToDemo = [
  'hyperdict.min.js',
  'hyperdict.min.js.map',
  'hyperdict-ui.min.js',
  'hyperdict-ui.min.js.map',
];
for (const file of copyToDemo) {
  fs.copyFileSync(path.join(distDir, file), path.join(demoDir, file));
}

console.log('✅ Built core + UI bundles and copied browser globals into demo/.');
console.log('   dist/hyperdict.min.js (global HyperDict, fflate bundled)');
console.log('   dist/hyperdict-ui.min.js (global HyperDictUI)');
console.log('   + matching .esm.js for npm/bundler consumers');
