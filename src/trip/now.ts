// A plan as it stands now. A plan (a Journey from the planner) says which rides and walks, with the listed times. The
// same legs with the times expected now are worked out here, in one place, from what is known live of each trip; every
// screen that shows a journey draws this and nothing else. No screen fetches vehicles, compares a planned time with a
// live one, or sets a time against the clock.
import { isRide, type Journey, type Leg, type RideLeg } from './journey';

/** What is known live of one trip at one of its stops (state/live.ts at): its time there (null for a stop the vehicle
 *  left before it was seen), whether that is sure, and whether the vehicle is past the stop. */
export type LiveAt = { time: number | null; sure: boolean; passed: boolean };
/** Where the live times are asked: a trip and the stop's place on it; null when nothing is known of the trip. */
export type At = (trip: number, pos: number) => LiveAt | null;

/** A trip's time at one of its stops as it stands now: the live one, else the listed one. A stop the vehicle has not
 *  passed is never before now (the live times are up to half a minute old when they are drawn). */
export function timeAt(
  at: At,
  trip: number,
  pos: number,
  listed: number,
  now: number,
): { time: number; live: LiveAt | null } {
  const live = at(trip, pos);
  if (!live || live.time == null) return { time: listed, live };
  return { time: live.passed ? live.time : Math.max(live.time, now), live };
}

/** Whether a departure is still to come, the one rule for every list of departures: with live times, its vehicle is
 *  not past the stop (so a late one listed earlier is, and one that left is not); without, its listed time has not
 *  gone by a minute. */
export const toCome = (x: { time: number; live: LiveAt | null }, now: number): boolean =>
  x.live ? !x.live.passed : x.time >= now - 60;

/** The journey with every time as it stands at `now` (seconds on its service day). A ride takes its trip's times at the
 *  stops it is boarded and left at; the way to the first ride ends as it leaves, and each walk after a ride starts as
 *  it comes in. `missed`: a ride now leaves before the rider can be there. Applying it again gives the same. */
export function tripNow(j: Journey, at: At, now: number): Journey {
  const legs: Leg[] = j.legs.map((l): Leg => {
    if (!isRide(l)) return l;
    const dep = timeAt(at, l.trip, l.boardPos, l.schedDepart ?? l.depart, now),
      arr = timeAt(at, l.trip, l.alightPos, l.schedArrive ?? l.arrive, now);
    return {
      ...l,
      depart: dep.time,
      arrive: Math.max(dep.time, arr.time),
      live: dep.live && { sure: dep.live.sure, passed: dep.live.passed },
      stopsAlong: l.stopsAlong?.map((s, k) => {
        const x = timeAt(at, l.trip, l.boardPos + k, s.sched ?? s.arr, now);
        return { ...s, sched: s.sched ?? s.arr, arr: x.time, passed: !!x.live && x.live.passed };
      }),
    };
  });
  const first = legs.findIndex(isRide);
  if (first < 0) return j; // no ride: as planned
  let t = legs[first].depart;
  for (let i = first - 1; i >= 0; i--) legs[i] = { ...legs[i], arrive: t, depart: (t -= legs[i].seconds) };
  t = legs[first].arrive;
  let missed = false;
  for (let i = first + 1; i < legs.length; i++) {
    const l = legs[i];
    if (isRide(l)) {
      if (l.depart < t) missed = true;
      t = l.arrive;
    } else legs[i] = { ...l, depart: t, arrive: (t += l.seconds) };
  }
  return { ...j, legs, depart: legs[0].depart, arrive: legs[legs.length - 1].arrive, missed };
}
/** The first ride of a journey, if it has one. */
export const firstRide = (j: Journey): RideLeg | undefined => j.legs.find(isRide);
