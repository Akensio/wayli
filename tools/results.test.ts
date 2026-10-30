// The result list (src/state/results.ts): the cards are in the order of the option each one shows, while each card's
// number (idx) follows its group's first option, which a plan from now (it looks ten minutes back) may already have
// filed under "just left".
import { test, expect } from 'vitest';
import * as clock from '../src/engine/clock.js';
import * as results from '../src/state/results';
import type { Journey, RideLeg } from '../src/journey/types';

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
