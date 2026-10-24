// A stop in the sheet, the one view of a stop wherever it was opened (the map, a search, a line, a trip): its lines,
// next departures (from now, or from the bar's time on another day) refreshed with live times every 45 s while it is
// open, from here and to here; a station is all its platforms, and where its trains go without a change.
import * as live from '../live.js';
import { t } from '../i18n';
import { calToday } from '../time';
import { call, tripStopsCached, estimate } from '../worker/client';
import * as search from '../state/search';
import * as sheet from '../state/sheet';
import * as nav from '../state/nav';
import * as stopPage from '../state/stop';
import * as map from '../map/index';
import { clock } from '../map/popups';
import type { StopInfo, Departure } from '../state/stop';
import type { Place } from '../state/search';
import { planTo, planFrom } from './planner';
import { openTrip } from './trip';
import { recentViews } from '../store.js';
import { routeColor } from '../journey/colors';
import { openTrains, chooseStation } from './station';
import { openLine } from './line';
import type { Dest } from '../state/station';

let current: StopInfo | null = null, seq = 0, timer = 0;
/** A stop as a place to plan from or to. */
export const stopPlace = (s: { name: string; stop: number; lat: number; lon: number }): Place => ({ name: s.name, stops: [s.stop], lat: s.lat, lon: s.lon });

export async function openStop(stop: number, where: { station?: number; stops?: number[] } = {}): Promise<void> {
  const my = ++seq;
  const info = await call<StopInfo>('stopInfo', { stop, station: where.station ?? -1, stops: where.stops || null });
  if (my !== seq) return;
  current = info;
  const members = info.stops && info.stops.length ? info.stops : [stop];
  recentViews.add(info.station != null && info.station >= 0 ? { type: 'station', name: info.name, lat: info.lat, lon: info.lon }
    : { type: 'stop', code: info.code || '', name: info.name, city: info.city, lat: info.lat, lon: info.lon });
  map.mapOf.stopDetail = async (drawSeq) => {
    const m = await map.mapReady();
    if (!m || my !== seq || map.stale(drawSeq)) return;
    const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = 'var(--accent)';
    map.markers.journey.push(new maplibregl.Marker({ element: el }).setLngLat([info.lon, info.lat]).addTo(m));
    m.easeTo({ center: [info.lon, info.lat], zoom: Math.max(m.getZoom(), 15), offset: [0, -Math.round(sheet.px('half') / 2) + 30], duration: 500 });
    // the page is about the lines calling here: their vehicles only, and their courses faint under the pin
    try {
      const routes = await call<{ pattern: number; ref: number | null; type: number; agency: string }[]>('stopRoutes', { stop, stops: members });
      if (my !== seq) return;
      map.showLinesFor('stopDetail', routes.filter((r) => r.ref != null).map((r) => String(r.ref)));
      const courses = await call<{ path: [number, number][] | null }[]>('patternCourse', { patterns: routes.map((r) => r.pattern) });
      if (my !== seq || map.stale(drawSeq)) return;
      const lines: GeoJSON.Feature[] = [];
      courses.forEach((c, i) => { if (c.path && c.path.length >= 2) lines.push({ type: 'Feature', properties: { color: routeColor(routes[i].type, routes[i].agency) }, geometry: { type: 'LineString', coordinates: c.path.map((q) => [q[1], q[0]]) } }); });
      (m.getSource('context') as any)?.setData({ type: 'FeatureCollection', features: lines });
    } catch { /* the pin and the departures stay */ }
  };
  map.showLinesFor('stopDetail', []);   // nothing until the stop's lines are known
  const day = search.day.value, svc = live.serviceDay();
  const isNow = day === svc.day || day === calToday();
  stopPage.open(info, day, isNow);
  const from = isNow ? live.nowOn(day) - 120 : search.atSeconds();
  // a station's trains: where they go without a change, the next one there and how long it takes
  if (info.rail) call<Dest[]>('stationReach', { stops: members, fromTime: from + 120 }).then((d) => { if (my === seq) stopPage.dests.value = d; }).catch(() => { if (my === seq) stopPage.dests.value = []; });
  const deps = await call<Departure[]>('departures', { stop, stops: members, fromTime: from, limit: 40 });
  if (my !== seq) return;
  stopPage.deps.value = deps;
  clearInterval(timer);
  if (isNow) {
    liveForStop(info, deps, day, my);
    timer = window.setInterval(() => { if (!nav.isOpen('stopDetail')) clearInterval(timer); else liveForStop(info, deps, day, my); }, 45000);
  }
}
export function closeStop(): void { clearInterval(timer); seq++; delete map.mapOf.stopDetail; map.showLinesFor('stopDetail', null); }

/** Live times for the departures of a stop: one request for the vehicles around it, then by line for what it missed. */
async function liveForStop(info: StopInfo, deps: Departure[], day: string, my: number): Promise<void> {
  if (!map.liveOn()) { stopPage.liveNote.value = t('liveOff'); return; }
  const now = live.nowOn(day);
  const soon = deps.filter((d) => d.routeId != null && d.time - now < 3600 && d.time - now > -300).slice(0, 16);
  if (!soon.length) return;
  try {
    let vs: any[] = await live.vehiclesNear(info.lat, info.lon, 8);
    if (my !== seq) return;
    const unmatched = new Set(soon.filter((d) => !live.matchTrip(vs, d.routeId, d.firstDep, day) && d.time - now < 1800).map((d) => d.routeId));
    if (unmatched.size) {
      const more = await Promise.all(Array.from(unmatched).slice(0, 6).map((r) => live.vehiclesByLine(r).catch(() => [])));
      vs = vs.concat(more.flat());
    }
    if (my !== seq) return;
    for (const d of soon) {
      const v = live.matchTrip(vs, d.routeId, d.firstDep, day);
      if (!v) continue;
      const ts = await tripStopsCached(d.trip);
      if (my !== seq) return;
      const at0 = info.stops && info.stops.length ? info.stops : [info.stop];   // any platform of a station
      const idx = ts.stops.findIndex((s: { stop: number; dep: number }) => at0.includes(s.stop) && s.dep === d.time);
      const est = await estimate(v, ts.stops, day);
      if (my !== seq) return;
      const at = live.liveAt(est, ts.stops, idx < 0 ? 0 : idx);
      if (!at) continue;
      stopPage.setLive(d.trip, at.passed ? { passed: true } : { passed: false, time: at.time, stale: !!at.stale, delayMin: live.delayMinutes(at.delay) });
    }
    const nw = live.newest(vs);
    stopPage.liveNote.value = nw ? t('liveUpdated', { time: clock(nw) }) : t('liveNoVehicle');
  } catch { stopPage.liveNote.value = t('liveFail'); }
}

Object.assign(stopPage.hooks, {
  show: () => nav.showOverlay('stopDetail'),
  close: () => nav.close('stopDetail'),
  refresh: () => { if (current) openStop(current.stop, { stops: current.stops }); },
  openLine: (route: number) => openLine(route),
  // a destination of a station: the trains between the two; in the train timetable (the two boxes at the top), as its To
  openTo: (d: Dest) => {
    const c = current; if (!c) return;
    if (search.railPair.value && search.stFrom.value) chooseStation('to', d);
    else openTrains({ key: '', name: c.name, stops: c.stops || [c.stop], lat: c.lat, lon: c.lon }, d);
  },
  openTrip: (trip: number, stop: number) => openTrip(trip, stop),
  fromHere: () => { if (current) { planFrom(stopPlace(current)); sheet.set('half'); } },
  toHere: () => { if (current) planTo(stopPlace(current)); },
});
