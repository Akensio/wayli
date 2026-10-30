// Trips: a trip's stops and times (as scheduled, or as shifted by live data during a plan), the trip a reported
// vehicle runs, and the direct trips between two places (the trains between two stations, a journey's ride options).
import { routeLabel } from '../engine/raptor.js';
import { secondsOn } from '../engine/clock.js';
import { haversine } from '../engine/geo.js';
import { tt } from './data.js';
import { indexRoutes, routeById, routePats } from './lines.js';
import { headsign, liveId, sName, stopOut } from './names.js';
import { stationOf } from './stops.js';

/** A trip's scheduled times, untouched by any live shift: from the stored start and deltas. */
export function rawTimes(p, t) {
  const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p],
    base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns;
  const dep = new Int32Array(ns),
    arr = new Int32Array(ns);
  let cur = tt.tripStart[t];
  for (let i = 0; i < ns; i++) {
    cur += tt.depDelta[base + i];
    dep[i] = cur;
    arr[i] = cur - tt.dwell[base + i];
  }
  return { dep, arr };
}
/** The trip of a route whose first departure is at `start` (seconds on the loaded day), else -1. */
export function tripFor(routeId, start) {
  if (!routeById) indexRoutes();
  const ri = routeById.get(String(routeId));
  if (ri == null) return -1;
  for (const p of routePats.get(ri) || []) {
    const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
    for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++)
      if (Math.abs(tt.dep[tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns] - start) <= 90) return t;
  }
  return -1;
}
export function tripStopList(t) {
  const p = tt.tripPat[t],
    ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p],
    base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns;
  const out = [];
  for (let i = 0; i < ns; i++) {
    const s = tt.patStops[tt.patStopsOff[p] + i];
    out.push({
      lat: tt.stopLat[s],
      lon: tt.stopLon[s],
      code: tt.stops[s][2],
      arr: tt.arr[base + i],
      dep: tt.dep[base + i],
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
  rideOptions({ from, to, fromTime, limit = 40 }) {
    const widen = (ss) => {
      const out = new Set();
      for (const s of ss) {
        for (const x of stationOf(s).stops) out.add(x);
        if (tt.stopParent[s] >= 0) continue;
        const name = sName(s);
        for (let x = 0; x < tt.stops.length; x++)
          if (
            tt.stopParent[x] < 0 &&
            sName(x) === name &&
            haversine(tt.stopLat[s], tt.stopLon[s], tt.stopLat[x], tt.stopLon[x]) <= 150
          )
            out.add(x);
      }
      return [...out];
    };
    return tripsOps.trainsBetween({ from: widen(from), to: widen(to), fromTime, limit });
  },
  /** The direct trains between two stations (their platforms), leaving from `fromTime` on: when, how long, which train. */
  trainsBetween({ from, to, fromTime, limit = 24 }) {
    const B = new Set(to),
      out = [],
      seen = new Set();
    for (const s of from) {
      for (let i = tt.stopPatsOff[s]; i < tt.stopPatsOff[s + 1]; i++) {
        const p = tt.stopPats[2 * i],
          pos = tt.stopPats[2 * i + 1];
        const o = tt.patStopsOff[p],
          ns = tt.patStopsOff[p + 1] - o;
        let j = -1;
        for (let k = pos + 1; k < ns; k++)
          if (B.has(tt.patStops[o + k])) {
            j = k;
            break;
          }
        if (j < 0) continue;
        const r = tt.routes[tt.patRoute[p]];
        for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++) {
          const base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns,
            dep = tt.dep[base + pos];
          if (dep < fromTime || seen.has(t)) continue;
          seen.add(t);
          out.push({
            trip: t,
            pattern: p,
            dep,
            arr: tt.arr[base + j],
            stops: j - pos,
            boardPos: pos,
            alightPos: j,
            line: routeLabel(r),
            routeType: r[3],
            agency: r[2],
            routeId: liveId(r),
            estimated: !!r[6],
            headsign: headsign(tt.patRoute[p]),
            firstDep: tt.dep[base],
            fromStop: s,
            toStop: tt.patStops[o + j],
          });
        }
      }
    }
    out.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
    return out.slice(0, limit);
  },
  /** The trip a reported vehicle is running: route id and scheduled start (ISO or ms). */
  tripFor({ routeId, scheduledStart }) {
    return tripFor(routeId, secondsOn(new Date(scheduledStart), tt.header.date));
  },
  /** One trip's every stop with times, plus what identifies it in real-time data. */
  tripStops({ trip }) {
    const p = tt.tripPat[trip],
      ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
    const base = tt.tripTimesOff[p] + (trip - tt.patTripsOff[p]) * ns;
    const r = tt.routes[tt.patRoute[p]];
    const stops = [];
    for (let i = 0; i < ns; i++) {
      const s = tt.patStops[tt.patStopsOff[p] + i];
      stops.push({ ...stopOut(s), arr: tt.arr[base + i], dep: tt.dep[base + i] });
    }
    return {
      trip,
      route: tt.patRoute[p],
      routeId: liveId(r),
      estimated: !!r[6],
      line: routeLabel(r),
      headsign: headsign(tt.patRoute[p]),
      routeType: r[3],
      agency: r[2],
      firstDep: tt.dep[base],
      stops,
    };
  },
};
