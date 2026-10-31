// The router's rules (src/engine/raptor.js) on tiny timetables: which stop to get off at, which journeys to keep, and
// the next way after an empty window.
import { test, expect } from 'vitest';
import {
  profile,
  plan,
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
