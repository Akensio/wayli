// The result list (src/state/results.ts): the cards are in the order of the option each one shows, while each card's
// number (idx) follows its group's first option, which a plan from now (it looks ten minutes back) may already have
// filed under "just left". And the trips of a search stay while their times follow: neither the clock nor a newer look
// moves a card or swaps its trip; asking again does.
import { test, expect, vi } from 'vitest';
import * as clock from '../src/engine/clock.ts';
import * as results from '../src/state/results';
import * as live from '../src/state/live';
import type { Journey, RideLeg } from '../src/trip/journey';
import { hm } from '../src/common/time';

const day = clock.serviceDay().day,
  n = clock.nowOn(day);
const ride = (depart: number, arrive: number, line: string): RideLeg => ({
  type: 'ride',
  seconds: arrive - depart,
  depart,
  arrive,
  line,
  agency: 'Dan',
  route: 1,
  routeType: 3,
  routeId: 1,
  trip: depart,
  pattern: 1,
  boardPos: 0,
  alightPos: 1,
  stops: 1,
  from: { name: 'a' },
  to: { name: 'b' },
});
const way = (depart: number, arrive: number, line: string): Journey => ({
  depart,
  arrive,
  transfers: 0,
  walkSeconds: 0,
  legs: [ride(depart, arrive, line)],
});
// group A (line 60): one option gone six minutes ago, arriving before everything; the next in nine minutes, arriving later
// group B (line 63): its first option in three minutes, arriving three minutes before A's shown one
const journeys = [way(n - 360, n + 360, '60'), way(n + 540, n + 1260, '60'), way(n + 180, n + 1080, '63')];
const groups = [
  { options: [0, 1], lines: [['60']] },
  { options: [2], lines: [['63']] },
];
const sortedLines = () => results.list.value.cards.map((c) => (c.j.legs[0] as RideLeg).line);

test('by arrival, departure and speed: the order of what the cards show', () => {
  results.query.value = {
    from: { name: 'x' },
    to: { name: 'y' },
    day,
    at: '',
    bike: 'none',
    folding: false,
    arriveBy: false,
    isNow: true,
    maxWalk: 15,
  };
  results.result.value = { journeys, groups };
  results.asked.value = Date.now();
  results.filters.value = { fDirect: false, fTrain: false, resultSort: 'arrive' };
  const { cards, gone } = results.list.value;
  expect(cards).toHaveLength(2);
  expect(sortedLines()).toEqual(['63', '60']); // the 63 arrives first
  expect(cards.map((c) => c.idx)).toEqual([1, 0]); // the numbers on the map follow the groups, not the order
  expect(gone).toHaveLength(1); // the 60 that left six minutes ago is on the just-left strip
  results.filters.value = { fDirect: false, fTrain: false, resultSort: 'depart' };
  expect(sortedLines()).toEqual(['63', '60']); // in three minutes before in nine
  results.filters.value = { fDirect: false, fTrain: false, resultSort: 'fast' };
  expect(sortedLines()).toEqual(['60', '63']); // 12 minutes before 15
});

test("a card's departures: its options and the own ride's followers, one per trip, the own one and three after", () => {
  const own = way(n + 120, n + 900, '164'),
    later = way(n + 1500, n + 2300, '164'), // another option of the group: the same trip the followers list first
    earlierSlower = { ...way(n - 60, n + 1000, '164'), slower: true }; // at the platform, arriving later: kept
  (own.legs[0] as RideLeg).next = [1500, 2100, 2700, 3300].map((d) => ({ trip: n + d, pos: 4, sched: n + d }));
  // the second follower runs a minute late, by a report that is not certain
  const at = (trip: number, pos: number) =>
    trip === n + 2100 && pos === 4 ? { time: n + 2160, sure: false, passed: false } : null;
  const d = results.departures(own, [earlierSlower, own, later], at, n);
  expect(d.map((x) => x.depart - n)).toEqual([-60, 120, 1500, 2160, 2700]); // one per trip; the fourth follower is off
  expect(d[2].o).toBe(later); // the option, which opens, not the follower
  expect([d[3].o, d[3].live]).toEqual([undefined, { sure: false, passed: false }]);
  expect(d[4].live).toBeNull();
});

test('the trips of a search stay and their times follow: only asking again changes which are listed, and where', () => {
  vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
  results.hooks.afterResults = () => {};
  const q = { ...results.query.value!, liveTried: true };
  const at0 = clock.nowOn(day);
  // the 8 is listed four minutes ago and has not reached the stop (it is due a minute from now); the 5 leaves in ten
  const late8 = { ...way(at0 - 240, at0 + 600, '8'), legs: [{ ...ride(at0 - 240, at0 + 600, '8'), trip: 8 }] },
    the5 = { ...way(at0 + 600, at0 + 1500, '5'), legs: [{ ...ride(at0 + 600, at0 + 1500, '5'), trip: 5 }] };
  const known = (dep8: number, arr8: number, passed: number) => ({
    asOf: Date.now() - 20000,
    trips: { 8: { seen: at0, sure: true, from: 0, times: [dep8, arr8], passed } },
  });
  const shown = () =>
    results.list.value.cards.map((c) => [(c.j.legs[0] as RideLeg).line, c.j.depart - at0, c.j.arrive - at0, c.left]);
  live.trips.value = known(at0 + 60, at0 + 900, 0).trips; // what the plan was routed on (the planner hands it in)
  results.setResults({ journeys: [late8, the5], live: known(at0 + 60, at0 + 900, 0) }, q);
  expect(shown()).toEqual([
    ['8', 60, 900, false], // the late bus is a card, at the time it is expected, before the 5 (it arrives first)
    ['5', 600, 1500, false],
  ]);
  expect(results.list.value.gone).toHaveLength(0);

  // six minutes on, a look says the 8 left at +90 and will now arrive after the 5: its times follow, and it is marked
  // as gone, but it is the same card in the same place, and nothing is filed under "just left"
  vi.setSystemTime(Date.now() + 360000);
  live.trips.value = known(at0 + 90, at0 + 1800, 1).trips;
  expect(shown()).toEqual([
    ['8', 90, 1800, true],
    ['5', 600, 1500, false],
  ]);
  expect(results.list.value.gone).toHaveLength(0);

  // the rider asks again, in the order they had chosen: now the list is the 5, and the 8 has just left
  results.setResults({ journeys: [late8, the5], live: known(at0 + 90, at0 + 1800, 1) }, q, 'fast');
  expect(shown().map((c) => c[0])).toEqual(['5']);
  expect(results.list.value.gone.map((j) => (j.legs[0] as RideLeg).line)).toEqual(['8']);
  expect(results.filters.value.resultSort).toBe('fast');
  vi.useRealTimers();
});

test('"Best" is the order a plan starts in: the effort the worker gives each way, and the time around it', () => {
  results.hooks.afterResults = () => {};
  const at0 = clock.nowOn(day),
    q = { ...results.query.value!, isNow: true, arriveBy: false };
  // three ways by arrival: two buses leaving now (there in 24 minutes), the direct bus in 6 (there in 31), and an
  // express in 25 (there in 45); their efforts as the worker works them out (engine/best.ts), in seconds of riding
  const twoBuses = { ...way(at0, at0 + 24 * 60, '5'), transfers: 1, effort: 41 * 60 },
    direct = { ...way(at0 + 6 * 60, at0 + 31 * 60, '18'), effort: 30 * 60 },
    express = { ...way(at0 + 25 * 60, at0 + 45 * 60, '900'), effort: 24 * 60 };
  results.setResults({ journeys: [twoBuses, direct, express] }, q);
  expect(results.filters.value.resultSort).toBe('best');
  expect(sortedLines()).toEqual(['18', '5', '900']); // 36, 41 and 49: the direct bus before the change that arrives sooner
  results.setFilter({ resultSort: 'arrive' });
  expect(sortedLines()).toEqual(['5', '18', '900']);
  // asked to arrive by a time, the time around the trip is after it: the same three, to be there by 46 minutes from now
  results.setResults(
    { journeys: [twoBuses, direct, express] },
    { ...q, isNow: false, arriveBy: true, at: hm(at0 + 46 * 60) },
  );
  expect(sortedLines()).toEqual(['900', '18', '5']); // the one that leaves last and idles least
});
