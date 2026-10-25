// A stop in the sheet, the one view of a stop wherever it was opened (the map, a search, a line, a trip): its lines,
// next departures (from now, or from the bar's time on another day) refreshed with live times every 45 s while it is
// open, from here and to here; a station is all its platforms, and where its trains go without a change.
import * as clock from '../engine/clock.js';
import * as delays from '../engine/delays.js';
import * as feed from '../engine/feed.js';
import { t } from '../lib/i18n';
import { calToday, timeOf } from '../lib/time';
import { call, tripStopsCached, estimate } from '../worker/client';
import * as search from '../state/search';
import * as sheet from '../state/sheet';
import * as nav from '../state/nav';
import * as stopPage from '../state/stop';
import * as map from '../map/index';
import type { StopInfo, Departure } from '../state/stop';
import { planTo, planFrom } from './planner';
import { recentViews } from '../lib/store.js';
import { openTrains, chooseStation } from './station';
import { openLine, openTrip } from './line';
import { asStation, type Dest } from '../state/station';

let current: StopInfo | null = null, seq = 0, timer = 0;

export async function openStop(stop: number, where: { station?: number; stops?: number[] } = {}): Promise<void> {
  const my = ++seq;
  const info = await call<StopInfo>('stopInfo', { stop, station: where.station ?? -1, stops: where.stops || null });
  if (my !== seq) return;
  current = info;
  const members = info.stops && info.stops.length ? info.stops : [stop];
  // a station, or a platform the trains of a station call at (one platform, a light rail stop): kept as a station
  recentViews.add((info.station != null && info.station >= 0) || info.reach ? { type: 'station', name: info.name, lat: info.lat, lon: info.lon, mode: info.reach || undefined }
    : { type: 'stop', code: info.code || '', name: info.name, city: info.city, lat: info.lat, lon: info.lon });
  // the map draws the stop and its lines' courses (map/render.ts)
  const day = search.day.value, svc = clock.serviceDay();
  const isNow = day === svc.day || day === calToday();
  stopPage.open(info, day, isNow);
  const from = isNow ? clock.nowOn(day) - 120 : search.atSeconds();
  // a station's trains: where they go without a change, the next one there and how long it takes
  if (info.reach) call<Dest[]>('stationReach', { stops: members, fromTime: from + 120, mode: info.reach }).then((d) => { if (my === seq) stopPage.dests.value = d; }).catch(() => { if (my === seq) stopPage.dests.value = []; });
  const deps = await call<Departure[]>('departures', { stop, stops: members, fromTime: from, limit: 40 });
  if (my !== seq) return;
  stopPage.deps.value = deps;
  clearInterval(timer);
  if (isNow) {
    liveForStop(info, deps, day, my);
    timer = window.setInterval(() => { if (!nav.isOpen('stopDetail')) clearInterval(timer); else liveForStop(info, deps, day, my); }, 45000);
  }
}
export function closeStop(): void { clearInterval(timer); seq++; }

/** Live times for the departures of a stop: one request for the vehicles around it, then by line for what it missed. */
async function liveForStop(info: StopInfo, deps: Departure[], day: string, my: number): Promise<void> {
  if (!map.liveOn()) { stopPage.liveNote.value = t('liveOff'); return; }
  const now = clock.nowOn(day);
  const soon = deps.filter((d) => d.routeId != null && d.time - now < 3600 && d.time - now > -300).slice(0, 16);
  if (!soon.length) return;
  try {
    let vs: any[] = await feed.vehiclesNear(info.lat, info.lon, 8);
    if (my !== seq) return;
    const unmatched = new Set(soon.filter((d) => !feed.matchTrip(vs, d.routeId, d.firstDep, day) && d.time - now < 1800).map((d) => d.routeId));
    if (unmatched.size) {
      const more = await Promise.all(Array.from(unmatched).slice(0, 6).map((r) => feed.vehiclesByLine(r).catch(() => [])));
      vs = vs.concat(more.flat());
    }
    if (my !== seq) return;
    for (const d of soon) {
      const v = feed.matchTrip(vs, d.routeId, d.firstDep, day);
      if (!v) continue;
      const ts = await tripStopsCached(d.trip);
      if (my !== seq) return;
      const at0 = info.stops && info.stops.length ? info.stops : [info.stop];   // any platform of a station
      const idx = ts.stops.findIndex((s: { stop: number; dep: number }) => at0.includes(s.stop) && s.dep === d.time);
      const est = await estimate(v, ts.stops, day);
      if (my !== seq) return;
      const at = delays.liveAt(est, ts.stops, idx < 0 ? 0 : idx);
      if (!at) continue;
      stopPage.setLive(d.trip, at.passed ? { passed: true } : { passed: false, time: at.time, stale: !!at.stale, delayMin: delays.delayMinutes(at.delay) });
    }
    const nw = feed.newest(vs);
    stopPage.liveNote.value = nw ? t('liveUpdated', { time: timeOf(nw) }) : t('liveNoVehicle');
  } catch { stopPage.liveNote.value = t('liveFail'); }
}

Object.assign(stopPage.hooks, {
  show: () => nav.showOverlay('stopDetail'),
  close: () => nav.close('stopDetail'),
  refresh: () => { if (current) openStop(current.stop, { stops: current.stops }); },
  openLine: (route: number) => { const c = current; openLine(route, c ? { stop: c.stop, near: c } : {}); },   // as a timetable at this stop
  // a destination of a station: the trains between the two; in the train timetable (the two boxes at the top), as its To
  openTo: (d: Dest) => {
    const c = current; if (!c) return;
    if (search.railPair.value && search.stFrom.value) chooseStation('to', d);
    else openTrains(asStation({ ...c, stops: c.stops || [c.stop] }), d);
  },
  openTrip: (trip: number, stop: number) => openTrip(trip, stop),
  fromHere: () => { if (current) { planFrom(search.stopPlace(current)); sheet.set('half'); } },
  toHere: () => { if (current) planTo(search.stopPlace(current)); },
});
