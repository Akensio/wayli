// The one map under everything: its layers, the stops of the day, the live vehicles, taps on it. What it shows for
// what the sheet holds is decided in one place (map/view.ts) and drawn by one renderer (map/render.ts).
import type { Map as MLMap } from 'maplibre-gl';
import { LocateControl, CompassControl } from './locate';
import * as nav from '../state/nav';
import * as search from '../state/search';
import * as sheet from '../state/sheet';
import * as results from '../state/results';
import { lastPos, knownGeo } from '../state/position';
import { state, popupState, EMPTY, settleWaiters } from './shared';
import {
  styleReady,
  mapStyle,
  makeMap,
  setBasemapLang,
  applySky,
  applyTerrain,
  TERRAIN_PITCH,
  wantDarkMap,
} from './basemap';
import { BADGE_KINDS, stationImage } from './images';
import { ensureJourneyLayers } from './layers';
import { stopPopup, placeBubble } from './popups';
import { loadStopsGeo, refreshLiveMap, applyLiveShow, selectVehicle, lm, resetShow, watchLive } from './live';
import { pickAt } from './picker';
import { startHeading, attachHeading } from './heading';

export { applyTheme, setBasemapLang } from './basemap';
export { mapReady, stale, stopKindProp, EMPTY } from './shared';
export { showVehicles, showRider, type VehicleSet } from './vehicles';
export { ensureJourneyLayers, drawJourney, boundsOf, withCourses } from './layers';
export { vehiclesForWorker, closePopup } from './popups';
export { refreshLiveMap, applyLiveShow, loadStopsGeo, updateNearRoutes, liveOn, resetLive, setStopLines } from './live';
export { pickOnMap, closePicker } from './picker';
export { hooks } from './shared';
export { redrawMap, afterDraw } from './render';
export { cameraPadding } from './shared';
import { redrawMap } from './render';
import { debug } from '../lib/debug';
let locate: LocateControl | null = null;

export async function initMap(): Promise<void> {
  await styleReady();
  // start where the map was last left (no wide view first, no jump): the saved camera, else the position, else Tel Aviv
  let view: { lat: number; lon: number; zoom: number } | null = null;
  try {
    const v: unknown = JSON.parse(localStorage.getItem('wayli-view') || 'null');
    const ok = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && x >= lo && x <= hi;
    if (v && typeof v === 'object' && 'lat' in v && 'lon' in v && 'zoom' in v)
      if (ok(v.lat, -90, 90) && ok(v.lon, -180, 180) && ok(v.zoom, 0, 22))
        view = { lat: v.lat, lon: v.lon, zoom: v.zoom };
  } catch {
    /* private mode, or not JSON: start from the position */
  }
  const start = view || lastPos || { lat: 32.08, lon: 34.78 };
  let zoom = 11;
  if (view) zoom = view.zoom;
  else if (lastPos) zoom = 14.5;
  state.main = makeMap('mainMap', [start.lat, start.lon], zoom);
  debug('map', state.main);
  if (!state.main) {
    state.failed = true;
    settleWaiters(null);
    return;
  }
  const m = state.main;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyMapStyle); // the basemap follows the system's theme
  watchLive();
  // the camera is remembered for the next start
  let viewTimer = 0;
  m.on('moveend', () => {
    clearTimeout(viewTimer);
    viewTimer = window.setTimeout(() => {
      try {
        const c = m.getCenter();
        localStorage.setItem(
          'wayli-view',
          JSON.stringify({ lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), zoom: +m.getZoom().toFixed(2) }),
        );
      } catch {
        /* private mode */
      }
    }, 500);
  });
  // our own locate and compass buttons (map/locate.ts): MapLibre's would need its private members to behave as asked
  locate = new LocateControl();
  m.addControl(locate, 'bottom-right');
  m.addControl(new CompassControl(), 'bottom-right');
  // heights come and go as the map tilts past the threshold (and only then: a check per frame is cheap)
  let tilted = m.getPitch() >= TERRAIN_PITCH;
  m.on('pitch', () => {
    const now = m.getPitch() >= TERRAIN_PITCH;
    if (now !== tilted) {
      tilted = now;
      applyTerrain(m);
    }
  });
  startHeading();
  attachHeading(m); // Android needs no tap for the compass
  m.once('load', () => {
    // the attribution starts folded (MapLibre opens it on a wide screen); it is the map's own control, in its container
    m.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  });
  m.on('style.load', () => {
    setupMapLayers(m);
    state.styled = true;
    settleWaiters(m);
    lm.stops = false;
    loadStopsGeo();
    resetShow();
    state.drawnFor = null;
    redrawMap();
    refreshLiveMap();
  });
  m.on('moveend', () => {
    applyLiveShow();
    clearTimeout(lm.moveTimer);
    lm.moveTimer = window.setTimeout(refreshLiveMap, 400);
  });
  m.on('click', (e) => {
    if (m.getLayer('alt-hit') && m.queryRenderedFeatures(e.point, { layers: ['alt-hit'] }).length) return; // an alternative route: highlighted by its own handler
    if (
      state.drawnFor === 'screen-plan' &&
      results.highlighted.value &&
      m.getLayer('journey-hit') &&
      m.queryRenderedFeatures(e.point, { layers: ['journey-hit'] }).length
    )
      return; // the highlighted one: its card
    if (nav.isOpen('picker')) {
      const f = stopNear(m, e.point);
      const s = f ? { stop: +f.properties.stop, name: f.properties.name || '' } : null;
      pickAt(m, s ? (f!.geometry as any).coordinates : [e.lngLat.lng, e.lngLat.lat], s);
      return;
    }
    const hit = m.queryRenderedFeatures(e.point, { layers: ['lm-veh', ...STOP_LAYERS].filter((l) => m.getLayer(l)) });
    if (hit.length || popupState.current) return; // the layer's own handler answers, or the open bubble closes
    const near = stopNear(m, e.point);
    if (near) {
      stopPopup(m, (near.geometry as any).coordinates, +near.properties.stop, near.properties.station);
      return;
    }
    if (sheet.state.value !== 'peek' || search.barOpen.value) {
      sheet.set('peek');
      search.foldBar();
      return;
    }
    placeBubble(m, e);
  });
  setInterval(refreshLiveMap, 20000);
  if (knownGeo()) m.once('load', () => locate?.trigger());
  debug('liveMap', m);
}
const STOP_LAYERS = [
  'lm-stops',
  'lm-stops-icon',
  'lm-stations',
  'journey-stops',
  'context-stops',
  'journey-stations',
  'context-stations',
];
/** The stop drawn nearest to a point, within a finger's width (14 px), or null. */
function stopNear(m: MLMap, point: { x: number; y: number }) {
  const r = 14,
    fs = m
      .queryRenderedFeatures(
        [
          [point.x - r, point.y - r],
          [point.x + r, point.y + r],
        ],
        { layers: STOP_LAYERS.filter((l) => m.getLayer(l)) },
      )
      .filter((f) => f.properties.stop != null && f.properties.stop !== '');
  let best: (typeof fs)[number] | null = null,
    bd = Infinity;
  for (const f of fs) {
    const p = m.project((f.geometry as any).coordinates);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}
/** Sources and layers of the main map, bottom to top: every stop, the journey or line, live vehicles. Re-made after a style change. */
function setupMapLayers(m: MLMap): void {
  if (m.getSource('lm-veh')) return;
  // the basemap's own transit squares would double our stops
  if (m.getLayer('poi_transit')) m.setLayoutProperty('poi_transit', 'visibility', 'none');
  setBasemapLang(m);
  applySky(m);
  applyTerrain(m);
  const dark = wantDarkMap();
  // traffic from the buses: under the basemap's labels and everything of ours
  const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  m.addSource('lm-traffic', { type: 'geojson', data: EMPTY });
  m.addLayer(
    {
      id: 'lm-traffic',
      type: 'line',
      source: 'lm-traffic',
      minzoom: 11,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'level'], 0, '#2fa35f', 1, '#f0962e', 2, '#d93b33', '#8e1b1b'],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          ['match', ['get', 'level'], 0, 1.5, 2.5],
          16,
          ['match', ['get', 'level'], 0, 4, 6],
        ],
        'line-opacity': ['match', ['get', 'level'], 0, 0.55, 0.85],
      },
    },
    firstLabel,
  );
  m.addSource('lm-stops', { type: 'geojson', data: EMPTY });
  m.addLayer({
    id: 'lm-stops',
    type: 'circle',
    source: 'lm-stops',
    minzoom: 14,
    filter: ['in', ['get', 'kind'], ['literal', ['bus', 'platform']]],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'kind'], 'platform'], 4, 5.5],
      'circle-color': '#ffffff',
      'circle-stroke-color': '#4a5560',
      'circle-stroke-width': 2,
    },
  });
  for (const k of BADGE_KINDS)
    if (!m.hasImage('wayli-st-' + k)) m.addImage('wayli-st-' + k, stationImage(k), { pixelRatio: 2 });
  // close up, every bus stop gets its badge over the dot; stations keep theirs from zoom 11
  m.addLayer({
    id: 'lm-stops-icon',
    type: 'symbol',
    source: 'lm-stops',
    minzoom: 15,
    filter: ['==', ['get', 'kind'], 'bus'],
    layout: {
      'icon-image': 'wayli-st-bus',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.9, 17, 1.15],
    },
  });
  // stations: the badge from zoom 11, the name under it from zoom 12.5 (the basemap's station labels are hidden with its squares)
  m.addLayer({
    id: 'lm-stations',
    type: 'symbol',
    source: 'lm-stops',
    minzoom: 11,
    filter: ['in', ['get', 'kind'], ['literal', ['rail', 'lrt', 'station']]],
    layout: {
      'icon-image': ['concat', 'wayli-st-', ['get', 'kind']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1],
      'icon-allow-overlap': true,
      'text-field': ['step', ['zoom'], '', 12.5, ['get', 'name']],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 10, 16, 12],
      'text-anchor': 'top',
      'text-offset': [0, 1.05],
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: {
      'text-color': dark ? '#e9eae6' : '#1b1f24',
      'text-halo-color': dark ? '#15181c' : '#ffffff',
      'text-halo-width': 1.4,
    },
  });
  ensureJourneyLayers(m);
  m.addSource('lm-veh', { type: 'geojson', data: EMPTY });
  m.addLayer({
    id: 'lm-veh',
    type: 'circle',
    source: 'lm-veh',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 13, 7, 15, 11],
      'circle-color': ['get', 'color'],
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': ['get', 'opacity'],
    },
  });
  m.addLayer({
    id: 'lm-veh-dir',
    type: 'symbol',
    source: 'lm-veh',
    filter: ['>', ['get', 'bearing'], -1],
    layout: {
      'icon-image': ['concat', 'wayli-arrow-', ['get', 'ckey']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 1],
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-offset': [0, -17],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['get', 'opacity'] },
  });
  m.addLayer({
    id: 'lm-veh-label',
    type: 'symbol',
    source: 'lm-veh',
    minzoom: 13.5,
    layout: {
      'text-field': ['get', 'line'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 9, 16, 12],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-font': ['Noto Sans Bold'],
    },
    paint: { 'text-color': ['get', 'tcol'], 'text-opacity': ['get', 'opacity'] },
  });
  m.on('click', 'lm-veh', (e) => {
    if (e.features && e.features[0])
      selectVehicle(m, e.features[0].properties, (e.features[0].geometry as any).coordinates);
  });
  for (const layer of ['lm-stops', 'lm-stops-icon', 'lm-stations'])
    m.on('click', layer, (e) => {
      const f = e.features && e.features[0];
      if (f && !m.queryRenderedFeatures(e.point, { layers: ['lm-veh'] }).length)
        stopPopup(m, (f.geometry as any).coordinates, +f.properties.stop, f.properties.station);
    });
  for (const layer of ['lm-veh', 'lm-stops', 'lm-stops-icon', 'lm-stations']) {
    m.on('mouseenter', layer, () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', layer, () => {
      m.getCanvas().style.cursor = '';
    });
  }
}
/** Switch the basemap (settings, or the phone's dark mode): a full reload of the style, so style.load re-adds our layers. */
export async function applyMapStyle(): Promise<void> {
  await styleReady();
  if (!state.main) return;
  applyTerrain(state.main); // the heights setting needs no new style
  const st = mapStyle();
  if (st === state.currentStyle) return;
  state.currentStyle = st;
  state.styled = false;
  lm.stops = false;
  state.main.setStyle(st, { diff: false });
}

/** Whether there is a map (none when MapLibre could not start, offline at first start). */
export const hasMap = (): boolean => state.main != null;
/** The basemap's labels in the current language. */
export const applyBasemapLang = (): void => {
  if (state.main) setBasemapLang(state.main);
};
