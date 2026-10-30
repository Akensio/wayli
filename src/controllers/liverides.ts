// Live times for a list of rides between two places (the trains between two stations, a journey's ride and the other
// lines that do it): each ride's vehicle, matched by its line and first departure, placed on its trip, and its time at
// the stop it is boarded at and the one it is left at. The vehicles come by line: from the relay that is a filter on
// the minute's snapshot already in the worker; only without it is each line a request to Hasadna.
import * as clock from '../engine/clock.js';
import * as delays from '../engine/delays.js';
import * as feed from '../engine/feed.js';
import { tripStopsCached, estimate } from '../worker/client';
import type { TrainRow, LiveTrain } from '../state/station';

export async function liveRides(
  rows: TrainRow[],
  day: string,
): Promise<{ live: Record<string, LiveTrain>; newest: Date | null }> {
  const now = clock.nowOn(day);
  const soon = rows.filter((r) => r.routeId != null && r.dep - now < 7200 && r.dep - now > -600).slice(0, 12);
  const out: Record<string, LiveTrain> = {};
  if (!soon.length) return { live: out, newest: null };
  // trains: every train in the country is one request (each train is a line of its own in the feed); else by line
  const ids = [...new Set(soon.map((r) => r.routeId))].slice(0, 8);
  const vs: any[] = soon.every((r) => r.routeType === 2)
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
