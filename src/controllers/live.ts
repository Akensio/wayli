// The one look for live times: each screen says which trips it shows (`watch`), and every LOOK_MS while the app is in
// view the worker is asked for all of them at once and the store (state/live.ts) is replaced with its answer. A plan
// hands in the times it was routed on (`seed`), so its results are drawn as planned without waiting for a look.
import * as clock from '../engine/clock.ts';
import * as feed from '../engine/feed.ts';
import * as data from '../state/data';
import * as live from '../state/live';
import * as map from '../map/index';
import { call } from '../worker/client';
import type { LiveTrips } from '../worker/ops';
import type { RideLeg } from '../trip/journey';

const LOOK_MS = 30000;
/** How far before now a list of departures from now is asked for (s): one listed earlier and running late is still to
 *  come and belongs in it (trip/now.ts toCome decides what of it is shown). */
export const LOOK_BACK_S = 3600;
const watched = new Map<string, readonly number[]>(); // what each screen shows, by the screen's name
let timer = 0,
  looking = 0;

/** Live times are for the service day that is on now, with live times switched on. */
const wanted = (): boolean => map.liveOn() && data.dayInfo.value?.date === clock.serviceDay().day;

async function look(): Promise<void> {
  const ids = [...new Set([...watched.values()].flat())];
  if (!wanted() || !ids.length) {
    live.trips.value = {};
    live.state.value = 'off';
    return;
  }
  const mine = ++looking;
  try {
    const r = await call('live', { urls: feed.RELAY_URLS, trips: ids });
    if (mine !== looking) return; // a later look answered first
    live.trips.value = r.trips;
    live.asOf.value = r.asOf;
    live.state.value = 'ok';
  } catch {
    if (mine !== looking) return;
    live.trips.value = {}; // an old answer is not shown as live
    live.state.value = 'failed';
  }
}
/** A screen shows these trips from now on (in place of what it showed before): looked up at once. */
export function watch(screen: string, tripIds: readonly number[]): void {
  watched.set(screen, tripIds);
  if (!timer) {
    timer = window.setInterval(() => {
      if (!document.hidden) void look();
    }, LOOK_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void look();
    });
  }
  void look();
}
/** A screen closed: its trips are no longer asked for. */
export function unwatch(screen: string): void {
  watched.delete(screen);
}
/** The live times a plan was routed on, taken in at once (the next look replaces them). */
export function seed(r: LiveTrips | null | undefined): void {
  if (!r || !wanted()) return;
  live.trips.value = { ...live.trips.value, ...r.trips };
  live.asOf.value = r.asOf;
  live.state.value = 'ok';
}
/** A ride's line on the map: its vehicles as markers for `panel`, the ride's own marked. `still` says whether the
 *  panel still shows what asked. */
export async function showRideVehicles(
  panel: Parameters<typeof map.showVehicles>[0],
  key: string,
  l: RideLeg,
  still: () => boolean,
): Promise<void> {
  if (l.routeId == null || !wanted()) return;
  const vs = await feed.vehiclesByLine(l.routeId).catch(() => null);
  if (!vs || !still()) return;
  const statuses = vs.length
    ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }).catch(() => [])
    : [];
  if (!still()) return;
  map.showVehicles(panel, key, {
    vs,
    statuses,
    routeType: l.routeType,
    mine: l.trip,
    fallback: { line: l.line, headsign: l.headsign, agency: l.agency, route: l.route },
  });
}
