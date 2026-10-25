// Planning: the two places to stops, the delays of the vehicles on the road into the timetable for a plan from now,
// the two searches (everything, and trains only), and the journeys as the app shows them: legs with their courses,
// the easiest place to change, walks merged, slower departures of the same way, and ways grouped.
import { profile, rank, journeySig, routeLabel } from '../engine/raptor.js';
import { accessStops, route } from '../engine/streets.js';
import { estimateDelay, secondsOn } from '../engine/live.js';
import { haversine } from '../engine/geo.js';
import { hasCourse, pathTo, ridePath, streetPath } from './courses.js';
import { st, tt } from './data.js';
import { headsign, liveId, sName, stopOut } from './names.js';
import { railStops } from './stops.js';
import { rawTimes, tripFor, tripStopList } from './trips.js';

/** A place as the planner takes it: the stops it reaches (on foot or by bike, along the streets when the graph is in,
 *  else in a straight line with a detour factor) and the point itself. A stop or station is its own stops. */
function resolvePlace(place, mode, maxSeconds) {
  if (place.stops) return { places: place.stops.map((s) => ({ stop: s, walk: 0 })), point: place.lat != null ? { lat: place.lat, lon: place.lon } : null };
  const { lat, lon } = place;
  if (st) {
    const places = accessStops(st, tt.stopNode, lat, lon, mode, maxSeconds, 30, tt.stopLat, tt.stopLon, railStops());
    if (places.length) return { places, point: { lat, lon }, streets: true };
  }
  // no street graph (yet): straight-line distance with a detour factor
  const speed = mode === 'bike' ? 4.0 : 1.2;
  const out = [];
  for (let s = 0; s < tt.stops.length; s++) {
    const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
    if (d > (mode === 'bike' ? 4000 : 800)) continue;
    out.push({ stop: s, walk: Math.round(d * 1.3 / speed + 30), mode });
  }
  out.sort((a, b) => a.walk - b.walk);
  return { places: out.slice(0, 40), point: { lat, lon }, streets: false };
}
let liveEdits = [], tripLive = new Map();
function applyLive(vehicles) {
  const day = tt.header.date, now = Date.now(), touched = new Set();
  const byTrip = new Map();   // the latest report per trip
  for (const v of vehicles) {
    const rec = new Date(v.recordedAt), start = new Date(v.scheduledStart);
    const age = (now - rec.getTime()) / 1000;
    if (Number.isNaN(age) || age > 1800 || age < -120) continue;
    const t = tripFor(v.lineRef, secondsOn(start, day));
    if (t < 0) continue;
    const o = byTrip.get(t);
    if (!o || rec > o.rec) byTrip.set(t, { v, rec });
  }
  for (const [t, { v, rec }] of byTrip) {
    const { p, ns, base, stops } = tripStopList(t);
    const est = estimateDelay({ lat: v.lat, lon: v.lon, recordedAt: rec, rideId: v.rideId, callSince: v.callSince, callSeenChange: v.callSeenChange }, stops, day);
    if (!est) continue;
    tripLive.set(t, { delay: est.delay, index: est.index, seen: rec.getTime(), stale: est.ageSec > 240, lat: v.lat, lon: v.lon });
    if (Math.abs(est.delay) < 60 && !est.dep) continue;   // a train with learned sections has its own time at each station
    touched.add(p);
    for (let i = est.index; i < ns; i++) {
      const idx = base + i;
      const own = (x) => (x && x[i] != null ? Math.round(x[i]) : null);
      let na = own(est.arr) ?? own(est.dep) ?? tt.arr[idx] + est.delay;
      // boarded when it pulls in, the time the rider is shown (liveAt): a train leaves after its learned stand, which
      // has its approach in it and runs long (2:53 at Rehovot), and the plan had the rider walk up after it had come in
      // (2026-10-25, Gadi: leave at 21:28 for the train shown at 21:26). One standing there already leaves at its time.
      let nd = est.at === i ? own(est.dep) ?? na : own(est.arr) ?? own(est.dep) ?? tt.dep[idx] + est.delay;
      if (na > nd) na = nd;
      liveEdits.push(idx, tt.dep[idx], tt.arr[idx]);
      tt.dep[idx] = nd; tt.arr[idx] = na;
    }
  }
  // in order again: from the last trip back, none later at a stop than the one after it
  for (const p of touched) {
    const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p], t0 = tt.patTripsOff[p], t1 = tt.patTripsOff[p + 1];
    for (let t = t1 - 2; t >= t0; t--) {
      const base = tt.tripTimesOff[p] + (t - t0) * ns, next = base + ns;
      for (let i = 0; i < ns; i++) {
        const idx = base + i;
        if (tt.dep[idx] <= tt.dep[next + i] && tt.arr[idx] <= tt.arr[next + i]) continue;
        liveEdits.push(idx, tt.dep[idx], tt.arr[idx]);
        tt.dep[idx] = Math.min(tt.dep[idx], tt.dep[next + i]); tt.arr[idx] = Math.min(tt.arr[idx], tt.arr[next + i], tt.dep[idx]);
      }
    }
  }
  return tripLive.size;
}
function revertLive() {
  for (let i = liveEdits.length - 3; i >= 0; i -= 3) { tt.dep[liveEdits[i]] = liveEdits[i + 1]; tt.arr[liveEdits[i]] = liveEdits[i + 2]; }
  liveEdits = []; tripLive = new Map();
}
function legOut(l, q) {
  const o = { type: l.type, depart: l.depart, arrive: l.arrive, seconds: l.seconds };
  if (l.type === 'ride') {
    const p = l.pattern, ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
    const base = tt.tripTimesOff[p] + (l.trip - tt.patTripsOff[p]) * ns;
    let bp = -1;   // board position on the pattern; a pattern can pass a stop twice, so match the time too
    for (let i = 0; i < ns; i++) if (tt.patStops[tt.patStopsOff[p] + i] === l.from && tt.dep[base + i] === l.depart) { bp = i; break; }
    const raw = rawTimes(p, l.trip);   // the schedule: dep/arr may carry a live shift during a plan
    Object.assign(o, { from: stopOut(l.from), to: stopOut(l.to), stops: l.stops, line: routeLabel(l.route),
      headsign: headsign(tt.patRoute[p]), agency: l.route[2], routeType: l.route[3],
      trip: l.trip, routeId: liveId(l.route), estimated: !!l.route[6], route: tt.patRoute[p], firstDep: raw.dep[0], boardPos: bp, live: tripLive.get(l.trip) || null,
      schedDepart: bp >= 0 ? raw.dep[bp] : l.depart, schedArrive: bp >= 0 ? raw.arr[bp + l.stops] : l.arrive,
      pattern: p, alightPos: bp + l.stops,
      path: ridePath(p, bp, bp + l.stops) || l.via.map((s) => [tt.stopLat[s], tt.stopLon[s]]), pathKind: hasCourse(p) ? 'shape' : 'stops',
      // every stop of the leg with its times, for "get off in N stops" and the expandable stop list
      stopsAlong: l.via.map((s, i) => ({ stop: s, name: sName(s), lat: tt.stopLat[s], lon: tt.stopLon[s], arr: tt.arr[base + bp + i], dep: tt.dep[base + bp + i] })) });
  } else if (l.type === 'walk') {
    const path = streetPath([tt.stopLat[l.from], tt.stopLon[l.from]], [tt.stopLat[l.to], tt.stopLon[l.to]], 'walk');
    Object.assign(o, { from: stopOut(l.from), to: stopOut(l.to), path: path || [[tt.stopLat[l.from], tt.stopLon[l.from]], [tt.stopLat[l.to], tt.stopLon[l.to]]], pathKind: path ? 'street' : 'straight' });
  } else if (l.type === 'access') {
    const p = q.from.places.find((x) => x.stop === l.to);
    const path = pathTo(q.from.point, l.to, p && p.mode);
    Object.assign(o, { to: stopOut(l.to), mode: p && p.mode === 'bike' ? 'bike' : 'walk', path, pathKind: path.length > 2 ? 'street' : 'straight' });
  } else if (l.type === 'egress') {
    const p = q.to.places.find((x) => x.stop === l.from);
    const path = pathTo(q.to.point, l.from, p && p.mode, true);
    Object.assign(o, { from: stopOut(l.from), mode: p && p.mode === 'bike' ? 'bike' : 'walk', path, pathKind: path.length > 2 ? 'street' : 'straight' });
  }
  return o;
}
/**
 * Where to change between the same two vehicles: the router keeps the first place it finds that works, and every other
 * gives the same arrival. Of all the places where the second can be caught from the first (the same stop, or a short
 * walk between stops), take one with time to spare (2 minutes or more, when there is one), then the least walking,
 * then the most time to spare. (2026-10-22, Gadi: the 56 to Ibn Gabirol/Arlosoroff, a 3-minute walk and 2 minutes to
 * catch the 61, when the 61 passes Rabin Square, on the 56's way, 9 minutes after the 56 is there.) Changes the
 * journey's legs in place; the vehicles, and so the arrival, stay.
 */
function easierTransfers(j) {
  const L = j.legs;
  const pos = (l) => {   // the leg's boarding position on its pattern (a pattern can pass a stop twice: match the time)
    const p = l.pattern, ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p], base = tt.tripTimesOff[p] + (l.trip - tt.patTripsOff[p]) * ns;
    for (let i = 0; i < ns; i++) if (tt.patStops[tt.patStopsOff[p] + i] === l.from && tt.dep[base + i] === l.depart) return { p, ns, base, bp: i };
    return null;
  };
  const stopsOf = (p, a, b) => Array.from(tt.patStops.subarray(tt.patStopsOff[p] + a, tt.patStopsOff[p] + b + 1));
  for (let i = 0; i < L.length; i++) {
    const A = L[i]; if (A.type !== 'ride') continue;
    const w = L[i + 1] && L[i + 1].type === 'walk' ? L[i + 1] : null, B = L[i + (w ? 2 : 1)];
    if (!B || B.type !== 'ride') continue;
    const a = pos(A), b = pos(B); if (!a || !b) continue;
    const apA = a.bp + A.stops, apB = b.bp + B.stops;
    const score = (walk, spare) => [spare >= 120 ? 0 : 1, walk, -spare];
    const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    let best = { score: score(w ? w.seconds : 0, B.depart - A.arrive - (w ? w.seconds : 0)), ia: apA, jb: b.bp, walk: w ? w.seconds : 0 };
    for (let ia = a.bp + 1; ia < a.ns; ia++) {
      const sa = tt.patStops[tt.patStopsOff[a.p] + ia], ta = tt.arr[a.base + ia];
      for (let jb = 0; jb < apB; jb++) {
        const sb = tt.patStops[tt.patStopsOff[b.p] + jb], tb = tt.dep[b.base + jb];
        let walk = -1;
        if (sa === sb) walk = 0;
        else for (let x = tt.trOff[sa]; x < tt.trOff[sa + 1]; x++) if (tt.trTo[x] === sb) { walk = tt.trTime[x]; break; }
        if (walk < 0) continue;
        const spare = tb - ta - walk - (walk === 0 ? tt.slack : 0);   // as the router: a change at the same stop keeps a margin
        if (spare < 0) continue;
        const sc = score(walk, spare);
        if (cmp(sc, best.score) < 0) best = { score: sc, ia, jb, walk };
      }
    }
    if (best.ia === apA && best.jb === b.bp) continue;
    const sa = tt.patStops[tt.patStopsOff[a.p] + best.ia], sb = tt.patStops[tt.patStopsOff[b.p] + best.jb];
    Object.assign(A, { to: sa, arrive: tt.arr[a.base + best.ia], stops: best.ia - a.bp, seconds: tt.arr[a.base + best.ia] - A.depart, via: stopsOf(a.p, a.bp, best.ia) });
    Object.assign(B, { from: sb, depart: tt.dep[b.base + best.jb], stops: apB - best.jb, seconds: B.arrive - tt.dep[b.base + best.jb], via: stopsOf(b.p, best.jb, apB) });
    const walkLeg = best.walk > 0 ? { type: 'walk', from: sa, to: sb, seconds: best.walk, depart: A.arrive, arrive: A.arrive + best.walk } : null;
    L.splice(i + 1, w ? 1 : 0, ...(walkLeg ? [walkLeg] : []));
  }
  j.walkSeconds = L.reduce((t, l) => t + (l.type === 'ride' ? 0 : l.seconds), 0);
}
/** Walks one after the other are one walk: to the first stop and on to the next is "walk 17 min to HaShalom", not two
 *  lines (2026-10-22); likewise a walk to another stop and on from it to the destination. */
function mergeWalks(legs) {
  const out = [];
  const join = (a, b) => (a || []).concat((b || []).slice(1));
  for (const l of legs) {
    const p = out[out.length - 1];
    if (p && l.type === 'walk' && (p.type === 'access' || p.type === 'walk')) {
      out[out.length - 1] = { ...p, to: l.to, seconds: p.seconds + l.seconds, arrive: l.arrive, path: join(p.path, l.path), pathKind: p.pathKind === 'street' && l.pathKind === 'street' ? 'street' : 'straight' };
    } else if (p && l.type === 'egress' && p.type === 'walk') {
      out[out.length - 1] = { ...l, from: p.from, seconds: p.seconds + l.seconds, depart: p.depart, path: join(p.path, l.path), pathKind: p.pathKind === 'street' && l.pathKind === 'street' ? 'street' : 'straight' };
    } else out.push(l);
  }
  return out;
}
/**
 * The train in front of you: a direct way's earlier departures between the same two stops that arrive later. The
 * router drops them, being beaten (an earlier departure arriving later), but a rider at the platform wants the one
 * that is there (2026-10-22: Gadi at HaHagana, the 19:30 to Moshe Dayan running at 19:37, beaten on paper by the 19:45
 * express, which was itself only on its timetable). They join their card's other times, marked (`slower`) with when
 * they arrive: the two latest that can still be reached, arriving at most 30 minutes after the card's own.
 */
function slowerSiblings(journeys, fromTime, q) {
  const out = [], seen = new Set();
  for (const j of journeys) {
    const rides = j.legs.filter((l) => l.type === 'ride');
    if (rides.length !== 1) continue;
    const R = rides[0], B = R.from.stop, A = R.to.stop, key = `${B}-${A}`;
    if (seen.has(key)) continue;   // one search per pair of stops: the card's earliest option comes first
    seen.add(key);
    const lead = R.depart - j.depart;   // from setting out to boarding
    const found = [];
    for (let i = tt.stopPatsOff[B]; i < tt.stopPatsOff[B + 1]; i++) {
      const p = tt.stopPats[2 * i], pos = tt.stopPats[2 * i + 1], ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
      let k = -1;
      for (let x = pos + 1; x < ns; x++) if (tt.patStops[tt.patStopsOff[p] + x] === A) { k = x; break; }
      if (k < 0) continue;
      const base = tt.tripTimesOff[p];
      for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++) {
        const o = base + (t - tt.patTripsOff[p]) * ns, d = tt.dep[o + pos], a = tt.arr[o + k];
        if (d >= R.depart || d < fromTime + lead || a <= R.arrive || a > R.arrive + 1800) continue;
        if (journeys.some((x) => x.legs.some((l) => l.type === 'ride' && l.trip === t))) continue;
        found.push({ p, t, pos, k, d, a });
      }
    }
    found.sort((x, y) => y.d - x.d);
    for (const f of found.slice(0, 2)) {
      const via = []; for (let x = f.pos; x <= f.k; x++) via.push(tt.patStops[tt.patStopsOff[f.p] + x]);
      const ride = legOut({ type: 'ride', pattern: f.p, trip: f.t, from: B, to: A, depart: f.d, arrive: f.a, seconds: f.a - f.d, stops: f.k - f.pos, via, route: tt.routes[tt.patRoute[f.p]] }, q);
      const before = f.d - R.depart, after = f.a - R.arrive;
      let seenRide = false;
      const legs = j.legs.map((l) => {
        if (l === R) { seenRide = true; return ride; }
        const dt = seenRide ? after : before;
        return { ...l, depart: l.depart + dt, arrive: l.arrive + dt };
      });
      out.push({ depart: j.depart + before, arrive: j.arrive + after, transfers: 0, walkSeconds: j.walkSeconds, legs, slower: true });
    }
  }
  return out;
}
/**
 * Journeys that board and alight at the same stops, in the same order, are one way to go at several
 * times, possibly with different lines on a leg. Groups keep the journey order (earliest first) and list
 * the indices of their options and the distinct lines per leg.
 */
function groupJourneys(journeys) {
  const byKey = new Map(), groups = [];
  journeys.forEach((j, idx) => {
    const key = j.legs.map((l) => l.type === 'ride' ? `r${l.from.stop}-${l.to.stop}` : l.type === 'walk' ? `w${l.from.stop}-${l.to.stop}` : l.type === 'access' ? `a${l.to.stop}` : `e${l.from.stop}`).join('|');
    let g = byKey.get(key);
    if (!g) { g = { options: [], lines: j.legs.map(() => []) }; byKey.set(key, g); groups.push(g); }
    g.options.push(idx);
    j.legs.forEach((l, i) => { if (l.type === 'ride' && !g.lines[i].includes(l.line)) g.lines[i].push(l.line); });
  });
  return groups;
}

export const planOps = {
  /**
   * Journeys between two places in a departure window; with arriveBy, the window ends at toTime and
   * only journeys arriving by then are kept. maxWalk (s) bounds the walk to the first and from the last stop.
   */
  plan({ from, to, fromTime, toTime, bike = 'none', folding = false, weekday = true, maxTransfers = 3, maxWalk = 900, arriveBy = false, vehicles = null }) {
    const t0 = performance.now();
    let live = null;
    if (vehicles) { try { live = { matched: applyLive(vehicles), vehicles: vehicles.length }; } catch (e) { revertLive(); live = null; } }
    try { return planNow(); } finally { revertLive(); }
    function planNow() {
    const q = {
      from: resolvePlace(from, bike === 'none' ? 'walk' : 'bike', bike === 'none' ? maxWalk : Math.max(1200, maxWalk)),
      to: resolvePlace(to, bike === 'along' ? 'bike' : 'walk', bike === 'along' ? Math.max(1200, maxWalk) : maxWalk),
    };
    if (!q.from.places.length || !q.to.places.length) return { journeys: [], groups: [], reason: !q.from.places.length ? 'noOriginStops' : 'noDestStops', live, ms: 0 };
    // Two searches: everything, and trains only. The first keeps, per departure, only the earliest arrival, so a bus
    // a minute faster leaves no trace of the train beside it; the second brings the trains back, ranked apart (rank).
    // on foot at either end, the whole walk (to the first stop and any walk on to another) is within the rider's longest
    const opts = { maxTransfers, bikeOnBoard: bike === 'along', folding, weekday, raw: true,
      maxAccess: bike === 'none' ? maxWalk : undefined, maxEgress: bike !== 'along' ? maxWalk : undefined };
    const r = profile(tt, q.from.places, q.to.places, fromTime, toTime, opts);
    const byRail = profile(tt, q.from.places, q.to.places, fromTime, toTime, { ...opts, routeTypes: [2] });
    const seen = new Set(), all = [];
    for (const j of r.journeys.concat(byRail.journeys)) { easierTransfers(j); const k = journeySig(j); if (!seen.has(k)) { seen.add(k); all.push(j); } }
    // arrive-by: the journeys arriving in time are ranked among themselves only; ranked with the rest, a later one with
    // fewer changes that arrives a few minutes past the deadline would knock out one that is in time, and then be dropped
    const found = rank(arriveBy ? all.filter((j) => j.arrive <= toTime) : all);
    const journeys = found.map((j) => ({
      depart: j.depart, arrive: j.arrive, transfers: j.transfers, walkSeconds: j.walkSeconds,
      legs: mergeWalks(j.legs.filter((l) => l.type === 'ride' || l.seconds > 0).map((l) => legOut(l, q))),
    }));
    if (!arriveBy) journeys.push(...slowerSiblings(journeys, fromTime, q));
    let bikeOnly = null;
    if (st && bike !== 'none' && q.from.point && q.to.point) {
      const br = route(st, q.from.point.lat, q.from.point.lon, q.to.point.lat, q.to.point.lon, 'bike', 3 * 3600);
      if (br) bikeOnly = { seconds: br.seconds, metres: br.metres, path: [[q.from.point.lat, q.from.point.lon], ...br.path, [q.to.point.lat, q.to.point.lon]] };
    }
    return { journeys, groups: groupJourneys(journeys), bikeOnly, candidates: r.candidates, streets: !!st, live, ms: performance.now() - t0 };
    }
  },
};
