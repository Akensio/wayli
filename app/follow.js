// Wayli follow mode, the part without a screen: where the rider is along a journey, what to tell them,
// and when. Pure functions over the journey (as the worker returns it), the rider's position and the
// clock, so it can be tested in Node and the UI just renders the result.
//
// A journey is a list of legs: access (walk/bike from the start to a stop), ride, walk (between stops),
// egress (from a stop to the destination). The state points at the current leg and, on a ride, whether
// the rider is still waiting for the vehicle or on it.

import { metres } from './live.js';

const AT_STOP = 60;        // m: close enough to count as being at a stop or the destination
const NEAR_ALIGHT = 350;   // m: when the alighting stop is this close, say "get off at the next stop"

export function initialState() { return { step: 0, onBoard: false, rideIdx: 0, alerted: {}, done: false, startedAt: Date.now() }; }

/** Walking legs end at a stop or the destination; where is that? */
function legEnd(journey, leg) {
  if (leg.type === 'egress') return journey.to || null;
  if (leg.to && leg.to.lat != null) return leg.to;
  return null;
}
function near(pos, pt, radius) {
  if (!pos || !pt || pt.lat == null) return false;
  return metres(pos.lat, pos.lon, pt.lat, pt.lon) <= Math.max(radius, Math.min(pos.acc || 0, 120));
}

/**
 * Advance the state from a position (or null) and the time (seconds on the service day).
 * Returns { state, events } where events are from: 'reached' (a walk ended), 'boarded', 'getOffNext',
 * 'getOff', 'arrived'. A time-based fallback keeps the follower moving when there is no position.
 */
export function advance(journey, state, pos, nowSec) {
  const s = { ...state, alerted: { ...state.alerted } };
  const events = [];
  const legs = journey.legs;
  let guard = 0;
  while (!s.done && s.step < legs.length && guard++ < 10) {
    const leg = legs[s.step];
    const last = s.step === legs.length - 1;
    if (leg.type !== 'ride') {
      const end = legEnd(journey, leg);
      const there = near(pos, end, AT_STOP);
      const overdue = nowSec > leg.arrive + (pos ? 900 : 180);
      if (!there && !overdue) break;
      if (last) { s.done = true; events.push('arrived'); break; }
      s.step++; events.push('reached');
      continue;
    }
    // a ride: waiting at the boarding stop, then on board
    const stops = leg.stopsAlong || [];
    const lastIdx = stops.length - 1;
    if (!s.onBoard) {
      // on board once the rider has left the boarding stop along the route, or the vehicle should be gone
      let idx = 0;
      if (pos && stops.length > 1) idx = nearestStop(pos, stops, 0);
      const moved = pos && idx >= 1 && !near(pos, stops[0], 150);
      const gone = nowSec > leg.depart + (pos ? 600 : 90);
      if (!moved && !gone) break;
      s.onBoard = true; s.rideIdx = Math.max(0, idx); events.push('boarded');
    }
    if (pos && stops.length > 1) {
      const idx = nearestStop(pos, stops, s.rideIdx);
      if (idx > s.rideIdx) s.rideIdx = idx;
    } else if (stops.length > 1) {
      // no position: follow the clock
      let idx = s.rideIdx;
      while (idx < lastIdx && nowSec >= stops[idx + 1].arr) idx++;
      s.rideIdx = idx;
    }
    const alightSoon = s.rideIdx >= lastIdx - 1 || (pos && near(pos, stops[lastIdx], NEAR_ALIGHT)) || (!pos && nowSec >= leg.arrive - 120);
    if (alightSoon && !s.alerted['soon' + s.step]) { s.alerted['soon' + s.step] = true; events.push('getOffNext'); }
    const atAlight = (pos && near(pos, stops[lastIdx], AT_STOP + 20)) || (!pos && nowSec >= leg.arrive + 30) || (pos && nowSec >= leg.arrive + 900);
    if (!atAlight) break;
    if (!s.alerted['off' + s.step]) { s.alerted['off' + s.step] = true; events.push('getOff'); }
    s.onBoard = false; s.rideIdx = 0;
    if (last) { s.done = true; events.push('arrived'); break; }
    s.step++;
  }
  if (s.step >= legs.length && !s.done) { s.done = true; events.push('arrived'); }
  return { state: s, events };
}

/** The stop of a ride the rider is at or has just passed; never behind where they already were. */
export function nearestStop(pos, stops, fromIdx) {
  let best = fromIdx, bd = Infinity;
  for (let i = fromIdx; i < stops.length; i++) {
    const d = metres(pos.lat, pos.lon, stops[i].lat, stops[i].lon);
    if (d < bd) { bd = d; best = i; }
  }
  // between two stops: count the one behind as reached once the next one is nearer than the previous
  if (best > fromIdx && bd > 400) return fromIdx;
  return best;
}

/** What to show now. */
export function view(journey, state, nowSec) {
  const legs = journey.legs;
  if (state.done || state.step >= legs.length) return { kind: 'done' };
  const leg = legs[state.step];
  const nextRide = legs.slice(state.step + (leg.type === 'ride' ? 1 : 0)).find((l) => l.type === 'ride');
  if (leg.type !== 'ride') {
    const toRide = legs[state.step + 1] && legs[state.step + 1].type === 'ride' ? legs[state.step + 1] : null;
    return { kind: leg.type === 'egress' ? 'final' : 'walk', leg, toRide, minutes: Math.max(1, Math.round(leg.seconds / 60)), departsIn: toRide ? Math.round((toRide.depart - nowSec) / 60) : null };
  }
  const stops = leg.stopsAlong || [];
  const lastIdx = stops.length - 1;
  if (!state.onBoard) return { kind: 'wait', leg, departsIn: Math.round((leg.depart - nowSec) / 60), stopsLeft: lastIdx };
  const stopsLeft = Math.max(0, lastIdx - state.rideIdx);
  const nextStop = stops[Math.min(lastIdx, state.rideIdx + 1)];
  return { kind: 'ride', leg, stopsLeft, nextStop, alight: stops[lastIdx], arrivesIn: Math.round((leg.arrive - nowSec) / 60), after: legs[state.step + 1] || null, nextRide };
}

// ------------------------------------------------------------------ re-planning on the way
// Delays can make another way faster: get off a stop early and take another line, or take a different
// line than the one being waited for. The planner answers from the stop the rider reaches next, at the
// time they will be there; these helpers say where that is, whether an answer is the plan already
// followed, and how to splice a chosen alternative into the journey.

/** Where a re-plan starts: the next stop of the ride (at its expected arrival, delay included), the
 *  boarding stop while waiting, or the stop a walk leads to. Null when there is nothing left to change. */
export function replanOrigin(journey, state, nowSec, delay = 0) {
  const v = view(journey, state, nowSec);
  if (v.kind === 'done' || v.kind === 'final') return null;
  const place = (s) => ({ name: s.name, stops: [s.stop], lat: s.lat, lon: s.lon });
  if (v.kind === 'ride') {
    if (v.stopsLeft <= 1 || !v.nextStop) return null;
    const s = v.nextStop;
    return { kind: 'ride', from: place(s), fromTime: s.arr + Math.max(0, delay), offAt: s, rideStep: state.step };
  }
  if (v.kind === 'wait') return { kind: 'wait', from: place(v.leg.from), fromTime: nowSec, rideStep: state.step };
  const to = v.leg.to;
  if (!v.toRide || !to || to.stop == null) return null;
  return { kind: 'walk', from: place(to), fromTime: Math.max(v.leg.arrive, nowSec), rideStep: state.step + 1 };
}
/** The rides of some legs as a key (trip and alighting stop each): equal keys mean the same plan. */
export function ridesKey(legs) { return legs.filter((l) => l.type === 'ride').map((l) => `${l.trip}@${l.to.stop}`).join('|'); }
export function remainingKey(journey, state) { return ridesKey(journey.legs.slice(state.step)); }
/** The journey and state after switching to an alternative planned from `origin`. */
export function spliceJourney(journey, state, alt, origin) {
  const legs = journey.legs;
  let newLegs;
  const newState = { ...initialState(), startedAt: state.startedAt };
  if (origin.kind === 'ride') {
    const cur = legs[state.step];
    if (alt.legs[0] && alt.legs[0].type === 'ride' && alt.legs[0].trip === cur.trip) {
      // the same vehicle, a different stop to get off at: the new ride starts at the next stop, which is ahead
      newLegs = alt.legs;
      newState.onBoard = true; newState.rideIdx = 0;
    } else {
      // get off at the next stop: the current ride, cut there, then the alternative
      const s = origin.offAt;
      const idx = Math.max(0, cur.stopsAlong.findIndex((x) => x.stop === s.stop && x.arr === s.arr));
      const along = cur.stopsAlong.slice(0, idx + 1);
      const trunc = { ...cur, to: { stop: s.stop, name: s.name, lat: s.lat, lon: s.lon, city: '', code: '' }, arrive: s.arr, seconds: s.arr - cur.depart, stops: idx,
        alightPos: cur.boardPos >= 0 ? cur.boardPos + idx : -1, pattern: cur.boardPos >= 0 ? cur.pattern : null, schedArrive: s.arr, stopsAlong: along, pathKind: 'stops', path: along.map((x) => [x.lat, x.lon]) };
      newLegs = [trunc, ...alt.legs];
      newState.onBoard = true; newState.rideIdx = Math.min(state.rideIdx, idx);
    }
  } else if (origin.kind === 'wait') {
    newLegs = alt.legs;
  } else {
    newLegs = [legs[state.step], ...alt.legs];
  }
  const rides = newLegs.filter((l) => l.type === 'ride').length;
  return { journey: { ...journey, legs: newLegs, arrive: alt.arrive, transfers: Math.max(0, rides - 1) }, state: newState };
}
