// The notification's line while following (src/following/status.ts): the times of the trip as it stands now, none once
// arrived.
import { test, expect } from 'vitest';
import { statusLine } from '../src/following/status.ts';
import type { FollowView } from '../src/following/follow.ts';
import type { RideLeg } from '../src/trip/journey';

const leg = {
  type: 'ride',
  line: '60',
  depart: 36_000,
  arrive: 36_900,
  from: { name: 'A' },
  to: { name: 'B' },
} as RideLeg;
const stop = { stop: 2, name: 'B', lat: 0, lon: 0, arr: 36_900 };

test('on board: where to get off and when, as the trip stands now', () => {
  const v: FollowView = {
    kind: 'ride',
    leg,
    stopsLeft: 3,
    nextStop: stop,
    alight: stop,
    arrivesIn: 10,
    after: null,
    nextRide: undefined,
  };
  const listed = statusLine(v, 'Home', 36_100)!;
  const late = statusLine({ ...v, leg: { ...leg, arrive: 37_020 } }, 'Home', 36_100)!;
  expect(listed[1]).toContain('10:15'); // the listed arrival, 36,900 s
  expect(late[1]).toContain('10:17'); // two minutes late now, 37,020 s
  expect(late[0]).toContain('Home');
});

test('waiting: the departure as it stands; arrived: no line at all', () => {
  const wait: FollowView = { kind: 'wait', leg: { ...leg, depart: 36_060 }, departsIn: 2, stopsLeft: 3 };
  expect(statusLine(wait, 'Home', 35_900)![1]).toContain('10:01');
  expect(statusLine({ kind: 'done' }, 'Home', 40_000)).toBeNull();
});
