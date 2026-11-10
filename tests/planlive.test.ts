// The worker's one answer per trip (worker/vehicles.ts liveTrips), the planner routed on it (worker/plan.ts) and the
// page's reading of it (trip/now.ts, state/results.ts), on a tiny timetable loaded the way the worker loads a real one
// and fed minute by minute the way the relay feeds it: a bus short of the stop leaves now and keeps its card (Nordau,
// 2026-11-08); one seen past it has gone; a train whose position never changes says nothing (the 233 and the 970); and
// what a fresh open knows from the snapshots of minutes before.
import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import { tinyContainer, T } from './tinytt.ts';
import { secondsOn } from '../src/engine/clock.ts';
import type { Journey } from '../src/trip/journey';
import { firstRide, tripNow } from '../src/trip/now';
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
let planOps: typeof import('../src/worker/plan.ts').planOps,
  vehicles: typeof import('../src/worker/vehicles.ts'),
  trips: typeof import('../src/worker/trips.ts'),
  results: typeof import('../src/state/results'),
  live: typeof import('../src/state/live');
beforeAll(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  (globalThis as { self?: unknown }).self = { postMessage() {}, location: { href: 'http://test/' } };
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array(container)));
  const data = await import('../src/worker/data.ts');
  await data.dataOps.loadTimetable({ url: 'http://test/tiny.bin' });
  planOps = (await import('../src/worker/plan.ts')).planOps;
  vehicles = await import('../src/worker/vehicles.ts');
  trips = await import('../src/worker/trips.ts');
  results = await import('../src/state/results');
  live = await import('../src/state/live');
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// One report as the feed gives it, and a minute's snapshot of several
type Rep = { line: string; start: string; lat: number; lon: number; operator?: string; ago?: number };
const start = (hm: string) => `2026-11-05T${hm}:00+02:00`;
const snapOf = (t: number, reps: Rep[]) => ({
  Siri: {
    ServiceDelivery: {
      StopMonitoringDelivery: [
        {
          MonitoredStopVisit: reps.map((r) => ({
            RecordedAtTime: new Date(t - (r.ago ?? 10) * 1000).toISOString(),
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
const MIN = 60e3,
  URLS = ['relay'], // never fetched: the snapshot taken below is fresh
  n = secondsOn(new Date(NOW), DAY);
/** A minute's reports taken as the current snapshot, as the worker's poll does. */
const see = (t: number, reps: Rep[]) => vehicles.take(snapOf(t, reps), t).vehicles;
/** The plan between two points, from now, on the live times of the snapshot taken. */
const planFrom = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  planOps.plan({
    from: { name: 'a', lat: a.lat, lon: a.lon },
    to: { name: 'b', lat: b.lat, lon: b.lon },
    fromTime: n - 600,
    toTime: n + 3600,
    urls: URLS,
  });
const bus = (lon: number, ago: number): Rep => ({
  line: '9768',
  start: start('09:10'),
  operator: '3',
  lat: 32.08,
  lon,
  ago,
});
const rideOf = (j: { legs: { type: string }[] }): RideLegOut => j.legs.find((l): l is RideLegOut => l.type === 'ride')!;

test('a bus short of the stop: the plan boards it now, the screens are given the same times, and its card stays', async () => {
  // 300 m short of the second stop, reported 100 s ago: by its place it is 7 minutes late and reached the stop at
  // 9:19:02, which has gone by; it has not been seen there, so it leaves now at the earliest (Nordau, 2026-11-08)
  see(NOW, [bus(stops[1].lon - 0.0032, 100)]);
  const r = await planFrom(stops[1], stops[3]),
    [first, next] = r.journeys,
    ride = rideOf(first);
  expect([ride.schedDepart, ride.depart, first.depart]).toEqual([T(9, 12), n, n]);
  expect(rideOf(next).depart).toBe(T(9, 32)); // the 9:30 ride: no vehicle, its timetable
  // one answer: what the plan was routed on is what the screens' own look gets, for the trips the plan rides
  const look = await vehicles.vehiclesOps.live({ urls: URLS, trips: [ride.trip] });
  expect(r.live!.trips[ride.trip]).toEqual(look.trips[ride.trip]);
  expect(look.trips[ride.trip]).toMatchObject({ sure: true, from: 0, passed: 1 }); // past the first stop, short of the second
  expect(look.trips[ride.trip].times[1]).toBe(n);
  // the page: the plan as it stands 20 s and 2 minutes on is still a card leaving now, not on the just-left strip
  live.trips.value = r.live!.trips;
  for (const later of [20, 120]) {
    const now = tripNow(first as Journey, live.at, n + later);
    expect([now.depart, results.standing(now, n + later)]).toEqual([n + later, 'ontime']);
  }
  live.trips.value = {};
});

test('a bus seen past the stop has gone, however fresh its report', async () => {
  see(NOW, [bus(stops[1].lon + 0.0027, 10)]); // half way from the second stop to the third
  const r = await planFrom(stops[1], stops[3]),
    ride = rideOf(r.journeys[0]);
  expect(ride.schedDepart).toBe(T(9, 12));
  expect(ride.depart).toBeLessThan(n); // the time it left the stop by, behind the clock
  live.trips.value = r.live!.trips;
  const now = tripNow(r.journeys[0] as Journey, live.at, n);
  expect([firstRide(now)!.live, results.standing(now, n)]).toEqual([{ sure: true, passed: true }, 'gone']);
  live.trips.value = {};
});

test('a position that does not change at all says nothing once the train was due to move; one standing with a live GPS is read', async () => {
  // The week's two trains, on the tiny line. Like train 970 (2026-11-10: on Rehovot's platform from 15:15 to past 17:01,
  // never ran): the 9:00 at its first stop, the very same fix every minute. Like train 233 (2026-11-09: one fix at
  // HaShalom for forty minutes while it ran on to Lod): the 9:10 at the second stop, the very same fix. And like train
  // 268 beside the 970, waiting for its time: the 9:18 at the first stop, a live GPS, a few metres apart each minute.
  const parked: Rep = { line: '9900', start: start('09:00'), lat: stations[0].lat, lon: stations[0].lon + 0.0001 };
  const dead: Rep = { line: '9900', start: start('09:10'), lat: stations[1].lat, lon: stations[1].lon };
  const jitter = (k: number): Rep => ({
    line: '9900',
    start: start('09:18'),
    lat: stations[0].lat,
    lon: stations[0].lon + 0.00001 * (k % 3),
  });
  for (let k = 10; k >= 0; k--) see(NOW - k * MIN, [parked, dead, jitter(k)]);
  const tripAt = (hm: string) => trips.tripFor('9900', secondsOn(new Date(start(hm)), DAY));
  const all = [tripAt('09:00'), tripAt('09:10'), tripAt('09:18')];
  // the screens' look: of the three trains only the one with a live GPS has live times, a minute and a half late
  let look = await vehicles.vehiclesOps.live({ urls: URLS, trips: all });
  expect(Object.keys(look.trips).map(Number)).toEqual([all[2]]);
  expect(look.trips[all[2]]).toMatchObject({ sure: true, from: 0, passed: 0 });
  // and so the plan from the first station: the 9:10 on its timetable (nothing known of it), the 9:18 leaving now at
  // the earliest, never the 9:00
  const rides = (await planFrom(stations[0], stations[3])).journeys.map(rideOf).filter((l) => l.line === '9');
  expect(rides.map((l) => [l.schedDepart, l.depart])).toEqual([
    [T(9, 10), T(9, 10)],
    [T(9, 18), n],
  ]);
  // the 9:10's unit wakes up further on: believed again at once
  vi.setSystemTime(NOW + MIN);
  see(NOW + MIN, [{ ...dead, lat: stations[2].lat, lon: stations[2].lon + 0.002 }]);
  look = await vehicles.vehiclesOps.live({ urls: URLS, trips: all });
  expect(look.trips[all[1]]).toMatchObject({ from: 2, passed: 3 });
  vi.setSystemTime(NOW);
});

test('a fresh open knows at once: the snapshots of 3 and 10 minutes before, read late, take the memory back', () => {
  const rep = (line: string, lon: number): Rep => ({ line, start: start('09:10'), lat: 32.08, lon, operator: '3' });
  const note = (t: number, reps: Rep[]) => {
    const j = snapOf(t, reps);
    vehicles.remember(j, t);
    return vehicles.snapVehicles(j, t);
  };
  const T0 = NOW + 60 * MIN; // away from the tests above
  vi.setSystemTime(T0);
  // now, then 3 and 10 minutes before: 'same' reports the very same position each time, 'here' stands with a live GPS
  // (a metre or two apart), 'came' was 900 m away ten minutes ago
  note(T0, [rep('same', 34.78), rep('here', 34.78001), rep('came', 34.78002)]);
  note(T0 - 3 * MIN, [rep('same', 34.78), rep('here', 34.78002), rep('came', 34.78003)]);
  note(T0 - 10 * MIN, [rep('same', 34.78), rep('here', 34.78003), rep('came', 34.79)]);
  const [same, here, came] = note(T0, [rep('same', 34.78), rep('here', 34.78001), rep('came', 34.78002)]);
  expect([same.sameSince, same.stillSince]).toEqual([T0 - 10 * MIN, T0 - 10 * MIN]);
  expect([here.sameSince, here.stillSince]).toEqual([T0, T0 - 10 * MIN]); // a live GPS, standing for ten minutes at least
  expect(came.stillSince).toBe(T0 - 3 * MIN); // elsewhere ten minutes ago: here since the snapshot of three
  // and when it moves on, it stands at the new place from then
  expect(note(T0 + MIN, [rep('here', 34.79)])[0].stillSince).toBe(T0 + MIN);
  vi.setSystemTime(NOW);
});
