// The planner with a live vehicle (worker/plan.ts applyLive) and the result list's reading of it (state/results.ts
// standing): a stop the vehicle has not reached cannot have been left before now, and a ride whose bus is still short
// of the boarding stop, in a fresh report, is due, not gone, even once the clock has passed its planned time (the
// maintainer at Nordau, 2026-11-08: a bus 300 m short of the station was filed under "just left" while Moovit said
// "now"). The tiny timetable is loaded the way the worker loads a real one, so the plan runs on the worker's own code.
import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import { tinyContainer, T } from './tinytt.ts';
import { secondsOn } from '../src/engine/clock.ts';
import { FRESH_S } from '../src/engine/delays.ts';
import type { Vehicle } from '../src/engine/feed.ts';
import type { Journey } from '../src/trip/journey';

const DAY = '20261105'; // a Thursday; Israel is at UTC+2 in November
const at = (sec: number): number => Date.parse('2026-11-05T00:00:00+02:00') + sec * 1000;
const NOW = at(T(9, 19, 30));
// four stops 500 m apart along a street; line 8 (route 9768) runs them in two minutes a stretch, at 9:10 and 9:30
const stops = [0, 1, 2, 3].map((i) => ({ name: `s${i}`, lat: 32.08, lon: 34.78 + i * 0.0053 }));
const container = tinyContainer({
  date: DAY,
  stops,
  routes: [{ short: '8', id: '9768' }],
  patterns: [
    {
      route: 0,
      stops: [0, 1, 2, 3],
      trips: [
        [T(9, 10), T(9, 12), T(9, 14), T(9, 16)],
        [T(9, 30), T(9, 32), T(9, 34), T(9, 36)],
      ],
    },
  ],
});
const bus = (lon: number, recordedAt: number): Vehicle => ({
  lineRef: '9768',
  lat: 32.08,
  lon,
  bearing: null,
  velocity: 0,
  recordedAt: new Date(recordedAt),
  scheduledStart: new Date(at(T(9, 10))),
  rideId: 'r1',
});
let planOps: typeof import('../src/worker/plan.ts').planOps, results: typeof import('../src/state/results');
beforeAll(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  (globalThis as { self?: unknown }).self = { postMessage() {}, location: { href: 'http://test/' } };
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array(container)));
  const data = await import('../src/worker/data.ts');
  await data.dataOps.loadTimetable({ url: 'http://test/tiny.bin' });
  planOps = (await import('../src/worker/plan.ts')).planOps;
  results = await import('../src/state/results');
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const plan = (v: Vehicle) =>
  planOps.plan({
    from: { name: 'at s1', lat: stops[1].lat, lon: stops[1].lon },
    to: { name: 'at s3', lat: stops[3].lat, lon: stops[3].lon },
    fromTime: T(9, 19, 30) - 600,
    toTime: T(9, 19, 30) + 3600,
    vehicles: [v],
  }).journeys as unknown as Journey[];

test('a bus still short of the stop, planned behind the clock, leaves now and stays a due card', () => {
  const n = secondsOn(new Date(NOW), DAY);
  // 300 m short of the second stop, reported 100 s ago: by position it is 7 minutes late and reached the stop at
  // 9:19:02, which has gone by; it has not been seen there, so the plan boards it now
  const [j, next] = plan(bus(stops[1].lon - 0.0032, NOW - 100e3));
  const ride = j.legs.find((l) => l.type === 'ride')!;
  expect(ride.depart).toBe(n);
  expect(j.depart).toBe(n);
  expect(ride.live).toMatchObject({ ahead: true, stale: false });
  expect(next.legs.find((l) => l.type === 'ride')!.depart).toBe(T(9, 32)); // the 9:30 ride, no vehicle yet
  // the list, 20 s and 2 min later: still due, a card with "leave now", not on the just-left strip
  expect(results.standing(j, n + 20, NOW + 20e3)).toBe('ontime');
  expect(results.leaveAt(j, n + 20, NOW + 20e3)).toBe(n + 20);
  expect(results.standing(j, n + 120, NOW + 120e3)).toBe('ontime');
  // once its report (100 s old at the plan) is older than FRESH_S, the times rule again: gone
  expect(results.standing(j, n + FRESH_S - 80, NOW + (FRESH_S - 80) * 1000)).toBe('gone');
});

test('a bus seen past the stop has gone, however fresh its report', () => {
  // half way from the second stop to the third, reported 10 s ago: the second stop gets the time it left it by, in
  // the past, and the way is gone
  const [j] = plan(bus(stops[1].lon + 0.0027, NOW - 10e3));
  const ride = j.legs.find((l) => l.type === 'ride')!;
  const n = secondsOn(new Date(NOW), DAY);
  expect(ride.depart).toBeGreaterThan(T(9, 12));
  expect(ride.depart).toBeLessThan(n);
  expect(ride.live).toMatchObject({ ahead: false });
  expect(results.standing(j, n, NOW)).toBe('gone');
});
