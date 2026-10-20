// The trip-following state machine's manual steps: node tools/follow.test.mjs (exits 1 on a failure).
import assert from 'node:assert/strict';
import { initialState, advance, stepForward, stepBack, canStepBack } from '../src/follow.js';

const T = (h, m) => h * 3600 + m * 60;
const stop = (n, lat, arr) => ({ stop: n, name: `s${n}`, lat, lon: 34.8, arr });
const journey = { to: { lat: 32.2, lon: 34.8 }, legs: [
  { type: 'access', seconds: 600, depart: T(17, 8), arrive: T(17, 18), to: { stop: 1, lat: 32.0, lon: 34.8 } },
  { type: 'ride', seconds: 1800, depart: T(17, 24), arrive: T(17, 54), stopsAlong: [stop(1, 32.0, T(17, 24)), stop(2, 32.05, T(17, 40)), stop(3, 32.1, T(17, 54))] },
  { type: 'egress', seconds: 600, depart: T(17, 54), arrive: T(18, 4) },
] };
let s = initialState();
// the clock moves a rider without a position along: at 17:30 the walk is long done and the train has left
s = advance(journey, s, null, T(17, 30)).state;
assert.equal(s.step, 1); assert.equal(s.onBoard, true);
// back: off the train, waiting for it, and the clock does not put the rider back on it
s = stepBack(journey, s); assert.equal(s.step, 1); assert.equal(s.onBoard, false); assert.equal(s.hold, 1);
s = advance(journey, s, null, T(17, 31)).state; assert.equal(s.onBoard, false, 'held: the clock does not board');
// back again: to the walk, held there too
s = stepBack(journey, s); assert.equal(s.step, 0); assert.equal(s.onBoard, false);
s = advance(journey, s, null, T(17, 31)).state; assert.equal(s.step, 0, 'held on the walk');
assert.equal(canStepBack(s), false);
// next: to the stop, then on board; forward and back are inverses
const fwd = stepForward(journey, s); assert.equal(fwd.step, 1); assert.equal(fwd.onBoard, false);
const on = stepForward(journey, fwd); assert.equal(on.onBoard, true);
assert.deepEqual([stepBack(journey, on).step, stepBack(journey, on).onBoard], [1, false]);
// a position still moves a held step on: at the train's first stop past boarding
const moved = advance(journey, { ...fwd }, { lat: 32.05, lon: 34.8, acc: 10 }, T(17, 40)).state;
assert.equal(moved.onBoard, true, 'the position boards a held rider');
// past the end and back
let end = stepForward(journey, stepForward(journey, on)); assert.equal(end.done, true);
end = stepBack(journey, end); assert.equal(end.done, false); assert.equal(end.step, 2);
console.log('follow: manual steps ok');
