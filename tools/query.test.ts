// What a plan asks for (src/journey/query.ts): the window of departures and whether live delays go in.
import { test, expect } from 'vitest';
import { planWindow, withLive, WINDOW } from '../src/journey/query.ts';

test('the window: an hour from the time asked; from now ten minutes back too; arriving by, the two hours before', () => {
  expect(planWindow(36_000, false, false)).toEqual({ fromTime: 36_000, toTime: 36_000 + WINDOW.spanSec });
  expect(planWindow(36_000, false, true)).toEqual({ fromTime: 36_000 - 600, toTime: 36_000 + 3600 });
  expect(planWindow(36_000, true, false)).toEqual({ fromTime: 36_000 - 7200, toTime: 36_000 });
  expect(planWindow(300, false, true).fromTime).toBe(0); // never before the service day's start
});

test('live delays go in only departing, today, within twenty minutes of now, with live data on', () => {
  const now = { day: '20261031', seconds: 36_000 };
  const base = { liveOn: true, arriveBy: false, day: '20261031', at: 36_000, now };
  expect(withLive(base)).toBe(true);
  expect(withLive({ ...base, at: 36_000 + 1199 })).toBe(true);
  expect(withLive({ ...base, at: 36_000 + 1200 })).toBe(false);
  expect(withLive({ ...base, arriveBy: true })).toBe(false);
  expect(withLive({ ...base, day: '20261101' })).toBe(false);
  expect(withLive({ ...base, liveOn: false })).toBe(false);
});
