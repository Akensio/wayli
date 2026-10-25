// Train delays from learned section times (src/engine/delays.js, railAhead): node tools/railtimes.test.mjs (exits 1 on a failure).
import assert from 'node:assert/strict';
import { setRailTimes, estimateDelay, liveAt } from '../src/engine/delays.js';

const T = (h, m, s = 0) => h * 3600 + m * 60 + s;
const day = '20261021';
const at = (sec) => new Date(Date.UTC(2026, 9, 21, 0, 0, sec) - 3 * 3600e3);   // Israel summer time: UTC+3
// four stations due north, 5.5 km apart; the timetable gives 6 minutes a section and a minute's stand
const stops = [
  { code: 1, lat: 32.00, lon: 34.8, arr: T(10, 0), dep: T(10, 0) },
  { code: 2, lat: 32.05, lon: 34.8, arr: T(10, 6), dep: T(10, 7) },
  { code: 3, lat: 32.10, lon: 34.8, arr: T(10, 13), dep: T(10, 14) },
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
// at 3 by 10:14:30, away 10:15:30, at 4 by 10:21:30. A rider's time at a station is when the train pulls in.
assert.equal(e.delay, 150);
assert.equal(liveAt(e, stops, 1).time, T(10, 8, 30));
assert.equal(liveAt(e, stops, 2).time, T(10, 14, 30));
assert.equal(liveAt(e, stops, 3).time, T(10, 21, 30));
assert.equal(liveAt(e, stops, 0).passed, true);

// early at a station: it leaves at its time (the time shown there, standing), and the 5-minute section brings it to 3
// early, at 10:12, where it waits
e = estimateDelay(train(32.05, T(10, 6, 30)), stops, day);
assert.equal(e.delay, 0);
assert.equal(liveAt(e, stops, 1).time, T(10, 7));
assert.equal(liveAt(e, stops, 2).time, T(10, 12));
assert.equal(liveAt(e, stops, 1).passed, false, 'standing at the station: not passed yet');

// the profile: a slow start puts a train a third of the way along only 45% into the section's time
setRailTimes({ s: { '1>2': [300, 0, 0.2, 0.35, 0.45, 0.55, 0.62, 0.7, 0.78, 0.85, 0.93, 1], '2>3': [300, ...even] }, d: { 2: 60, 3: 60 } });
e = estimateDelay(train(32.05 * 0.3 + 32.0 * 0.7, T(10, 4)), stops, day);   // 30% along at 10:04: 45% of 300 s done
assert.equal(liveAt(e, stops, 1).time, T(10, 4) + Math.round(0.55 * 300));
// a learned catch-up per station (h) is ignored: it made every prediction early (2026-10-25)
setRailTimes({ s: { '1>2': [300, ...even], '2>3': [300, ...even] }, d: { 2: 60, 3: 60 }, h: 20 });
e = estimateDelay(train(32.025, T(10, 6)), stops, day);
assert.equal(liveAt(e, stops, 2).time, T(10, 14, 30));

// a train without GPS, put at the station its call names (2). It is not standing there now: it reached it when the call
// first named it (a kilometre out: 45 s later) and has not reached 3 yet (Herzliya at 09:08, 2026-10-25)
const nofix = (now, since, seenChange) => ({ lat: 32.05, lon: 34.8, recordedAt: at(now), callSince: at(since).getTime(), callSeenChange: seenChange });
setRailTimes({ s: { '1>2': [300, ...even], '2>3': [300, ...even] }, d: { 2: 60, 3: 60 } });
e = estimateDelay(nofix(T(10, 9), T(10, 5, 30), true), stops, day);
// at 2 by 10:06:15, away after its minute at 10:07:15, at 3 by 10:12:15 (it was read as leaving 2 now, at 10:09)
assert.equal(liveAt(e, stops, 2).time, T(10, 12, 15));
// the change of call not seen (the app just opened): it reached 2 no later than its time there
e = estimateDelay(nofix(T(10, 9), T(10, 8), false), stops, day);
assert.equal(liveAt(e, stops, 2).time, T(10, 12));
// still named after 2 at 10:13:30: not at 3 before 10:14:15, whatever its time
e = estimateDelay(nofix(T(10, 13, 30), T(10, 5, 30), true), stops, day);
assert.equal(liveAt(e, stops, 2).time, T(10, 14, 15));
console.log('railtimes: learned sections ok');
