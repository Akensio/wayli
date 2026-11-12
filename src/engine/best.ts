// How good a way is, as one number: when it gets the rider there, plus what it costs on the way in walking, waiting,
// changes and the risk of missing one, all in seconds of plain riding (lower is better). The results' "Best" order
// sorts by it (state/results.ts); the worker works out each way's parts (worker/plan.ts partsOf).
// One formula for every trip: nothing here knows a short trip from a long one, a bus from a train. What makes a change
// onto an hourly train on a long trip weigh more than one onto a bus every six minutes is the risk term. Among ways
// that cost the same on the way, the one that gets there first is first.
//
// The weights, and where each comes from (docs/architecture.md, "Best"):
// - walking and waiting, against riding: 1.75 and 1.5. A meta-analysis of 2,872 multipliers from 606 studies supports
//   1.5 to 1.75 in place of the long-used 2 (Wardman et al. 2026, https://doi.org/10.1016/j.tra.2026.104925).
// - a change: 8 minutes flat, besides its walk and its wait. Published values of the "pure" penalty run from 5 minutes
//   (https://research.tudelft.nl/files/187269156/1-s2.0-S1077291X24000092-main.pdf) to 13-18
//   (https://econpapers.repec.org/RePEc:eee:trapol:v:125:y:2022:i:c:p:48-55); the low middle, since the risk of missing
//   the next ride, part of what those values measure, is counted here on its own.
// - the rest are this app's own choices, estimates until measured: the chance of missing a connection by the time to
//   spare, and one more per minute walked past the rider's longest walk.
// - the time before leaving counts in full, like riding. At half weight (tried on real trips, 2026-11-12) a train that
//   left 32 minutes later and arrived 13 minutes later came first, which no rider asking "from now" would choose.

/** One change of vehicle (s): the time to spare at the stop after the walk to it, and how long after the ride the next
 *  one of its line leaves from there (what missing it costs; GAP_MAX when there is none soon). */
export type Change = { spare: number; gap: number };
/** What a way is made of (s): riding (in a vehicle, or on the rider's own bicycle), walking, the walking past the
 *  rider's longest walk, and its changes. */
export type Parts = { ride: number; walk: number; over: number; changes: Change[] };

export const WALK = 1.75,
  WAIT = 1.5,
  OVER = 1,
  CHANGE = 480,
  GAP_MAX = 3600;

/** The chance of missing a connection with `spare` seconds in hand: an estimate (a half with none, 26% with two
 *  minutes, 9% with five, 2% with ten), to be measured against the buses' real lateness. */
export const missChance = (spare: number): number => 0.5 * Math.exp(-Math.max(0, spare) / 180);

/** A way's effort from leaving to arriving, in seconds of riding. */
export function effort(p: Parts): number {
  let s = p.ride + WALK * p.walk + OVER * p.over;
  for (const c of p.changes) s += CHANGE + WAIT * Math.max(0, c.spare) + missChance(c.spare) * Math.min(c.gap, GAP_MAX);
  return s;
}
/** The number "Best" sorts by: the effort, and the time around it that is not travel (`lead`, s): before leaving, from
 *  the time asked; or, when asked to arrive by a time, between arriving and that time. Together: when the rider gets
 *  there (or how late they may leave), plus what the way costs beyond its minutes. */
export const best = (effortS: number, lead: number): number => effortS + Math.max(0, lead);
/** For a way with no effort worked out (a result kept from before): its time and its changes. */
export const plainEffort = (seconds: number, transfers: number): number => seconds + CHANGE * transfers;
