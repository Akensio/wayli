// MapLibre, bundled with the app instead of loaded from a CDN: a phone whose network could not reach the CDN got a
// blank page (2026-10-22), and one less third party sees who opens the app. The rest of the code uses it as the
// global `maplibregl`; this module sets it, and main.ts imports it before anything else.
import maplibre from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

(globalThis as unknown as { maplibregl: typeof maplibre }).maplibregl = maplibre;
