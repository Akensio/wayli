// Trips: a trip's stops and times (as scheduled, or as shifted by live data during a plan), the trip a reported
// vehicle runs, and the direct trips between two places (the trains between two stations, a journey's ride options).
import { patternLength, patternStop, routeLabel, timesRow, tripRange, patternsAt } from '../engine/raptor.ts';
import { secondsOn } from '../engine/clock.ts';
import { haversine } from '../engine/geo.ts';
import { tt } from './data.ts';
import { indexRoutes, routeById, routePats } from './lines.ts';
import { headsign, liveId, sName, stopOut } from './names.ts';
import { stationOf } from './stops.ts';
import type { OpsPart, TrainRow, TripStop } from './ops.ts';

/** A stop of a trip as the delay estimates read it (engine/delays.ts TimedStop): where it is (degrees), the number
 *  on its sign (what names the learned sections), and the trip's times there, seconds on the service day, as the
 *  timetable holds them now (shifted by live data for the length of a plan). */
export type TripStopRow = { lat: number; lon: number; code: string; arr: number; dep: number };
/** A trip's stops with where its times are in the timetable: its pattern `p`, the pattern's `ns` stops, and `base`,
 *  the index of its first stop's times in dep and arr. */
export type TripStopList = { p: number; ns: number; base: number; stops: TripStopRow[] };

/** A trip's scheduled times, untouched by any live shift: from the stored start and deltas. */
export function rawTimes(p: number, t: number): { dep: Int32Array; arr: Int32Array } {
  const ns = patternLength(tt!, p),
    base = timesRow(tt!, t);
  const dep = new Int32Array(ns),
    arr = new Int32Array(ns);
  let cur = tt!.tripStart[t];
  for (let i = 0; i < ns; i++) {
    cur += tt!.depDelta[base + i];
    dep[i] = cur;
    arr[i] = cur - tt!.dwell[base + i];
  }
  return { dep, arr };
}
/** The trip of a route whose first departure is at `start` (seconds on the loaded day), else -1. */
export function tripFor(routeId: number | string | null, start: number): number {
  if (!routeById) indexRoutes();
  const ri = routeById!.get(String(routeId));
  if (ri == null) return -1;
  for (const p of routePats!.get(ri) || []) {
    const { first, end } = tripRange(tt!, p);
    for (let t = first; t < end; t++) if (Math.abs(tt!.tripStart[t] - start) <= 90) return t; // the schedule: plan.ts shifts dep for live delays
  }
  return -1;
}
export function tripStopList(t: number): TripStopList {
  const p = tt!.tripPat[t],
    ns = patternLength(tt!, p),
    base = timesRow(tt!, t);
  const out: TripStopRow[] = [];
  for (let i = 0; i < ns; i++) {
    const s = patternStop(tt!, p, i);
    out.push({
      lat: tt!.stopLat[s],
      lon: tt!.stopLon[s],
      code: tt!.stops[s][2],
      arr: tt!.arr[base + i],
      dep: tt!.dep[base + i],
    });
  }
  return { p, ns, base, stops: out };
}

export const tripsOps = {
  /**
   * A ride of a journey as a station sees it: every trip, of any line, that goes from where the ride boards straight to
   * where it gets off, from `fromTime` on. Both ends are widened to the whole place: a station's platforms, or the stops
   * of the same name within 150 m (one street corner's stops for different lines).
   */
  rideOptions({ from, to, fromTime, limit = 40 }): TrainRow[] {
    const widen = (ss: number[]): number[] => {
      const out = new Set<number>();
      for (const s of ss) {
        for (const x of stationOf(s).stops) out.add(x);
        if (tt!.stopParent[s] >= 0) continue;
        const name = sName(s);
        for (let x = 0; x < tt!.stops.length; x++)
          if (
            tt!.stopParent[x] < 0 &&
            sName(x) === name &&
            haversine(tt!.stopLat[s], tt!.stopLon[s], tt!.stopLat[x], tt!.stopLon[x]) <= 150
          )
            out.add(x);
      }
      return [...out];
    };
    return tripsOps.trainsBetween({ from: widen(from), to: widen(to), fromTime, limit });
  },
  /** The direct trains between two stations (their platforms), leaving from `fromTime` on: when, how long, which train. */
  trainsBetween({ from, to, fromTime, limit = 24 }): TrainRow[] {
    const B = new Set(to),
      out: TrainRow[] = [],
      seen = new Set<number>();
    for (const s of from) {
      for (const { p, pos } of patternsAt(tt!, s)) {
        const ns = patternLength(tt!, p);
        let j = -1;
        for (let k = pos + 1; k < ns; k++)
          if (B.has(patternStop(tt!, p, k))) {
            j = k;
            break;
          }
        if (j < 0) continue;
        const r = tt!.routes[tt!.patRoute[p]];
        const { first, end } = tripRange(tt!, p);
        for (let t = first; t < end; t++) {
          const base = timesRow(tt!, t),
            dep = tt!.dep[base + pos];
          if (dep < fromTime || seen.has(t)) continue;
          seen.add(t);
          out.push({
            trip: t,
            pattern: p,
            dep,
            arr: tt!.arr[base + j],
            stops: j - pos,
            boardPos: pos,
            alightPos: j,
            line: routeLabel(r),
            routeType: r[3],
            agency: r[2],
            routeId: liveId(r),
            estimated: !!r[6],
            headsign: headsign(tt!.patRoute[p]),
            firstDep: tt!.dep[base],
            fromStop: s,
            toStop: patternStop(tt!, p, j),
          });
        }
      }
    }
    out.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
    return out.slice(0, limit);
  },
  /** The trip a reported vehicle is running: route id and scheduled start (ISO or ms). */
  tripFor({ routeId, scheduledStart }) {
    return tripFor(routeId, secondsOn(new Date(scheduledStart), tt!.header.date));
  },
  /** One trip's every stop with times, plus what identifies it in real-time data. */
  tripStops({ trip }) {
    const p = tt!.tripPat[trip],
      ns = patternLength(tt!, p);
    const base = timesRow(tt!, trip);
    const r = tt!.routes[tt!.patRoute[p]];
    const stops: TripStop[] = [];
    for (let i = 0; i < ns; i++) {
      const s = patternStop(tt!, p, i);
      stops.push({ ...stopOut(s), arr: tt!.arr[base + i], dep: tt!.dep[base + i] });
    }
    return {
      trip,
      route: tt!.patRoute[p],
      routeId: liveId(r),
      estimated: !!r[6],
      line: routeLabel(r),
      headsign: headsign(tt!.patRoute[p]),
      routeType: r[3],
      agency: r[2],
      firstDep: tt!.dep[base],
      stops,
    };
  },
} satisfies OpsPart<'rideOptions' | 'trainsBetween' | 'tripFor' | 'tripStops'>;
