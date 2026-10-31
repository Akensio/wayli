// What the follow screen shows (src/journey/follow.ts view): a ride always has a stop to get off at.
import { test, expect } from 'vitest';
import { view, initialState } from '../src/journey/follow.ts';
import type { Journey, RideLeg } from '../src/journey/types';

test('a ride with no stops listed still names where to get off: its own end', () => {
  // with an empty stopsAlong, the view read stops[-1] and the screen showed an empty name (2026-10-31)
  const ride = {
    type: 'ride',
    depart: 36000,
    arrive: 36600,
    seconds: 600,
    from: { name: 'A', stop: 1, lat: 32, lon: 34.8 },
    to: { name: 'B', stop: 2, lat: 32.01, lon: 34.8 },
    line: '60',
    agency: 'Dan',
    route: 0,
    routeType: 3,
    routeId: 1,
    trip: 5,
    pattern: 0,
    boardPos: 0,
    alightPos: 1,
    stops: 1,
    stopsAlong: [],
  } as RideLeg;
  const j: Journey = { depart: 36000, arrive: 36600, transfers: 0, legs: [ride] };
  const v = view(j, { ...initialState(), onBoard: true }, 36100);
  expect(v.kind).toBe('ride');
  if (v.kind === 'ride') expect(v.alight.name).toBe('B');
});
