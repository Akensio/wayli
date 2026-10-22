// The one map under everything. Panels register what they draw on it (`mapOf`); whichever panel is on top is
// drawn, over the stops of the day and the live vehicles.
import type { Map as MLMap, GeolocateControl } from 'maplibre-gl';
import { dur } from '../journey/format';
import * as nav from '../state/nav';
import * as search from '../state/search';
import * as sheet from '../state/sheet';
import * as results from '../state/results';
import * as nearby from '../state/nearby';
import { lastPos, notePos } from '../state/position';
import { state, markers, popupState, EMPTY, settleWaiters, stale, stopKindProp } from './shared';
import { styleReady, mapStyle, makeMap, setBasemapLang, applySky, wantDarkMap } from './basemap';
import { BADGE_KINDS, stationImage } from './images';
import { ensureJourneyLayers, drawJourney, fitMap, withCourses } from './layers';
import { stopPopup, placeBubble } from './popups';
import { loadStopsGeo, refreshLiveMap, applyLiveShow, selectVehicle, lm, resetShow } from './live';
import { pickAt } from './picker';
import { startHeading, attachHeading } from './heading';

export { applyTheme, setBasemapLang } from './basemap';
export { mapReady, stale, state as mapState, markers, stopKindProp, EMPTY } from './shared';
export { ensureJourneyLayers, drawJourney, boundsOf, fitMap, withCourses } from './layers';
export { lineVehicleMarkers, vehiclesForWorker, closePopup } from './popups';
export { refreshLiveMap, applyLiveShow, loadStopsGeo, updateNearRoutes, liveOn, resetLive } from './live';
export { pickOnMap, closePicker } from './picker';
export { hooks } from './shared';

/** panel id (or 'screen-<name>') -> async function (token) drawing that panel's content on the map */
export const mapOf: Record<string, (seq: number) => Promise<void> | void> = {};
let geoCtl: GeolocateControl | null = null;

export async function initMap(): Promise<void> {
  await styleReady();
  // start where the map was last left (no wide view first, no jump): the saved camera, else the position, else Tel Aviv
  let view: { lat: number; lon: number; zoom: number } | null = null; try { view = JSON.parse(localStorage.getItem('wayli-view') || 'null'); } catch { /* private mode */ }
  const start = view || lastPos || { lat: 32.08, lon: 34.78 };
  state.main = makeMap('mainMap', [start.lat, start.lon], view ? view.zoom : lastPos ? 14.5 : 11);
  try { window.wayliDebug = { ...(window.wayliDebug || {}), map: state.main }; } catch { /* debugging only */ }
  if (!state.main) { state.failed = true; settleWaiters(null); return; }
  const m = state.main;
  geoCtl = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 15, linear: true, duration: 500 } });
  let viewTimer = 0;   // the camera is remembered for the next start
  m.on('moveend', () => { clearTimeout(viewTimer); viewTimer = window.setTimeout(() => { try { const c = m.getCenter(); localStorage.setItem('wayli-view', JSON.stringify({ lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), zoom: +m.getZoom().toFixed(2) })); } catch { /* private mode */ } }, 500); });
  m.addControl(geoCtl, 'bottom-right');
  // The button only ever shows where you are. MapLibre's control turns location off on a tap while it follows you (or
  // is still locating, or has failed); here that tap re-centres instead (nothing while still locating; a failure tries
  // again). Turning location off is the phone's permission, not a map button.
  const g: any = geoCtl;
  g._geolocateButton.addEventListener('click', (e: Event) => {
    startHeading();   // the compass for the cone on the dot; an iPhone asks for it here, on the tap
    const st = g._watchState;
    if (!['ACTIVE_LOCK', 'WAITING_ACTIVE', 'ACTIVE_ERROR', 'BACKGROUND_ERROR'].includes(st)) return;   // on, or back to following: as MapLibre does
    e.stopImmediatePropagation(); e.preventDefault();
    if (st === 'ACTIVE_LOCK' && g._lastKnownPosition) g._updateCamera(g._lastKnownPosition);
    else if (st !== 'WAITING_ACTIVE') { try { g.trigger(); g.trigger(); } catch { /* no geolocation */ } }   // off and on: a fresh try
  }, { capture: true });
  // a compass under it: shows the rotation and the tilt, a tap sets north up and flat; hidden while there is nothing to reset
  const compass = new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true });
  m.addControl(compass, 'bottom-right');
  const compassVis = () => { const on = Math.abs(m.getBearing()) > 0.5 || m.getPitch() > 0.5; (compass as any)._container.classList.toggle('wayli-hidden', !on); };
  compassVis(); for (const ev of ['rotate', 'pitch', 'moveend', 'load'] as const) m.on(ev, compassVis);
  geoCtl.on('geolocate', (p: any) => notePos(p.coords.latitude, p.coords.longitude));
  startHeading(); attachHeading(m);   // Android needs no tap for the compass
  m.once('load', () => { const a = document.querySelector('.maplibregl-ctrl-attrib'); if (a) a.classList.remove('maplibregl-compact-show'); });
  m.on('style.load', () => {
    setupMapLayers(m);
    state.styled = true;
    settleWaiters(m);
    lm.stops = false; loadStopsGeo();
    resetShow(); state.drawnFor = null; redrawMap();
    refreshLiveMap();
  });
  m.on('moveend', () => { applyLiveShow(); clearTimeout(lm.moveTimer); lm.moveTimer = window.setTimeout(refreshLiveMap, 400); });
  m.on('click', (e) => {
    if (m.getLayer('alt-hit') && m.queryRenderedFeatures(e.point, { layers: ['alt-hit'] }).length) return;   // an alternative route: highlighted by its own handler
    if (nav.isOpen('picker')) {
      const f = stopNear(m, e.point);
      const s = f ? { stop: +f.properties.stop, name: f.properties.name || '' } : null;
      pickAt(m, s ? (f!.geometry as any).coordinates : [e.lngLat.lng, e.lngLat.lat], s);
      return;
    }
    const hit = m.queryRenderedFeatures(e.point, { layers: ['lm-veh', ...STOP_LAYERS].filter((l) => m.getLayer(l)) });
    if (hit.length || popupState.current) return;   // the layer's own handler answers, or the open bubble closes
    const near = stopNear(m, e.point);
    if (near) { stopPopup(m, (near.geometry as any).coordinates, +near.properties.stop, near.properties.station); return; }
    if (sheet.state.value !== 'peek' || search.barOpen.value) { sheet.set('peek'); search.foldBar(); return; }
    placeBubble(m, e);
  });
  setInterval(refreshLiveMap, 20000);
  let known = false; try { known = !!localStorage.getItem('wayli-geo'); } catch { /* private mode */ }
  if (known) m.once('load', () => { try { geoCtl!.trigger(); } catch { /* no geolocation */ } });
  try { window.wayliDebug = { ...(window.wayliDebug || {}), liveMap: m }; } catch { /* debugging only */ }
}
const STOP_LAYERS = ['lm-stops', 'lm-stops-icon', 'lm-stations', 'journey-stops', 'context-stops', 'journey-stations', 'context-stations'];
/** The stop drawn nearest to a point, within a finger's width (14 px), or null. */
function stopNear(m: MLMap, point: { x: number; y: number }) {
  const r = 14, fs = m.queryRenderedFeatures([[point.x - r, point.y - r], [point.x + r, point.y + r]], { layers: STOP_LAYERS.filter((l) => m.getLayer(l)) }).filter((f) => f.properties.stop != null && f.properties.stop !== '');
  let best: (typeof fs)[number] | null = null, bd = Infinity;
  for (const f of fs) { const p = m.project((f.geometry as any).coordinates); const d = Math.hypot(p.x - point.x, p.y - point.y); if (d < bd) { bd = d; best = f; } }
  return best;
}
/** Sources and layers of the main map, bottom to top: every stop, the journey or line, live vehicles. Re-made after a style change. */
function setupMapLayers(m: MLMap): void {
  if (m.getSource('lm-veh')) return;
  // the basemap's own transit squares would double our stops
  if (m.getLayer('poi_transit')) m.setLayoutProperty('poi_transit', 'visibility', 'none');
  setBasemapLang(m);
  applySky(m);
  const dark = wantDarkMap();
  m.addSource('lm-stops', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'lm-stops', type: 'circle', source: 'lm-stops', minzoom: 14, filter: ['in', ['get', 'kind'], ['literal', ['bus', 'platform']]], paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'platform'], 4, 5.5], 'circle-color': '#ffffff', 'circle-stroke-color': '#4a5560', 'circle-stroke-width': 2 } });
  for (const k of BADGE_KINDS) if (!m.hasImage('wayli-st-' + k)) m.addImage('wayli-st-' + k, stationImage(k), { pixelRatio: 2 });
  // close up, every bus stop gets its badge over the dot; stations keep theirs from zoom 11
  m.addLayer({ id: 'lm-stops-icon', type: 'symbol', source: 'lm-stops', minzoom: 15, filter: ['==', ['get', 'kind'], 'bus'], layout: { 'icon-image': 'wayli-st-bus', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.9, 17, 1.15] } });
  // stations: the badge from zoom 11, the name under it from zoom 12.5 (the basemap's station labels are hidden with its squares)
  m.addLayer({ id: 'lm-stations', type: 'symbol', source: 'lm-stops', minzoom: 11, filter: ['in', ['get', 'kind'], ['literal', ['rail', 'lrt', 'station']]],
    layout: { 'icon-image': ['concat', 'wayli-st-', ['get', 'kind']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1], 'icon-allow-overlap': true, 'text-field': ['step', ['zoom'], '', 12.5, ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 10, 16, 12], 'text-anchor': 'top', 'text-offset': [0, 1.05], 'text-max-width': 9, 'text-optional': true },
    paint: { 'text-color': dark ? '#e9eae6' : '#1b1f24', 'text-halo-color': dark ? '#15181c' : '#ffffff', 'text-halo-width': 1.4 } });
  ensureJourneyLayers(m);
  m.addSource('lm-veh', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'lm-veh', type: 'circle', source: 'lm-veh', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 13, 7, 15, 11], 'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['get', 'opacity'] } });
  m.addLayer({ id: 'lm-veh-dir', type: 'symbol', source: 'lm-veh', filter: ['>', ['get', 'bearing'], -1], layout: { 'icon-image': ['concat', 'wayli-arrow-', ['get', 'ckey']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 1], 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-offset': [0, -17], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': ['get', 'opacity'] } });
  m.addLayer({ id: 'lm-veh-label', type: 'symbol', source: 'lm-veh', minzoom: 13.5, layout: { 'text-field': ['get', 'line'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 9, 16, 12], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': ['get', 'tcol'], 'text-opacity': ['get', 'opacity'] } });
  m.on('click', 'lm-veh', (e) => { if (e.features && e.features[0]) selectVehicle(m, e.features[0].properties, (e.features[0].geometry as any).coordinates); });
  for (const layer of ['lm-stops', 'lm-stops-icon', 'lm-stations']) m.on('click', layer, (e) => { const f = e.features && e.features[0]; if (f && !m.queryRenderedFeatures(e.point, { layers: ['lm-veh'] }).length) stopPopup(m, (f.geometry as any).coordinates, +f.properties.stop, f.properties.station); });
  for (const layer of ['lm-veh', 'lm-stops', 'lm-stops-icon', 'lm-stations']) { m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; }); m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; }); }
}
/** Switch the basemap (settings, or the phone's dark mode): a full reload of the style, so style.load re-adds our layers. */
export async function applyMapStyle(): Promise<void> {
  await styleReady();
  if (!state.main) return;
  const st = mapStyle();
  if (st === state.currentStyle) return;
  state.currentStyle = st; state.styled = false; lm.stops = false;
  state.main.setStyle(st, { diff: false });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyMapStyle);
function clearMap(m: MLMap): void {
  for (const arr of [markers.journey, markers.live, markers.lineVeh, markers.followVehicle, markers.alt]) for (const mk of arr.splice(0)) mk.remove();
  if (markers.me) { markers.me.remove(); markers.me = null; }
  for (const src of ['journey', 'stops', 'context', 'context-stops', 'alts']) { const s = m.getSource(src) as any; if (s) s.setData(EMPTY); }
}
/** Draw what the panel on top wants on the map; nothing when it wants nothing. */
export function redrawMap(force = false): void {
  const key = nav.key.value;
  applyLiveShow();
  if (!force && key === state.drawnFor) return;
  state.drawnFor = key;
  const seq = ++state.drawSeq;
  const m = state.main;
  if (!m || !state.styled) return;
  clearMap(m);
  const fn = mapOf[key];
  if (fn) fn(seq);
}
/** The rider's dot. */
export function drawMe(pos: { lat: number; lon: number }): void {
  const m = state.main;
  if (!m || !state.styled) return;
  if (!markers.me) { const el = document.createElement('div'); el.className = 'wayli-me'; markers.me = new maplibregl.Marker({ element: el }).setLngLat([pos.lon, pos.lat]).addTo(m); }
  else markers.me.setLngLat([pos.lon, pos.lat]);
}

/** The results on the map: the ways switched on, the highlighted one in colour with its stops, the others grey,
 *  each with a badge of its minutes at the middle of its longest ride (a tap highlights that way). */
mapOf['screen-plan'] = async (seq) => {
  const m = state.main;
  const shown = results.list.value.cards.filter((c) => results.altShown.value.has(c.idx));
  const altSel = results.altSel.value;
  if (!m || !shown.length) return;
  await Promise.all(shown.map((c) => withCourses(c.j)));
  if (stale(seq) || !state.main) return;
  ensureJourneyLayers(m);
  for (const mk of markers.alt.splice(0)) mk.remove();
  const features: GeoJSON.Feature[] = [], b = new maplibregl.LngLatBounds();
  for (const c of shown) {
    let longest: [number, number][] | null = null;
    for (const l of c.j.legs) {
      if (!l.path || l.path.length < 2) continue;
      const coords = l.path.map((p) => [p[1], p[0]] as [number, number]);
      coords.forEach((x) => b.extend(x));
      if (c.idx !== altSel) features.push({ type: 'Feature', properties: { idx: c.idx, ride: l.type === 'ride' ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } });
      if (l.type === 'ride' && (!longest || coords.length > longest.length)) longest = coords;
    }
    const at = longest ? longest[Math.floor(longest.length / 2)] : null;
    if (!at) continue;
    const el = document.createElement('button'); el.type = 'button'; el.className = 'wayli-alt' + (c.idx === altSel ? ' sel' : '');
    el.textContent = dur(c.j.arrive - c.j.depart);
    el.addEventListener('click', (e) => { e.stopPropagation(); results.selectAlt(c.idx); });
    markers.alt.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(m));
  }
  (m.getSource('alts') as any).setData({ type: 'FeatureCollection', features });
  const sel = shown.find((c) => c.idx === altSel) || shown[0];
  drawJourney(m, sel.j, markers.journey, -1, false);
  fitMap(b, 15);
};
/** The nearby screen on the map: the rider's position, a ring out to the farthest listed stop, the stops highlighted. */
mapOf['screen-nearby'] = async (seq) => {
  const m = state.main, stops = nearby.stops.value;
  if (!m || !lastPos || !stops.length || stale(seq)) return;
  ensureJourneyLayers(m);
  const r = Math.max(150, (stops[stops.length - 1].distance || 0) + 30), ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) { const a = i / 64 * 2 * Math.PI; ring.push([lastPos.lon + r / 111000 / Math.cos(lastPos.lat * Math.PI / 180) * Math.cos(a), lastPos.lat + r / 111000 * Math.sin(a)]); }
  (m.getSource('context') as any).setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color: '#12998b' }, geometry: { type: 'LineString', coordinates: ring } }] });
  (m.getSource('stops') as any).setData({ type: 'FeatureCollection', features: stops.map((s) => ({ type: 'Feature', properties: { stop: s.stop, ...stopKindProp(s.stop) }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) });
  drawMe(lastPos);
  const b = new maplibregl.LngLatBounds(); ring.forEach((c) => b.extend(c));
  fitMap(b, 16);
};
