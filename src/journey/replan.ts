// Re-planning on the way, the decisions only: whether to look for a faster way now, and which of the ways found is
// worth proposing. The controller (controllers/follow.ts) gathers what it needs, asks the planner and shows the answer;
// every threshold that decides is here, with its unit, and tested (tools/replan.test.ts).
import { ridesKey } from './follow.ts';
import type { Journey } from './types';

export const REPLAN = {
  lateSec: 180, // the ride moved this much since it was planned
  missingFrom: -300, // its vehicle is not seen while it leaves within these seconds of now (from 5 min ago...
  missingTo: 600, // ...to 10 min ahead)
  everyMs: 300_000, // look anyway every five minutes
  minGapMs: 90_000, // and never twice within a minute and a half
  gainSec: 240, // a way is proposed when it arrives this much earlier...
  perExtraRideSec: 180, // ...plus this for every ride it has more than the trip as it stands
  dismissedMs: 900_000, // a way the rider declined stays away this long
};

/** What the controller saw: how much the current or next ride moved, whether a change ahead is missed, whether live
 *  data was asked for and the next ride's vehicle seen, when the next ride leaves (seconds from now), and how long since
 *  the last look. `force` for a look asked by hand. */
export type ReplanSignals = {
  force: boolean;
  shiftSec: number;
  missedChange: boolean;
  liveChecked: boolean;
  vehicleSeen: boolean;
  nextRideInSec: number | null;
  sinceLastMs: number;
};
export type ReplanDecision =
  | { look: true; why: 'forced' | 'late' | 'missed' | 'missing' | 'due' }
  | { look: false; why: 'no reason yet' | 'too soon' };

/** Whether to look for a faster way now, and why. */
export function whyReplan(s: ReplanSignals): ReplanDecision {
  if (s.force) return { look: true, why: 'forced' };
  let why: 'late' | 'missed' | 'missing' | 'due' | null = null;
  if (s.shiftSec >= REPLAN.lateSec) why = 'late';
  else if (s.missedChange) why = 'missed';
  else if (
    s.liveChecked &&
    !s.vehicleSeen &&
    s.nextRideInSec != null &&
    s.nextRideInSec > REPLAN.missingFrom &&
    s.nextRideInSec < REPLAN.missingTo
  )
    why = 'missing';
  else if (s.sinceLastMs > REPLAN.everyMs) why = 'due';
  if (!why) return { look: false, why: 'no reason yet' };
  if (s.sinceLastMs < REPLAN.minGapMs) return { look: false, why: 'too soon' };
  return { look: true, why };
}

/** The trip as it stands: the key of its remaining rides, its planned arrival (seconds on the service day), how many
 *  rides are left, and how late the current or next ride runs. */
export type Standing = { key: string; arrive: number; rides: number; shiftSec: number };
export type Pick = {
  best: { journey: Journey; key: string; gain: number } | null;
  /** When the trip as it stands arrives: planned plus the lateness, or the planner's answer for the same rides. */
  arrive: number;
  /** Whether the planner found the trip's own rides among its answers. */
  same: boolean;
};

/** The first way found (the planner ranks them) that arrives enough earlier than staying, counting each extra ride,
 *  and that the rider has not declined lately. `dismissed`: when each way's key was declined, ms. */
export function pickAlternative(
  found: Journey[],
  cur: Standing,
  opts: { gainSec?: number; dismissed: Record<string, number>; nowMs: number },
): Pick {
  const gainSec = opts.gainSec ?? REPLAN.gainSec;
  let arrive = cur.arrive + Math.max(0, cur.shiftSec);
  const same = found.find((j) => ridesKey(j.legs) === cur.key);
  if (same) arrive = Math.min(arrive, same.arrive); // staying, with the delays the planner knows of
  for (const j of found) {
    const key = ridesKey(j.legs) || 'walk';
    if (key === cur.key) continue;
    const rides = j.legs.filter((l) => l.type === 'ride').length;
    if (arrive - j.arrive < gainSec + REPLAN.perExtraRideSec * Math.max(0, rides - cur.rides)) continue;
    const declined = opts.dismissed[key];
    if (declined && opts.nowMs - declined < REPLAN.dismissedMs) continue;
    return { best: { journey: j, key, gain: arrive - j.arrive }, arrive, same: !!same };
  }
  return { best: null, arrive, same: !!same };
}
