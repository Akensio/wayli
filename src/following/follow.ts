// Wayli follow mode, the part without a screen: where the rider is along a journey, what to tell them,
// and when. Pure functions over the journey (as the worker returns it), the rider's position and the
// clock, so it can be tested in Node and the UI just renders the result.
//
// A journey is a list of legs: access (walk/bike from the start to a stop), ride, walk (between stops),
// egress (from a stop to the destination). The state points at the current leg and, on a ride, whether
// the rider is still waiting for the vehicle or on it.

import { metres, projectOnStops } from '../engine/geo.ts';
import { legMinutes } from '../engine/clock.ts';
import type { Journey, Leg, RideLeg, WalkLeg, StopAlong } from '../model/journey';
import type { Query } from '../model/query';

const AT_STOP = 60; // m: close enough to count as being at a stop or the destination

/** Where the follower is along the journey: the state machine's state, kept with the trip and advanced by `advance`,
 *  `stepForward` and `stepBack`. */
export type FollowState = {
  step: number; // the current leg: its index in journey.legs
  onBoard: boolean; // on a ride: on the vehicle (else waiting for it at the boarding stop)
  rideIdx: number; // on board: the last stop reached, its index in the ride's stopsAlong
  alerted: Record<string, boolean>; // the alerts given, 'soon' + step and 'off' + step, so each is raised once
  done: boolean; // arrived
  hold: number; // a step the rider chose by hand: the clock does not leave it, a position still can; -1 when none
  startedAt: number; // when following began, ms since the epoch
};
/** The trip being followed, as the phone keeps it: the journey, the places it was asked for, the service day, the
 *  machine's state, whether its screen is up, and when following began and how often it was re-planned. */
export type ActiveTrip = {
  journey: Journey;
  q: Pick<Query, 'from' | 'to' | 'bike' | 'folding'>;
  day: string;
  state: FollowState;
  view: 'follow' | 'hidden';
  startedAt?: number;
  replanned?: number;
};
/** The rider's position: degrees, and the fix's accuracy in metres when known. */
export type Position = { lat: number; lon: number; acc?: number };
/** What advancing the follower set off: a walk ended, the vehicle was boarded, the stop to get off at is the next one,
 *  get off here, or the journey is over. */
export type FollowEvent = 'reached' | 'boarded' | 'getOffNext' | 'getOff' | 'arrived';

/** A trip over by 45 minutes, or started 12 hours ago, is not resumed. `nowSec`: seconds on its service day. */
export function isTripOver(a: ActiveTrip, nowSec: number, nowMs: number): boolean {
  return nowSec > a.journey.arrive + 2700 || nowMs - (a.startedAt || 0) > 12 * 3600e3;
}
export function initialState(): FollowState {
  return { step: 0, onBoard: false, rideIdx: 0, alerted: {}, done: false, hold: -1, startedAt: Date.now() };
}
/** The state for a rider who starts following once already on board: on the ride that has departed (the last
 *  one to have, else the first), so the walk to the stop is not waited for. */
export function aboardState(journey: Journey, nowSec: number): FollowState {
  let idx = journey.legs.findIndex((l) => l.type === 'ride');
  journey.legs.forEach((l, i) => {
    if (l.type === 'ride' && l.depart <= nowSec) idx = i;
  });
  return { ...initialState(), step: Math.max(0, idx), onBoard: true, rideIdx: 0 };
}

/** A point a walk ends at, or a stop, when its position is known. */
type Spot = { lat?: number | null; lon?: number | null };
/** Walking legs end at a stop or the destination; where is that? */
function legEnd(journey: Journey, leg: WalkLeg): Spot | null {
  if (leg.type === 'egress') return journey.to || null;
  if (leg.to && leg.to.lat != null) return leg.to;
  return null;
}
function near(pos: Position | null, pt: Spot | null | undefined, radius: number): boolean {
  if (!pos || !pt || pt.lat == null) return false;
  return metres(pos.lat, pos.lon, pt.lat, pt.lon!) <= Math.max(radius, Math.min(pos.acc || 0, 120));
}

/**
 * Advance the state from a position (or null) and the time (seconds on the service day).
 * Returns { state, events } where events are from: 'reached' (a walk ended), 'boarded', 'getOffNext',
 * 'getOff', 'arrived'. A time-based fallback keeps the follower moving when there is no position.
 */
export function advance(
  journey: Journey,
  state: FollowState,
  pos: Position | null,
  nowSec: number,
): { state: FollowState; events: FollowEvent[] } {
  const s: FollowState = { ...state, alerted: { ...state.alerted } };
  const events: FollowEvent[] = [];
  const legs = journey.legs;
  let guard = 0;
  while (!s.done && s.step < legs.length && guard++ < 10) {
    const leg = legs[s.step];
    const last = s.step === legs.length - 1;
    // a step the rider chose by hand (back or next) is not left on the clock's word, only on the position's
    const clock = s.hold !== s.step;
    if (leg.type !== 'ride') {
      const end = legEnd(journey, leg);
      const there = near(pos, end, AT_STOP);
      const overdue = clock && nowSec > leg.arrive + (pos ? 900 : 180);
      if (!there && !overdue) break;
      if (last) {
        s.done = true;
        events.push('arrived');
        break;
      }
      s.step++;
      events.push('reached');
      continue;
    }
    // a ride: waiting at the boarding stop, then on board
    const stops = leg.stopsAlong || [];
    const lastIdx = stops.length - 1;
    if (!s.onBoard) {
      // on board once the rider has left the boarding stop along the route, or the vehicle should be gone
      let idx = 0,
        moved = false;
      if (pos && stops.length > 1) {
        const p = along(pos, stops, 0);
        idx = nearestStop(pos, stops, 0);
        moved = p.d <= 400 && (p.i >= 1 || !near(pos, stops[0], 150)); // on the way, past the boarding stop
      }
      const gone = clock && nowSec > leg.depart + (pos ? 600 : 90);
      if (!moved && !gone) break;
      s.onBoard = true;
      s.rideIdx = Math.max(0, idx);
      events.push('boarded');
    }
    if (pos && stops.length > 1) {
      const idx = nearestStop(pos, stops, s.rideIdx);
      if (idx > s.rideIdx) s.rideIdx = idx;
    } else if (stops.length > 1 && clock) {
      // no position: follow the clock
      let idx = s.rideIdx;
      while (idx < lastIdx && nowSec >= stops[idx + 1].arr) idx++;
      s.rideIdx = idx;
    }
    // the next stop is the one to get off at once the one before it is passed (by position, or by the clock without one)
    const alightSoon = s.rideIdx >= lastIdx - 1 || (!pos && nowSec >= leg.arrive - 120);
    if (alightSoon && !s.alerted['soon' + s.step]) {
      s.alerted['soon' + s.step] = true;
      events.push('getOffNext');
    }
    const atAlight =
      (pos && near(pos, stops[lastIdx], AT_STOP + 20)) ||
      (clock && ((!pos && nowSec >= leg.arrive + 30) || (pos && nowSec >= leg.arrive + 900)));
    if (!atAlight) break;
    if (!s.alerted['off' + s.step]) {
      s.alerted['off' + s.step] = true;
      events.push('getOff');
    }
    s.onBoard = false;
    s.rideIdx = 0;
    if (last) {
      s.done = true;
      events.push('arrived');
      break;
    }
    s.step++;
  }
  if (s.step >= legs.length && !s.done) {
    s.done = true;
    events.push('arrived');
  }
  return { state: s, events };
}

/** "Next step" by hand: on board the vehicle being waited for, else on to the next leg (or done). The step reached is
 *  held: the clock does not move it on, a position still can. */
export function stepForward(journey: Journey, state: FollowState): FollowState {
  const s: FollowState = { ...state, alerted: { ...state.alerted } },
    legs = journey.legs,
    leg = legs[s.step];
  if (s.done) return s;
  if (leg && leg.type === 'ride' && !s.onBoard) {
    s.onBoard = true;
    s.rideIdx = 0;
  } else if (s.step >= legs.length - 1) s.done = true;
  else {
    s.step++;
    s.onBoard = false;
    s.rideIdx = 0;
  }
  s.hold = s.step;
  return s;
}
/** "Back" by hand: the exact reverse of stepForward, held the same way. */
export function stepBack(journey: Journey, state: FollowState): FollowState {
  const s: FollowState = { ...state, alerted: { ...state.alerted } },
    legs = journey.legs;
  if (s.done) s.done = false;
  else if (legs[s.step] && legs[s.step].type === 'ride' && s.onBoard) {
    s.onBoard = false;
    s.rideIdx = 0;
  } else if (s.step > 0) {
    s.step--;
    s.onBoard = legs[s.step].type === 'ride';
    s.rideIdx = 0;
  }
  s.hold = s.step;
  return s;
}
/** Whether there is a step to go back to. */
export const canStepBack = (state: FollowState): boolean => state.done || state.step > 0 || state.onBoard;

/** Where the rider is along a ride's stops, from stop `fromIdx` on: the stretch between stop i and stop i+1 they are
 *  nearest to, how far along it (f) and how far off it (d, metres). */
function along(pos: Position, stops: readonly StopAlong[], fromIdx: number): { i: number; f: number; d: number } {
  const p = projectOnStops(pos.lat, pos.lon, stops, fromIdx);
  return { i: p.index, f: p.frac, d: p.metres };
}
/** The last stop of a ride the rider has reached: the one at the start of the stretch they are on, or the one at its
 *  end once they are at it. Never behind where they already were. (The nearest stop was often the one ahead, and
 *  "get off at the next stop" came a stop early, 2026-10-22.) */
function nearestStop(pos: Position, stops: readonly StopAlong[], fromIdx: number): number {
  if (stops.length < 2 || fromIdx >= stops.length - 1) return fromIdx;
  const p = along(pos, stops, fromIdx);
  if (p.d > 400) return fromIdx; // far off the route: no step taken on its word
  return near(pos, stops[p.i + 1], AT_STOP) ? p.i + 1 : p.i;
}

/** What the follow screen shows now (view): the journey is over; on foot (the last walk is `final`) with the ride it
 *  leads to and the minutes to its stop; waiting for a ride, in how many minutes it leaves; or on it, with the stops
 *  left, the next one, the one to get off at, the minutes to it, the leg after it and the next ride of the journey. */
export type FollowView =
  | { kind: 'done' }
  | { kind: 'walk' | 'final'; leg: WalkLeg; toRide: RideLeg | null; minutes: number; departsIn: number | null }
  | { kind: 'wait'; leg: RideLeg; departsIn: number; stopsLeft: number }
  | {
      kind: 'ride';
      leg: RideLeg;
      stopsLeft: number;
      nextStop: StopAlong;
      alight: StopAlong;
      arrivesIn: number;
      after: Leg | null;
      nextRide: RideLeg | undefined;
    };
/** What to show now. */
export function view(journey: Journey, state: FollowState, nowSec: number): FollowView {
  const legs = journey.legs;
  if (state.done || state.step >= legs.length) return { kind: 'done' };
  const leg = legs[state.step];
  const nextRide = legs.slice(state.step + (leg.type === 'ride' ? 1 : 0)).find((l): l is RideLeg => l.type === 'ride');
  if (leg.type !== 'ride') {
    const next = legs[state.step + 1];
    const toRide = next && next.type === 'ride' ? next : null;
    return {
      kind: leg.type === 'egress' ? 'final' : 'walk',
      leg,
      toRide,
      minutes: legMinutes(leg.seconds),
      departsIn: toRide ? Math.round((toRide.depart - nowSec) / 60) : null,
    };
  }
  // a ride the worker gave no stops for (it always does): its two ends stand for them
  const end = (s: Leg['to'], arr: number): StopAlong => ({
    stop: s?.stop ?? -1,
    name: s?.name ?? '',
    lat: s?.lat ?? 0,
    lon: s?.lon ?? 0,
    arr,
  });
  const stops = leg.stopsAlong?.length ? leg.stopsAlong : [end(leg.from, leg.depart), end(leg.to, leg.arrive)];
  const lastIdx = stops.length - 1;
  if (!state.onBoard)
    return { kind: 'wait', leg, departsIn: Math.round((leg.depart - nowSec) / 60), stopsLeft: lastIdx };
  const stopsLeft = Math.max(0, lastIdx - state.rideIdx);
  const nextStop = stops[Math.min(lastIdx, state.rideIdx + 1)];
  return {
    kind: 'ride',
    leg,
    stopsLeft,
    nextStop,
    alight: stops[lastIdx],
    arrivesIn: Math.round((leg.arrive - nowSec) / 60),
    after: legs[state.step + 1] || null,
    nextRide,
  };
}

// ------------------------------------------------------------------ re-planning on the way
// Delays can make another way faster: get off a stop early and take another line, or take a different
// line than the one being waited for. The planner answers from the stop the rider reaches next, at the
// time they will be there; these helpers say where that is, whether an answer is the plan already
// followed, and how to splice a chosen alternative into the journey.

/** A stop as a place to plan from: its name, its index in the timetable's stops, where it is (degrees). */
export type ReplanPlace = { name: string; stops: number[]; lat: number; lon: number };
/** Where a re-plan starts (replanOrigin): the place and the time the rider is there (`fromTime`, seconds on the
 *  service day), and which leg's ride the answer replaces (`rideStep`). From a ride, the stop to get off at. */
export type ReplanOrigin =
  | { kind: 'ride'; from: ReplanPlace; fromTime: number; offAt: StopAlong; rideStep: number }
  | { kind: 'wait'; from: ReplanPlace; fromTime: number; rideStep: number }
  | { kind: 'walk'; from: ReplanPlace; fromTime: number; rideStep: number };
/** Where a re-plan starts: the next stop of the ride (at its expected arrival, delay included), the
 *  boarding stop while waiting, or the stop a walk leads to. Null when there is nothing left to change. */
export function replanOrigin(journey: Journey, state: FollowState, nowSec: number, delay = 0): ReplanOrigin | null {
  const v = view(journey, state, nowSec);
  if (v.kind === 'done' || v.kind === 'final') return null;
  // a stop as the worker hands it out always has its index and position (the type leaves them optional for the page's
  // made-up legs)
  const place = (s: { name: string; stop?: number; lat?: number; lon?: number }): ReplanPlace => ({
    name: s.name,
    stops: [s.stop!],
    lat: s.lat!,
    lon: s.lon!,
  });
  if (v.kind === 'ride') {
    if (v.stopsLeft <= 1 || !v.nextStop) return null;
    const s = v.nextStop;
    return { kind: 'ride', from: place(s), fromTime: s.arr + Math.max(0, delay), offAt: s, rideStep: state.step };
  }
  if (v.kind === 'wait') return { kind: 'wait', from: place(v.leg.from!), fromTime: nowSec, rideStep: state.step };
  const to = v.leg.to;
  if (!v.toRide || !to || to.stop == null) return null;
  return { kind: 'walk', from: place(to), fromTime: Math.max(v.leg.arrive, nowSec), rideStep: state.step + 1 };
}
/** A change between two rides (connections): the seconds to spare, negative when missed; when the rider reaches the
 *  stop (`arr`) and when the ride leaves (`dep`), seconds on the service day, live where a vehicle was seen. */
export type Connection = { sec: number; arr: number; dep: number };
/** What the live data says of the rides' vehicles, by leg index: its arrival at the stop to get off at, its departure
 *  from the boarding stop (seconds on the service day); absent, the planned time stands. */
export type LiveTimes = Record<number, { arrive?: number; depart?: number }>;
/** The changes ahead: for each ride after the first remaining one, the seconds between reaching its stop (the ride
 *  before's arrival, live when known, plus the walks between) and its departure (live when known), with both times.
 *  `live`: by leg index, { arrive?, depart? } of the vehicles seen. Negative: the change is missed. */
export function connections(legs: readonly Leg[], step: number, live: LiveTimes = {}): Record<number, Connection> {
  const out: Record<number, Connection> = {};
  let prev = -1;
  for (let i = step; i < legs.length; i++) {
    const l = legs[i];
    if (l.type !== 'ride') continue;
    if (prev >= 0) {
      let walk = 0;
      for (let k = prev + 1; k < i; k++) walk += legs[k].seconds || 0;
      const lp = live[prev],
        li = live[i];
      const arr = (lp && lp.arrive != null ? lp.arrive : legs[prev].arrive) + walk;
      const dep = li && li.depart != null ? li.depart : l.depart;
      out[i] = { sec: dep - arr, arr, dep };
    }
    prev = i;
  }
  return out;
}
/** The rides of some legs as a key (trip and alighting stop each): equal keys mean the same plan. */
export function ridesKey(legs: readonly Leg[]): string {
  return legs
    .filter((l): l is RideLeg => l.type === 'ride')
    .map((l) => `${l.trip}@${l.to!.stop}`)
    .join('|');
}
export function remainingKey(journey: Journey, state: FollowState): string {
  return ridesKey(journey.legs.slice(state.step));
}
/** The journey and state after switching to an alternative planned from `origin`. */
export function spliceJourney(
  journey: Journey,
  state: FollowState,
  alt: Journey,
  origin: ReplanOrigin,
): { journey: Journey; state: FollowState } {
  const legs = journey.legs;
  let newLegs: Leg[];
  const newState: FollowState = { ...initialState(), startedAt: state.startedAt };
  if (origin.kind === 'ride') {
    const cur = legs[state.step] as RideLeg; // the origin came from the ride at this step (replanOrigin)
    if (alt.legs[0] && alt.legs[0].type === 'ride' && alt.legs[0].trip === cur.trip) {
      // the same vehicle, a different stop to get off at: the new ride starts at the next stop, which is ahead
      newLegs = alt.legs;
      newState.onBoard = true;
      newState.rideIdx = 0;
    } else {
      // get off at the next stop: the current ride, cut there, then the alternative
      const s = origin.offAt;
      const idx = Math.max(
        0,
        cur.stopsAlong!.findIndex((x) => x.stop === s.stop && x.arr === s.arr),
      );
      const along = cur.stopsAlong!.slice(0, idx + 1);
      const trunc: RideLeg = {
        ...cur,
        to: { stop: s.stop, name: s.name, lat: s.lat, lon: s.lon, city: '', code: '' },
        arrive: s.arr,
        seconds: s.arr - cur.depart,
        stops: idx,
        alightPos: cur.boardPos >= 0 ? cur.boardPos + idx : -1,
        pattern: cur.boardPos >= 0 ? cur.pattern : null,
        schedArrive: s.arr,
        stopsAlong: along,
        pathKind: 'stops',
        path: along.map((x) => [x.lat, x.lon]),
      };
      newLegs = [trunc, ...alt.legs];
      newState.onBoard = true;
      newState.rideIdx = Math.min(state.rideIdx, idx);
    }
  } else if (origin.kind === 'wait') {
    newLegs = alt.legs;
  } else {
    newLegs = [legs[state.step], ...alt.legs];
  }
  const rides = newLegs.filter((l) => l.type === 'ride').length;
  return {
    journey: { ...journey, legs: newLegs, arrive: alt.arrive, transfers: Math.max(0, rides - 1) },
    state: newState,
  };
}
