// Train delays from learned section times (src/engine/delays.ts, railAhead).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { setRailTimes, estimateDelay, liveAt, sureLate } from '../src/engine/delays.ts';

test('railtimes: train delays from learned section times', () => {
  const T = (h, m, s = 0) => h * 3600 + m * 60 + s;
  const day = '20261021';
  const at = (sec) => new Date(Date.UTC(2026, 9, 21, 0, 0, sec) - 3 * 3600e3); // Israel summer time: UTC+3
  // four stations due north, 5.5 km apart; the timetable gives 6 minutes a section and a minute's stand
  const stops = [
    { code: 1, lat: 32.0, lon: 34.8, arr: T(10, 0), dep: T(10, 0) },
    { code: 2, lat: 32.05, lon: 34.8, arr: T(10, 6), dep: T(10, 7) },
    { code: 3, lat: 32.1, lon: 34.8, arr: T(10, 13), dep: T(10, 14) },
    { code: 4, lat: 32.15, lon: 34.8, arr: T(10, 20), dep: T(10, 20) },
  ];
  const even = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const train = (lat, sec) => ({ lat, lon: 34.8, recordedAt: at(sec) });

  // no learned times: the timetable's pace, as before (halfway at 10:06 is 3 minutes late)
  setRailTimes(null);
  assert.equal(estimateDelay(train(32.025, T(10, 6)), stops, day).delay, 180);

  // learned: 1-2 and 2-3 take 5 minutes, not 6; 3-4 was never seen (the timetable's 6); trains stand a minute
  setRailTimes({ s: { '1>2': [300, ...even], '2>3': [300, ...even] }, d: { 2: 60, 3: 60 } });
  let e = estimateDelay(train(32.025, T(10, 6)), stops, day);
  // halfway at 10:06: at 2 by 10:08:30 (2.5 min late: lateness is when it comes), away after its minute at 10:09:30,
  // at 3 by 10:14:30, away 10:15:30, at 4 by 10:21:30
  assert.equal(e.late, 150);
  assert.deepEqual([e.arr[1], e.arr[2], e.arr[3]], [T(10, 8, 30), T(10, 14, 30), T(10, 21, 30)]);
  // what the rider is shown: the station's time, late only by what we are sure of (2.5 min predicted 2.5 min ahead:
  // at least 2 minutes; 1.5 min later on: not sure enough, the timetable's)
  assert.equal(e.delay, 120);
  assert.equal(liveAt(e, stops, 1).time, T(10, 8));
  assert.equal(liveAt(e, stops, 2).time, T(10, 13));
  assert.equal(liveAt(e, stops, 3).time, T(10, 20));
  assert.equal(liveAt(e, stops, 0).passed, true);
  assert.equal(sureLate(600, 900), 480); // 10 min late 15 min ahead: at least 8 minutes
  assert.equal(sureLate(600, 2400), 0); // 40 minutes ahead: the timetable's (late trains make time up)
  assert.equal(sureLate(130, 60), 0); // under 2 minutes once unsure: on time
  assert.equal(sureLate(-200, 300), 0); // early: never shown (a train does not leave before its time)

  // at a station on time: it leaves after its minute, at its time, and the 5-minute section brings it to 3 early, at
  // 10:12, where it waits; the rider is shown the timetable's times
  e = estimateDelay(train(32.05, T(10, 6, 30)), stops, day);
  assert.equal(e.delay, 0);
  assert.equal(e.dep[1], T(10, 7));
  assert.equal(e.arr[2], T(10, 12));
  assert.equal(liveAt(e, stops, 1).time, T(10, 6));
  assert.equal(liveAt(e, stops, 2).time, T(10, 13));
  assert.equal(liveAt(e, stops, 1).passed, false, 'standing at the station: not passed yet');
  // standing at 2 at 10:08:30, where trains stand 4 minutes: taken as in at its time (10:06), it leaves at 10:10, not at
  // its time, nor a minute later each minute it stands (2026-10-26, train 959 at Tel Aviv Center)
  setRailTimes({ s: { '1>2': [300, ...even], '2>3': [300, ...even] }, d: { 2: 240, 3: 60 } });
  e = estimateDelay(train(32.05, T(10, 8, 30)), stops, day);
  assert.equal(e.dep[1], T(10, 10));
  setRailTimes({ s: { '1>2': [300, ...even], '2>3': [300, ...even] }, d: { 2: 60, 3: 60 } });

  // the profile: a slow start puts a train a third of the way along only 45% into the section's time
  setRailTimes({
    s: { '1>2': [300, 0, 0.2, 0.35, 0.45, 0.55, 0.62, 0.7, 0.78, 0.85, 0.93, 1], '2>3': [300, ...even] },
    d: { 2: 60, 3: 60 },
  });
  e = estimateDelay(train(32.05 * 0.3 + 32.0 * 0.7, T(10, 4)), stops, day); // 30% along at 10:04: 45% of 300 s done
  assert.equal(Math.round(e.arr[1]), T(10, 4) + Math.round(0.55 * 300));
  // a learned catch-up per station (h) is ignored: it made every prediction early (2026-10-25)
  setRailTimes({ s: { '1>2': [300, ...even], '2>3': [300, ...even] }, d: { 2: 60, 3: 60 }, h: 20 });
  e = estimateDelay(train(32.025, T(10, 6)), stops, day);
  assert.equal(e.arr[2], T(10, 14, 30));

  // a train an hour late: every station ahead stays late, beyond the 30 minutes too (each station alone, those beyond read
  // on time, and a plan boarded the train late and left it "on time" before it had boarded; 2026-10-26)
  const far = [0, 1, 2, 3, 4, 5].map((k) => ({
    code: 10 + k,
    lat: 32.0 + 0.05 * k,
    lon: 34.8,
    arr: T(10, 6 * k),
    dep: T(10, 6 * k),
  }));
  const secs = Object.fromEntries([0, 1, 2, 3, 4].map((k) => [`${10 + k}>${11 + k}`, [300, ...even]]));
  setRailTimes({ s: secs, d: Object.fromEntries([1, 2, 3, 4].map((k) => [10 + k, 60])) });
  e = estimateDelay(train(32.025, T(11, 2, 30)), far, day); // halfway 0-1 an hour late
  const shownAt = [1, 2, 3, 4, 5].map((i) => liveAt(e, far, i).time);
  for (let i = 1; i < shownAt.length; i++)
    assert.ok(shownAt[i] > shownAt[i - 1], 'times along the trip never go backwards');
  assert.ok(liveAt(e, far, 5).delay >= 3000, 'still most of an hour late beyond half an hour ahead');
});

test('a train is under the same stillness rule as a bus: standing past due, at its first station or a later one', () => {
  const T = (h, m, s = 0) => h * 3600 + m * 60 + s;
  const day = '20261021';
  const ms = (sec) => Date.UTC(2026, 9, 21, 0, 0, sec) - 3 * 3600e3;
  const stops = [
    { code: 1, lat: 32.0, lon: 34.8, arr: T(10, 0), dep: T(10, 0) },
    { code: 2, lat: 32.05, lon: 34.8, arr: T(10, 6), dep: T(10, 7) },
    { code: 3, lat: 32.1, lon: 34.8, arr: T(10, 13), dep: T(10, 14) },
  ];
  const even = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  setRailTimes({ s: { '1>2': [300, ...even], '2>3': [300, ...even] }, d: { 2: 60 } });
  const at = (lat, sec, since) =>
    estimateDelay({ lat, lon: 34.8, recordedAt: new Date(ms(sec)), stillSince: ms(since) }, stops, day);
  // at its first station since 9:30, twenty minutes past its time: late, leaving now at the earliest
  assert.equal(at(32.0, T(10, 20), T(9, 30)).dep[0], T(10, 20));
  // twenty-six minutes past: more likely than not it is not running
  assert.equal(at(32.0, T(10, 26), T(9, 30)), null);
  // the same at a later station: due away at 10:07, still there at 10:33
  assert.notEqual(at(32.05, T(10, 20), T(10, 6)), null);
  assert.equal(at(32.05, T(10, 33), T(10, 6)), null);
  // just pulled in, half an hour late: nothing against it
  assert.notEqual(at(32.05, T(10, 36), T(10, 36)), null);
  setRailTimes(null);
});
