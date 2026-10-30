// Wayli's build: Vite bundles src/ (Preact + TypeScript, the data modules, the worker) into dist/, which
// pipeline/build_site.py then joins with the data files. The service worker is written here too, with the
// list of built files it has to cache, since their names carry content hashes.
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function serviceWorker(): Plugin {
  return {
    name: 'wayli-service-worker',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js');
      const shell = [
        './',
        ...files.map((f) => './' + f),
        './manifest.webmanifest',
        './icons/icon-192.png',
        './icons/icon-512.png',
        './icons/icon-180.png',
      ];
      const template = readFileSync(path.resolve(import.meta.dirname, 'src/sw.template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__SHELL_FILES__', JSON.stringify(shell)),
      });
    },
  };
}

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: 'public',
  plugins: [serviceWorker()],
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        // MapLibre's worker is an .mjs asset: as .js, so every host serves it as JavaScript (a module worker insists)
        assetFileNames: (a) =>
          (a.names?.[0] || a.name || '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: { format: 'es' },
});
