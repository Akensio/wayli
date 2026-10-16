// Wayli: compact timetable loader + RAPTOR trip planner.
// Plain ES module, runs in the browser and in Node (see bench.mjs).

const TYPES = { int32: Int32Array, uint16: Uint16Array, float32: Float32Array };

/** Parse the decompressed timetable container into typed arrays. */
export function parseTimetable(ab) {
  const headerLen = new DataView(ab).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, headerLen)));
  const base = 4 + headerLen;
  const tt = { header, counts: header.counts, routes: header.routes, stops: header.stops };
  for (const s of header.sections) {
    tt[s.name] = new TYPES[s.dtype](ab, base + s.offset, s.length);
  }
  expandTimes(tt);
  return tt;
}

/** Turn (tripStart, depDelta, dwell) into absolute arrival/departure arrays. */
function expandTimes(tt) {
  const n = tt.depDelta.length;
  const dep = new Int32Array(n), arr = new Int32Array(n);
  const { patStopsOff, patTripsOff, tripTimesOff, tripStart, depDelta, dwell } = tt;
  const P = patStopsOff.length - 1;
  for (let p = 0; p < P; p++) {
    const ns = patStopsOff[p + 1] - patStopsOff[p];
    let idx = tripTimesOff[p];
    for (let t = patTripsOff[p]; t < patTripsOff[p + 1]; t++) {
      let cur = tripStart[t];
      for (let i = 0; i < ns; i++, idx++) {
        cur += depDelta[idx];
        dep[idx] = cur;
        arr[idx] = cur - dwell[idx];
      }
    }
  }
  tt.dep = dep;
  tt.arr = arr;
  // trip -> pattern, for journey reconstruction
  const tripPat = new Int32Array(tripStart.length);
  for (let p = 0; p < P; p++) for (let t = patTripsOff[p]; t < patTripsOff[p + 1]; t++) tripPat[t] = p;
  tt.tripPat = tripPat;
}

/** Stops whose name contains the query (case-insensitive). Returns indices. */
export function searchStops(tt, query, limit = 20) {
  const q = query.toLowerCase();
  const out = [];
  for (let i = 0; i < tt.stops.length && out.length < limit; i++) {
    if (tt.stops[i][1].toLowerCase().includes(q) || tt.stops[i][2] === query) out.push(i);
  }
  return out;
}

const INF = 0x7fffffff;

/**
 * RAPTOR: earliest arrival at `dest` from `origin` leaving at or after `depTime`
 * (seconds since midnight), one journey per number of transfers that improves.
 */
export function plan(tt, origin, dest, depTime, maxTransfers = 3) {
  const t0 = now();
  const S = tt.stops.length;
  const K = maxTransfers + 1;
  const { patStopsOff, patStops, patTripsOff, tripTimesOff, stopPatsOff, stopPats,
          trOff, trTo, trTime, dep, arr } = tt;

  // tau[k][s]: best arrival at s using at most k trips. Labels explain how.
  const tau = [];
  const lblType = [], lblTrip = [], lblBoardPos = [], lblAlightPos = [], lblFrom = [];
  for (let k = 0; k <= K; k++) {
    tau.push(new Int32Array(S).fill(INF));
    lblType.push(new Int8Array(S));        // 0 none, 1 ride, 2 walk
    lblTrip.push(new Int32Array(S));
    lblBoardPos.push(new Int32Array(S));
    lblAlightPos.push(new Int32Array(S));
    lblFrom.push(new Int32Array(S));
  }
  const best = new Int32Array(S).fill(INF);
  let marked = new Uint8Array(S);
  let markedList = [];

  const relaxWalks = (k, fromList) => {
    for (const p of fromList) {
      const tp = tau[k][p];
      for (let i = trOff[p]; i < trOff[p + 1]; i++) {
        const q = trTo[i], tq = tp + trTime[i];
        if (tq < tau[k][q] && tq < best[q]) {
          tau[k][q] = tq; best[q] = tq;
          lblType[k][q] = 2; lblFrom[k][q] = p;
          if (!marked[q]) { marked[q] = 1; markedList.push(q); }
        }
      }
    }
  };

  tau[0][origin] = depTime; best[origin] = depTime;
  marked[origin] = 1; markedList.push(origin);
  relaxWalks(0, [origin]);

  let rounds = 0;
  for (let k = 1; k <= K; k++) {
    rounds = k;
    tau[k].set(tau[k - 1]);
    // routes to scan: pattern -> earliest marked position
    const Q = new Map();
    for (const s of markedList) {
      for (let i = stopPatsOff[s]; i < stopPatsOff[s + 1]; i++) {
        const p = stopPats[2 * i], pos = stopPats[2 * i + 1];
        const cur = Q.get(p);
        if (cur === undefined || pos < cur) Q.set(p, pos);
      }
    }
    marked = new Uint8Array(S); markedList = [];
    const improved = [];
    for (const [p, startPos] of Q) {
      const ns = patStopsOff[p + 1] - patStopsOff[p];
      const sBase = patStopsOff[p];
      const tFirst = patTripsOff[p], tEnd = patTripsOff[p + 1];
      const nTrips = tEnd - tFirst;
      if (nTrips === 0) continue;
      const base = tripTimesOff[p];
      let t = -1, boardPos = -1;
      for (let pos = startPos; pos < ns; pos++) {
        const stop = patStops[sBase + pos];
        if (t >= 0) {
          const a = arr[base + (t - tFirst) * ns + pos];
          if (a < best[stop] && a < best[dest]) {
            tau[k][stop] = a; best[stop] = a;
            lblType[k][stop] = 1; lblTrip[k][stop] = t;
            lblBoardPos[k][stop] = boardPos; lblAlightPos[k][stop] = pos;
            if (!marked[stop]) { marked[stop] = 1; markedList.push(stop); improved.push(stop); }
          }
        }
        // can we catch an earlier trip here?
        const ready = tau[k - 1][stop];
        if (ready === INF) continue;
        if (t < 0 || ready <= dep[base + (t - tFirst) * ns + pos]) {
          // earliest trip departing this stop at or after `ready` (binary search over trips)
          let lo = 0, hi = nTrips;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (dep[base + mid * ns + pos] < ready) lo = mid + 1; else hi = mid;
          }
          if (lo < nTrips && (t < 0 || tFirst + lo < t)) { t = tFirst + lo; boardPos = pos; }
        }
      }
    }
    if (improved.length === 0) break;
    relaxWalks(k, improved);
  }

  // journeys: one per round that improved the destination
  const journeys = [];
  let prevBest = INF;
  for (let k = 0; k <= K; k++) {
    if (tau[k][dest] >= prevBest) continue;
    prevBest = tau[k][dest];
    const legs = [];
    let s = dest, kk = k;
    while (kk >= 0) {
      const type = lblType[kk][s];
      if (type === 0) { kk--; continue; }
      if (type === 2) {
        const from = lblFrom[kk][s];
        legs.push({ type: 'walk', from, to: s, seconds: tau[kk][s] - tau[kk][from],
                    depart: tau[kk][from], arrive: tau[kk][s] });
        s = from;
        if (s === origin && kk === 0) break;
        continue;
      }
      const t = lblTrip[kk][s], p = tt.tripPat[t];
      const ns = patStopsOff[p + 1] - patStopsOff[p];
      const base = tripTimesOff[p] + (t - patTripsOff[p]) * ns;
      const bp = lblBoardPos[kk][s], ap = lblAlightPos[kk][s];
      const from = patStops[patStopsOff[p] + bp];
      legs.push({ type: 'ride', trip: t, route: patRouteOf(tt, p), from, to: s,
                  depart: dep[base + bp], arrive: arr[base + ap], stops: ap - bp,
                  via: Array.from(patStops.subarray(patStopsOff[p] + bp, patStopsOff[p] + ap + 1)) });
      s = from; kk--;
    }
    legs.reverse();
    journeys.push({ transfers: k - 1 < 0 ? 0 : k - 1, arrive: tau[k][dest], depart: depTime, legs });
  }
  return { journeys, rounds, ms: now() - t0 };
}

function patRouteOf(tt, p) { return tt.routes[tt.patRoute[p]]; }

function now() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now());
}

export function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Human-readable journey, for logs and the test page. */
export function describe(tt, j) {
  const name = (s) => tt.stops[s][1];
  const lines = [`${fmtTime(j.depart)} -> ${fmtTime(j.arrive)}, ${j.transfers} transfers`];
  for (const l of j.legs) {
    if (l.type === 'walk') lines.push(`  walk ${Math.round(l.seconds / 60)} min: ${name(l.from)} -> ${name(l.to)}`);
    else lines.push(`  ${fmtTime(l.depart)} line ${l.route[0] || (l.route[3] === 2 ? "train" : l.route[1])} (${l.route[2]}) ${name(l.from)} -> ${name(l.to)} ${fmtTime(l.arrive)}, ${l.stops} stops`);
  }
  return lines.join('\n');
}
