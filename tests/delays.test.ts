// The bus delay model's steadiness rules (measure/busbacktest.ts, 2026-11-07): a bus waiting to start gets the same
// learned times as one under way; a ride is placed from where it was last placed, so a looping trip is not read
// backwards or at its far end; one bus's run and small swings do not move the road factor; a bus at a stop is there now.
// And no news past due (2026-11-10): once a vehicle was due to move, the very same position for two minutes is no
// estimate, standing within 100 m is not certain past five minutes and no estimate past twenty-five, whatever it is.
import { test, expect, vi } from 'vitest';
import {
  estimateDelay,
  GONE_STILL_S,
  liveAt,
  parseBusTimes,
  placeOn,
  setBusTimes,
  setRoadsNow,
  type TimedStop,
} from '../src/engine/delays.ts';

const DAY = '20261105'; // a Thursday; Israel is at UTC+2 in November
const at = (sec: number): Date => new Date(Date.parse('2026-11-05T00:00:00+02:00') + sec * 1000);

/** A learned-times file with one band and the weekday kind: each section "a>b" takes `runs[i]` seconds. */
function busTimes(sections: [number, number, number][]): void {
  const head = new TextEncoder().encode(JSON.stringify({ bands: 1, kinds: 3, n: sections.length }).padEnd(64)); // to a multiple of 4, as the file is
  const n = sections.length,
    buf = new ArrayBuffer(4 + head.length + 8 * n + 3 * n);
  new DataView(buf).setUint32(0, head.length, true);
  new Uint8Array(buf, 4, head.length).set(head);
  const a = new Uint32Array(buf, 4 + head.length, n),
    b = new Uint32Array(buf, 4 + head.length + 4 * n, n),
    cells = new Uint8Array(buf, 4 + head.length + 8 * n, 3 * n);
  sections.forEach(([from, to, run], i) => {
    a[i] = from;
    b[i] = to;
    cells[i * 3] = run / 2; // the file's unit: 2 s
  });
  setBusTimes(parseBusTimes(buf));
}
// four stops 500 m apart along a street, listed a minute apart, learned at two minutes a section
const T0 = 36000; // 10:00
const stops: TimedStop[] = [0, 1, 2, 3].map((i) => ({
  lat: 32.08,
  lon: 34.78 + i * 0.0053,
  arr: T0 + 60 * i,
  dep: T0 + 60 * i,
  code: 101 + i,
}));
const learned = () =>
  busTimes([
    [101, 102, 120],
    [102, 103, 120],
    [103, 104, 120],
  ]);

test('a bus waiting to start shows the learned times from its listed departure, the same it shows once under way', () => {
  learned();
  setRoadsNow(new Map());
  const early = estimateDelay(
    { lat: stops[0].lat, lon: stops[0].lon, recordedAt: at(T0 - 600), rideId: 'r' },
    stops,
    DAY,
  )!;
  expect(early.waiting).toBe(true);
  expect(early.delay).toBe(0);
  expect(liveAt(early, stops, 3)!.time).toBe(T0 + 360); // not the timetable's T0 + 180
  const started = estimateDelay({ lat: stops[0].lat, lon: stops[0].lon, recordedAt: at(T0), rideId: 'r' }, stops, DAY)!;
  expect(started.waiting).toBeFalsy();
  expect(liveAt(started, stops, 3)!.time).toBe(T0 + 360);
  // leaving late, every time moves by the lateness, from the time it has reached
  const late = estimateDelay(
    { lat: stops[0].lat, lon: stops[0].lon, recordedAt: at(T0 + 180), rideId: 'r' },
    stops,
    DAY,
  )!;
  expect(liveAt(late, stops, 3)!.time).toBe(T0 + 180 + 360);
  setBusTimes(null);
});

test('a looping trip is read from where the bus was last placed, unless nothing from there on is near', () => {
  const loop: TimedStop[] = [
    { lat: 32.0, lon: 34.8, arr: 0, dep: 0 },
    { lat: 32.0, lon: 34.81, arr: 60, dep: 60 },
    { lat: 32.01, lon: 34.81, arr: 120, dep: 120 },
    { lat: 32.01, lon: 34.8, arr: 180, dep: 180 },
    { lat: 32.0, lon: 34.8, arr: 240, dep: 240 }, // back at the first stop
  ];
  const nearStart = { lat: 32.00003, lon: 34.80005 }; // a few metres from the first stretch and from the last alike
  expect(placeOn(nearStart.lat, nearStart.lon, loop).index).toBe(0); // no memory: the first
  expect(placeOn(nearStart.lat, nearStart.lon, loop, 3).index).toBe(3); // seen on the last stretch: the last
  expect(placeOn(nearStart.lat, nearStart.lon, loop, 2).index).toBe(3); // seen two stretches back: forward, not around again
  expect(placeOn(32.0, 34.805, loop, 3).index).toBe(0); // by the second stop, nothing from the last stretch on is near: the memory was wrong
});

test('a bus once under way is not read as waiting to start again', () => {
  learned();
  // 20 minutes early on the third stretch: with no memory that is impossible, so it is read as still at its start
  const v = { lat: stops[2].lat, lon: stops[2].lon + 0.002, recordedAt: at(T0 - 1080), rideId: 'r' };
  expect(estimateDelay({ ...v, recordedAt: at(T0 + 30) }, stops, DAY)!.waiting).toBeFalsy(); // on time: under way
  const impossible: TimedStop[] = stops.map((s, i) => ({ ...s, arr: T0 + 600 * i, dep: T0 + 600 * i })); // 10 min a stretch
  expect(estimateDelay({ ...v, recordedAt: at(T0 + 60) }, impossible, DAY)!.waiting).toBe(true);
  expect(estimateDelay({ ...v, recordedAt: at(T0 + 60), lastIndex: 1 }, impossible, DAY)!.waiting).toBeFalsy();
  setBusTimes(null);
});

test('the road factor needs two buses and ignores swings within a tenth; at the stop itself the bus is there now', () => {
  learned();
  const v = { lat: stops[0].lat, lon: stops[0].lon, recordedAt: at(T0), rideId: 'me' };
  const t = at(T0).getTime();
  const timeAt1 = (runs: number[]): number => {
    setRoadsNow(new Map([['101>102', runs.map((ratio, i) => ({ ratio, t, ride: `other${i}` }))]])); // one bus each
    return liveAt(estimateDelay(v, stops, DAY)!, stops, 1)!.time;
  };
  expect(timeAt1([1.5])).toBe(T0 + 120); // one bus: no evidence
  setRoadsNow(new Map([['101>102', [1.6, 1.6, 1.6].map((ratio) => ({ ratio, t, ride: 'same' }))]]));
  expect(liveAt(estimateDelay(v, stops, DAY)!, stops, 1)!.time).toBe(T0 + 120); // one bus seen thrice: still one
  expect(timeAt1([1.05, 1.05])).toBe(T0 + 120); // within the band: as usual
  expect(timeAt1([1.6, 1.6])).toBe(T0 + 144); // 0.6 shrunk to 0.3 by two buses of four, the band of 0.1 taken out: 1.2
  setRoadsNow(new Map());
  // just past the second stop (a tenth of the stretch): its time there is now, not the listed time plus its lateness
  const here = estimateDelay(
    { lat: stops[1].lat, lon: stops[1].lon + 0.00053, recordedAt: at(T0 + 300), rideId: 'me' },
    stops,
    DAY,
  )!;
  expect(here.index).toBe(1);
  expect(liveAt(here, stops, 1)!.passed).toBe(false);
  expect(liveAt(here, stops, 1)!.time).toBe(T0 + 300);
  setBusTimes(null);
});

test('stillness past due: not certain past five minutes, no estimate past twenty-five, whatever the vehicle and wherever', () => {
  setBusTimes(null);
  // half way between the second and third stops, where the timetable has it at T0 + 90
  const mid = { lat: stops[1].lat, lon: (stops[1].lon + stops[2].lon) / 2, rideId: 'r' };
  const first = { lat: stops[0].lat, lon: stops[0].lon, rideId: 'w' };
  const est = (stillFor: number | null, sec: number, v = mid) => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(at(sec).getTime() + 20e3);
    const e = estimateDelay(
      { ...v, recordedAt: at(sec), stillSince: stillFor == null ? null : at(sec - stillFor).getTime() },
      stops,
      DAY,
    );
    now.mockRestore();
    return e;
  };
  const seen = T0 + 90 + 600; // ten minutes late
  // no memory of it, it only just got here, or it has stood two minutes (a light, a stop): late by its place, certain
  for (const still of [null, 0, 120]) expect([est(still, seen)!.delay, est(still, seen)!.stale]).toEqual([600, false]);
  // eight minutes: the same times, not certain
  expect([est(480, seen)!.delay, est(480, seen)!.stale]).toEqual([600, true]);
  // past twenty-five: more likely than not it is not running
  expect(est(GONE_STILL_S + 60, T0 + 90 + GONE_STILL_S + 60)).toBeNull();
  // before it is due nothing counts: twenty minutes at its first stop, its time still to come
  expect([est(1200, T0 - 300, first)!.waiting, est(1200, T0 - 300, first)!.stale]).toEqual([true, false]);
  // the very same position for two minutes past due is a unit repeating itself: no estimate; before it is due, or for
  // a minute, it is a vehicle waiting
  const same = (sec: number, sameFor: number, v = mid) => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(at(sec).getTime() + 20e3);
    const e = estimateDelay({ ...v, recordedAt: at(sec), sameSince: at(sec - sameFor).getTime() }, stops, DAY);
    now.mockRestore();
    return e;
  };
  expect(same(seen, 60)).not.toBeNull();
  expect(same(seen, 120)).toBeNull();
  expect(same(T0 - 300, 1200, first)!.waiting).toBe(true); // parked at its first stop, its time still to come
  expect(same(T0 + 60, 1200, first)).not.toBeNull(); // a minute past its time
  expect(same(T0 + 120, 1200, first)).toBeNull(); // two: not a bus about to leave
  // at its first stop past its time, there all along: the same rule, counted from its time
  expect(est(3600, T0 + 600, first)!.stale).toBe(true);
  expect(est(3600, T0 + GONE_STILL_S + 60, first)).toBeNull();
});
