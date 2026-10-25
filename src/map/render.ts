// Carrying out what the map shows (map/view.ts decides): one renderer for every panel. It reads what the sheet holds
// from the state the panels fill, draws it, moves the camera into the part of the screen the map shows (between the
// bar and the sheet) and tells the panel when it is drawn, so a panel that draws its own live vehicles (a way, a line,
// the followed trip) can put them on. The camera fits a thing once: not again when only the highlight, a live
// update or the courses arriving redraw it, and again when it changes or the sheet comes back to it.
import type { Map as MLMap, LngLatBounds } from 'maplibre-gl';
import { lineText, dur } from '../journey/format';
import { chipColors, routeColor } from '../journey/colors';
import { call } from '../worker/client';
import * as nav from '../state/nav';
import * as sheet from '../state/sheet';
import * as results from '../state/results';
import * as detail from '../state/detail';
import * as follow from '../state/follow';
import * as linePage from '../state/line';
import * as stopPage from '../state/stop';
import * as station from '../state/station';
import type { Journey } from '../journey/types';
import type { TrainRow } from '../state/station';
import { state, markers, EMPTY, stale, stopKindProp } from './shared';
import { ensureJourneyLayers, drawJourney, withCourses, boundsOf } from './layers';
import { applyLiveShow, setStopLines } from './live';
import { viewFor, visibleArea, centreOffset } from './view';
import type { View, Sheet, Padding } from './view';

/** What the sheet holds, as the decision takes it. */
export function currentSheet(key = nav.key.value): Sheet {
  return { key, results: results.showing.value && results.list.value.cards.length > 0, focus: detail.focus.value };
}
/** The part of the screen the map shows, as camera padding (also the locate button's, map/index.ts). */
export const cameraPadding = (): Padding => visibleArea(innerHeight, sheet.topPad() - 12, sheet.px(sheet.state.value));

/** A panel's live vehicles, put on once the map has drawn it (the panels fill this in). */
export const afterDraw: Record<string, () => void> = {};

/** What a drawing returns for the camera: the box of what was drawn (or the focused part), or a point, and what it was
 *  (the camera fits again only when that changes). */
type Drawn = { bounds?: LngLatBounds; focus?: LngLatBounds; point?: [number, number]; id: string } | null;
type Recipe = (m: MLMap, v: View, seq: number) => Promise<Drawn> | Drawn;

const setData = (m: MLMap, src: string, fc: GeoJSON.FeatureCollection) => (m.getSource(src) as any)?.setData(fc);
const pin = (m: MLMap, lon: number, lat: number) => {
  const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = 'var(--accent)';
  markers.journey.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(m));
};
/** The rider's own dot, where the map's is not shown (following). */
export function drawMe(pos: { lat: number; lon: number }): void {
  const m = state.main;
  if (!m || !state.styled) return;
  if (!markers.me) { const el = document.createElement('div'); el.className = 'wayli-me'; markers.me = new maplibregl.Marker({ element: el }).setLngLat([pos.lon, pos.lat]).addTo(m); }
  else markers.me.setLngLat([pos.lon, pos.lat]);
}
/** Courses as faint lines under the rest (a stop's lines). */
async function stopCourses(m: MLMap, seq: number, stop: number, stops: number[]): Promise<void> {
  try {
    const routes = await call<{ pattern: number; ref: number | null; type: number; agency: string }[]>('stopRoutes', { stop, stops });
    if (stale(seq)) return;
    setStopLines(routes.filter((r) => r.ref != null).map((r) => String(r.ref)));
    const courses = await call<{ path: [number, number][] | null }[]>('patternCourse', { patterns: routes.map((r) => r.pattern) });
    if (stale(seq)) return;
    const lines: GeoJSON.Feature[] = [];
    courses.forEach((c, i) => { if (c.path && c.path.length >= 2) lines.push({ type: 'Feature', properties: { color: routeColor(routes[i].type, routes[i].agency) }, geometry: { type: 'LineString', coordinates: c.path.map((q) => [q[1], q[0]]) } }); });
    setData(m, 'context', { type: 'FeatureCollection', features: lines });
  } catch { /* the pin and the departures stay */ }
}

const RECIPES: Record<View['draw'], Recipe> = {
  nothing: () => null,
  /** The results: the ways switched on, the highlighted one in colour with its stops, the others grey, each with a
   *  badge of its minutes at the middle of its longest ride and its lines' chips (a tap highlights that way). */
  ways: async (m, _v, seq) => {
    const shown = results.list.value.cards.filter((c) => results.altShown.value.has(c.idx));
    const altSel = results.altSel.value;
    if (!shown.length) return null;
    await Promise.all(shown.map((c) => withCourses(c.j)));
    if (stale(seq)) return null;
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
      // each ride says its line where it runs (a third of the way along, clear of the boarding pin and the minutes at
      // the middle): in the line's colours on the highlighted way, grey on the others; a tap highlights that way
      for (const l of c.j.legs) {
        if (l.type !== 'ride' || !l.path || l.path.length < 2) continue;
        const p = l.path[Math.floor((l.path.length - 1) / 3)];
        const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'wayli-linechip' + (c.idx === altSel ? ' sel' : '');
        chip.textContent = lineText(l.line);
        if (c.idx === altSel) Object.assign(chip.style, chipColors(l.routeType, l.agency));
        chip.addEventListener('click', (e) => { e.stopPropagation(); results.pickAlt(c.idx); });
        markers.alt.push(new maplibregl.Marker({ element: chip, anchor: 'center' }).setLngLat([p[1], p[0]]).addTo(m));
      }
      const at = longest ? longest[Math.floor(longest.length / 2)] : null;
      if (!at) continue;
      const el = document.createElement('button'); el.type = 'button'; el.className = 'wayli-alt' + (c.idx === altSel ? ' sel' : '');
      el.textContent = dur(c.j.arrive - c.j.depart);
      el.addEventListener('click', (e) => { e.stopPropagation(); results.pickAlt(c.idx); });
      markers.alt.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(m));
    }
    setData(m, 'alts', { type: 'FeatureCollection', features });
    const sel = shown.find((c) => c.idx === altSel) || shown[0];
    drawJourney(m, sel.j, markers.journey, -1, false);
    // the ways shown, not which is highlighted: a rider who zoomed in to tap a route keeps the view
    const q = results.query.value;
    return { bounds: b, id: `${shown.map((c) => c.idx).join(',')}|${q ? JSON.stringify([q.from, q.to, q.day, q.at]) : ''}|${results.result.value ? results.result.value.journeys.length : 0}` };
  },
  /** One way (a trip's detail), or the trip followed. */
  journey: async (m, v, seq) => {
    const followed = nav.key.value === 'follow';
    const j: Journey | null | undefined = followed ? follow.active.value?.journey : detail.journey.value;
    if (!j) return null;
    const bikeOnly = !followed && detail.bikeOnly.value;
    if (!bikeOnly) await withCourses(j);
    if (stale(seq)) return null;
    const focus = followed ? -1 : detail.focus.value;
    const b = drawJourney(m, j, markers.journey, focus, v.context);
    const id = `${j.depart}|${j.arrive}|${j.legs.length}|${focus}`;
    return { bounds: b, focus: focus >= 0 && j.legs[focus] ? boundsOf(j.legs[focus].path) : undefined, id };
  },
  /** A line: its course, and every stop of it in its colour. */
  line: (m) => {
    const info = linePage.info.value;
    if (!info) return null;
    const course: Journey = { depart: 0, arrive: 0, transfers: 0, legs: [{ type: 'ride', seconds: 0, routeType: info.routeType, agency: info.agency, path: info.path, pattern: null }] };
    const b = drawJourney(m, course, markers.journey);
    const color = routeColor(info.routeType, info.agency);
    setData(m, 'stops', { type: 'FeatureCollection', features: info.stops.map((st) => ({ type: 'Feature', properties: { stop: st.stop, color, ...stopKindProp(st.stop) }, geometry: { type: 'Point', coordinates: [st.lon, st.lat] } })) });
    for (const st of info.stops) b.extend([st.lon, st.lat]);
    return { bounds: b, id: String(info.route) };
  },
  /** A stop (or a station): its pin, the lines calling there faint around it. */
  stop: (m, v, seq) => {
    const info = stopPage.info.value;
    if (!info) return null;
    pin(m, info.lon, info.lat);
    setStopLines([]);   // its lines' vehicles only, none until they are known
    if (v.context) stopCourses(m, seq, info.stop, info.stops && info.stops.length ? info.stops : [info.stop]);
    return { point: [info.lon, info.lat], id: `${info.stop}|${(info.stops || []).join(',')}` };
  },
  /** The trains between two stations: the next one's course in its colour with the stations it calls at, the other
   *  ways the trains take faint under it (a train that calls at more stations, or goes round), and only their vehicles.
   *  Both pins until the trains are known. */
  pair: async (m, _v, seq) => {
    const p = station.pair.value;
    if (!p) return null;
    const b = new maplibregl.LngLatBounds([p.from.lon, p.from.lat], [p.from.lon, p.from.lat]).extend([p.to.lon, p.to.lat]);
    const rows = station.trains.value;
    setStopLines([...new Set((rows || []).map((r) => r.routeId).filter((x) => x != null).map(String))]);
    const ways = new Map<string, TrainRow>();
    for (const r of (rows || []).slice(0, 24)) { const k = `${r.pattern}|${r.boardPos}|${r.alightPos}`; if (!ways.has(k)) ways.set(k, r); }
    const legs = [...ways.values()];
    let courses: { path: [number, number][]; stops: { lat: number; lon: number; stop: number }[] }[] = [];
    if (legs.length) courses = await call<typeof courses>('rideCourses', { legs: legs.map((r) => ({ pattern: r.pattern, boardPos: r.boardPos, alightPos: r.alightPos })) }).catch(() => []);
    if (stale(seq)) return null;
    if (!courses.length) { pin(m, p.from.lon, p.from.lat); pin(m, p.to.lon, p.to.lat); return { bounds: b, id: `${p.from.name}|${p.to.name}` }; }
    const next = legs[0], c0 = courses[0];
    const ride: Journey = { depart: 0, arrive: 0, transfers: 0, legs: [{ type: 'ride', seconds: 0, routeType: next.routeType, agency: next.agency, path: c0.path, pattern: null, stopsAlong: c0.stops } as any] };
    b.extend(drawJourney(m, ride, markers.journey, -1, false));
    const color = routeColor(next.routeType, next.agency), lines: GeoJSON.Feature[] = [], dots: GeoJSON.Feature[] = [], seen = new Set(c0.stops.map((s) => s.stop));
    courses.slice(1).forEach((c) => {
      lines.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: c.path.map((q) => [q[1], q[0]]) } });
      for (const s of c.stops) if (!seen.has(s.stop)) { seen.add(s.stop); dots.push({ type: 'Feature', properties: { color, stop: s.stop, ...stopKindProp(s.stop) }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } }); }
      for (const q of c.path) b.extend([q[1], q[0]]);
    });
    setData(m, 'context', { type: 'FeatureCollection', features: lines });
    setData(m, 'context-stops', { type: 'FeatureCollection', features: dots });
    return { bounds: b, id: `${p.from.name}|${p.to.name}|course` };
  },
};

let lastFit = '';   // the panel and thing the camera was last fitted to
function aim(m: MLMap, key: string, v: View, d: Drawn): void {
  if (v.camera === 'keep' || !d) return;
  const id = `${key}|${d.id}`;
  if (id === lastFit) return;
  lastFit = id;
  const pad = cameraPadding();
  if (v.camera === 'point' && d.point) { m.easeTo({ center: d.point, zoom: Math.max(m.getZoom(), v.maxZoom), offset: centreOffset(pad), duration: 500 }); return; }
  const b = v.camera === 'focus' && d.focus && !d.focus.isEmpty() ? d.focus : d.bounds;
  if (b && !b.isEmpty()) m.fitBounds(b, { padding: pad, duration: 0, maxZoom: v.maxZoom });
}

function clearMap(m: MLMap): void {
  for (const arr of [markers.journey, markers.live, markers.lineVeh, markers.followVehicle, markers.alt]) for (const mk of arr.splice(0)) mk.remove();
  if (markers.me) { markers.me.remove(); markers.me = null; }
  for (const src of ['journey', 'stops', 'context', 'context-stops', 'alts']) setData(m, src, EMPTY);
}
/** Draw what the sheet holds; `force` draws again though the panel is the same (its content changed). */
export function redrawMap(force = false): void {
  const key = nav.key.value;
  applyLiveShow();
  if (!force && key === state.drawnFor) return;
  if (key !== state.drawnFor) lastFit = '';   // back to a panel: fitted again, as it was
  state.drawnFor = key;
  const seq = ++state.drawSeq;
  const m = state.main;
  if (!m || !state.styled) return;
  clearMap(m);
  const v = viewFor(currentSheet(key));
  Promise.resolve(RECIPES[v.draw](m, v, seq)).then((d) => {
    if (stale(seq) || !state.main) return;
    aim(m, key, v, d);
    afterDraw[key]?.();
  });
}
