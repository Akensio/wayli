// What a plan asks the router for: the window of departures it searches, and whether live vehicles go in. Times are
// seconds on the service day. Tested in tests/query.test.ts.

export const WINDOW = {
  spanSec: 3600, // departing: the hour from the time asked
  arriveSpanSec: 7200, // arriving by: the two hours before it
  nowLookBackSec: 600, // from now: ten minutes back too, so a ride just boarded can still be followed
  liveWithinSec: 1200, // live delays go in when the time asked is within twenty minutes of now, today
};

/** The departures searched: from `fromTime` to `toTime`. `fromNow`: the rider set no time (nor arrive-by). */
export function planWindow(at: number, arriveBy: boolean, fromNow: boolean): { fromTime: number; toTime: number } {
  if (arriveBy) return { fromTime: Math.max(0, at - WINDOW.arriveSpanSec), toTime: at };
  return { fromTime: fromNow ? Math.max(0, at - WINDOW.nowLookBackSec) : at, toTime: at + WINDOW.spanSec };
}

/** Whether the plan takes the live vehicles' delays: live data on, departing (not arriving by), on today's service day
 *  and near now. */
export function withLive(o: {
  liveOn: boolean;
  arriveBy: boolean;
  day: string;
  at: number;
  now: { day: string; seconds: number };
}): boolean {
  return o.liveOn && !o.arriveBy && o.day === o.now.day && Math.abs(o.at - o.now.seconds) < WINDOW.liveWithinSec;
}
