import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Build options
const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'ES2020',
  format: 'iife',
  globalName: 'HyperDict',
  outfile: 'dist/hyperdict.min.js',
  external: [],
};

// Build for browsers (IIFE + minified)
console.log('📦 Building HyperDict browser bundle...');
esbuild
  .build(buildOptions)
  .then(() => {
    console.log('✅ Browser bundle created: dist/hyperdict.min.js');

    // Also create ES module version for npm
    console.log('📦 Building HyperDict ESM version...');
    return esbuild.build({
      ...buildOptions,
      outfile: 'dist/hyperdict.esm.js',
      format: 'esm',
      globalName: undefined,
    });
  })
  .then(() => {
    console.log('✅ ESM version created: dist/hyperdict.esm.js');
    console.log('🎉 All builds complete!');
    console.log('\nOutputs:');
    console.log('  Browser (IIFE):  dist/hyperdict.min.js');
    console.log('  ES Module:       dist/hyperdict.esm.js');
  })
  .catch((error) => {
    console.error('❌ Build failed:', error);
    process.exit(1);
  });
