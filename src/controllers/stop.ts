// A stop in the sheet, the one view of a stop wherever it was opened (the map, a search, a line, a trip): its lines,
// next departures (from now, or from the bar's time on another day) refreshed with live times every 45 s while it is
// open, from here and to here; a station is all its platforms, and where its trains go without a change.
import * as clock from '../engine/clock.ts';
import * as delays from '../engine/delays.ts';
import * as feed from '../engine/feed.ts';
import type { Vehicle } from '../engine/feed.ts';
import { isNowDay } from '../lib/time';
import { call, tripStopsCached, estimate } from '../worker/client';
import { livePoll } from './livepoll';
import { toast } from '../widgets/toast';
import { t } from '../lib/i18n';
import * as nav from '../state/nav';
import * as stopPage from '../state/stop';
import type { StopInfo, Departure } from '../state/stop';
import { recentViews } from '../state/store.ts';
import { openLine } from './line';
import * as query from '../state/query';

let current: StopInfo | null = null,
  seq = 0,
  timer = 0;

export async function openStop(stop: number, where: { station?: number; stops?: number[] } = {}): Promise<void> {
  const my = ++seq;
  let info: StopInfo;
  try {
    info = await call('stopInfo', { stop, station: where.station ?? -1, stops: where.stops || null });
  } catch {
    if (my === seq) toast(t('liveFail'));
    return;
  }
  if (my !== seq) return;
  current = info;
  const members = info.stops && info.stops.length ? info.stops : [stop];
  // a station, or a platform the trains of a station call at (one platform, a light rail stop): kept as a station
  recentViews.add(
    (info.station != null && info.station >= 0) || info.reach
      ? { type: 'station', name: info.name, lat: info.lat, lon: info.lon, mode: info.reach || undefined }
      : { type: 'stop', code: info.code || '', name: info.name, city: info.city, lat: info.lat, lon: info.lon },
  );
  // the map draws the stop and its lines' courses (map/render.ts)
  const day = query.day.value,
    isNow = isNowDay(day);
  stopPage.open(info, day, isNow);
  const from = isNow ? clock.nowOn(day) - 120 : query.atSeconds();
  // a station's trains: where they go without a change, the next one there and how long it takes
  if (info.reach)
    call('stationReach', { stops: members, fromTime: from + 120, mode: info.reach })
      .then((d) => {
        if (my === seq) stopPage.dests.value = d;
      })
      .catch(() => {
        if (my === seq) stopPage.dests.value = [];
      });
  let deps: Departure[];
  try {
    deps = await call('departures', { stop, stops: members, fromTime: from, limit: 40 });
  } catch {
    if (my === seq) stopPage.deps.value = []; // the page says there is nothing to show, not "loading" for ever
    return;
  }
  if (my !== seq) return;
  stopPage.deps.value = deps;
  clearInterval(timer);
  if (isNow) timer = livePoll('stopDetail', stopPage.liveNote, () => liveForStop(info, deps, day, my));
}
export function closeStop(): void {
  clearInterval(timer);
  seq++;
}

/** Live times for the departures of a stop: one request for the vehicles around it, then by line for what it missed.
 *  The newest report seen, for the note (livePoll). */
async function liveForStop(
  info: StopInfo,
  deps: Departure[],
  day: string,
  my: number,
): Promise<Date | null | undefined> {
  const now = clock.nowOn(day);
  const soon = deps
    .filter(
      (d): d is Departure & { routeId: number | string; firstDep: number } =>
        d.routeId != null && d.firstDep != null && d.time - now < 3600 && d.time - now > -300,
    )
    .slice(0, 16);
  if (!soon.length) return undefined;
  let vs: Vehicle[] = await feed.vehiclesNear(info.lat, info.lon, 8);
  if (my !== seq) return undefined;
  const unmatched = new Set(
    soon.filter((d) => !feed.matchTrip(vs, d.routeId, d.firstDep, day) && d.time - now < 1800).map((d) => d.routeId),
  );
  if (unmatched.size) {
    const more = await Promise.all(
      Array.from(unmatched)
        .slice(0, 6)
        .map((r) => feed.vehiclesByLine(r).catch(() => [])),
    );
    vs = vs.concat(more.flat());
  }
  if (my !== seq) return undefined;
  for (const d of soon) {
    const v = feed.matchTrip(vs, d.routeId, d.firstDep, day);
    if (!v) continue;
    const ts = await tripStopsCached(d.trip);
    if (my !== seq) return undefined;
    const at0 = info.stops && info.stops.length ? info.stops : [info.stop]; // any platform of a station
    const idx = ts.stops.findIndex((s: { stop: number; dep: number }) => at0.includes(s.stop) && s.dep === d.time);
    const est = await estimate(v, ts.stops, day);
    if (my !== seq) return undefined;
    const at = delays.liveAt(est, ts.stops, idx < 0 ? 0 : idx);
    if (!at) continue;
    stopPage.setLive(
      d.trip,
      at.passed
        ? { passed: true }
        : { passed: false, time: at.time, stale: !!at.stale, delayMin: delays.delayMinutes(at.delay) },
    );
  }
  return feed.newest(vs);
}

/** The live times asked again. */
export function refreshStop(): void {
  if (current) openStop(current.stop, { stops: current.stops });
}
/** A line of the stop: its timetable at this stop. */
export function openLineAtStop(route: number): void {
  const c = current;
  void openLine(route, c ? { stop: c.stop, near: c } : {});
}
// What the page's own flow needs back from here: the panel's history entry.
Object.assign(stopPage.hooks, { show: () => nav.showOverlay('stopDetail') });
