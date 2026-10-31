// The notification's line while following (src/journey/status.ts): the live time when there is one, none once arrived.
import { test, expect } from 'vitest';
import { statusLine } from '../src/journey/status.ts';
import type { FollowView } from '../src/journey/follow.ts';
import type { RideLeg } from '../src/journey/types';

const leg = {
  type: 'ride',
  line: '60',
  depart: 36_000,
  arrive: 36_900,
  from: { name: 'A' },
  to: { name: 'B' },
} as RideLeg;
const stop = { stop: 2, name: 'B', lat: 0, lon: 0, arr: 36_900 };

test('on board: where to get off and when, the live time over the planned one', () => {
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
  const planned = statusLine(v, 'Home', null, 36_100)!;
  const live = statusLine(v, 'Home', 37_020, 36_100)!;
  expect(planned[1]).toContain('10:15'); // the planned arrival, 36,900 s
  expect(live[1]).toContain('10:17'); // the live one, 37,020 s
  expect(live[0]).toContain('Home');
});

test('waiting: the live departure; arrived: no line at all', () => {
  const wait: FollowView = { kind: 'wait', leg, departsIn: 2, stopsLeft: 3 };
  expect(statusLine(wait, 'Home', 36_060, 35_900)![1]).toContain('10:01');
  expect(statusLine({ kind: 'done' }, 'Home', null, 40_000)).toBeNull();
});
