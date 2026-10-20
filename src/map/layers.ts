// Drawing a journey or a line: the sources and layers (created once per style), the journey with its stops
// and pins, the faded whole lines of its rides, the other ways muted under it; fitting the map to what the
// bar and the sheet leave visible.
import type { Map as MLMap, Marker, LngLatBounds } from 'maplibre-gl';
import { legColor } from '../journey/colors';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as results from '../state/results';
import * as sheet from '../state/sheet';
import type { Journey } from '../journey/types';
import { state, EMPTY, stopKindProp } from './shared';
import { BADGE_KINDS, stationImage } from './images';
import { wireStopLayers } from './popups';

const setData = (m: MLMap, src: string, fc: GeoJSON.FeatureCollection) => { const s = m.getSource(src) as any; if (s) s.setData(fc); };
/** The map's sources and layers for a journey, created once, bottom to top: the other ways, the faded whole lines, then the journey. */
export function ensureJourneyLayers(m: MLMap): void {
  if (m.getSource('journey')) return;
  m.addSource('context', { type: 'geojson', data: EMPTY });
  m.addSource('context-stops', { type: 'geojson', data: EMPTY });
  m.addSource('journey', { type: 'geojson', data: EMPTY });
  m.addSource('stops', { type: 'geojson', data: EMPTY });
  // the other ways to go, muted under the highlighted one; a wide invisible line takes the taps
  m.addSource('alts', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'alt-casing', type: 'line', source: 'alts', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'alt-ride', type: 'line', source: 'alts', filter: ['==', ['get', 'ride'], 1], paint: { 'line-color': '#8d939c', 'line-width': 4.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'alt-walk', type: 'line', source: 'alts', filter: ['==', ['get', 'ride'], 0], paint: { 'line-color': '#8d939c', 'line-width': 3.5, 'line-dasharray': [1, 1.5] }, layout: { 'line-cap': 'round' } });
  m.addLayer({ id: 'alt-hit', type: 'line', source: 'alts', paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0.001 } });
  m.on('click', 'alt-hit', (e) => { const f = e.features && e.features[0]; if (f) results.selectAlt(+f.properties.idx); });
  m.on('mouseenter', 'alt-hit', () => { m.getCanvas().style.cursor = 'pointer'; }); m.on('mouseleave', 'alt-hit', () => { m.getCanvas().style.cursor = ''; });
  m.addLayer({ id: 'context-line', type: 'line', source: 'context', paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'context-stops', type: 'circle', source: 'context-stops', minzoom: 11, paint: { 'circle-radius': 3, 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-opacity': 0.5, 'circle-stroke-opacity': 0.5 } });
  // the highlighted way: a white casing, the rides wide in their line's colour, the walks dashed
  m.addLayer({ id: 'journey-casing', type: 'line', source: 'journey', paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'ride'], 1], 10, 7], 'line-opacity': .95 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'journey-ride', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 1], paint: { 'line-color': ['get', 'color'], 'line-width': 6.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'journey-walk', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 0], paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [1, 1.5] }, layout: { 'line-cap': 'round' } });
  m.addLayer({ id: 'journey-stops', type: 'circle', source: 'stops', minzoom: 12, paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#444', 'circle-stroke-width': 1.5 } });
  // stations along a line or a journey get their badge over the dot
  for (const k of BADGE_KINDS) if (!m.hasImage('wayli-st-' + k)) m.addImage('wayli-st-' + k, stationImage(k), { pixelRatio: 2 });
  for (const [id, src] of [['context-stations', 'context-stops'], ['journey-stations', 'stops']] as const) m.addLayer({ id, type: 'symbol', source: src, minzoom: 10, filter: ['has', 'kind'], layout: { 'icon-image': ['concat', 'wayli-st-', ['get', 'kind']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1], 'icon-allow-overlap': true } });
  wireStopLayers(m, ['journey-stops', 'context-stops', 'journey-stations', 'context-stations']);
}
/** The whole line of every ride, faded, with all its stops: where the bus comes from and where it goes on. */
async function drawContext(m: MLMap, j: Journey, focus = -1): Promise<void> {
  const rides = j.legs.filter((l, i) => l.type === 'ride' && l.pattern != null && (focus < 0 || i === focus));
  if (!rides.length || !data.ttReady.value) return;
  try {
    const courses: any[] = await call('patternCourse', { patterns: rides.map((l) => l.pattern) });
    if (!m.getSource('context')) return;
    const lines: GeoJSON.Feature[] = [], dots: GeoJSON.Feature[] = [];
    courses.forEach((c, i) => {
      const color = legColor(rides[i]);
      if (c.path && c.path.length >= 2) lines.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: c.path.map((q: number[]) => [q[1], q[0]]) } });
      for (const st of c.stops) dots.push({ type: 'Feature', properties: { color, name: st[2], stop: st[3], ...stopKindProp(st[3]) }, geometry: { type: 'Point', coordinates: [st[1], st[0]] } });
    });
    setData(m, 'context', { type: 'FeatureCollection', features: lines });
    setData(m, 'context-stops', { type: 'FeatureCollection', features: dots });
  } catch { /* the ride itself is still drawn */ }
}
/** Draw a journey: casing, rides, dashed walks, pins at boarding and alighting stops, dots at the stops between. Returns its bounds. */
export function drawJourney(m: MLMap, j: Journey, markers: Marker[], focus = -1, context = true): LngLatBounds {
  ensureJourneyLayers(m);
  for (const mk of markers.splice(0)) mk.remove();
  const features: GeoJSON.Feature[] = [], dots: GeoJSON.Feature[] = [];
  const bounds = new maplibregl.LngLatBounds();
  for (const l of j.legs) {
    if (!l.path || l.path.length < 2) continue;
    const color = legColor(l);
    const coords = l.path.map((p) => [p[1], p[0]] as [number, number]);
    coords.forEach((c) => bounds.extend(c));
    features.push({ type: 'Feature', properties: { color, ride: l.type === 'ride' ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } });
    if (l.type === 'ride') {
      for (const c of [coords[0], coords[coords.length - 1]]) {
        const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = color;
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(m));
      }
      // the stops between boarding and alighting: from the leg's stop list (the path itself follows the road now)
      const along = l.stopsAlong as { lon: number; lat: number; stop: number }[] | undefined;
      const between = along ? along.slice(1, -1).map((st) => ({ c: [st.lon, st.lat] as [number, number], stop: st.stop as number | string })) : (l.pathKind === 'stops' ? coords.slice(1, -1).map((c) => ({ c, stop: '' as number | string })) : []);
      for (const b of between) dots.push({ type: 'Feature', properties: { stop: b.stop, ...stopKindProp(b.stop) }, geometry: { type: 'Point', coordinates: b.c } });
    }
  }
  setData(m, 'journey', { type: 'FeatureCollection', features });
  setData(m, 'stops', { type: 'FeatureCollection', features: dots });
  setData(m, 'context', EMPTY); setData(m, 'context-stops', EMPTY);
  if (context) drawContext(m, j, focus);
  return bounds;
}
export const boundsOf = (path?: [number, number][] | null): LngLatBounds => { const b = new maplibregl.LngLatBounds(); for (const p of path || []) b.extend([p[1], p[0]]); return b; };
/** Fit bounds into the part of the map the sheet and the top bar leave visible. */
export function fitMap(b: LngLatBounds | null, maxZoom: number): void {
  const m = state.main;
  if (!m || !b || b.isEmpty()) return;
  const top = sheet.topPad();
  const bottom = Math.min(sheet.px(sheet.state.value) + 20, innerHeight - top - 120);
  m.fitBounds(b, { padding: { top, bottom, left: 24, right: 24 }, duration: 0, maxZoom });
}
/** Ride legs planned before the courses were loaded get their course now (in place). */
export async function withCourses(j: Journey): Promise<void> {
  if (!data.shReady.value || !data.ttReady.value) return;
  const rides = j.legs.filter((l) => l.type === 'ride' && l.pathKind !== 'shape' && l.pattern != null);
  if (!rides.length) return;
  try {
    const paths: any[] = await call('ridePaths', { legs: rides.map((l) => ({ pattern: l.pattern, boardPos: l.boardPos, alightPos: l.alightPos })) });
    rides.forEach((l, i) => { if (paths[i]) { l.path = paths[i]; l.pathKind = 'shape'; } });
  } catch { /* straight lines then */ }
}
