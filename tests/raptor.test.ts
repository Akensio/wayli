// The router's rules (src/engine/raptor.ts) on tiny timetables: which stop to get off at, which journeys to keep, and
// the next way after an empty window.
import { test, expect } from 'vitest';
import {
  profile,
  plan,
  canBoard,
  canAlight,
  rank,
  endWalks,
  worthTheWalk,
  patternLength,
  patternStop,
  lastStop,
  stopsBetween,
  patternsAt,
  tripCount,
  tripRange,
  timesRow,
  type RawJourney,
  type RawRideLeg,
} from '../src/engine/raptor.ts';
import { tinyTimetable, T } from './tinytt.ts';

// a street with stops O, A, B, C every 400 m; the door is near B and C
const stops = [
  { name: 'O', lat: 32.07, lon: 34.8 },
  { name: 'A', lat: 32.07, lon: 34.804 },
  { name: 'B', lat: 32.07, lon: 34.808 },
  { name: 'C', lat: 32.07, lon: 34.812 },
];
const routes = [{ short: '60' }];
/** The journey's ride; the tests below assert there is one. */
const rideOf = (j: RawJourney): RawRideLeg => j.legs.find((l): l is RawRideLeg => l.type === 'ride')!;

test('getting off: within a minute of the earliest arrival at the door, the stop with the least walking', () => {
  // the 60 reaches C 70 s after B; the door is 171 s from B and 117 s from C (the 2026-10-29 case, Katznelson/Sirkin)
  const tt = tinyTimetable({
    stops,
    routes,
    patterns: [{ route: 0, stops: [0, 1, 2, 3], trips: [[T(10, 0), T(10, 5), T(10, 10), T(10, 11, 10)]] }],
  });
  const dests = [
    { stop: 2, walk: 171 },
    { stop: 3, walk: 117 },
  ];
  const { journeys } = profile(tt, [{ stop: 0, walk: 0 }], dests, T(9, 55), T(10, 5));
  expect(journeys).toHaveLength(1);
  expect(rideOf(journeys[0]).to).toBe(3); // one more stop, 16 s later at the door, 54 s less walking
  expect(journeys[0].arrive).toBe(T(10, 11, 10) + 117);
});

test('getting off: an earlier stop that brings the rider to the door a minute sooner still wins', () => {
  const tt = tinyTimetable({
    stops,
    routes,
    patterns: [{ route: 0, stops: [0, 1, 2, 3], trips: [[T(10, 0), T(10, 5), T(10, 10), T(10, 12, 30)]] }],
  });
  const dests = [
    { stop: 2, walk: 171 },
    { stop: 3, walk: 117 },
  ];
  const { journeys } = profile(tt, [{ stop: 0, walk: 0 }], dests, T(9, 55), T(10, 5));
  expect(rideOf(journeys[0]).to).toBe(2); // via C the door is 96 s later: a real saving, so B
  expect(journeys[0].arrive).toBe(T(10, 10) + 171);
});

// O to D direct in 40 minutes, or O to M, change, M to D
const changeStops = [
  { name: 'O', lat: 32.07, lon: 34.8 },
  { name: 'M', lat: 32.08, lon: 34.81 },
  { name: 'D', lat: 32.09, lon: 34.82 },
];
const changeRoutes = [{ short: '1' }, { short: '2' }, { short: '3' }];
const withChangeArriving = (arrive: number) =>
  tinyTimetable({
    stops: changeStops,
    routes: changeRoutes,
    patterns: [
      { route: 0, stops: [0, 2], trips: [[T(10, 0), T(10, 40)]] },
      { route: 1, stops: [0, 1], trips: [[T(10, 0), T(10, 20)]] },
      { route: 2, stops: [1, 2], trips: [[T(10, 22), arrive]] },
    ],
  });

test('ranking: an extra change has to save at least five minutes', () => {
  const few = profile(withChangeArriving(T(10, 37)), 0, 2, T(9, 55), T(10, 5)).journeys;
  expect(few.map((j) => j.transfers)).toEqual([0]); // three minutes saved: the change is not worth showing
  const many = profile(withChangeArriving(T(10, 30)), 0, 2, T(9, 55), T(10, 5)).journeys;
  expect(many.map((j) => j.transfers).sort()).toEqual([0, 1]); // ten minutes saved: both ways shown
});

test('a window with no departures still answers with the first ride after it, however long the wait', () => {
  // (so an empty list means nothing more runs that day, and the worker's one search from the window's end, nextAt,
  // matters when buses leave in the window but none reaches the destination until later)
  const tt = withChangeArriving(T(10, 37));
  expect(profile(tt, 0, 2, T(7, 0), T(8, 0)).journeys.map((j) => j.depart)).toEqual([T(10, 0)]);
  expect(plan(tt, 0, 2, T(8, 0)).journeys.map((j) => j.depart)).toEqual([T(10, 0)]);
});

test('route types: every GTFS type can be asked for, on-demand (715) and shared taxis (8) too', () => {
  // the route types used to sit in an Int8Array and a lookup of 8 slots: 715 wrapped to -53 and 8 fell off the end, so
  // asking for either found nothing (2026-10-31)
  const tt = tinyTimetable({
    stops,
    routes: [{ short: 'F1', type: 715 }, { short: '4', type: 8 }, { short: '60' }],
    patterns: [
      { route: 0, stops: [0, 1], trips: [[T(10, 0), T(10, 5)]] },
      { route: 1, stops: [0, 2], trips: [[T(10, 1), T(10, 9)]] },
      { route: 2, stops: [0, 3], trips: [[T(10, 2), T(10, 12)]] },
    ],
  });
  const reach = (types: number[], to: number) =>
    profile(tt, [{ stop: 0, walk: 0 }], [{ stop: to, walk: 0 }], T(9, 55), T(10, 5), { routeTypes: types }).journeys;
  expect(reach([715], 1)).toHaveLength(1);
  expect(reach([8], 2)).toHaveLength(1);
  expect(reach([715], 3)).toHaveLength(0); // the bus is not on demand
});

test("the layout's accessors: a pattern's stops, its trips, and where each trip's times are", () => {
  const tt = tinyTimetable({
    stops,
    routes,
    patterns: [
      {
        route: 0,
        stops: [0, 1, 2],
        trips: [
          [T(8, 0), T(8, 5), T(8, 9)],
          [T(9, 0), T(9, 6), T(9, 10)],
        ],
      },
      { route: 0, stops: [3, 2, 1, 0], trips: [[T(7, 0), T(7, 2), T(7, 5), T(7, 9)]] },
    ],
  });
  expect([0, 1].map((p) => patternLength(tt, p))).toEqual([3, 4]);
  expect([patternStop(tt, 1, 0), lastStop(tt, 1)]).toEqual([3, 0]);
  expect(stopsBetween(tt, 1, 1, 2)).toEqual([2, 1]);
  expect(patternsAt(tt, 2).sort((a, b) => a.p - b.p)).toEqual([
    { p: 0, pos: 2 },
    { p: 1, pos: 1 },
  ]);
  // every trip's row holds its own times, stop by stop
  const seen: number[][] = [];
  for (const p of [0, 1]) {
    expect(tripCount(tt, p)).toBe(p === 0 ? 2 : 1);
    const { first, end } = tripRange(tt, p);
    for (let t = first; t < end; t++)
      seen.push(Array.from({ length: patternLength(tt, p) }, (_, i) => tt.dep[timesRow(tt, t) + i]));
  }
  expect(seen).toEqual([
    [T(8, 0), T(8, 5), T(8, 9)],
    [T(9, 0), T(9, 6), T(9, 10)],
    [T(7, 0), T(7, 2), T(7, 5), T(7, 9)],
  ]);
});

test('a trip is boarded and left only where it allows: no riding an intercity line between two stops of one city', () => {
  // the maintainer's plan to the beach, 2026-11-12: the 480 to Jerusalem from Azrieli two stops to HaMasger, across the
  // road, and the 480 from Jerusalem on to Reading. The feed lets the first be boarded only, in Tel Aviv, and the
  // second be left only; 28% of all trips have such stops and the timetable did not carry them.
  const spec = (flags: boolean) => ({
    stops: [
      { name: 'Azrieli', lat: 32.074, lon: 34.792 },
      { name: 'HaMasger south', lat: 32.064, lon: 34.784 },
      { name: 'HaMasger north', lat: 32.0641, lon: 34.7842 },
      { name: 'Reading', lat: 32.1, lon: 34.78 },
      { name: 'Jerusalem', lat: 31.789, lon: 35.203 },
    ],
    routes: [{ short: '480' }, { short: '40' }],
    patterns: [
      // to Jerusalem: riders get on in Tel Aviv, off in Jerusalem
      {
        route: 0,
        stops: [0, 1, 4],
        trips: [[T(1, 44), T(1, 50), T(2, 40)]],
        ...(flags && { only: ['board', 'board', 'alight'] as const }),
      },
      // from Jerusalem: on there, off in Tel Aviv
      {
        route: 0,
        stops: [4, 2, 3],
        trips: [[T(1, 0), T(1, 58), T(2, 15)]],
        ...(flags && { only: ['board', 'alight', 'alight'] as const }),
      },
      // the local line, later
      { route: 1, stops: [0, 3], trips: [[T(2, 0), T(2, 30)]] },
    ],
    footpaths: [[1, 2, 60]] as [number, number, number][],
  });
  const lines = (tt: ReturnType<typeof tinyTimetable>, from: number, to: number, at: number) =>
    plan(tt, from, to, at).journeys.map((j) =>
      j.legs.filter((l) => l.type === 'ride').map((l) => (l as RawRideLeg).route[0]),
    );
  const tt = tinyTimetable(spec(true));
  expect(lines(tt, 0, 3, T(1, 40))).toEqual([['40']]); // not the two 480s, which arrive a quarter of an hour sooner
  expect(lines(tt, 0, 4, T(1, 40))).toEqual([['480']]); // what the line is for still works: out of the city
  expect(lines(tt, 4, 3, T(0, 50))).toEqual([['480']]); // and into it
  expect([canBoard(tt, 0, 0), canAlight(tt, 0, 1), canAlight(tt, 0, 2)]).toEqual([true, false, true]);
  expect([canBoard(tt, 1, 0), canBoard(tt, 1, 1), canAlight(tt, 1, 1)]).toEqual([true, false, true]);
  expect([canBoard(tt, 2, 1), canAlight(tt, 2, 0)]).toEqual([false, false]); // never on at the last stop, off at the first
  // a file from before the compiler kept the marks: every stop takes riders on and off, as it did
  expect(lines(tinyTimetable(spec(false)), 0, 3, T(1, 40))[0]).toEqual(['480', '480']);
});

test('a way past the longest walk is offered when it is worth it: five minutes sooner than what can still be caught, a change counted as five', () => {
  // the night of 2026-11-12 in small: within a 20-minute walk, the 40, then the 480, then the 445, an hour and a half;
  // 25 minutes away, a 445 that goes straight there in twelve minutes
  const tt = tinyTimetable({
    stops: ['Azrieli', 'Namir', 'Reading', 'Gordon', 'Sharona', 'Bograshov'].map((name, i) => ({
      name,
      lat: 32.07 + i * 0.01,
      lon: 34.78,
    })),
    routes: [{ short: '40' }, { short: '480' }, { short: '445' }],
    patterns: [
      { route: 0, stops: [0, 1], trips: [[T(1, 44), T(1, 49)]] },
      { route: 1, stops: [1, 2], trips: [[T(2, 8), T(2, 15)]] },
      { route: 2, stops: [2, 3], trips: [[T(2, 30), T(2, 37)]] },
      { route: 2, stops: [4, 5], trips: [[T(1, 53), T(2, 5)]] }, // the direct one, from the stop 25 minutes away
    ],
  });
  const LIMIT = 20 * 60,
    near = [{ stop: 0, walk: 17 * 60 }],
    all = [...near, { stop: 4, walk: 25 * 60 }],
    dests = [
      { stop: 3, walk: 12 * 60 },
      { stop: 5, walk: 4 * 60 },
    ];
  const search = (origins: typeof all, walk: number) =>
    rank(profile(tt, origins, dests, T(1, 14), T(2, 24), { maxAccess: walk, maxEgress: walk, raw: true }).journeys);
  const within = search(near, LIMIT),
    wider = search(all, LIMIT * 1.5).filter((j) => Math.max(...endWalks(j)) > LIMIT);
  const lines = (j: RawJourney) => j.legs.filter((l) => l.type === 'ride').map((l) => (l as RawRideLeg).route[0]);
  expect(within.map(lines)).toEqual([['40', '480', '445']]); // what the rider was shown
  expect(within[0].arrive).toBe(T(2, 49));
  // the wider search finds the direct one, and it is worth the walk: forty minutes sooner, and two changes fewer
  const worth = wider.filter((w) => worthTheWalk(w, within));
  expect(worth.map((j) => [lines(j), j.arrive, Math.max(...endWalks(j))])).toEqual([[['445'], T(2, 9), 25 * 60]]);
  // the rule's edges, on the same two ways moved in time. With as many changes: five minutes sooner on the clock
  const w = worth[0],
    a = { ...within[0], transfers: 0 };
  expect(worthTheWalk({ ...w, arrive: a.arrive - 300 }, [a])).toBe(true);
  expect(worthTheWalk({ ...w, arrive: a.arrive - 299 }, [a])).toBe(false);
  // with two changes fewer, as here: each is worth five minutes, so even five minutes later on the clock
  expect(worthTheWalk({ ...w, arrive: within[0].arrive + 300 }, within)).toBe(true);
  expect(worthTheWalk({ ...w, arrive: within[0].arrive + 301 }, within)).toBe(false);
  // a way within the limit that has left by then is not one the rider can catch, and with none to catch it is the way
  expect(worthTheWalk({ ...w, depart: a.depart + 61, arrive: a.arrive + 3600 }, [a])).toBe(true);
  expect(worthTheWalk(w, [])).toBe(true);
});
