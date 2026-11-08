// A stop's list of departures (state/stop.ts visibleDeps): a departure listed before now (early) shows only while the
// live data says it is still to come, in its live place; a delayed train that has not left yet is not missing from the
// list (maintainer, 2026-11-08), and one that left is not shown either.
import { test, expect } from 'vitest';
import { visibleDeps } from '../src/state/stop';
import type { Departure } from '../src/worker/ops.ts';

const dep = (trip: number, time: number, early = false): Departure =>
  ({
    trip,
    time,
    line: '',
    headsign: '',
    routeType: 2,
    agency: '',
    routeId: 1,
    estimated: false,
    firstDep: 0,
    early,
  }) as Departure;

test('an early departure shows only with a live time still to come, and in its live place', () => {
  const T = 9 * 3600;
  const deps = [dep(1, T - 15 * 60, true), dep(2, T - 10 * 60, true), dep(3, T + 60), dep(4, T + 5 * 60)];
  // no live data yet: the early ones stay out of sight
  expect(visibleDeps(deps, {}).map((d) => d.trip)).toEqual([3, 4]);
  // trip 1 left; trip 2 is 13 minutes late and comes at T + 3 min: between 3 and 4
  const live = { '1': { passed: true } as const, '2': { passed: false, time: T + 3 * 60, stale: false, delayMin: 13 } };
  expect(visibleDeps(deps, live).map((d) => d.trip)).toEqual([3, 2, 4]);
  // a due departure with a live time moves to it as well
  const live2 = { ...live, '3': { passed: false, time: T + 6 * 60, stale: false, delayMin: 5 } };
  expect(visibleDeps(deps, live2).map((d) => d.trip)).toEqual([2, 4, 3]);
});
