// The router (src/engine/raptor.ts) against a search that is slow but plainly right, on a few hundred small random
// timetables. No footpaths here: every change is at a stop, with the timetable's slack between getting off and boarding
// again, none before the first ride. Three promises are checked:
//   1. the earliest arrival the router finds is the true earliest, with at most four rides, and it finds none only
//      when there is none;
//   2. every journey it gives can be ridden: each ride is a real trip at its real times, rides chain stop to stop with
//      the slack between them, and nothing leaves before the rider does;
//   3. leaving later never arrives earlier (the timetable's trips do not overtake).
import { test, expect } from 'vitest';
import { plan, type RawJourney, type RawRideLeg, type Timetable } from '../src/engine/raptor.ts';
import { patternLength, patternStop, tripRange, timesRow } from '../src/engine/raptor.ts';
import { tinyTimetable, T, type TinySpec } from './tinytt.ts';

/** A small seeded generator (mulberry32), so a failing case can be run again by its seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOPS = 8;
/** A random network: a few lines, each a run of distinct stops with the same running times for every trip (so trips
 *  do not overtake), its trips spread over the morning. */
function randomSpec(r: () => number): TinySpec {
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const stops = Array.from({ length: STOPS }, (_, i) => ({ name: `S${i}`, lat: 32 + i * 0.01, lon: 34.8 }));
  const patterns: TinySpec['patterns'] = [];
  for (let k = int(3, 6); k > 0; k--) {
    const order = Array.from({ length: STOPS }, (_, i) => i).sort(() => r() - 0.5);
    const line = order.slice(0, int(2, 5));
    const gaps = line.slice(1).map(() => int(1, 10) * 60);
    const trips: number[][] = [];
    for (let n = int(1, 5); n > 0; n--) {
      let t = T(6, 0) + int(0, 180) * 60;
      trips.push(line.map((_, i) => (i === 0 ? t : (t += gaps[i - 1]))));
    }
    patterns.push({ route: 0, stops: line, trips });
  }
  return { stops, routes: [{ short: '1' }], patterns };
}

const INF = Number.MAX_SAFE_INTEGER;
/** The earliest arrival at `to`, leaving `from` at `depTime`, with at most `maxRides` rides: round by round, every
 *  trip of every pattern tried from every stop it can be boarded at. */
function bruteEarliest(tt: Timetable, from: number, to: number, depTime: number, maxRides: number): number {
  let ready = new Array<number>(STOPS).fill(INF); // when a rider can board at each stop, after the rides so far
  ready[from] = depTime;
  let best = from === to ? depTime : INF;
  for (let k = 1; k <= maxRides; k++) {
    const arrive = new Array<number>(STOPS).fill(INF);
    for (let p = 0; p < tt.header.counts.patterns; p++) {
      const { first, end } = tripRange(tt, p);
      for (let t = first; t < end; t++) {
        const row = timesRow(tt, t);
        for (let i = 0; i < patternLength(tt, p); i++) {
          if (tt.dep[row + i] < ready[patternStop(tt, p, i)]) continue;
          for (let j = i + 1; j < patternLength(tt, p); j++) {
            const s = patternStop(tt, p, j);
            arrive[s] = Math.min(arrive[s], tt.arr[row + j]);
          }
        }
      }
    }
    best = Math.min(best, arrive[to]);
    const next = ready.slice();
    for (let s = 0; s < STOPS; s++) if (arrive[s] < INF) next[s] = Math.min(next[s], arrive[s] + tt.slack);
    ready = next;
  }
  return best;
}

/** What is wrong with a journey as a thing to ride, or null when nothing is. */
function unrideable(tt: Timetable, j: RawJourney, from: number, to: number, depTime: number): string | null {
  const rides = j.legs.filter((l): l is RawRideLeg => l.type === 'ride');
  if (!rides.length) return 'no ride';
  if (rides[0].from !== from) return `starts at ${rides[0].from}, not ${from}`;
  if (rides[rides.length - 1].to !== to) return `ends at ${rides[rides.length - 1].to}, not ${to}`;
  if (rides.length > 4) return `${rides.length} rides`;
  let ready = depTime;
  for (const [n, l] of rides.entries()) {
    if (n > 0 && l.from !== rides[n - 1].to) return `ride ${n} starts where the one before did not end`;
    const p = tt.tripPat[l.trip],
      row = timesRow(tt, l.trip),
      stops = Array.from({ length: patternLength(tt, p) }, (_, i) => patternStop(tt, p, i));
    const i = stops.indexOf(l.from),
      k = stops.lastIndexOf(l.to);
    if (i < 0 || k <= i) return `ride ${n}: trip ${l.trip} does not go from ${l.from} to ${l.to}`;
    if (tt.dep[row + i] !== l.depart || tt.arr[row + k] !== l.arrive) return `ride ${n}: times are not the trip's`;
    if (l.depart < ready) return `ride ${n} leaves at ${l.depart}, before the rider is there at ${ready}`;
    ready = l.arrive + tt.slack;
  }
  if (j.arrive !== rides[rides.length - 1].arrive) return 'the journey arrives at another time than its last ride';
  return null;
}

test('the router finds the true earliest arrival, and every journey it gives can be ridden', () => {
  let checked = 0,
    found = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed),
      tt = tinyTimetable(randomSpec(r));
    for (let q = 0; q < 4; q++) {
      const from = Math.floor(r() * STOPS),
        to = (from + 1 + Math.floor(r() * (STOPS - 1))) % STOPS,
        depTime = T(6, 0) + Math.floor(r() * 200) * 60;
      const want = bruteEarliest(tt, from, to, depTime, 4);
      const { journeys } = plan(tt, [{ stop: from, walk: 0 }], [{ stop: to, walk: 0 }], depTime, { raw: true });
      const got = journeys.length ? Math.min(...journeys.map((j) => j.arrive)) : INF;
      expect(got, `seed ${seed}, ${from} to ${to} at ${depTime}`).toBe(want);
      for (const j of journeys) expect(unrideable(tt, j, from, to, depTime), `seed ${seed}`).toBeNull();
      checked++;
      if (journeys.length) found++;
    }
  }
  expect(checked).toBe(1200);
  expect(found).toBeGreaterThan(300); // the networks are connected enough for the check to mean something
});

test('leaving later never arrives earlier', () => {
  for (let seed = 1001; seed <= 1100; seed++) {
    const r = rng(seed),
      tt = tinyTimetable(randomSpec(r));
    const from = Math.floor(r() * STOPS),
      to = (from + 1 + Math.floor(r() * (STOPS - 1))) % STOPS;
    let last = 0;
    for (let depTime = T(6, 0); depTime <= T(9, 0); depTime += 600) {
      const { journeys } = plan(tt, [{ stop: from, walk: 0 }], [{ stop: to, walk: 0 }], depTime, { raw: true });
      const got = journeys.length ? Math.min(...journeys.map((j) => j.arrive)) : INF;
      expect(got, `seed ${seed}, leaving at ${depTime}`).toBeGreaterThanOrEqual(last);
      last = got;
    }
  }
});
