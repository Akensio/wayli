// Live times for a list of rides between two places (the trains between two stations, a journey's ride and the other
// lines that do it): each ride's vehicle, matched by its line and first departure, placed on its trip, and its time at
// the stop it is boarded at and the one it is left at. The vehicles come by line: from the relay that is a filter on
// the minute's snapshot already in the worker; only without it is each line a request to Hasadna.
import * as clock from '../engine/clock.ts';
import * as delays from '../engine/delays.ts';
import * as feed from '../engine/feed.ts';
import type { Vehicle } from '../engine/feed.ts';
import { tripStopsCached, estimate } from '../worker/client';
import type { TrainRow, LiveTrain } from '../state/station';
import type { RideLeg } from '../journey/types';
import { call } from '../worker/client';
import * as map from '../map/index';

export async function liveRides(
  rows: TrainRow[],
  day: string,
): Promise<{ live: Record<string, LiveTrain>; newest: Date | null }> {
  const now = clock.nowOn(day);
  const soon = rows
    .filter(
      (r): r is TrainRow & { routeId: number | string; firstDep: number } =>
        r.routeId != null && r.firstDep != null && r.dep - now < 7200 && r.dep - now > -600,
    )
    .slice(0, 12);
  const out: Record<string, LiveTrain> = {};
  if (!soon.length) return { live: out, newest: null };
  // trains: every train in the country is one request (each train is a line of its own in the feed); else by line
  const ids = [...new Set(soon.map((r) => r.routeId))].slice(0, 8);
  const vs: Vehicle[] = soon.every((r) => r.routeType === 2)
    ? await feed.trains()
    : (await Promise.all(ids.map((id) => feed.vehiclesByLine(id).catch(() => [])))).flat();
  for (const r of soon) {
    const v = feed.matchTrip(vs, r.routeId, r.firstDep, day);
    if (!v) continue;
    const ts = await tripStopsCached(r.trip);
    const est = await estimate(v, ts.stops, day);
    const a = delays.liveAt(est, ts.stops, r.boardPos),
      b = delays.liveAt(est, ts.stops, r.alightPos);
    if (!a || !b) continue;
    out[String(r.trip)] = {
      passed: a.passed,
      dep: a.time,
      arr: b.time,
      delayMin: delays.delayMinutes(a.delay),
      stale: !!a.stale,
    };
  }
  return { live: out, newest: feed.newest(vs) };
}

/** What is seen of one ride: its line's vehicles (with their statuses for the map, when `withStatuses`), the ride's
 *  own vehicle among them, and that vehicle's estimate along the trip's stops. Null when the live data could not be had
 *  (the network, the worker): the one place the journey's and following's live parts expect a failure. */
export async function seeRide(
  leg: RideLeg & { routeId: number | string; firstDep: number },
  day: string,
  withStatuses: boolean,
) {
  try {
    const vs = await feed.vehiclesByLine(leg.routeId);
    const statuses =
      withStatuses && vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
    const v = feed.matchTrip(vs, leg.routeId, leg.firstDep, day);
    const ts = v ? await tripStopsCached(leg.trip) : null;
    const est = v && ts ? await estimate(v, ts.stops, day) : null;
    return { vs, statuses, v, ts, est };
  } catch (e) {
    console.warn('live for a ride', e);
    return null;
  }
}
