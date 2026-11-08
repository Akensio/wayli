// Standing at a stop is being there (docs/decisions.md 2026-10-18 and 2026-11-08): within 60 m of a stop, 150 m of a
// railway station, the walk to it is nothing, by the street graph and by the straight line alike, so no walk chip and no
// minute shows for a rider on the platform. The rule broke twice; this holds it.
import { test, expect } from 'vitest';
import { airAccess, standingWalk, AT_STOP_M, AT_STATION_M } from '../src/engine/streets.ts';

test('standing at a stop or in a station is no walk at all', () => {
  expect(standingWalk(0, false)).toBe(0);
  expect(standingWalk(AT_STOP_M, false)).toBe(0);
  expect(standingWalk(AT_STOP_M + 1, false)).toBeNull();
  expect(standingWalk(140, true)).toBe(0); // in the station hall, 140 m from the feed's point
  expect(standingWalk(140, false)).toBeNull(); // 140 m from a bus stop is a walk
  expect(standingWalk(AT_STATION_M + 1, true)).toBeNull();
});

test('before the street graph is in, the straight-line access keeps the same rule', () => {
  // two stops: a railway station 120 m east of the rider, a bus stop 120 m west; a third 500 m north
  const lat = 32.0735,
    lon = 34.7932,
    dLon = 120 / (111000 * Math.cos((lat * Math.PI) / 180)),
    dLat = 500 / 111000;
  const stopLat = [lat, lat, lat + dLat],
    stopLon = [lon + dLon, lon - dLon, lon],
    big = new Uint8Array([1, 0, 0]);
  const walk = airAccess(lat, lon, stopLat, stopLon, big, 'walk');
  const by = Object.fromEntries(walk.map((a) => [a.stop, a.walk]));
  expect(by[0]).toBe(0); // in the station
  expect(by[1]).toBeGreaterThan(60); // the bus stop 120 m off is a short walk
  expect(by[2]).toBeGreaterThan(by[1]); // the far one further
  expect(walk[0].stop).toBe(0); // nearest first
  // on a bicycle the station is a ride like any other
  expect(airAccess(lat, lon, stopLat, stopLon, big, 'bike').find((a) => a.stop === 0)!.walk).toBeGreaterThan(0);
});
