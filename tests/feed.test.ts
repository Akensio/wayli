// Live vehicles (src/engine/feed.ts): freshness is judged within a set, against that set's own newest report.
import { test, expect } from 'vitest';
import { isFresh, type Vehicle } from '../src/engine/feed.ts';

const at = (ms: number): Vehicle =>
  ({
    lineRef: '1',
    lat: 32,
    lon: 34.8,
    bearing: 0,
    velocity: 0,
    rideId: 'r',
    recordedAt: new Date(ms),
    scheduledStart: new Date(0),
  }) as Vehicle;

test("a vehicle is fresh within five minutes of its own set's newest report, whatever was seen elsewhere", () => {
  // isFresh used to fall back on the newest report any query had returned: after a query for one busy line, a quiet
  // area whose feed lags 20 minutes lost every vehicle (2026-10-31)
  const newest = 1_000_000_000;
  expect(isFresh(at(newest - 299_000), 300, newest)).toBe(true);
  expect(isFresh(at(newest - 301_000), 300, newest)).toBe(false);
  expect(isFresh(at(newest - 301_000), 300, new Date(newest - 10_000))).toBe(true);
  expect(isFresh(at(0), 300, null)).toBe(true); // no set to judge against
});
