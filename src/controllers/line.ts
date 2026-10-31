// A line's page: its course and stops on the map, and its vehicles with their delays, every 20 s while open.
import * as clock from '../engine/clock.ts';
import * as feed from '../engine/feed.ts';
import { t } from '../lib/i18n';
import { toast } from '../widgets/toast';
import { call } from '../worker/client';
import * as nav from '../state/nav';
import * as linePage from '../state/line';
import * as map from '../map/index';
import type { LineInfo } from '../state/line';
import { recentViews } from '../state/store.ts';
import * as data from '../state/data';
import { lastPos } from '../state/position';
import { tripStopsCached, estimate } from '../worker/client';
import * as delays from '../engine/delays.ts';
import type { LineTime } from '../state/line';
import { metres } from '../engine/geo.ts';
import { timeOf } from '../lib/time';
import { panelSession, whileVisible } from './session';

const session = panelSession(); // the line shown: older answers dropped, its vehicles' poll stopped with it
let current: LineInfo | null = null;
let seenNow: { vs: any[]; st: any[] } = { vs: [], st: [] }; // the line's vehicles at the last look, and which trip each runs

/** A line, as a timetable at `stop` when it calls there (the stop the rider came from: a stop's view, a ride's boarding
 *  stop), else at its stop nearest the rider, else its first; with `trip`, that trip chosen (a departure, a vehicle). */
export async function openLine(
  route: number,
  at: { stop?: number; near?: { lat: number; lon: number }; trip?: number } = {},
): Promise<void> {
  const my = session.begin();
  let info: LineInfo;
  try {
    info = await call('lineInfo', { route });
  } catch {
    toast(t('liveFail'));
    return;
  }
  if (!session.isCurrent(my)) return;
  current = info;
  if (info.ref)
    recentViews.add({
      type: 'line',
      ref: info.ref,
      line: info.line,
      routeType: info.routeType,
      agency: info.agency,
      headsign: info.headsign,
      mode: info.mode,
    });
  linePage.info.value = info;
  linePage.liveText.value = '';
  linePage.liveOk.value = false;
  let a = at.stop != null ? info.stops.findIndex((s) => s.stop === at.stop) : -1;
  const near = at.near || lastPos;
  if (a < 0 && near) {
    let bd = 3000;
    info.stops.forEach((s, i) => {
      const d = metres(near.lat, near.lon, s.lat, s.lon);
      if (d < bd) {
        bd = d;
        a = i;
      }
    });
  }
  setAnchor(Math.max(0, a), my, at.trip);
  nav.showOverlay('lineDetail');
  session.poll(whileVisible(lineLive, 20000));
}
/** One trip (a departure at a stop, a vehicle on the map, a train between two stations): its line at that stop, the
 *  trip chosen, so every stop shows its time. There is no page of its own for a trip. */
export async function openTrip(trip: number, stop: number): Promise<void> {
  let ts: { route?: number; stops: { stop: number }[] };
  try {
    ts = await tripStopsCached(trip);
  } catch {
    return;
  }
  if (ts.route == null) return;
  openLine(ts.route, { ...(stop >= 0 ? { stop } : {}), trip });
}
/** The line's times at the stop chosen, the next one chosen (or the first, on another day), or `trip` when it calls. */
async function setAnchor(i: number, my = session.current(), trip?: number): Promise<void> {
  const info = current;
  if (!info || !info.stops[i]) return;
  // what is shown stays until the new times come (emptied first, the box collapsed and the rows' times blinked)
  linePage.anchor.value = i;
  linePage.loading.value = true;
  const day = data.dayInfo.value?.date || '',
    svc = clock.serviceDay(),
    today = day === svc.day;
  const now = today ? clock.nowOn(day) : null;
  linePage.now.value = now;
  try {
    const rows = await call('lineTimes', { route: info.route, from: [info.stops[i].stop] });
    if (!session.isCurrent(my) || linePage.anchor.value !== i) return;
    linePage.times.value = rows;
    linePage.loading.value = false;
    const first =
      (trip != null && rows.find((r) => r.trip === trip)) ||
      (now != null && rows.find((r) => r.dep >= now - 30)) ||
      rows[0];
    if (first) pick(first, my);
    else {
      linePage.sel.value = null;
      linePage.selTimes.value = [];
    }
  } catch {
    if (session.isCurrent(my)) {
      linePage.times.value = [];
      linePage.loading.value = false;
    }
  }
}
/** A time chosen: that trip's time at every stop of the list. */
async function pick(r: LineTime, my = session.current()): Promise<void> {
  const info = current;
  if (!info) return;
  linePage.sel.value = r.trip;
  linePage.selLive.value = [];
  void selLive(my);
  try {
    const ts = await tripStopsCached(r.trip);
    if (!session.isCurrent(my) || linePage.sel.value !== r.trip) return;
    // by stop, and by name for a train calling at another platform of the same station
    const byStop = new Map<number, number>(),
      byName = new Map<string, number>();
    for (const s of ts.stops as { stop: number; name: string; dep: number }[]) {
      byStop.set(s.stop, s.dep);
      byName.set(s.name, s.dep);
    }
    linePage.selTimes.value = info.stops.map((s) => byStop.get(s.stop) ?? byName.get(s.name) ?? null);
  } catch {
    /* the times at the stop stay */
  }
}
export function closeLine(): void {
  session.end();
  current = null;
  seenNow = { vs: [], st: [] };
}
/** The chosen trip's live time at each stop of the list, when its vehicle is among the line's: the time the rider is
 *  shown everywhere (delays.js liveAt), so the line and a trip with that ride say the same. By stop, and by name for a
 *  train calling at another platform of the same station. */
async function selLive(my = session.current()): Promise<void> {
  const info = current,
    trip = linePage.sel.value,
    k = seenNow.st.findIndex((s) => s && s.trip === trip);
  if (!info || trip == null || k < 0) {
    linePage.selLive.value = [];
    return;
  }
  const day = data.dayInfo.value?.date || '';
  try {
    const ts = await tripStopsCached(trip);
    const est = await estimate(seenNow.vs[k], ts.stops, day);
    if (!session.isCurrent(my) || linePage.sel.value !== trip) return;
    if (!est) {
      linePage.selLive.value = [];
      return;
    }
    const byStop = new Map<number, linePage.LiveTime>(),
      byName = new Map<string, linePage.LiveTime>();
    (ts.stops as { stop: number; name: string }[]).forEach((s, i) => {
      const at = delays.liveAt(est, ts.stops, i);
      if (!at) return;
      const lt = { time: at.time, delay: at.delay, passed: at.passed, stale: !!at.stale };
      byStop.set(s.stop, lt);
      byName.set(s.name, lt);
    });
    linePage.selLive.value = info.stops.map((s) => byStop.get(s.stop) ?? byName.get(s.name) ?? null);
  } catch (e) {
    console.warn('line: live times of the trip chosen', e); // the timetable stays
  }
}

/** The line's vehicles on its map, with how late each runs. */
async function lineLive(): Promise<void> {
  const info = current;
  let ids: (number | string)[] = [];
  if (info?.routeIds?.length) ids = info.routeIds;
  else if (info?.routeId != null) ids = [info.routeId];
  if (!info || !nav.isOpen('lineDetail') || !map.liveOn() || !ids.length) return;
  const my = session.current();
  try {
    // a train line is many routes in the feed (one per train): every train in the country, then those of this line
    const vs =
      ids.length > 1
        ? (await feed.trains()).filter((v: { lineRef: unknown }) => ids.includes(Number(v.lineRef)))
        : await feed.vehiclesByLine(ids[0]);
    if (!session.isCurrent(my)) return;
    const st = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
    if (!session.isCurrent(my)) return;
    map.showVehicles('lineDetail', 'line', {
      vs,
      statuses: st,
      routeType: info.routeType,
      mine: null,
      fallback: { line: info.line, headsign: info.headsign, agency: info.agency, route: info.route },
    });
    seenNow = { vs, st };
    void selLive(my);
    const nw = feed.newest(vs);
    linePage.liveText.value =
      vs.length && nw ? `${t('vehiclesOnLine', { n: vs.length })} · ${timeOf(nw)}` : t('noLineVehicles');
    linePage.liveOk.value = vs.length > 0;
  } catch (e) {
    console.warn('line: its vehicles', e); // the schedule stays
  }
}

/** The other direction of the line, at its stop nearest the one chosen here (across the street, usually). */
export function openOtherDirection(route: number): void {
  const a = current?.stops[linePage.anchor.value];
  void openLine(route, a ? { near: a } : {});
}
/** A stop of the list tapped: the times at it. */
export function chooseAnchor(i: number): void {
  void setAnchor(i);
}
/** A time tapped: that trip at every stop. */
export function chooseTime(r: LineTime): void {
  void pick(r);
}

/** Start: the line's vehicles once the map has drawn it. */
export function install(): void {
  // the line's vehicles, once the map has drawn its course (map/render.ts)
  map.afterDraw.lineDetail = () => {
    lineLive();
  };
}
