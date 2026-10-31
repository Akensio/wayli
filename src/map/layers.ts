// Drawing a journey or a line: the sources and layers (created once per style), the journey with its stops
// and pins, the faded whole lines of its rides, the other ways muted under it. (What is drawn when, and the camera:
// map/view.ts decides, map/render.ts carries it out.)
import type { Map as MLMap, Marker, LngLatBounds } from 'maplibre-gl';
import { legColor } from '../journey/colors';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as results from '../state/results';
import type { Drawable, DrawLeg, StopRef } from '../journey/types';
import { state, EMPTY, stopKindProp, stale } from './shared';
import type { PathPoint } from '../engine/geo.ts';
import { BADGE_KINDS, stationImage } from './images';
import { wireStopLayers } from './popups';
import { maplibregl } from './maplibre';

const setData = (m: MLMap, src: string, fc: GeoJSON.FeatureCollection) => {
  const s = m.getSource(src) as any;
  if (s) s.setData(fc);
};
/**
 * What a leg's line feature says about itself: `ride` 1 for a ride, 0 for a walk; `approx` 1 for a ride drawn from
 * its stops joined straight (planned before the courses were loaded, or a pattern with no course at all), which is
 * drawn dashed, never as if it ran along the road. The results' ways and the journey layers read these.
 */
export const legProps = (l: DrawLeg): { ride: 0 | 1; approx: 0 | 1 } => ({
  ride: l.type === 'ride' ? 1 : 0,
  approx: l.type === 'ride' && l.pathKind === 'stops' ? 1 : 0,
});
const RIDE_ON_COURSE: any = ['all', ['==', ['get', 'ride'], 1], ['!=', ['get', 'approx'], 1]];
const RIDE_APPROX: any = ['all', ['==', ['get', 'ride'], 1], ['==', ['get', 'approx'], 1]];
const RIDE_DASH = [2, 1.5]; // longer than a walk's dots
/** The map's sources and layers for a journey, created once, bottom to top: the other ways, the faded whole lines, then the journey. */
export function ensureJourneyLayers(m: MLMap): void {
  if (m.getSource('journey')) return;
  m.addSource('context', { type: 'geojson', data: EMPTY });
  m.addSource('context-stops', { type: 'geojson', data: EMPTY });
  m.addSource('journey', { type: 'geojson', data: EMPTY });
  m.addSource('stops', { type: 'geojson', data: EMPTY });
  // the other ways to go, muted under the highlighted one; a wide invisible line takes the taps
  m.addSource('alts', { type: 'geojson', data: EMPTY });
  m.addLayer({
    id: 'alt-casing',
    type: 'line',
    source: 'alts',
    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  m.addLayer({
    id: 'alt-ride',
    type: 'line',
    source: 'alts',
    filter: RIDE_ON_COURSE,
    paint: { 'line-color': '#8d939c', 'line-width': 4.5 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  m.addLayer({
    id: 'alt-ride-approx',
    type: 'line',
    source: 'alts',
    filter: RIDE_APPROX,
    paint: { 'line-color': '#8d939c', 'line-width': 4.5, 'line-dasharray': RIDE_DASH },
    layout: { 'line-cap': 'round' },
  });
  m.addLayer({
    id: 'alt-walk',
    type: 'line',
    source: 'alts',
    filter: ['==', ['get', 'ride'], 0],
    paint: { 'line-color': '#8d939c', 'line-width': 3.5, 'line-dasharray': [1, 1.5] },
    layout: { 'line-cap': 'round' },
  });
  m.addLayer({
    id: 'alt-hit',
    type: 'line',
    source: 'alts',
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0.001 },
  });
  m.on('click', 'alt-hit', (e) => {
    const f = e.features && e.features[0];
    if (f) results.pickAlt(+f.properties.idx);
  });
  m.on('mouseenter', 'alt-hit', () => {
    m.getCanvas().style.cursor = 'pointer';
  });
  m.on('mouseleave', 'alt-hit', () => {
    m.getCanvas().style.cursor = '';
  });
  // the whole lines, before and after the ride (or through a stop), faint but findable on either map
  m.addLayer({
    id: 'context-line',
    type: 'line',
    source: 'context',
    paint: { 'line-color': ['get', 'color'], 'line-width': 4.5, 'line-opacity': 0.45 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  m.addLayer({
    id: 'context-stops',
    type: 'circle',
    source: 'context-stops',
    minzoom: 11,
    paint: {
      'circle-radius': 3,
      'circle-color': '#ffffff',
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.5,
      'circle-stroke-opacity': 0.5,
    },
  });
  // the highlighted way: a white casing, the rides wide in their line's colour (dashed while drawn stop to stop,
  // without their course), the walks dotted
  m.addLayer({
    id: 'journey-casing',
    type: 'line',
    source: 'journey',
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'ride'], 1], 10, 7], 'line-opacity': 0.95 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  m.addLayer({
    id: 'journey-ride',
    type: 'line',
    source: 'journey',
    filter: RIDE_ON_COURSE,
    paint: { 'line-color': ['get', 'color'], 'line-width': 6.5 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  m.addLayer({
    id: 'journey-ride-approx',
    type: 'line',
    source: 'journey',
    filter: RIDE_APPROX,
    paint: { 'line-color': ['get', 'color'], 'line-width': 6.5, 'line-dasharray': RIDE_DASH },
    layout: { 'line-cap': 'round' },
  });
  m.addLayer({
    id: 'journey-walk',
    type: 'line',
    source: 'journey',
    filter: ['==', ['get', 'ride'], 0],
    paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [1, 1.5] },
    layout: { 'line-cap': 'round' },
  });
  // the highlighted way takes taps too, among the results (its card comes into view): a wide invisible line over it
  m.addLayer({
    id: 'journey-hit',
    type: 'line',
    source: 'journey',
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0.001 },
  });
  m.on('click', 'journey-hit', () => {
    if (results.highlighted.value && state.drawnFor === 'screen-plan') results.pickAlt(results.highlighted.value.idx);
  });
  // a journey's stops from zoom 12; a line's (they carry its colour) from zoom 9, solid in its colour while far out,
  // white with a ring of it up close
  m.addLayer({
    id: 'journey-stops',
    type: 'circle',
    source: 'stops',
    minzoom: 9,
    filter: ['any', ['has', 'color'], ['>=', ['zoom'], 12]],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 12, 4, 15, 6],
      'circle-color': ['step', ['zoom'], ['coalesce', ['get', 'color'], '#ffffff'], 13, '#ffffff'],
      'circle-stroke-color': ['step', ['zoom'], '#ffffff', 13, ['coalesce', ['get', 'color'], '#444444']],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 13, 2],
    },
  });
  // stations along a line or a journey get their badge over the dot
  for (const k of BADGE_KINDS)
    if (!m.hasImage('wayli-st-' + k)) m.addImage('wayli-st-' + k, stationImage(k), { pixelRatio: 2 });
  for (const [id, src] of [
    ['context-stations', 'context-stops'],
    ['journey-stations', 'stops'],
  ] as const)
    m.addLayer({
      id,
      type: 'symbol',
      source: src,
      minzoom: 10,
      filter: ['has', 'kind'],
      layout: {
        'icon-image': ['concat', 'wayli-st-', ['get', 'kind']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1],
        'icon-allow-overlap': true,
      },
    });
  wireStopLayers(m, ['journey-stops', 'context-stops', 'journey-stations', 'context-stations']);
}
/** The whole line of every ride, faded, with all its stops: where the bus comes from and where it goes on. A line
 *  whose course is not there yet gets its stops only; the redraw when the courses arrive draws it. */
async function drawContext(m: MLMap, j: Drawable, focus = -1): Promise<void> {
  const rides = j.legs.filter((l, i) => l.type === 'ride' && l.pattern != null && (focus < 0 || i === focus));
  if (!rides.length || !data.ttReady.value) return;
  const seq = state.drawSeq; // the drawing this belongs to: when another started meanwhile, its context is not ours
  try {
    const courses = await call('patternCourse', {
      patterns: rides.flatMap((l) => (l.pattern == null ? [] : [l.pattern])),
    });
    if (stale(seq) || !m.getSource('context')) return;
    const lines: GeoJSON.Feature[] = [],
      dots: GeoJSON.Feature[] = [];
    courses.forEach((c, i) => {
      const color = legColor(rides[i]);
      if (c.course && c.path.length >= 2)
        lines.push({
          type: 'Feature',
          properties: { color },
          geometry: { type: 'LineString', coordinates: c.path.map((q: number[]) => [q[1], q[0]]) },
        });
      for (const st of c.stops)
        dots.push({
          type: 'Feature',
          properties: { color, name: st[2], stop: st[3], ...stopKindProp(st[3]) },
          geometry: { type: 'Point', coordinates: [st[1], st[0]] },
        });
    });
    setData(m, 'context', { type: 'FeatureCollection', features: lines });
    setData(m, 'context-stops', { type: 'FeatureCollection', features: dots });
  } catch (e) {
    console.warn("map: a ride's course and stops", e); // the ride itself is still drawn
  }
}
/** Draw a journey: casing, rides (dashed where drawn from stops), dotted walks, pins at boarding and alighting stops, dots at the stops between. Returns its bounds. */
export function drawJourney(m: MLMap, j: Drawable, markers: Marker[], focus = -1, context = true): LngLatBounds {
  ensureJourneyLayers(m);
  for (const mk of markers.splice(0)) mk.remove();
  const features: GeoJSON.Feature[] = [],
    dots: GeoJSON.Feature[] = [];
  const bounds = new maplibregl.LngLatBounds();
  for (const l of j.legs) {
    if (!l.path || l.path.length < 2) continue;
    const color = legColor(l);
    const coords = l.path.map((p) => [p[1], p[0]] as [number, number]);
    coords.forEach((c) => bounds.extend(c));
    features.push({
      type: 'Feature',
      properties: { color, ...legProps(l) },
      geometry: { type: 'LineString', coordinates: coords },
    });
    if (l.type === 'ride') {
      // the pins at the stops themselves (where the walk ends), not at the course's ends: a stop placed off its
      // course by the data would otherwise show a pin away from where the rider is sent
      const at = (st: StopRef | undefined, c: [number, number]): [number, number] =>
        st && typeof st.lon === 'number' && typeof st.lat === 'number' ? [st.lon, st.lat] : c;
      for (const c of [at(l.from, coords[0]), at(l.to, coords[coords.length - 1])]) {
        const el = document.createElement('div');
        el.className = 'wayli-pin';
        el.style.background = color;
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(m));
      }
      // the stops between boarding and alighting: from the leg's stop list (the path itself follows the road now)
      const along = l.stopsAlong as { lon: number; lat: number; stop: number }[] | undefined;
      let between: { c: [number, number]; stop: number | string }[] = [];
      if (along) between = along.slice(1, -1).map((st) => ({ c: [st.lon, st.lat] as [number, number], stop: st.stop }));
      else if (l.pathKind === 'stops') between = coords.slice(1, -1).map((c) => ({ c, stop: '' }));
      for (const b of between)
        dots.push({
          type: 'Feature',
          properties: { stop: b.stop, ...stopKindProp(b.stop) },
          geometry: { type: 'Point', coordinates: b.c },
        });
    }
  }
  setData(m, 'journey', { type: 'FeatureCollection', features });
  setData(m, 'stops', { type: 'FeatureCollection', features: dots });
  setData(m, 'context', EMPTY);
  setData(m, 'context-stops', EMPTY);
  if (context) drawContext(m, j, focus);
  return bounds;
}
export const boundsOf = (path?: [number, number][] | null): LngLatBounds => {
  const b = new maplibregl.LngLatBounds();
  for (const p of path || []) b.extend([p[1], p[0]]);
  return b;
};
/** Legs planned before the courses or the street graph were loaded get their course or street path now (in place). */
/** The courses and street paths fetched so far, by what they are for: a ride by its pattern and the stops it runs
 *  between on that day's timetable, a walk by its two ends and its mode. The map owns them; a journey's own legs are
 *  never written to (the planner's results, the detail and the stored trip hold the same objects). A few hundred are
 *  kept, the oldest dropped first. */
const paths = new Map<string, { path: PathPoint[]; pathKind: string }>();
const PATHS_KEPT = 400;
const remember = (k: string, path: PathPoint[], pathKind: string) => {
  paths.delete(k);
  paths.set(k, { path, pathKind });
  if (paths.size > PATHS_KEPT) paths.delete(paths.keys().next().value!);
};
const rideKey = (l: DrawLeg): string | null =>
  l.type === 'ride' && l.pattern != null
    ? `${data.dayInfo.value?.date}|${l.pattern}|${l.boardPos}|${l.alightPos}`
    : null;
const walkKey = (l: DrawLeg): string | null =>
  l.type !== 'ride' && l.path && l.path.length >= 2
    ? `${l.path[0].join()}>${l.path[l.path.length - 1].join()}|${l.mode === 'bike' ? 'bike' : 'walk'}`
    : null;
/** The drawing of a journey: its legs along their courses and the streets where those are known (fetched first when
 *  not), as a new object whose unchanged legs are the journey's own; the journey itself is not touched. */
export async function withCourses<D extends Drawable>(j: D): Promise<D> {
  await Promise.all([fetchRideCourses(j), fetchStreetPaths(j)]);
  let changed = false;
  const legs = j.legs.map((l) => {
    const k = rideKey(l) ?? walkKey(l),
      c = k != null ? paths.get(k) : undefined;
    if (!c || (l.path === c.path && l.pathKind === c.pathKind)) return l;
    changed = true;
    return { ...l, path: c.path, pathKind: c.pathKind };
  });
  // the same kind of object with its legs drawn along their courses (only the legs that changed are new)
  return changed ? ({ ...j, legs } as D) : j;
}
async function fetchRideCourses(j: Drawable): Promise<void> {
  if (!data.shReady.value || !data.ttReady.value) return;
  const rides = j.legs.filter((l) => {
    const k = rideKey(l);
    return k != null && l.pathKind !== 'shape' && !paths.has(k);
  });
  if (!rides.length) return;
  try {
    const got = await call('ridePaths', {
      legs: rides.map((l) => ({
        pattern: l.pattern as number,
        boardPos: l.boardPos as number,
        alightPos: l.alightPos as number,
      })),
    });
    rides.forEach((l, i) => {
      if (got[i]) remember(rideKey(l)!, got[i], 'shape');
    });
  } catch {
    /* straight lines then */
  }
}
/** A walk drawn as a straight line (no street graph when it was planned) follows the streets once they are there. */
async function fetchStreetPaths(j: Drawable): Promise<void> {
  if (!data.stReady.value) return;
  const walks = j.legs.filter((l) => {
    const k = walkKey(l);
    return k != null && l.pathKind !== 'street' && l.path!.length === 2 && !paths.has(k);
  });
  if (!walks.length) return;
  try {
    const got = await call('streetPaths', {
      legs: walks.map((l) => ({
        from: l.path![0],
        to: l.path![1],
        mode: l.mode === 'bike' ? ('bike' as const) : ('walk' as const),
      })),
    });
    walks.forEach((l, i) => {
      const p = got[i];
      if (p) remember(walkKey(l)!, p, 'street');
    });
  } catch {
    /* straight lines then */
  }
}
