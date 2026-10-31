// Re-planning on the way (src/journey/replan.ts): when to look for a faster way, and which way is worth proposing.
import { test, expect } from 'vitest';
import { whyReplan, pickAlternative, REPLAN, type ReplanSignals } from '../src/journey/replan.ts';
import type { Journey, RideLeg } from '../src/journey/types';

const quiet: ReplanSignals = {
  force: false,
  shiftSec: 0,
  missedChange: false,
  liveChecked: true,
  vehicleSeen: true,
  nextRideInSec: 900,
  sinceLastMs: 120_000,
};

test('look when the ride is late, a change is missed, its vehicle is missing near departure, or every five minutes', () => {
  expect(whyReplan(quiet)).toEqual({ look: false, why: 'no reason yet' });
  expect(whyReplan({ ...quiet, shiftSec: REPLAN.lateSec })).toEqual({ look: true, why: 'late' });
  expect(whyReplan({ ...quiet, shiftSec: REPLAN.lateSec - 1 }).look).toBe(false);
  expect(whyReplan({ ...quiet, missedChange: true })).toEqual({ look: true, why: 'missed' });
  // missing: live data was asked, no vehicle seen, and the ride leaves within ten minutes (or left five ago)
  expect(whyReplan({ ...quiet, vehicleSeen: false, nextRideInSec: 300 })).toEqual({ look: true, why: 'missing' });
  expect(whyReplan({ ...quiet, vehicleSeen: false, nextRideInSec: 700 }).look).toBe(false);
  expect(whyReplan({ ...quiet, vehicleSeen: false, nextRideInSec: -200 }).look).toBe(true);
  expect(whyReplan({ ...quiet, vehicleSeen: false, liveChecked: false, nextRideInSec: 300 }).look).toBe(false);
  expect(whyReplan({ ...quiet, sinceLastMs: REPLAN.everyMs + 1 })).toEqual({ look: true, why: 'due' });
});

test('never twice within a minute and a half, unless asked by hand', () => {
  expect(whyReplan({ ...quiet, shiftSec: 600, sinceLastMs: 30_000 })).toEqual({ look: false, why: 'too soon' });
  expect(whyReplan({ ...quiet, force: true, sinceLastMs: 0 })).toEqual({ look: true, why: 'forced' });
});

// a ride's key is its trip and the stop it is left at (journey/follow.ts ridesKey): here every ride ends at stop 9
const ride = (trip: number): RideLeg =>
  ({ type: 'ride', trip, line: String(trip), seconds: 0, depart: 0, arrive: 0, to: { name: 'X', stop: 9 } }) as RideLeg;
const way = (arrive: number, ...trips: number[]): Journey => ({
  depart: 0,
  arrive,
  transfers: 0,
  legs: trips.map(ride),
});

test('a way is proposed when it arrives enough earlier than staying, counting its extra rides', () => {
  const cur = { key: '1@9', arrive: 10_000, rides: 1, shiftSec: 0 };
  const opts = { dismissed: {}, nowMs: 0 };
  // 4 minutes earlier with as many rides: proposed; a minute less: not
  expect(pickAlternative([way(10_000 - 240, 2)], cur, opts).best?.key).toBe('2@9');
  expect(pickAlternative([way(10_000 - 239, 2)], cur, opts).best).toBeNull();
  // one ride more needs 3 minutes more of gain
  expect(pickAlternative([way(10_000 - 300, 2, 3)], cur, opts).best).toBeNull();
  expect(pickAlternative([way(10_000 - 420, 2, 3)], cur, opts).best?.gain).toBe(420);
});

test("staying is judged with its lateness, or with the planner's own answer for the same rides when it has one", () => {
  const late = { key: '1@9', arrive: 10_000, rides: 1, shiftSec: 600 };
  expect(pickAlternative([way(10_200, 2)], late, { dismissed: {}, nowMs: 0 }).best?.gain).toBe(400);
  // the planner says the current rides arrive at 10,100 after all: the other way gains only 100 s, not proposed
  const r = pickAlternative([way(10_100, 1), way(10_000, 2)], late, { dismissed: {}, nowMs: 0 });
  expect(r.same).toBe(true);
  expect(r.arrive).toBe(10_100);
  expect(r.best).toBeNull();
});

test('a way the rider declined stays away for fifteen minutes', () => {
  const cur = { key: '1@9', arrive: 10_000, rides: 1, shiftSec: 0 };
  const found = [way(9_000, 2)];
  expect(
    pickAlternative(found, cur, { dismissed: { '2@9': 1_000 }, nowMs: 1_000 + REPLAN.dismissedMs - 1 }).best,
  ).toBeNull();
  expect(
    pickAlternative(found, cur, { dismissed: { '2@9': 1_000 }, nowMs: 1_000 + REPLAN.dismissedMs }).best?.key,
  ).toBe('2@9');
});
