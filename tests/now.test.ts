// A plan as it stands now (src/trip/now.ts) and the one store of live times every screen reads (src/state/live.ts).
// The cases are the ones that went wrong on the road, each as the rider met it: a bus short of the stop filed as gone
// (Nordau, 2026-11-08), a train that never ran shown as leaving now for an hour and a half (the 970, 2026-11-10), a
// late train missing from its stop's list (HaShalom, 2026-11-08), a stop saying "now" for ever, and the same ride
// showing different times on different screens.
import { test, expect, beforeEach } from 'vitest';
import * as live from '../src/state/live';
import * as results from '../src/state/results';
import { visibleDeps } from '../src/state/stop';
import { timeAt, tripNow } from '../src/trip/now';
import type { Journey, RideLeg } from '../src/trip/journey';
import type { Departure, TripLive } from '../src/worker/ops.ts';

const T = (h: number, m: number, s = 0): number => h * 3600 + m * 60 + s;
/** A trip's live times: from stop `from` on, each `late` seconds after the listed ones given; `passed` stops behind it. */
const liveTrip = (from: number, times: number[], passed = from, sure = true): TripLive => ({
  seen: 0,
  sure,
  from,
  times,
  passed,
});
const ride = (trip: number, boardPos: number, alightPos: number, dep: number, arr: number, line = '8'): RideLeg => ({
  type: 'ride',
  seconds: arr - dep,
  depart: dep,
  arrive: arr,
  schedDepart: dep,
  schedArrive: arr,
  line,
  agency: 'Dan',
  route: 1,
  routeType: 3,
  routeId: 1,
  trip,
  pattern: 1,
  boardPos,
  alightPos,
  stops: alightPos - boardPos,
  from: { name: 'A' },
  to: { name: 'B' },
});
const walk = (type: 'access' | 'transfer' | 'egress', seconds: number, depart: number) =>
  ({ type, seconds, depart, arrive: depart + seconds }) as const;
// a five-minute walk, trip 1 from its third stop (10:00) to its sixth (10:20), two minutes on foot, trip 2 from its
// first stop (10:25) to its fourth (10:40), four minutes to the door
const plan: Journey = {
  depart: T(9, 55),
  arrive: T(10, 44),
  transfers: 1,
  legs: [
    walk('access', 300, T(9, 55)),
    ride(1, 2, 5, T(10, 0), T(10, 20)),
    walk('transfer', 120, T(10, 20)),
    ride(2, 0, 3, T(10, 25), T(10, 40), '14'),
    walk('egress', 240, T(10, 40)),
  ],
};
/** Trip 1's listed times at its stops 2..5, for a vehicle on the stretch before stop 2. */
const trip1 = [T(10, 0), T(10, 7), T(10, 14), T(10, 20)];
const times = (j: Journey): number[] => j.legs.flatMap((l) => [l.depart, l.arrive]);
beforeEach(() => {
  live.trips.value = {};
});

test('nothing known live: the plan stands on its listed times, and standing by it again changes nothing', () => {
  const now = tripNow(plan, live.at, T(9, 50));
  expect(times(now)).toEqual(times(plan));
  expect([now.depart, now.arrive, now.missed]).toEqual([T(9, 55), T(10, 44), false]);
  expect(times(tripNow(now, live.at, T(9, 50)))).toEqual(times(now));
  expect((now.legs[1] as RideLeg).live).toBeNull();
});

test('a late ride moves the trip with it: when to set out, the change, the arrival; too late and the change is missed', () => {
  // three minutes late all along: set out three minutes later, the change is made with nothing to spare
  live.trips.value = { 1: liveTrip(1, [T(9, 58), ...trip1.map((t) => t + 180)]) };
  let now = tripNow(plan, live.at, T(9, 50));
  expect([now.depart, now.legs[1].depart, now.legs[1].arrive]).toEqual([T(9, 58), T(10, 3), T(10, 23)]);
  expect([now.legs[2].arrive, now.legs[3].depart, now.missed]).toEqual([T(10, 25), T(10, 25), false]);
  expect((now.legs[1] as RideLeg).live).toEqual({ sure: true, passed: false });
  expect(now.arrive).toBe(T(10, 44)); // the second ride is on its timetable: so is the arrival
  // five minutes late: the second ride leaves before the rider is at its stop
  live.trips.value = { 1: liveTrip(1, [T(9, 58), ...trip1.map((t) => t + 300)]) };
  now = tripNow(plan, live.at, T(9, 50));
  expect(now.missed).toBe(true);
  expect(results.standing(now, T(9, 50))).toBe('gone');
  // unless the second ride is late too
  live.trips.value = { ...live.trips.value, 2: liveTrip(0, [T(10, 29), T(10, 34), T(10, 39), T(10, 44)]) };
  now = tripNow(plan, live.at, T(9, 50));
  expect([now.missed, now.arrive]).toEqual([false, T(10, 48)]);
});

test('standing at the stop, the bus a few hundred metres short of it: it leaves now, not "just left" (Nordau)', () => {
  // the 8 was listed at the station at 9:14; its bus, late, is on the stretch before it and by its last report should
  // have reached it at 9:19:23. It is 9:19:30 and the rider stands at the stop
  const j: Journey = { depart: T(9, 14), arrive: T(9, 24), transfers: 0, legs: [ride(7, 21, 26, T(9, 14), T(9, 24))] };
  const bus = liveTrip(20, [T(9, 18, 42), T(9, 19, 23), T(9, 20, 35), T(9, 22), T(9, 24), T(9, 25), T(9, 28)]);
  live.trips.value = { 7: bus };
  for (const n of [T(9, 19, 30), T(9, 20, 10), T(9, 21)]) {
    // until the bus is seen past the stop, however far the clock moves on from its estimate
    const now = tripNow(j, live.at, n);
    expect(now.legs[0].depart).toBe(Math.max(n, T(9, 19, 23)));
    expect(results.standing(now, n)).toBe('ontime');
  }
  // seen past the stop: gone
  live.trips.value = { 7: { ...bus, from: 21, times: bus.times.slice(1), passed: 22 } };
  expect(results.standing(tripNow(j, live.at, T(9, 21)), T(9, 21))).toBe('gone');
  // and with a five-minute walk to the stop, a bus due there now is out of reach
  const far: Journey = { ...j, depart: T(9, 9), legs: [walk('access', 300, T(9, 9)), ...j.legs] };
  live.trips.value = { 7: bus };
  expect(results.standing(tripNow(far, live.at, T(9, 19, 30)), T(9, 19, 30))).toBe('gone');
});

test('a train nothing believable is known of is its timetable: listed 15:34, at 16:50 it is gone, never "leaves now" (the 970)', () => {
  // the worker gives no live times for a report that shows no movement (delays.ts noNews), so the store has none
  const j: Journey = {
    depart: T(15, 34),
    arrive: T(15, 57),
    transfers: 0,
    legs: [ride(970, 0, 4, T(15, 34), T(15, 57))],
  };
  const now = tripNow(j, live.at, T(16, 50));
  expect([now.legs[0].depart, (now.legs[0] as RideLeg).live]).toEqual([T(15, 34), null]);
  expect(results.standing(now, T(16, 50))).toBe('gone');
  // the same when a look for live times fails: what was shown as live is not kept
  live.trips.value = { 970: liveTrip(0, [T(16, 50), T(16, 56), T(17, 2), T(17, 8), T(17, 13)]) };
  expect(results.standing(tripNow(j, live.at, T(16, 50)), T(16, 50))).toBe('ontime');
  live.trips.value = {};
  expect(results.standing(tripNow(j, live.at, T(16, 51)), T(16, 51))).toBe('gone');
});

test('a stop\'s list: a late train listed earlier is in it, one that left is not, and nothing says "now" for ever', () => {
  const dep = (trip: number, time: number, pos = 3): Departure =>
    ({
      trip,
      time,
      pos,
      line: '',
      headsign: '',
      routeType: 2,
      agency: '',
      routeId: 1,
      estimated: false,
      firstDep: 0,
    }) as Departure;
  const n = T(9, 5);
  const deps = [dep(1, T(8, 50)), dep(2, T(8, 55)), dep(3, T(9, 0)), dep(4, T(9, 6)), dep(5, T(9, 10))];
  // no live times: the three listed before now have gone by; the list is what is still to come
  expect(visibleDeps(deps, live.at, n).map((d) => d.trip)).toEqual([4, 5]);
  // the 8:50 left (its train is past the stop); the 8:55 is 13 minutes late and comes at 9:08, between the two; the
  // 9:00 has no train reporting and is not shown as coming
  live.trips.value = { 1: liveTrip(4, [T(9, 4)], 4), 2: liveTrip(2, [T(9, 3), T(9, 8)]) };
  const list = visibleDeps(deps, live.at, n);
  expect(list.map((d) => [d.trip, d.at])).toEqual([
    [4, T(9, 6)],
    [2, T(9, 8)],
    [5, T(9, 10)],
  ]);
  expect(list[1].live).toEqual({ sure: true, passed: false });
  // a list for another time than now is the timetable's, whole
  expect(visibleDeps(deps, live.at, null).map((d) => d.trip)).toEqual([1, 2, 3, 4, 5]);
});

test('one ride, one time: the card, its chip, the stop page and the list of rides all say the same', () => {
  // trip 7 at its stop 21, listed 9:14, live 9:21 and not certain
  const n = T(9, 19, 30);
  live.trips.value = {
    7: liveTrip(20, [T(9, 20), T(9, 21), T(9, 23), T(9, 25), T(9, 27), T(9, 29), T(9, 31)], 20, false),
  };
  const j: Journey = { depart: T(9, 14), arrive: T(9, 24), transfers: 0, legs: [ride(7, 21, 26, T(9, 14), T(9, 24))] };
  const card = tripNow(j, live.at, n),
    chip = results.departures(card, [card], live.at, n)[0],
    row = timeAt(live.at, 7, 21, T(9, 14), n),
    stop = visibleDeps([{ trip: 7, time: T(9, 14), pos: 21 } as Departure], live.at, n)[0];
  expect([card.depart, chip.depart, row.time, stop.at]).toEqual([T(9, 21), T(9, 21), T(9, 21), T(9, 21)]);
  expect([card.legs[0], chip, stop].map((x) => (x as { live: unknown }).live)).toEqual(
    new Array(3).fill({ sure: false, passed: false }),
  );
  // along the ride, each stop keeps its listed time beside the one that stands now, the passed ones marked
  const along = { stop: 0, name: '', lat: 0, lon: 0 };
  const withStops: Journey = {
    ...j,
    legs: [
      {
        ...(j.legs[0] as RideLeg),
        boardPos: 19,
        stopsAlong: [T(9, 10), T(9, 12), T(9, 14)].map((arr) => ({ ...along, arr })),
      },
    ],
  };
  expect(
    (tripNow(withStops, live.at, n).legs[0] as RideLeg).stopsAlong!.map((s) => [s.sched, s.arr, s.passed]),
  ).toEqual([
    [T(9, 10), T(9, 10), true], // behind the bus: its listed time, passed
    [T(9, 12), T(9, 20), false],
    [T(9, 14), T(9, 21), false],
  ]);
});
