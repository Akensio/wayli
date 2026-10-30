// The trip-following state machine's manual steps: node tools/follow.test.mjs (exits 1 on a failure).
import assert from 'node:assert/strict';
import { initialState, advance, stepForward, stepBack, canStepBack, connections } from '../src/engine/follow.js';

const T = (h, m) => h * 3600 + m * 60;
const stop = (n, lat, arr) => ({ stop: n, name: `s${n}`, lat, lon: 34.8, arr });
const journey = {
  to: { lat: 32.2, lon: 34.8 },
  legs: [
    { type: 'access', seconds: 600, depart: T(17, 8), arrive: T(17, 18), to: { stop: 1, lat: 32.0, lon: 34.8 } },
    {
      type: 'ride',
      seconds: 1800,
      depart: T(17, 24),
      arrive: T(17, 54),
      stopsAlong: [stop(1, 32.0, T(17, 24)), stop(2, 32.05, T(17, 40)), stop(3, 32.1, T(17, 54))],
    },
    { type: 'egress', seconds: 600, depart: T(17, 54), arrive: T(18, 4) },
  ],
};
let s = initialState();
// the clock moves a rider without a position along: at 17:30 the walk is long done and the train has left
s = advance(journey, s, null, T(17, 30)).state;
assert.equal(s.step, 1);
assert.equal(s.onBoard, true);
// back: off the train, waiting for it, and the clock does not put the rider back on it
s = stepBack(journey, s);
assert.equal(s.step, 1);
assert.equal(s.onBoard, false);
assert.equal(s.hold, 1);
s = advance(journey, s, null, T(17, 31)).state;
assert.equal(s.onBoard, false, 'held: the clock does not board');
// back again: to the walk, held there too
s = stepBack(journey, s);
assert.equal(s.step, 0);
assert.equal(s.onBoard, false);
s = advance(journey, s, null, T(17, 31)).state;
assert.equal(s.step, 0, 'held on the walk');
assert.equal(canStepBack(s), false);
// next: to the stop, then on board; forward and back are inverses
const fwd = stepForward(journey, s);
assert.equal(fwd.step, 1);
assert.equal(fwd.onBoard, false);
const on = stepForward(journey, fwd);
assert.equal(on.onBoard, true);
assert.deepEqual([stepBack(journey, on).step, stepBack(journey, on).onBoard], [1, false]);
// a position still moves a held step on: at the train's first stop past boarding
const moved = advance(journey, { ...fwd }, { lat: 32.05, lon: 34.8, acc: 10 }, T(17, 40)).state;
assert.equal(moved.onBoard, true, 'the position boards a held rider');
// past the end and back
let end = stepForward(journey, stepForward(journey, on));
assert.equal(end.done, true);
end = stepBack(journey, end);
assert.equal(end.done, false);
assert.equal(end.step, 2);
// "get off at the next stop" only once the stop before it is passed (2026-10-22: it came a stop early, the nearest
// stop being the one ahead). Five stops 300 m apart due north, get off at the last.
{
  const D = 0.0027; // about 300 m of latitude
  const sp = (n) => ({ stop: n, name: `b${n}`, lat: 32.0 + n * D, lon: 34.8, arr: T(21, 50 + n * 2) });
  const ride = {
    type: 'ride',
    seconds: 480,
    depart: T(21, 50),
    arrive: T(21, 58),
    stopsAlong: [0, 1, 2, 3, 4].map(sp),
  };
  const j = {
    to: { lat: 32.02, lon: 34.8 },
    legs: [ride, { type: 'egress', seconds: 120, depart: T(21, 58), arrive: T(22, 0) }],
  };
  const at = (n) => ({ lat: 32.0 + n * D, lon: 34.8, acc: 15 });
  let r = advance(j, initialState(), at(0.7), T(21, 51)); // 200 m along from the first stop: on board
  assert.equal(r.state.onBoard, true, 'boarded 200 m along');
  r = advance(j, r.state, at(2.7), T(21, 55)); // between stops 2 and 3, nearer 3: stop 3 still to come
  assert.equal(r.state.rideIdx, 2);
  assert.ok(!r.events.includes('getOffNext'), 'not yet: a stop before the last is still ahead');
  r = advance(j, r.state, at(3.15), T(21, 56)); // past stop 3: the next is the last
  assert.ok(r.events.includes('getOffNext'), 'now: the next stop is the one');
}

// the changes ahead: planned, then with the ride before late, then with the next ride late too
{
  const legs = [
    { type: 'ride', depart: T(17, 24), arrive: T(17, 54), seconds: 1800 },
    { type: 'walk', seconds: 300, depart: T(17, 54), arrive: T(17, 59) },
    { type: 'ride', depart: T(18, 2), arrive: T(18, 30), seconds: 1680 },
    { type: 'ride', depart: T(18, 35), arrive: T(18, 50), seconds: 900 },
  ];
  let c = connections(legs, 0);
  assert.equal(c[0], undefined, 'the first remaining ride has no change before it');
  assert.equal(c[2].sec, 180, 'planned: 3 minutes after the walk');
  assert.equal(c[3].sec, 300);
  c = connections(legs, 0, { 0: { arrive: T(17, 58) } });
  assert.equal(c[2].sec, -60, 'the ride before 4 min late: the change is missed');
  assert.equal(c[2].arr, T(18, 3));
  c = connections(legs, 0, { 0: { arrive: T(17, 58) }, 2: { depart: T(18, 6) } });
  assert.equal(c[2].sec, 180, 'the next ride 4 min late too: made again');
  assert.equal(c[3].sec, 300, 'a ride with no vehicle keeps its planned times');
  assert.deepEqual(
    connections(legs, 2),
    { 3: { sec: 300, arr: T(18, 30), dep: T(18, 35) } },
    'from the second ride on',
  );
}

console.log('follow: manual steps ok');
