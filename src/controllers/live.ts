// The one look for live times: each screen that follows a trip, a stop or a line says which trips it shows (`watch`),
// and every LOOK_MS while the app is in view the worker is asked for all of them at once and the store (state/live.ts)
// is replaced with its answer. The search results are not watched: they stay as answered until the rider asks again
// (state/results.ts), and hand what they know to the screen a journey is opened on.
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
/** A screen shows these trips from now on (in place of what it showed before): looked up at once. `known`: what the
 *  search results showed of them, drawn until the look answers, so a journey opens as its card showed it. */
export function watch(screen: string, tripIds: readonly number[], known?: LiveTrips | null): void {
  watched.set(screen, tripIds);
  const mine = known && wanted() ? tripIds.filter((id) => known.trips[id]) : [];
  if (mine.length) {
    live.trips.value = { ...live.trips.value, ...Object.fromEntries(mine.map((id) => [id, known!.trips[id]])) };
    live.asOf.value = known!.asOf;
    live.state.value = 'ok';
  }
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
