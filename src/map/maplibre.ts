// MapLibre, bundled with the app instead of loaded from a CDN: a phone whose network could not reach the CDN got a
// blank page (2026-10-22), and one less third party sees who opens the app. The map's modules import the library from
// here (`maplibregl`), not from the package, so its worker is named to it before any map is made: the worker (a file of
// its own since 6.x, ESM only) is bundled as an asset, and left to itself it looks next to the bundle, where Vite does
// not put it.
import * as maplibre from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibre.setWorkerUrl(workerUrl);
/** The map library, with its worker set: the map's modules import it from here. */
export const maplibregl = maplibre;
