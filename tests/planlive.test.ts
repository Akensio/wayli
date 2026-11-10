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
import type { RideLegOut } from '../src/worker/ops.ts';

const DAY = '20261105'; // a Thursday; Israel is at UTC+2 in November
const at = (sec: number): number => Date.parse('2026-11-05T00:00:00+02:00') + sec * 1000;
const NOW = at(T(9, 19, 30));
// four stops 500 m apart along a street; line 8 (route 9768) runs them in two minutes a stretch, at 9:10 and 9:30;
// train 9 (route 9900) runs its own four stations a kilometre north the same way, at 9:00, 9:10 and 9:18
const stops = [0, 1, 2, 3].map((i) => ({ name: `s${i}`, lat: 32.08, lon: 34.78 + i * 0.0053, code: `c${i}` }));
const stations = [0, 1, 2, 3].map((i) => ({ name: `t${i}`, lat: 32.09, lon: 34.78 + i * 0.0053, code: `d${i}` }));
const container = tinyContainer({
  date: DAY,
  stops: [...stops, ...stations],
  routes: [
    { short: '8', id: '9768' },
    { short: '9', id: '9900', type: 2 },
  ],
  patterns: [
    {
      route: 0,
      stops: [0, 1, 2, 3],
      trips: [
        [T(9, 10), T(9, 12), T(9, 14), T(9, 16)],
        [T(9, 30), T(9, 32), T(9, 34), T(9, 36)],
      ],
    },
    {
      route: 1,
      stops: [4, 5, 6, 7],
      trips: [
        [T(9, 0), T(9, 2), T(9, 4), T(9, 6)],
        [T(9, 10), T(9, 12), T(9, 14), T(9, 16)],
        [T(9, 18), T(9, 20), T(9, 22), T(9, 24)],
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
let planOps: typeof import('../src/worker/plan.ts').planOps,
  results: typeof import('../src/state/results'),
  snapVehicles: typeof import('../src/worker/vehicles.ts').snapVehicles,
  remember: typeof import('../src/worker/vehicles.ts').remember,
  estimateFor: typeof import('../src/worker/vehicles.ts').estimateFor,
  tripFor: typeof import('../src/worker/trips.ts').tripFor,
  tripStopList: typeof import('../src/worker/trips.ts').tripStopList;
beforeAll(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  (globalThis as { self?: unknown }).self = { postMessage() {}, location: { href: 'http://test/' } };
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array(container)));
  const data = await import('../src/worker/data.ts');
  await data.dataOps.loadTimetable({ url: 'http://test/tiny.bin' });
  planOps = (await import('../src/worker/plan.ts')).planOps;
  results = await import('../src/state/results');
  ({ snapVehicles, remember, estimateFor } = await import('../src/worker/vehicles.ts'));
  ({ tripFor, tripStopList } = await import('../src/worker/trips.ts'));
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

// One report as the feed gives it, and a minute's snapshot of several
type Rep = { line: string; start: string; lat: number; lon: number; operator?: string };
const snapOf = (t: number, reps: Rep[]) => ({
  Siri: {
    ServiceDelivery: {
      StopMonitoringDelivery: [
        {
          MonitoredStopVisit: reps.map((r) => ({
            RecordedAtTime: new Date(t - 10e3).toISOString(),
            MonitoredVehicleJourney: {
              LineRef: r.line,
              OriginAimedDepartureTime: r.start,
              OperatorRef: r.operator ?? '2',
              VehicleRef: r.line + r.start,
              Velocity: '0',
              VehicleLocation: { Latitude: String(r.lat), Longitude: String(r.lon) },
            },
          })),
        },
      ],
    },
  },
});
const MIN = 60e3;
const see = (t: number, reps: Rep[]) => {
  const j = snapOf(t, reps);
  remember(j, t);
  return snapVehicles(j, t);
};

test('a position that does not change at all says nothing once the train was due to move; one standing with a live GPS is read', () => {
  // The week's two trains, on the tiny line. Like train 970 (2026-11-10: on Rehovot's platform from 15:15 to past 17:01,
  // never ran): the 9:00 at its first stop, the very same fix every minute. Like train 233 (2026-11-09: one fix at
  // HaShalom for forty minutes while it ran on to Lod): the 9:10 at the second stop, the very same fix. And like train
  // 268 beside the 970, waiting for its time: the 9:18 at the first stop, a live GPS, a few metres apart each minute.
  const start = (hm: string) => `2026-11-05T${hm}:00+02:00`;
  const parked: Rep = { line: '9900', start: start('09:00'), lat: stations[0].lat, lon: stations[0].lon + 0.0001 };
  const dead: Rep = { line: '9900', start: start('09:10'), lat: stations[1].lat, lon: stations[1].lon };
  const live = (k: number): Rep => ({
    line: '9900',
    start: start('09:18'),
    lat: stations[0].lat,
    lon: stations[0].lon + 0.00001 * (k % 3),
  });
  let vs: ReturnType<typeof snapVehicles> = [];
  for (let k = 10; k >= 0; k--) vs = see(NOW - k * MIN, [parked, dead, live(k)]);
  const estimate = (hm: string) => {
    const v = vs.find((x) => x.scheduledStart.getTime() === Date.parse(start(hm)))!;
    return estimateFor(v, tripStopList(tripFor('9900', secondsOn(v.scheduledStart, DAY))).stops, DAY);
  };
  expect(estimate('09:00')).toBeNull(); // nineteen minutes past its time, not a metre of news
  expect(estimate('09:10')).toBeNull();
  expect(estimate('09:18')).toMatchObject({ index: 0, stale: false }); // a minute and a half past its time, standing: late, live
  // and so the plan from the first station: the 9:10 on its timetable (no news of it), the 9:18 leaving now at the
  // earliest, never the 9:00
  const rides = planOps
    .plan({
      from: { name: 'at t0', lat: stations[0].lat, lon: stations[0].lon },
      to: { name: 'at t3', lat: stations[3].lat, lon: stations[3].lon },
      fromTime: T(9, 19, 30) - 600,
      toTime: T(9, 19, 30) + 3600,
      vehicles: vs,
    })
    .journeys.flatMap((j) => j.legs)
    .filter((l): l is RideLegOut => l.type === 'ride' && l.line === '9');
  expect(rides.map((l) => [l.schedDepart, l.depart])).toEqual([
    [T(9, 10), T(9, 10)],
    [T(9, 18), T(9, 19, 30)],
  ]);
  // the 9:10's unit wakes up further on: believed again at once
  vs = see(NOW + MIN, [{ ...dead, lat: stations[2].lat, lon: stations[2].lon + 0.002 }]);
  expect(estimate('09:10')).toMatchObject({ index: 2 });
});

test('a fresh open knows at once: the snapshots of 3 and 10 minutes before, read late, take the memory back', () => {
  const rep = (line: string, lon: number): Rep => ({
    line,
    start: '2026-11-05T09:10:00+02:00',
    lat: 32.08,
    lon,
    operator: '3',
  });
  const T0 = NOW + 60 * MIN; // away from the test above
  vi.setSystemTime(T0);
  // now, then 3 and 10 minutes before: 'same' reports the very same position each time, 'here' stands with a live GPS
  // (a metre or two apart), 'came' was 900 m away ten minutes ago
  see(T0, [rep('same', 34.78), rep('here', 34.78001), rep('came', 34.78002)]);
  see(T0 - 3 * MIN, [rep('same', 34.78), rep('here', 34.78002), rep('came', 34.78003)]);
  see(T0 - 10 * MIN, [rep('same', 34.78), rep('here', 34.78003), rep('came', 34.79)]);
  const [same, here, came] = see(T0, [rep('same', 34.78), rep('here', 34.78001), rep('came', 34.78002)]);
  expect([same.sameSince, same.stillSince]).toEqual([T0 - 10 * MIN, T0 - 10 * MIN]);
  expect([here.sameSince, here.stillSince]).toEqual([T0, T0 - 10 * MIN]); // a live GPS, standing for ten minutes at least
  expect(came.stillSince).toBe(T0 - 3 * MIN); // elsewhere ten minutes ago: here since the snapshot of three
  // and when it moves on, it stands at the new place from then
  expect(see(T0 + MIN, [rep('here', 34.79)])[0].stillSince).toBe(T0 + MIN);
  vi.setSystemTime(NOW);
});
