// What "Best" means (src/engine/best.ts), by the choices a rider meets: a short trip, a long one, a long walk, a tight
// connection, two rides alike but for when they leave. One formula for all of them; each case says which way should come
// first and the numbers show it does. The weights themselves are in best.ts with their sources.
import { test, expect } from 'vitest';
import { best, effort, missChance, type Parts } from '../src/engine/best.ts';

const MIN = 60;
/** A way in minutes: riding, walking, its changes as [time to spare, until the next one of that line], and how long
 *  from now until it has to be left for. Returns its score in minutes of riding. */
const way = (ride: number, walk: number, changes: [number, number][] = [], leaveIn = 0, over = 0): number => {
  const p: Parts = {
    ride: ride * MIN,
    walk: walk * MIN,
    over: over * MIN,
    changes: changes.map(([spare, gap]) => ({ spare: spare * MIN, gap: gap * MIN })),
  };
  return best(effort(p), leaveIn * MIN) / MIN;
};

test('a short trip: the direct bus beats a change that arrives a little sooner, and loses to one that saves real time', () => {
  // across town: two buses leaving now (6 and 7 minutes, four to spare onto a line every ten minutes)
  const twoBuses = way(13, 7, [[4, 10]]);
  // against the direct bus in 6 minutes: 18 minutes aboard, there 7 minutes later
  expect(way(18, 7, [], 6)).toBeLessThan(twoBuses);
  // against a direct bus that crawls for 30 minutes, there 19 minutes later: now the change is worth it
  expect(way(30, 7, [], 6)).toBeGreaterThan(twoBuses);
});

test('walking: a long walk to a slightly faster bus loses to the bus by the door', () => {
  const farStop = way(12, 16), // 14 minutes to the stop and 2 from it: there in 28
    nearStop = way(22, 4, [], 4); // leaves in 4, ten minutes more aboard: there in 30
  expect(nearStop).toBeLessThan(farStop);
  // and a walk past the rider's longest walk counts more still: the same way, five of its minutes over the limit
  expect(way(12, 16, [], 0, 5)).toBeCloseTo(farStop + 5);
});

test('a long trip: a tight change onto an hourly train sinks, a comfortable one that saves time wins', () => {
  // Haifa to Be'er Sheva: the direct train in 20 minutes, 2 h 15 aboard
  const direct = way(135, 20, [], 20);
  // two trains, two minutes to change onto one that runs hourly, there 10 minutes sooner
  expect(way(118, 20, [[2, 60]], 25)).toBeGreaterThan(direct);
  // two trains with twelve minutes to change, leaving now, there 30 minutes sooner
  expect(way(113, 20, [[12, 60]], 0)).toBeLessThan(direct);
});

test('the same tight change costs little onto a line every six minutes and a lot onto an hourly one', () => {
  const frequent = way(40, 6, [[2, 6]]),
    hourly = way(40, 6, [[2, 60]]);
  expect(hourly - frequent).toBeCloseTo(missChance(2 * MIN) * 54); // the chance of missing it, times the longer wait
  expect(hourly - frequent).toBeGreaterThan(13);
  expect(missChance(0)).toBe(0.5);
  expect(missChance(10 * MIN)).toBeLessThan(0.02);
});

test('ways that cost the same on the way: the one that gets there first is first, whenever it leaves', () => {
  // the slow bus now (38 minutes) is there two minutes before the express that leaves in 25 (15 minutes)
  expect(way(38, 5)).toBeLessThan(way(15, 5, [], 25));
  // a train in 12 minutes that takes 2 h 38, against one in 44 minutes that takes 2 h 19: the first is there sooner
  expect(way(158, 0, [], 12)).toBeLessThan(way(139, 0, [], 44));
});
