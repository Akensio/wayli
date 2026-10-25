// MapLibre, bundled with the app instead of loaded from a CDN: a phone whose network could not reach the CDN got a
// blank page (2026-10-22), and one less third party sees who opens the app. The rest of the code uses it as the
// global `maplibregl`; this module sets it, and main.ts imports it before anything else. Its worker (a file of its
// own since 6.x, ESM only) is bundled as an asset and named to it: left to itself it looks next to the bundle, where
// Vite does not put it.
import * as maplibre from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibre.setWorkerUrl(workerUrl);
(globalThis as unknown as { maplibregl: typeof maplibre }).maplibregl = maplibre;
