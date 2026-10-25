// Wayli: compact timetable loader + RAPTOR trip planner.
// Plain ES module, runs in the browser and in Node (see bench.mjs).
//
// plan()    one departure time, earliest arrival per number of transfers.
// profile() a departure window (range RAPTOR): every journey worth showing.
// Both take sets of origin and destination stops with access/egress walking
// times, so a station with many platforms, or a location with several stops
// nearby, is one query.

import { readContainer } from './container.js';
import { hhmm } from './clock.js';
import { norm, byScore } from './text.js';

const INF = 0x7fffffff;

/** Parse the decompressed timetable container into typed arrays. */
export function parseTimetable(ab) {
  const tt = readContainer(ab), header = tt.header;
  Object.assign(tt, { counts: header.counts, routes: header.routes, stops: header.stops,
                      stations: header.stations || [], names: header.names || {} });
  const w = header.walk || {};
  tt.slack = w.transfer_slack_s ?? 90;
  tt.chainMax = w.chain_max_s ?? 900;
  if (!tt.stopParent) tt.stopParent = new Int32Array(tt.stops.length).fill(-1);
  expandTimes(tt);
  buildSearchIndex(tt);
  return tt;
}

/** Turn (tripStart, depDelta, dwell) into absolute arrival/departure arrays. */
function expandTimes(tt) {
  const n = tt.depDelta.length;
  const dep = new Int32Array(n), arr = new Int32Array(n);
  const { patStopsOff, patTripsOff, tripTimesOff, tripStart, depDelta, dwell } = tt;
  const P = patStopsOff.length - 1;
  const tripPat = new Int32Array(tripStart.length);
  for (let p = 0; p < P; p++) {
    const ns = patStopsOff[p + 1] - patStopsOff[p];
    let idx = tripTimesOff[p];
    for (let t = patTripsOff[p]; t < patTripsOff[p + 1]; t++) {
      tripPat[t] = p;
      let cur = tripStart[t];
      for (let i = 0; i < ns; i++, idx++) {
        cur += depDelta[idx];
        dep[idx] = cur;
        arr[idx] = cur - dwell[idx];
      }
    }
  }
  tt.dep = dep; tt.arr = arr; tt.tripPat = tripPat;
  // GTFS route_type per pattern (0 light rail, 2 rail, 3 bus), for "bike on board" filtering
  const patType = new Int8Array(P);
  for (let p = 0; p < P; p++) patType[p] = tt.routes[tt.patRoute[p]][3];
  tt.patType = patType;
}

/**
 * Bikes on board, Israel (sources in docs/architecture.md):
 *  - folding bikes: any bus, light rail and train, at any hour;
 *  - other bikes: trains outside the weekday peaks (Sun-Thu 06:00-09:00, 15:00-19:00),
 *    intercity buses in the luggage compartment (space permitting); not city buses or light rail.
 */
const BIKE_RULES = {
  trainPeak: [[6 * 3600, 9 * 3600], [15 * 3600, 19 * 3600]],
  peakDays: [0, 1, 2, 3, 4],  // JS getDay(): Sunday..Thursday
};
function bikeAllowed(tt, p, depTime, folding, weekday = true) {
  if (folding) return true;
  const type = tt.patType[p];
  if (type === 2) {
    if (!weekday) return true;
    for (const [a, b] of BIKE_RULES.trainPeak) if (depTime >= a && depTime < b) return false;
    return true;
  }
  if (type === 3) return tt.patIntercity ? tt.patIntercity[p] === 1 : false;
  return false;
}

// ---------------------------------------------------------------- search

function buildSearchIndex(tt) {
  const S = tt.stops.length;
  tt.stopName = new Array(S);
  tt.stopCity = new Array(S);
  for (let i = 0; i < S; i++) {
    tt.stopName[i] = norm(tt.stops[i][1]);
    tt.stopCity[i] = norm(tt.stops[i][3] || '');
  }
  // the same names in the other languages the timetable carries, so a stop matches whichever one is typed
  tt.altNames = [];
  for (const [lang, n] of Object.entries(tt.names)) {
    if (!n || !n.stops) continue;
    const name = new Array(S), city = new Array(S);
    for (let i = 0; i < S; i++) { name[i] = n.stops[i] ? norm(n.stops[i]) : ''; city[i] = norm((n.cities && n.cities[tt.stops[i][3]]) || ''); }
    tt.altNames.push({ lang, name, city });
  }
  // station groups: parent index -> member stops
  tt.stationStops = new Map();
  for (let i = 0; i < S; i++) {
    const p = tt.stopParent[i];
    if (p >= 0) {
      if (!tt.stationStops.has(p)) tt.stationStops.set(p, []);
      tt.stationStops.get(p).push(i);
    }
  }
}

// ---------------------------------------------------------------- names in the rider's language

const other = (tt, lang) => (lang && lang !== 'he' && tt.names[lang]) || null;
/** A stop's name in `lang` when the timetable carries it, else as the feed names it (Hebrew). */
export function stopName(tt, s, lang) { const n = other(tt, lang); return (n && n.stops[s]) || tt.stops[s][1]; }
export function stationName(tt, p, lang) { const n = other(tt, lang); return (n && n.stations[p]) || (tt.stations[p] && tt.stations[p][1]) || ''; }
export function cityName(tt, city, lang) { const n = other(tt, lang); return (n && n.cities && n.cities[city]) || city || ''; }
/** Where a route is headed: the destination half of the MOT route_long_name "origin-city<->destination-city-1#". */
export function parseHeadsign(longName) {
  const parts = longName.split('<->');
  if (parts.length !== 2) return longName;
  const dest = parts[1].replace(/-\d+[#א-ת]*$/, '').trim();
  const i = dest.lastIndexOf('-');
  return i > 0 ? dest.slice(0, i).trim() : dest;
}
export function routeHeadsign(tt, ri, lang) { const n = other(tt, lang); return (n && n.routes && n.routes[ri]) || parseHeadsign(tt.routes[ri][1]); }

/** How well a name (with its city) answers the typed tokens; null when a token matches neither. */
function matchScore(name, city, tokens) {
  if (!name) return null;
  let score = 0;
  for (const tok of tokens) {
    if (name === tok || name.startsWith(tok + ' ')) score += 4;   // a whole first word (הל"ה/הדרים for "הלה"), not just a prefix (הלהב)
    else if (name.startsWith(tok)) score += 3;
    else if (name.includes(' ' + tok)) score += 2.5;
    else if (name.includes(tok)) score += 2;
    else if (city.startsWith(tok) || city.includes(' ' + tok)) score += 1;
    else if (city.includes(tok)) score += 0.5;
    else return null;
  }
  if (tokens.join(' ') === name) score += 1.5;   // the whole name, typed in full
  return score - name.length / 200;
}

/**
 * Search stops by name and city, in Hebrew or any language the timetable carries names in. Returns groups:
 * a station with all its platforms is one result, a plain stop is a group of one, named in `lang`.
 * [{ name, city, stops: [idx...], lat, lon, score }]
 */
export function searchStops(tt, query, limit = 12, lang = 'he') {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const S = tt.stops.length;
  const groups = new Map();
  for (let i = 0; i < S; i++) {
    let score = matchScore(tt.stopName[i], tt.stopCity[i], tokens);
    for (const a of tt.altNames) { const s2 = matchScore(a.name[i], a.city[i], tokens); if (s2 != null && (score == null || s2 > score)) score = s2; }
    if (score == null) continue;
    const p = tt.stopParent[i];
    if (p >= 0) score += 1;
    const key = p >= 0 ? 'p' + p : 's' + i;
    let g = groups.get(key);
    if (!g) {
      g = { key, name: (p >= 0 && stationName(tt, p, lang)) || stopName(tt, i, lang),
            city: cityName(tt, tt.stops[i][3], lang), stops: [], score: -Infinity, lat: 0, lon: 0, code: tt.stops[i][2] };
      groups.set(key, g);
    }
    g.stops.push(i);
    if (score > g.score) g.score = score;
  }
  const out = Array.from(groups.values());
  for (const g of out) {
    // a station with a partial name match: include all its platforms, not only the matching ones
    const p = tt.stopParent[g.stops[0]];
    if (p >= 0) g.stops = tt.stationStops.get(p).slice();
    let la = 0, lo = 0;
    for (const s of g.stops) { la += tt.stopLat[s]; lo += tt.stopLon[s]; }
    g.lat = la / g.stops.length; g.lon = lo / g.stops.length;
  }
  out.sort(byScore);
  return out.slice(0, limit);
}

// ---------------------------------------------------------------- routing

function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

/** Normalise an origin/destination argument: a stop index, a search group, or [{stop, walk}]. */
function asPlaces(x) {
  if (typeof x === 'number') return [{ stop: x, walk: 0 }];
  if (Array.isArray(x)) return x.map((e) => (typeof e === 'number' ? { stop: e, walk: 0 } : e));
  if (x && x.stops) return x.stops.map((s) => ({ stop: s, walk: 0 }));
  throw new Error('bad place');
}

/**
 * Range RAPTOR over [fromTime, toTime] (seconds since midnight).
 * origins / dests: stop index, search group, or [{stop, walk}] with access/egress seconds.
 * Returns { journeys, runs, candidates, ms }.
 */
export function profile(tt, origins, dests, fromTime, toTime, opts = {}) {
  const t0 = now();
  origins = asPlaces(origins); dests = asPlaces(dests);
  const maxTransfers = opts.maxTransfers ?? 3;
  const slack = opts.slack ?? tt.slack;
  // optional restriction to vehicle types (GTFS route_type), and the bike-on-board rules
  let allowed = null;
  if (opts.routeTypes) { allowed = new Uint8Array(8); for (const t of opts.routeTypes) allowed[t] = 1; }
  const patType = tt.patType;
  const bike = opts.bikeOnBoard ? { folding: !!opts.folding, weekday: opts.weekday ?? true } : null;
  const patOk = (p) => (!allowed || allowed[patType[p]]) && (!bike || bike.folding || patType[p] === 2 || (patType[p] === 3 && tt.patIntercity && tt.patIntercity[p] === 1));
  const tripOk = (p, d) => !bike || bikeAllowed(tt, p, d, bike.folding, bike.weekday);
  const chainMax = opts.maxWalkChain ?? Math.min(tt.chainMax, 600);
  // the whole walk at either end, the access or egress leg and any footpath chained to it, within the rider's longest
  // walk (seconds; unset: the footpaths only bounded by chainMax). A 15-minute walk to one stop plus 2 to the next
  // came out as a 17-minute start against a 15-minute setting (2026-10-22).
  const accessMax = opts.maxAccess ?? null, egressMax = opts.maxEgress ?? null;
  const S = tt.stops.length, K = maxTransfers + 1;
  const { patStopsOff, patStops, patTripsOff, tripTimesOff, stopPatsOff, stopPats,
          trOff, trTo, trTime, dep, arr } = tt;

  const tau = [], lblType = [], lblTrip = [], lblBoardPos = [], lblAlightPos = [], lblFrom = [], lblWalk = [], lblRide = [];
  for (let k = 0; k <= K; k++) {
    tau.push(new Int32Array(S).fill(INF));
    lblType.push(new Int8Array(S)); lblRide.push(new Int8Array(S));
    lblTrip.push(new Int32Array(S)); lblBoardPos.push(new Int32Array(S)); lblAlightPos.push(new Int32Array(S));
    lblFrom.push(new Int32Array(S)); lblWalk.push(new Int32Array(S));
  }
  const best = new Int32Array(S).fill(INF);
  const bestK = new Int8Array(S).fill(127);   // round that achieved best[]; a tie with fewer rounds still counts
  const destWalk = new Int32Array(S).fill(-1);
  for (const d of dests) if (destWalk[d.stop] < 0 || d.walk < destWalk[d.stop]) destWalk[d.stop] = d.walk;
  let bestDest = INF;
  const marked = new Uint8Array(S);
  let markedList = [];

  const better = (k, s, t) => t < best[s] || (t === best[s] && k < bestK[s]);
  const improve = (k, s, t, w = 0) => {
    tau[k][s] = t; best[s] = t; bestK[s] = k;
    if (destWalk[s] >= 0 && (egressMax == null || w + destWalk[s] <= egressMax) && t + destWalk[s] < bestDest) bestDest = t + destWalk[s];
    if (!marked[s]) { marked[s] = 1; markedList.push(s); }
  };

  // chained footpaths from the stops in `queue`, bounded by chainMax per chain
  const relaxWalks = (k, queue) => {
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi];
      const tp = tau[k][p], wp = lblWalk[k][p];
      for (let i = trOff[p]; i < trOff[p + 1]; i++) {
        const w = wp + trTime[i];
        // round 0 walks on from the access leg: the whole of it within accessMax (lblWalk there includes the access)
        if (k === 0 && accessMax != null ? w > accessMax : w > chainMax) continue;
        const q = trTo[i], tq = tp + trTime[i];
        if (tq < tau[k][q] && better(k, q, tq) && tq <= bestDest) {
          improve(k, q, tq, w);
          lblType[k][q] = 2; lblFrom[k][q] = p; lblWalk[k][q] = w; lblRide[k][q] = 0;
          queue.push(q);
        }
      }
    }
  };

  // candidate departure times: trips leaving any stop reachable from an origin, inside the window.
  // One merged reach map over all origins (access time + walk chain), each stop enumerated once.
  const cands = new Set();
  const reach = new Map();
  const queue = [];
  for (const o of origins) {
    if (!reach.has(o.stop) || reach.get(o.stop) > o.walk) { reach.set(o.stop, o.walk); queue.push(o.stop); }
  }
  const chainFrom = new Map(origins.map((o) => [o.stop, 0]));  // walking done since the access leg
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi], tp = reach.get(p), cp = chainFrom.get(p) ?? 0;
    for (let i = trOff[p]; i < trOff[p + 1]; i++) {
      const c = cp + trTime[i];
      if (c > chainMax || (accessMax != null && tp + trTime[i] > accessMax)) continue;
      const q = trTo[i], tq = tp + trTime[i];
      if (!reach.has(q) || reach.get(q) > tq) { reach.set(q, tq); chainFrom.set(q, c); queue.push(q); }
    }
  }
  for (const [q, w] of reach) {
    for (let i = stopPatsOff[q]; i < stopPatsOff[q + 1]; i++) {
      const p = stopPats[2 * i], pos = stopPats[2 * i + 1];
      if (!patOk(p)) continue;
      const ns = patStopsOff[p + 1] - patStopsOff[p];
      if (pos === ns - 1) continue;
      const tFirst = patTripsOff[p], tEnd = patTripsOff[p + 1], base = tripTimesOff[p];
      // trips are sorted by time: binary search the first one in the window, stop at the end of it
      let lo = 0, hi = tEnd - tFirst;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (dep[base + mid * ns + pos] - w < fromTime) lo = mid + 1; else hi = mid; }
      for (let t = tFirst + lo; t < tEnd; t++) {
        const d = dep[base + (t - tFirst) * ns + pos] - w;
        if (d > toTime) break;
        cands.add(Math.floor(d / 60) * 60);
      }
    }
  }
  if (fromTime === toTime || cands.size === 0) cands.add(fromTime);
  const departures = Array.from(cands).sort((a, b) => b - a);

  const journeys = [];
  const seen = new Set();
  // the footpath walked into a stop at round k (the label may be inherited from an earlier round)
  const walkIn = (k, s) => { while (k > 0 && lblType[k][s] === 0) k--; return lblType[k][s] === 2 ? lblWalk[k][s] : 0; };
  const endOk = (k, d) => egressMax == null || walkIn(k, d.stop) + d.walk <= egressMax;
  const destArr = (k) => {
    let m = INF;
    for (const d of dests) { const v = tau[k][d.stop]; if (v !== INF && v + d.walk < m && endOk(k, d)) m = v + d.walk; }
    return m;
  };
  const extract = (k) => {
    // which destination stop gives the round-k arrival
    let bestD = null, bestT = INF;
    for (const d of dests) { const v = tau[k][d.stop]; if (v !== INF && v + d.walk < bestT && endOk(k, d)) { bestT = v + d.walk; bestD = d; } }
    if (!bestD) return;
    const legs = [];
    let s = bestD.stop, kk = k, guard = 0;
    while (kk >= 0 && guard++ < 1000) {
      const type = lblType[kk][s];
      if (type === 0) { kk--; continue; }
      if (type === 3) {
        const o = origins[lblFrom[kk][s]];
        legs.push({ type: 'access', from: -1, to: s, seconds: o.walk, depart: tau[0][s] - o.walk, arrive: tau[0][s], origin: lblFrom[kk][s] });
        break;
      }
      if (type === 2) {
        const from = lblFrom[kk][s];
        legs.push({ type: 'walk', from, to: s, seconds: tau[kk][s] - tau[kk][from], depart: tau[kk][from], arrive: tau[kk][s] });
        s = from;
        continue;
      }
      const t = lblTrip[kk][s], p = tt.tripPat[t];
      const ns = patStopsOff[p + 1] - patStopsOff[p];
      const base = tripTimesOff[p] + (t - patTripsOff[p]) * ns;
      const bp = lblBoardPos[kk][s], ap = lblAlightPos[kk][s];
      const from = patStops[patStopsOff[p] + bp];
      legs.push({ type: 'ride', trip: t, pattern: p, route: tt.routes[tt.patRoute[p]], from, to: s,
                  depart: dep[base + bp], arrive: arr[base + ap], stops: ap - bp,
                  via: Array.from(patStops.subarray(patStopsOff[p] + bp, patStopsOff[p] + ap + 1)) });
      s = from; kk--;
    }
    legs.reverse();
    // leave as late as the first vehicle allows: shift the walks before it
    const firstRide = legs.findIndex((l) => l.type === 'ride');
    if (firstRide > 0) {
      let t = legs[firstRide].depart;
      for (let i = firstRide - 1; i >= 0; i--) { legs[i].arrive = t; t -= legs[i].seconds; legs[i].depart = t; }
    }
    if (bestD.walk > 0) legs.push({ type: 'egress', from: bestD.stop, to: -1, seconds: bestD.walk, depart: tau[k][bestD.stop], arrive: bestT });
    const sig = legs.map((l) => l.type === 'ride' ? `r${l.trip}:${l.from}-${l.to}` : `${l.type[0]}${l.from}-${l.to}`).join('|');
    if (seen.has(sig)) return;
    seen.add(sig);
    const rides = legs.filter((l) => l.type === 'ride');
    let walk = 0;
    for (const l of legs) if (l.type !== 'ride') walk += l.seconds;
    journeys.push({ depart: legs[0].depart, arrive: bestT, transfers: Math.max(0, rides.length - 1), walkSeconds: walk, legs });
  };

  let runs = 0;
  for (const depTime of departures) {
    runs++;
    const before = [];
    for (let k = 0; k <= K; k++) before.push(destArr(k));
    for (let i = 0; i < markedList.length; i++) marked[markedList[i]] = 0;
    markedList = [];
    for (let oi = 0; oi < origins.length; oi++) {
      const o = origins[oi], t = depTime + o.walk;
      if (t < tau[0][o.stop] || (t === tau[0][o.stop] && lblType[0][o.stop] !== 3)) {
        improve(0, o.stop, t);
        lblType[0][o.stop] = 3; lblFrom[0][o.stop] = oi; lblWalk[0][o.stop] = accessMax != null ? o.walk : 0; lblRide[0][o.stop] = 0;
      }
    }
    relaxWalks(0, markedList.slice());

    for (let k = 1; k <= K && markedList.length; k++) {
      // inherit: tau[k] = min(tau[k], tau[k-1])
      const tk = tau[k], tp = tau[k - 1], rk = lblRide[k], rp = lblRide[k - 1], lk = lblType[k];
      for (let s = 0; s < S; s++) if (tp[s] < tk[s]) { tk[s] = tp[s]; lk[s] = 0; rk[s] = rp[s]; }
      const Q = new Map();
      for (const s of markedList) {
        for (let i = stopPatsOff[s]; i < stopPatsOff[s + 1]; i++) {
          const p = stopPats[2 * i], pos = stopPats[2 * i + 1];
          if (!patOk(p)) continue;
          const cur = Q.get(p);
          if (cur === undefined || pos < cur) Q.set(p, pos);
        }
      }
      for (let i = 0; i < markedList.length; i++) marked[markedList[i]] = 0;
      markedList = [];
      const improved = [];
      for (const [p, startPos] of Q) {
        const ns = patStopsOff[p + 1] - patStopsOff[p], sBase = patStopsOff[p];
        const tFirst = patTripsOff[p], nTrips = patTripsOff[p + 1] - tFirst;
        if (nTrips === 0) continue;
        const base = tripTimesOff[p];
        let t = -1, boardPos = -1;
        for (let pos = startPos; pos < ns; pos++) {
          const stop = patStops[sBase + pos];
          if (t >= 0) {
            const a = arr[base + (t - tFirst) * ns + pos];
            if (better(k, stop, a) && a <= bestDest) {
              improve(k, stop, a);
              lblType[k][stop] = 1; lblTrip[k][stop] = t; lblBoardPos[k][stop] = boardPos; lblAlightPos[k][stop] = pos;
              lblWalk[k][stop] = 0; lblRide[k][stop] = 1;
              improved.push(stop);
            }
          }
          let ready = tau[k - 1][stop];
          if (ready === INF) continue;
          if (lblRide[k - 1][stop]) ready += slack;
          if (t < 0 || ready <= dep[base + (t - tFirst) * ns + pos]) {
            let lo = 0, hi = nTrips;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (dep[base + mid * ns + pos] < ready) lo = mid + 1; else hi = mid; }
            if (bike) while (lo < nTrips && !tripOk(p, dep[base + lo * ns + pos])) lo++;  // skip departures the bike may not board
            if (lo < nTrips && (t < 0 || tFirst + lo < t)) { t = tFirst + lo; boardPos = pos; }
          }
        }
      }
      if (!improved.length) break;
      relaxWalks(k, improved);
    }
    for (let k = 1; k <= K; k++) if (destArr(k) < before[k]) extract(k);
  }
  return { journeys: opts.raw ? journeys : rank(journeys), runs, candidates: departures.length, ms: now() - t0 };
}

/** One departure time: earliest arrival per number of transfers. */
export function plan(tt, origins, dests, depTime, maxTransfersOrOpts = 3) {
  const opts = typeof maxTransfersOrOpts === 'number' ? { maxTransfers: maxTransfersOrOpts } : maxTransfersOrOpts;
  const r = profile(tt, origins, dests, depTime, depTime, opts);
  return { journeys: r.journeys, rounds: r.journeys.length ? Math.max(...r.journeys.map((j) => j.transfers + 1)) : 0, ms: r.ms };
}

const TRANSFER_PENALTY = 300;  // s: an extra transfer has to save at least this much
const WALK_WEIGHT = 0.5;       // a minute walking costs this many minutes of riding, on top of its time

export function cost(j) { return (j.arrive - j.depart) + TRANSFER_PENALTY * j.transfers + WALK_WEIGHT * j.walkSeconds; }

/** A journey that rides a train, as a rider sees the choice: a train is never hidden behind a bus, nor a bus behind a train. */
const byTrain = (j) => j.legs.some((l) => l.type === 'ride' && l.route && l.route[3] === 2);
/** The same journey found twice (by two searches): its legs, trip by trip. */
export const journeySig = (j) => j.legs.map((l) => (l.type === 'ride' ? `r${l.trip}:${l.from}-${l.to}` : `${l.type[0]}${l.from}-${l.to}`)).join('|');

/**
 * Keep the journeys worth showing: Pareto by (later departure, earlier arrival,
 * fewer transfers), then drop ones whose extra transfers buy too little. Journeys
 * by train and journeys without one are compared only among themselves: a bus that
 * leaves a minute later and arrives a minute earlier must not hide the train.
 */
export function rank(journeys) {
  const out = [];
  for (const j of journeys) {
    let dominated = false;
    const train = byTrain(j);
    for (const o of journeys) {
      if (o === j || byTrain(o) !== train) continue;
      const pareto = o.depart >= j.depart && o.arrive <= j.arrive && o.transfers <= j.transfers &&
        (o.depart > j.depart || o.arrive < j.arrive || o.transfers < j.transfers || cost(o) < cost(j));
      const penalty = o.depart >= j.depart - 60 && o.transfers < j.transfers &&
        o.arrive <= j.arrive + TRANSFER_PENALTY * (j.transfers - o.transfers);
      if (pareto || penalty) { dominated = true; break; }
    }
    if (!dominated) out.push(j);
  }
  out.sort((a, b) => a.depart - b.depart || a.arrive - b.arrive);
  return out;
}

export function routeLabel(route) { return route[0] || (route[3] === 2 ? 'train' : route[1]); }

/** Human-readable journey, for logs and the test page. */
export function describe(tt, j) {
  const name = (s) => (s < 0 ? 'start/end' : tt.stops[s][1]);
  const lines = [`${hhmm(j.depart)} -> ${hhmm(j.arrive)}, ${Math.round((j.arrive - j.depart) / 60)} min, ${j.transfers} transfers, ${Math.round(j.walkSeconds / 60)} min walking`];
  for (const l of j.legs) {
    if (l.type === 'ride') lines.push(`  ${hhmm(l.depart)} ${routeLabel(l.route)} (${l.route[2]}) ${name(l.from)} -> ${name(l.to)} ${hhmm(l.arrive)}, ${l.stops} stops`);
    else if (l.seconds > 0) lines.push(`  ${l.type} ${Math.round(l.seconds / 60)} min: ${name(l.from)} -> ${name(l.to)}`);
  }
  return lines.join('\n');
}
