// Planning: the two places to stops, the delays of the vehicles on the road into the timetable for a plan from now,
// the two searches (everything, and trains only), and the journeys as the app shows them: legs with their courses,
// the easiest place to change, walks merged, slower departures of the same way, and ways grouped.
import {
  journeySig,
  patternLength,
  patternStop,
  plan as planFrom,
  profile,
  rank,
  routeLabel,
  stopsBetween,
  timesRow,
  tripRange,
  type ProfileOptions,
  type RawAccessLeg,
  type RawEgressLeg,
  type RawJourney,
  type RawRideLeg,
  type RawWalkLeg,
  type StopAccess,
  patternsAt,
} from '../engine/raptor.ts';
import { accessStops, route, type StreetMode, airAccess } from '../engine/streets.ts';
import { liveTrips, vehiclesNow, type SnapVehicle } from './vehicles.ts';
import { haversine, type LatLon as Point } from '../engine/geo.ts';
import type { PathPoint } from '../engine/geo.ts';
import { hasCourse, pathTo, ridePath, streetPath } from './courses.ts';
import { st, tt } from './data.ts';
import { headsign, liveId, sName, stopOut } from './names.ts';
import type {
  JourneyOut,
  LegOut,
  LiveTrips,
  NextDep,
  OpsPart,
  PlanGroup,
  PlanOut,
  RideLegOut,
  WalkLegOut,
} from './ops.ts';
import { railStops } from './stops.ts';
import { bestEntrance } from './exits.ts';
import { rawTimes, tripStopList } from './trips.ts';
import type { PlanPlace } from './ops.ts';

/** A stop the planner may start or end at: the router's StopAccess, with how the rider gets there when the streets
 *  (or the straight-line fallback) said; a stop of a chosen station carries no mode. */
type Access = StopAccess & { mode?: StreetMode };
/** A place as the planner takes it (resolvePlace): the stops it reaches, the point itself (null for a stop or station
 *  given without one), and whether the street graph found the stops. */
type ResolvedPlace = { places: Access[]; point: Point | null; streets?: boolean };
type Resolved = { from: ResolvedPlace; to: ResolvedPlace };
/** A ride leg as this module sees it: the router's (RawRideLeg), which carries no `seconds`, or one easierTransfers or
 *  slowerSiblings rewrote, which does. legOut copies whatever is there (undefined for the router's own). */
type RideIn = RawRideLeg & { seconds?: number };
type PlanLeg = RideIn | RawWalkLeg | RawAccessLeg | RawEgressLeg;
/** What legOut adds to the base of a leg (its type and times) for each kind. */
type Rest<T> = Omit<T, 'type' | 'depart' | 'arrive' | 'seconds'>;

/** A place as the planner takes it: the stops it reaches (on foot or by bike, along the streets when the graph is in,
 *  else in a straight line with a detour factor) and the point itself. A stop or station is its own stops. */
function resolvePlace(place: PlanPlace, mode: StreetMode, maxSeconds: number): ResolvedPlace {
  if (place.stops)
    return {
      places: place.stops.map((s) => ({ stop: s, walk: 0 })),
      point: place.lat != null ? { lat: place.lat, lon: place.lon! } : null,
    };
  const lat = place.lat!,
    lon = place.lon!; // a place without stops is a point
  if (st) {
    const places = accessStops(st, tt!.stopNode, lat, lon, mode, maxSeconds, 30, tt!.stopLat, tt!.stopLon, railStops());
    if (places.length) return { places, point: { lat, lon }, streets: true };
  }
  // no street graph (yet): the straight line with a detour factor, the same standing-at rule (streets.ts airAccess)
  return {
    places: airAccess(lat, lon, tt!.stopLat, tt!.stopLon, railStops(), mode),
    point: { lat, lon },
    streets: false,
  };
}
/**
 * Live times, for one search: every trip with a vehicle on the road moves to the times the rider is shown for it
 * (vehicles.ts liveTrips, the same answer the screens draw), the trips stay in order, the search runs, and every time
 * moved is put back. The times are the timetable's own arrays, shifted in place: a copy for each plan would be 36 MB.
 * That is safe because nothing runs in between: the worker answers one question at a time and `run` cannot await.
 * Matching a vehicle to its trip reads the schedule (`tripStart`), never these times.
 */
function withLiveTimes<T>(vehicles: SnapVehicle[] | null, run: (live: LiveTrips | null) => T): T {
  const edits: number[] = [];
  try {
    let live: LiveTrips | null = null;
    if (vehicles)
      try {
        live = applyLive(vehicles, edits);
      } catch {
        revertLive(edits); // a failure half-way: plan on the timetable as it is
        edits.length = 0;
      }
    return run(live);
  } finally {
    revertLive(edits);
  }
}
/** Move the vehicles' trips to their live times; every time moved goes into `edits` (index, departure, arrival) to be
 *  put back. */
function applyLive(vehicles: SnapVehicle[], liveEdits: number[]): LiveTrips {
  const live = liveTrips(vehicles, null),
    touched = new Set<number>();
  for (const [key, { from, times }] of Object.entries(live.trips)) {
    const { p, base } = tripStopList(+key);
    times.forEach((time, k) => {
      const idx = base + from + k;
      if (tt!.arr[idx] === time && tt!.dep[idx] === time) return;
      touched.add(p);
      liveEdits.push(idx, tt!.dep[idx], tt!.arr[idx]);
      tt!.arr[idx] = tt!.dep[idx] = time;
    });
  }
  // in order again: from the last trip back, none later at a stop than the one after it (RAPTOR needs them so)
  for (const p of touched) {
    const ns = patternLength(tt!, p),
      { first, end } = tripRange(tt!, p);
    for (let t = end - 2; t >= first; t--) {
      const base = timesRow(tt!, t),
        next = base + ns; // the trip after it: the next row
      for (let i = 0; i < ns; i++) {
        const idx = base + i;
        if (tt!.dep[idx] <= tt!.dep[next + i] && tt!.arr[idx] <= tt!.arr[next + i]) continue;
        liveEdits.push(idx, tt!.dep[idx], tt!.arr[idx]);
        tt!.dep[idx] = Math.min(tt!.dep[idx], tt!.dep[next + i]);
        tt!.arr[idx] = Math.min(tt!.arr[idx], tt!.arr[next + i], tt!.dep[idx]);
      }
    }
  }
  return live;
}
/** Of the live times a plan routed on, those of the trips its journeys ride and of the departures after them: what the
 *  page needs to draw them as the plan saw them. */
function pick(trips: LiveTrips['trips'], journeys: JourneyOut[]): LiveTrips['trips'] {
  const out: LiveTrips['trips'] = {};
  for (const j of journeys)
    for (const l of j.legs)
      if (l.type === 'ride')
        for (const t of [l.trip, ...(l.next || []).map((n) => n.trip)]) if (trips[t]) out[t] = trips[t];
  return out;
}
const LIVE_NEAR_M = 12000;
function revertLive(liveEdits: number[]): void {
  for (let i = liveEdits.length - 3; i >= 0; i -= 3) {
    tt!.dep[liveEdits[i]] = liveEdits[i + 1];
    tt!.arr[liveEdits[i]] = liveEdits[i + 2];
  }
}
/** A leg as the page shows it: the router's leg with its stops named, its course, and for a ride what identifies the
 *  trip and the times the plan used against the listed ones. */
/** The departures of a route from a stop after a time, up to `n` within two hours, in the order they come on the
 *  timetable as it stands (live-shifted during a plan): the card's "leaves X: in 18, 21:22, 21:43" (maintainer,
 *  2026-11-08: every card says when its first ride leaves its stop and the ones after it, as Moovit does). */
function nextDeparts(route: number, stop: number, after: number, n = 3): NextDep[] {
  const out: { d: number; p: number; t: number; pos: number }[] = [];
  for (const { p, pos } of patternsAt(tt!, stop)) {
    if (tt!.patRoute[p] !== route) continue;
    const { first, end } = tripRange(tt!, p);
    for (let t = first; t < end; t++) {
      const d = tt!.dep[timesRow(tt!, t) + pos];
      if (d > after && d <= after + 7200) out.push({ d, p, t, pos });
    }
  }
  return out
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(({ p, t, pos }) => ({ trip: t, pos, sched: rawTimes(p, t).dep[pos] }));
}
function legOut(l: PlanLeg, q: Resolved): LegOut {
  // the router sets no `seconds` on a ride (easierTransfers and slowerSiblings do on the rides they build): its length
  const o = { type: l.type, depart: l.depart, arrive: l.arrive, seconds: l.seconds ?? l.arrive - l.depart };
  if (l.type === 'ride') {
    const p = l.pattern,
      ns = patternLength(tt!, p);
    const base = timesRow(tt!, l.trip);
    let bp = -1; // board position on the pattern; a pattern can pass a stop twice, so match the time too
    for (let i = 0; i < ns; i++)
      if (patternStop(tt!, p, i) === l.from && tt!.dep[base + i] === l.depart) {
        bp = i;
        break;
      }
    const raw = rawTimes(p, l.trip); // the schedule: dep/arr may carry a live shift during a plan
    Object.assign(o, {
      from: stopOut(l.from),
      to: stopOut(l.to),
      stops: l.stops,
      line: routeLabel(l.route),
      headsign: headsign(tt!.patRoute[p]),
      agency: l.route[2],
      routeType: l.route[3],
      trip: l.trip,
      routeId: liveId(l.route),
      estimated: !!l.route[6],
      route: tt!.patRoute[p],
      firstDep: raw.dep[0],
      boardPos: bp,
      schedDepart: bp >= 0 ? raw.dep[bp] : l.depart,
      schedArrive: bp >= 0 ? raw.arr[bp + l.stops] : l.arrive,
      pattern: p,
      alightPos: bp + l.stops,
      path: ridePath(p, bp, bp + l.stops) || l.via.map((s): PathPoint => [tt!.stopLat[s], tt!.stopLon[s]]),
      pathKind: hasCourse(p) ? 'shape' : 'stops',
      // every stop of the leg with its times, for "get off in N stops" and the expandable stop list
      stopsAlong: l.via.map((s, i) => ({
        stop: s,
        name: sName(s),
        lat: tt!.stopLat[s],
        lon: tt!.stopLon[s],
        arr: raw.arr[bp + i],
        dep: raw.dep[bp + i],
      })),
    } satisfies Rest<RideLegOut>);
  } else if (l.type === 'walk') {
    // a station's entrance at either end: the one nearest the other end, the walk drawn between the two
    const a: PathPoint = [tt!.stopLat[l.from], tt!.stopLon[l.from]],
      b: PathPoint = [tt!.stopLat[l.to], tt!.stopLon[l.to]];
    const out = bestEntrance(l.from, { lat: b[0], lon: b[1] }, 'walk', true),
      into = bestEntrance(l.to, { lat: a[0], lon: a[1] }, 'walk', false);
    const a2: PathPoint = out ? [out.exit.lat, out.exit.lon] : a,
      b2: PathPoint = into ? [into.exit.lat, into.exit.lon] : b;
    const path = streetPath(a2, b2, 'walk');
    // the stretches inside the stations keep the line whole, from the ride drawn to one stop to the ride from the other
    const whole: PathPoint[] = [...(out ? [a] : []), ...(path || [a2, b2]), ...(into ? [b] : [])];
    Object.assign(o, {
      from: stopOut(l.from),
      to: stopOut(l.to),
      path: whole,
      pathKind: path ? 'street' : 'straight',
      ...(out ? { exit: out.exit } : {}),
      ...(into ? { entry: into.exit } : {}),
    } satisfies Rest<Extract<WalkLegOut, { type: 'walk' }>>);
  } else if (l.type === 'access') {
    const p = q.from.places.find((x) => x.stop === l.to);
    const into = q.from.point && bestEntrance(l.to, q.from.point, p && p.mode, false);
    const path = into ? into.path : pathTo(q.from.point, l.to, p && p.mode);
    Object.assign(o, {
      to: stopOut(l.to),
      mode: p && p.mode === 'bike' ? 'bike' : 'walk',
      path,
      pathKind: path.length > 2 ? 'street' : 'straight',
      ...(into ? { entry: into.exit } : {}),
    } satisfies Rest<Extract<WalkLegOut, { type: 'access' }>>);
  } else if (l.type === 'egress') {
    const p = q.to.places.find((x) => x.stop === l.from);
    const out = q.to.point && bestEntrance(l.from, q.to.point, p && p.mode, true);
    const path = out ? out.path : pathTo(q.to.point, l.from, p && p.mode, true);
    Object.assign(o, {
      from: stopOut(l.from),
      mode: p && p.mode === 'bike' ? 'bike' : 'walk',
      path,
      pathKind: path.length > 2 ? 'street' : 'straight',
      ...(out ? { exit: out.exit } : {}),
    } satisfies Rest<Extract<WalkLegOut, { type: 'egress' }>>);
  }
  // each kind's fields were checked above as they were assigned; the compiler cannot follow Object.assign into `o`
  return o as LegOut;
}
/**
 * Where to change between the same two vehicles: the router keeps the first place it finds that works, and every other
 * gives the same arrival. Of all the places where the second can be caught from the first (the same stop, or a short
 * walk between stops), take one with time to spare (2 minutes or more, when there is one), then the least walking,
 * then the most time to spare. (2026-10-22, the maintainer: the 56 to Ibn Gabirol/Arlosoroff, a 3-minute walk and 2 minutes to
 * catch the 61, when the 61 passes Rabin Square, on the 56's way, 9 minutes after the 56 is there.) Changes the
 * journey's legs in place; the vehicles, and so the arrival, stay.
 */
function easierTransfers(j: RawJourney): void {
  const L = j.legs;
  const pos = (l: RawRideLeg): { p: number; ns: number; base: number; bp: number } | null => {
    // the leg's boarding position on its pattern (a pattern can pass a stop twice: match the time)
    const p = l.pattern,
      ns = patternLength(tt!, p),
      base = timesRow(tt!, l.trip);
    for (let i = 0; i < ns; i++)
      if (patternStop(tt!, p, i) === l.from && tt!.dep[base + i] === l.depart) return { p, ns, base, bp: i };
    return null;
  };
  const stopsOf = (p: number, a: number, b: number): number[] => stopsBetween(tt!, p, a, b);
  for (let i = 0; i < L.length; i++) {
    const A = L[i];
    if (A.type !== 'ride') continue;
    const next = L[i + 1],
      w = next && next.type === 'walk' ? next : null,
      B = L[i + (w ? 2 : 1)];
    if (!B || B.type !== 'ride') continue;
    const a = pos(A),
      b = pos(B);
    if (!a || !b) continue;
    const apA = a.bp + A.stops,
      apB = b.bp + B.stops;
    const score = (walk: number, spare: number): [number, number, number] => [spare >= 120 ? 0 : 1, walk, -spare];
    const cmp = (x: number[], y: number[]): number => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    let best = {
      score: score(w ? w.seconds : 0, B.depart - A.arrive - (w ? w.seconds : 0)),
      ia: apA,
      jb: b.bp,
      walk: w ? w.seconds : 0,
    };
    for (let ia = a.bp + 1; ia < a.ns; ia++) {
      const sa = patternStop(tt!, a.p, ia),
        ta = tt!.arr[a.base + ia];
      for (let jb = 0; jb < apB; jb++) {
        const sb = patternStop(tt!, b.p, jb),
          tb = tt!.dep[b.base + jb];
        let walk = -1;
        if (sa === sb) walk = 0;
        else
          for (let x = tt!.trOff[sa]; x < tt!.trOff[sa + 1]; x++)
            if (tt!.trTo[x] === sb) {
              walk = tt!.trTime[x];
              break;
            }
        if (walk < 0) continue;
        const spare = tb - ta - walk - (walk === 0 ? tt!.slack : 0); // as the router: a change at the same stop keeps a margin
        if (spare < 0) continue;
        const sc = score(walk, spare);
        if (cmp(sc, best.score) < 0) best = { score: sc, ia, jb, walk };
      }
    }
    if (best.ia === apA && best.jb === b.bp) continue;
    const sa = patternStop(tt!, a.p, best.ia),
      sb = patternStop(tt!, b.p, best.jb);
    Object.assign(A, {
      to: sa,
      arrive: tt!.arr[a.base + best.ia],
      stops: best.ia - a.bp,
      seconds: tt!.arr[a.base + best.ia] - A.depart,
      via: stopsOf(a.p, a.bp, best.ia),
    });
    Object.assign(B, {
      from: sb,
      depart: tt!.dep[b.base + best.jb],
      stops: apB - best.jb,
      seconds: B.arrive - tt!.dep[b.base + best.jb],
      via: stopsOf(b.p, best.jb, apB),
    });
    const walkLeg: RawWalkLeg | null =
      best.walk > 0
        ? { type: 'walk', from: sa, to: sb, seconds: best.walk, depart: A.arrive, arrive: A.arrive + best.walk }
        : null;
    L.splice(i + 1, w ? 1 : 0, ...(walkLeg ? [walkLeg] : []));
  }
  j.walkSeconds = L.reduce((t, l) => t + (l.type === 'ride' ? 0 : l.seconds), 0);
}
/** Walks one after the other are one walk: to the first stop and on to the next is "walk 17 min to HaShalom", not two
 *  lines (2026-10-22); likewise a walk to another stop and on from it to the destination. The station entrance the
 *  whole walk comes out of is the first walk's, the one it goes in by the last's; a stop passed through between keeps
 *  none (2026-11-06: a walk to Arlozorov through a nearer stop lost its entrance). */
function mergeWalks(legs: LegOut[]): LegOut[] {
  const out: LegOut[] = [];
  const join = (a: PathPoint[] | undefined, b: PathPoint[] | undefined): PathPoint[] =>
    (a || []).concat((b || []).slice(1));
  for (const l of legs) {
    const p = out[out.length - 1];
    if (p && l.type === 'walk' && (p.type === 'access' || p.type === 'walk')) {
      out[out.length - 1] = {
        ...p,
        to: l.to,
        seconds: p.seconds + l.seconds,
        arrive: l.arrive,
        path: join(p.path, l.path),
        pathKind: p.pathKind === 'street' && l.pathKind === 'street' ? 'street' : 'straight',
        entry: l.entry,
      };
    } else if (p && l.type === 'egress' && p.type === 'walk') {
      out[out.length - 1] = {
        ...l,
        from: p.from,
        seconds: p.seconds + l.seconds,
        depart: p.depart,
        path: join(p.path, l.path),
        pathKind: p.pathKind === 'street' && l.pathKind === 'street' ? 'street' : 'straight',
        exit: p.exit,
      };
    } else out.push(l);
  }
  return out;
}
/**
 * The train in front of you: a direct way's earlier departures between the same two stops that arrive later. The
 * router drops them, being beaten (an earlier departure arriving later), but a rider at the platform wants the one
 * that is there (2026-10-22: Maintainer at HaHagana, the 19:30 to Moshe Dayan running at 19:37, beaten on paper by the 19:45
 * express, which was itself only on its timetable). They join their card's other times, marked (`slower`) with when
 * they arrive: the two latest that can still be reached, arriving at most 30 minutes after the card's own.
 */
function slowerSiblings(journeys: JourneyOut[], fromTime: number, q: Resolved): JourneyOut[] {
  const out: JourneyOut[] = [],
    seen = new Set<string>();
  for (const j of journeys) {
    const rides = j.legs.filter((l): l is RideLegOut => l.type === 'ride');
    if (rides.length !== 1) continue;
    const R = rides[0],
      B = R.from.stop,
      A = R.to.stop,
      key = `${B}-${A}`;
    if (seen.has(key)) continue; // one search per pair of stops: the card's earliest option comes first
    seen.add(key);
    const lead = R.depart - j.depart; // from setting out to boarding
    const found: { p: number; t: number; pos: number; k: number; d: number; a: number }[] = [];
    for (const { p, pos } of patternsAt(tt!, B)) {
      const ns = patternLength(tt!, p);
      let k = -1;
      for (let x = pos + 1; x < ns; x++)
        if (patternStop(tt!, p, x) === A) {
          k = x;
          break;
        }
      if (k < 0) continue;
      const { first, end } = tripRange(tt!, p);
      for (let t = first; t < end; t++) {
        const o = timesRow(tt!, t),
          d = tt!.dep[o + pos],
          a = tt!.arr[o + k];
        if (d >= R.depart || d < fromTime + lead || a <= R.arrive || a > R.arrive + 1800) continue;
        if (journeys.some((x) => x.legs.some((l) => l.type === 'ride' && l.trip === t))) continue;
        found.push({ p, t, pos, k, d, a });
      }
    }
    found.sort((x, y) => y.d - x.d);
    for (const f of found.slice(0, 2)) {
      const via: number[] = [];
      for (let x = f.pos; x <= f.k; x++) via.push(patternStop(tt!, f.p, x));
      const ride = legOut(
        {
          type: 'ride',
          pattern: f.p,
          trip: f.t,
          from: B,
          to: A,
          depart: f.d,
          arrive: f.a,
          seconds: f.a - f.d,
          stops: f.k - f.pos,
          via,
          route: tt!.routes[tt!.patRoute[f.p]],
        },
        q,
      );
      const before = f.d - R.depart,
        after = f.a - R.arrive;
      let seenRide = false;
      const legs = j.legs.map((l): LegOut => {
        if (l === R) {
          seenRide = true;
          return ride;
        }
        const dt = seenRide ? after : before;
        return { ...l, depart: l.depart + dt, arrive: l.arrive + dt };
      });
      out.push({
        depart: j.depart + before,
        arrive: j.arrive + after,
        transfers: 0,
        walkSeconds: j.walkSeconds,
        legs,
        slower: true,
      });
    }
  }
  return out;
}
/**
 * Journeys that board and alight at the same stops, in the same order, are one way to go at several
 * times, possibly with different lines on a leg. Groups keep the journey order (earliest first) and list
 * the indices of their options and the distinct lines per leg.
 */
/** A leg as the grouping sees it: its kind and its stops, so journeys that board and alight alike share a card. */
function legKey(l: LegOut): string {
  if (l.type === 'ride') return `r${l.from.stop}-${l.to.stop}`;
  if (l.type === 'walk') return `w${l.from.stop}-${l.to.stop}`;
  if (l.type === 'access') return `a${l.to.stop}`;
  return `e${l.from.stop}`;
}
function groupJourneys(journeys: JourneyOut[]): PlanGroup[] {
  const byKey = new Map<string, PlanGroup>(),
    groups: PlanGroup[] = [];
  journeys.forEach((j, idx) => {
    const key = j.legs.map(legKey).join('|');
    let g = byKey.get(key);
    if (!g) {
      g = { options: [], lines: j.legs.map(() => []) };
      byKey.set(key, g);
      groups.push(g);
    }
    g.options.push(idx);
    j.legs.forEach((l, i) => {
      if (l.type === 'ride' && !g.lines[i].includes(l.line)) g.lines[i].push(l.line);
    });
  });
  return groups;
}

export const planOps = {
  /**
   * Journeys between two places in a departure window; with arriveBy, the window ends at toTime and
   * only journeys arriving by then are kept. maxWalk (s) bounds the walk to the first and from the last stop.
   */
  async plan({
    from,
    to,
    fromTime,
    toTime,
    bike = 'none',
    folding = false,
    weekday = true,
    maxTransfers = 3,
    maxWalk = 900,
    arriveBy = false,
    urls = null,
  }) {
    const t0 = performance.now();
    // the vehicles around the origin and every train: enough for what a plan from here can ride, a fifth of the country's
    const all = await vehiclesNow(urls),
      near = (v: SnapVehicle): boolean =>
        v.operator === 2 || from.lat == null || haversine(v.lat, v.lon, from.lat, from.lon!) <= LIVE_NEAR_M;
    return withLiveTimes(all && all.filter(near), planNow);
    function planNow(lived: LiveTrips | null): PlanOut {
      const q: Resolved = {
        from: resolvePlace(
          from,
          bike === 'none' ? 'walk' : 'bike',
          bike === 'none' ? maxWalk : Math.max(1200, maxWalk),
        ),
        to: resolvePlace(to, bike === 'along' ? 'bike' : 'walk', bike === 'along' ? Math.max(1200, maxWalk) : maxWalk),
      };
      if (!q.from.places.length || !q.to.places.length)
        return {
          journeys: [],
          groups: [],
          reason: !q.from.places.length ? 'noOriginStops' : 'noDestStops',
          live: null,
          ms: 0,
        };
      // Two searches: everything, and trains only. The first keeps, per departure, only the earliest arrival, so a bus
      // a minute faster leaves no trace of the train beside it; the second brings the trains back, ranked apart (rank).
      // on foot at either end, the whole walk (to the first stop and any walk on to another) is within the rider's longest
      const opts: ProfileOptions = {
        maxTransfers,
        bikeOnBoard: bike === 'along',
        folding,
        weekday,
        raw: true,
        maxAccess: bike === 'none' ? maxWalk : undefined,
        maxEgress: bike !== 'along' ? maxWalk : undefined,
      };
      const r = profile(tt!, q.from.places, q.to.places, fromTime, toTime, opts);
      const byRail = profile(tt!, q.from.places, q.to.places, fromTime, toTime, { ...opts, routeTypes: [2] });
      const seen = new Set<string>(),
        all: RawJourney[] = [];
      for (const j of r.journeys.concat(byRail.journeys)) {
        easierTransfers(j);
        const k = journeySig(j);
        if (!seen.has(k)) {
          seen.add(k);
          all.push(j);
        }
      }
      // arrive-by: the journeys arriving in time are ranked among themselves only; ranked with the rest, a later one with
      // fewer changes that arrives a few minutes past the deadline would knock out one that is in time, and then be dropped
      const found = rank(arriveBy ? all.filter((j) => j.arrive <= toTime) : all);
      const journeys: JourneyOut[] = found.map((j) => ({
        depart: j.depart,
        arrive: j.arrive,
        transfers: j.transfers,
        walkSeconds: j.walkSeconds,
        legs: mergeWalks(j.legs.filter((l) => l.type === 'ride' || l.seconds > 0).map((l) => legOut(l, q))),
      }));
      if (!arriveBy) journeys.push(...slowerSiblings(journeys, fromTime, q));
      for (const j of journeys) {
        const r = j.legs.find((l): l is RideLegOut => l.type === 'ride');
        if (r) r.next = nextDeparts(r.route, r.from.stop, r.depart);
      }
      // nothing in the window: when the next way leaves (one search from the window's end finds the first ride after
      // it, however long the wait), or null when nothing more runs on this service day (a Friday evening)
      let nextAt: number | null = null;
      if (!journeys.length && !arriveBy) {
        const n = planFrom(tt!, q.from.places, q.to.places, toTime, opts).journeys;
        if (n.length) nextAt = Math.min(...n.map((j) => j.depart));
      }
      let bikeOnly: PlanOut['bikeOnly'] = null;
      if (st && bike !== 'none' && q.from.point && q.to.point) {
        const br = route(st, q.from.point.lat, q.from.point.lon, q.to.point.lat, q.to.point.lon, 'bike', 3 * 3600);
        if (br)
          bikeOnly = {
            seconds: br.seconds,
            metres: br.metres,
            path: [[q.from.point.lat, q.from.point.lon], ...br.path, [q.to.point.lat, q.to.point.lon]],
          };
      }
      return {
        journeys,
        groups: groupJourneys(journeys),
        nextAt,
        bikeOnly,
        candidates: r.candidates,
        streets: !!st,
        live: lived && { asOf: lived.asOf, trips: pick(lived.trips, journeys) },
        ms: performance.now() - t0,
      };
    }
  },
} satisfies OpsPart<'plan'>;
