// Following a trip: the state machine (follow.js, pure) advanced by the position and the clock every 5 s, the
// remaining rides' vehicles every 30 s (the current or next one for the step card and the map; every one for its
// row, its stops and the change into it), a look for a faster way every minute when there is reason to; alerts on
// the way; the trip kept in the store so it survives a reload, with a bar to come back to it when hidden. The
// screen (features/follow) draws what is published into state/follow.ts.
import * as clock from '../engine/clock.ts';
import * as delays from '../engine/delays.ts';
import * as feed from '../engine/feed.ts';
import {
  initialState,
  aboardState,
  advance,
  view as followView,
  replanOrigin,
  remainingKey,
  isTripOver,
  spliceJourney,
  stepForward,
  stepBack,
  connections,
} from '../journey/follow.ts';
import { settings, activeTrip } from '../state/store.ts';
import { t } from '../lib/i18n';
import { dateOf } from '../lib/time';
import { toast } from '../widgets/toast';
import { call, tripStopsCached, estimate } from '../worker/client';
import * as data from '../state/data';
import * as nav from '../state/nav';
import * as follow from '../state/follow';
import { notePos } from '../state/position';
import * as map from '../map/index';
import { lineText, liveBadge } from '../journey/format';
import type { Journey, Query, RideLeg } from '../journey/types';
import type { ActiveTrip, Alt, Position, LegLive } from '../state/follow';
import type { FollowView, ReplanOrigin } from '../journey/follow.ts';
import type { LiveTime } from '../engine/delays.ts';
import type { Vehicle } from '../engine/feed.ts';
import { ensureAudio, requestAlertPermission, alertUser, tripStatus } from './alerts';
import { whyReplan, pickAlternative, REPLAN } from '../journey/replan.ts';
import { statusLine } from '../journey/status.ts';
import { isRide } from '../journey/types';
import { debug } from '../lib/debug';

type LiveEst = {
  est: { delay: number; [k: string]: unknown } | null;
  at: LiveTime | null;
  shift: number;
} | null;
/** The trip being followed, with everything that runs while it is. */
type Following = {
  a: ActiveTrip;
  pos: Position | null;
  watch: number | null;
  timers: number[];
  wake: WakeLockSentinel | null;
  liveEst: LiveEst;
  legLive: Record<number, LegLive>;
  liveChecked: boolean;
  alt: Alt | null;
  dismissed: Record<string, number>;
  replanAt: number;
  replanning: boolean;
  toldKey: string | null;
};
let fol: Following | null = null;
let replanGain = REPLAN.gainSec; // s: changeable from the console for trying (wayliDebug.setReplanGain)

export const isFollowing = (): boolean => fol != null;
/** A trip over by 45 minutes, or started 12 hours ago, is not resumed. */
const tripStale = (a: ActiveTrip): boolean => isTripOver(a, clock.nowOn(a.day), Date.now());
const stored = (): ActiveTrip | null => activeTrip.get();
/** The trip followed, replaced with what changed (never changed in place: the screen's signal, the store and this
 *  module hold the same object, and a change in place is seen by none of them); saved on the phone when `save`. The
 *  journey and its legs are shared with the old trip, not copied. */
function setTrip(f: Following, patch: Partial<ActiveTrip>, save: boolean): ActiveTrip {
  const a: ActiveTrip = { ...f.a, ...patch };
  f.a = a;
  if (save) activeTrip.set(a);
  return a;
}

export function startTrip(j: Journey, q: Query): void {
  const day = q.day;
  if (clock.nowOn(day) > j.arrive + 1800) {
    toast(t('tripOver'));
    return;
  }
  ensureAudio();
  const firstRide = j.legs.find(isRide);
  const aboard = firstRide && clock.nowOn(day) > firstRide.depart + 60; // started after the ride left: the rider is on it
  const a: ActiveTrip = {
    journey: {
      ...j,
      to: q.to.lat != null && q.to.lon != null ? { name: q.to.name, lat: q.to.lat, lon: q.to.lon } : null,
    },
    q: { from: q.from, to: q.to, bike: q.bike, folding: q.folding },
    day,
    state: aboard ? aboardState(j, clock.nowOn(day)) : initialState(),
    view: 'follow',
    startedAt: Date.now(),
  };
  activeTrip.set(a);
  requestAlertPermission();
  if (!nav.swap('detail', 'follow')) nav.closeAll();
  openFollow(a);
}

function openFollow(trip: ActiveTrip): void {
  if (fol && fol.a !== trip) closeFollow(false);
  const a: ActiveTrip = trip.view === 'follow' ? trip : { ...trip, view: 'follow' };
  if (!fol) {
    const f: Following = {
      a,
      pos: null,
      watch: null,
      timers: [],
      wake: null,
      liveEst: null,
      legLive: {},
      liveChecked: false,
      alt: null,
      dismissed: {},
      replanAt: 0,
      replanning: false,
      toldKey: null,
    };
    fol = f;
    if (navigator.geolocation) {
      f.watch = navigator.geolocation.watchPosition(
        (p) => {
          f.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
          follow.pos.value = f.pos;
          notePos(f.pos.lat, f.pos.lon);
          stepFollow();
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    }
    f.timers = [
      window.setInterval(stepFollow, 5000),
      window.setInterval(followLive, 30000),
      window.setInterval(() => replanCheck(), 60000),
    ];
    requestWake();
  }
  activeTrip.set(fol!.a);
  follow.publish(fol!.a, follow.alt.value); // the map draws the trip from here (map/render.ts)
  // started from the detail, the panel is already 'follow' (swapped in before its trip was published), and a plain
  // redraw would see the same panel and skip it: draw it now
  if (nav.isOpen('follow')) map.redrawMap(true);
  else nav.showOverlay('follow');
  follow.resumable.value = null;
  stepFollow();
}
/** The screen stays on while following (where the browser allows it). */
async function requestWake(): Promise<void> {
  try {
    if (fol && navigator.wakeLock && document.visibilityState === 'visible')
      fol.wake = await navigator.wakeLock.request('screen');
  } catch {
    /* not allowed */
  }
}

/** Advance the state machine with the position (when fresh) and the clock; alert on what happened; publish. */
function stepFollow(): void {
  if (!fol) return;
  const a = fol.a;
  const pos = fol.pos && Date.now() - fol.pos.at < 90000 ? fol.pos : null;
  const { state, events } = advance(a.journey, a.state, pos, clock.nowOn(a.day));
  // saved on the phone only when the machine moved (every 5 s and every fix it mostly does not)
  if (JSON.stringify(state) !== JSON.stringify(a.state)) {
    const moved = setTrip(fol, { state }, true);
    for (const e of events) onFollowEvent(e, moved);
  }
  publish();
}
function onFollowEvent(e: string, a: ActiveTrip): void {
  const v: FollowView = followView(a.journey, a.state, clock.nowOn(a.day));
  if (e === 'getOffNext') {
    const leg = a.journey.legs[a.state.step];
    alertUser(t('alertSoon'), t('getOffAt', { name: leg.to ? leg.to.name : '' }));
  } else if (e === 'getOff') alertUser(t('alertOff'), '');
  else if (e === 'arrived') alertUser(t('alertArrived'), t('arrived'));
  else if (e === 'boarded')
    toast(t('boarded', { line: lineText(v.kind === 'ride' || v.kind === 'wait' ? v.leg.line : '') }));
}
function publish(): void {
  if (!fol) return;
  follow.publish(fol.a, fol.alt);
  const live = fol.liveEst?.at && !fol.liveEst.at.passed ? fol.liveEst.at.time : null; // the stop that matters now
  const now = clock.nowOn(fol.a.day);
  const sl = statusLine(followView(fol.a.journey, fol.a.state, now), fol.a.q.to.name, live, now);
  tripStatus(sl ? sl[0] : null, sl ? sl[1] : '');
  map.showRider(fol.pos);
  if (fol.a.state.done)
    setTimeout(() => {
      if (fol && fol.a.state.done) {
        closeFollow(true);
        nav.close('follow');
        toast(t('arrived'), 4000);
      }
    }, 15000);
}

/** The remaining rides' vehicles, every 30 s. The current or next ride's: on the map, as the step card's badge, and its
 *  shift for re-planning. Every ride's (at most three): its badge at the boarding stop, its stops at their shown times,
 *  and the change into it from the ride before (connections), so a late connecting bus shows, and a missed change
 *  starts a re-plan (2026-10-29, Gadi). */
async function followLive(): Promise<void> {
  if (!fol || !map.liveOn()) return;
  const a = fol.a,
    now = clock.nowOn(a.day),
    legs = a.journey.legs;
  // the rides whose vehicle may be out (within the hour); the changes are computed for every remaining ride regardless,
  // from the planned times where no vehicle is seen
  const rides = legs
    .map((l, i) => ({ l, i }))
    .filter(
      (x): x is { l: RideLeg & { routeId: number | string; firstDep: number }; i: number } =>
        x.i >= a.state.step && isRide(x.l) && x.l.routeId != null && x.l.firstDep != null && x.l.depart - now <= 3600,
    )
    .slice(0, 3);
  const polling = rides.length > 0 && !!data.dayInfo.value && data.dayInfo.value.date === a.day;
  if (!polling) fol.liveEst = null;
  else fol.liveChecked = true;
  try {
    const legLive: Record<number, LegLive> = {},
      times: Record<number, { arrive?: number; depart?: number }> = {};
    let first = true;
    for (const { l: leg, i } of polling ? rides : []) {
      const vs = await feed.vehiclesByLine(leg.routeId);
      if (!fol) return;
      if (first) {
        const statuses = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
        if (!fol) return;
        map.showVehicles('follow', 'ride', {
          vs,
          statuses,
          routeType: leg.routeType,
          mine: leg.trip,
          fallback: { line: leg.line, headsign: leg.headsign, agency: leg.agency, route: leg.route },
        });
      }
      const v = feed.matchTrip(vs, leg.routeId, leg.firstDep, a.day);
      const ts = v ? await tripStopsCached(leg.trip) : null;
      if (!fol) return;
      const est = v && ts ? await estimate(v, ts.stops, a.day) : null;
      if (!fol) return;
      const atBoard = est && ts ? delays.liveAt(est, ts.stops, leg.boardPos) : null;
      const atAlight = est && ts ? delays.liveAt(est, ts.stops, leg.alightPos) : null;
      if (first) {
        // waiting: its time at the stop to board; on board: at the stop to get off at. The shift is how much that moved
        // since the plan, against the planned time at the same stop (docs/architecture.md, "Live times, end to end", rule 6)
        const aboard = a.state.onBoard,
          at = aboard ? atAlight : atBoard;
        fol.liveEst = est && at ? { est, at, shift: at.time - (aboard ? leg.arrive : leg.depart) } : null;
        follow.liveBadge.value = v ? liveBadge(at) : null;
      }
      // the ride's stops at their shown times, the ones the vehicle has passed marked (the current ride's list opens)
      const along = leg.stopsAlong || [];
      const stops =
        est && ts && along.length === leg.alightPos - leg.boardPos + 1
          ? along.map((s, k) => {
              const x = delays.liveAt(est, ts.stops, leg.boardPos + k);
              return { time: x ? x.time : s.arr, passed: !!x && x.passed };
            })
          : null;
      legLive[i] = { badge: liveBadge(atBoard), change: null, stops };
      times[i] = {
        depart: atBoard ? atBoard.time : undefined,
        arrive: atAlight && !atAlight.passed ? atAlight.time : undefined,
      };
      first = false;
    }
    const ch = connections(legs, a.state.step, times) as Record<number, { sec: number; arr: number; dep: number }>;
    for (const k of Object.keys(ch)) {
      const i = +k;
      if (legLive[i]) legLive[i].change = ch[i];
      else legLive[i] = { badge: null, change: ch[i], stops: null };
    }
    fol.legLive = legLive;
    follow.legLive.value = legLive;
    publish();
    if (polling) replanCheck();
  } catch {
    /* live is a bonus */
  }
}

// ---- re-planning on the way: when delays make another way faster, say so and offer to switch
const replanSkip = (why: string) => {
  debug('lastReplan', { skipped: why });
};
async function replanCheck(force = false): Promise<void> {
  if (!fol || fol.replanning) return;
  if (!map.liveOn() || !data.dayInfo.value || data.dayInfo.value.date !== fol.a.day || document.hidden) {
    let why = 'other day';
    if (!map.liveOn()) why = 'live off';
    else if (document.hidden) why = 'hidden';
    replanSkip(why);
    return;
  }
  const f = fol,
    a = f.a,
    now = clock.nowOn(a.day);
  const shift = f.liveEst ? f.liveEst.shift : 0; // how much the ride moved since it was planned
  const origin: ReplanOrigin | null = replanOrigin(a.journey, a.state, now, shift);
  if (!origin) {
    replanSkip('nothing left to change');
    if (f.alt) {
      f.alt = null;
      publish();
    }
    return;
  }
  // reasons to look (journey/replan.ts): the ride is late, a change ahead is missed, its vehicle is missing close to
  // departure, or five minutes passed
  const nextRide = a.journey.legs.slice(origin.rideStep).find((l) => l.type === 'ride');
  const decision = whyReplan({
    force,
    shiftSec: shift,
    missedChange: Object.values(f.legLive).some((x) => x.change != null && x.change.sec < 0),
    liveChecked: f.liveChecked,
    vehicleSeen: !!f.liveEst,
    nextRideInSec: nextRide ? nextRide.depart - now : null,
    sinceLastMs: Date.now() - f.replanAt,
  });
  if (!decision.look) {
    replanSkip(decision.why);
    return;
  }
  f.replanning = true;
  f.replanAt = Date.now();
  try {
    let vehicles: Vehicle[] | null = null;
    try {
      vehicles = await feed.vehiclesForPlanning(origin.from.lat, origin.from.lon, { timeoutMs: 8000, radiusKm: 8 });
    } catch {
      vehicles = null;
    }
    if (fol !== f) return;
    const q = a.q;
    const r = await call('plan', {
      from: origin.from,
      to: q.to,
      fromTime: origin.fromTime,
      toTime: origin.fromTime + 3600,
      bike: q.bike === 'along' ? 'along' : 'none',
      folding: !!q.folding,
      weekday: dateOf(a.day).getDay() <= 4,
      maxWalk: settings.get().maxWalk * 60,
      vehicles,
    });
    if (fol !== f) return;
    const picked = pickAlternative(
      r.journeys,
      {
        key: remainingKey(a.journey, a.state),
        arrive: a.journey.arrive,
        rides: a.journey.legs.slice(a.state.step).filter((l) => l.type === 'ride').length,
        shiftSec: shift,
      },
      { gainSec: replanGain, dismissed: f.dismissed, nowMs: Date.now() },
    );
    const best: Alt | null = picked.best && { ...picked.best, origin };
    const curArrive = picked.arrive,
      same = picked.same;
    f.alt = best;
    debug('lastReplan', {
      origin,
      found: r.journeys.length,
      curArrive,
      same,
      best: best && { arrive: best.journey.arrive, gain: best.gain, key: best.key },
    });
    publish();
    if (best && best.key !== f.toldKey) {
      f.toldKey = best.key;
      toast(t('fasterWay'), 5000);
      try {
        if (settings.get().sound && navigator.vibrate) navigator.vibrate(200);
      } catch {
        /* no vibration */
      }
    }
  } catch (e) {
    replanSkip('failed: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    f.replanning = false;
  }
}
/** The faster way proposed, taken: spliced into the trip from where the rider joins it. */
export function switchJourney(alt: Alt): void {
  if (!fol) return;
  const a = fol.a;
  const { journey, state } = spliceJourney(a.journey, a.state, alt.journey, alt.origin);
  setTrip(fol, { journey, state, replanned: (a.replanned || 0) + 1 }, true);
  fol.alt = null;
  fol.liveEst = null;
  fol.toldKey = null;
  fol.replanAt = Date.now();
  follow.liveBadge.value = null;
  map.redrawMap(true);
  stepFollow();
  followLive();
  toast(t('routeSwitched'));
}
/** "Next step" or "Back": the rider corrects the state machine by hand (the step reached is held from the clock). */
function step(dir: 1 | -1): void {
  if (!fol) return;
  const a = fol.a;
  setTrip(fol, { state: dir > 0 ? stepForward(a.journey, a.state) : stepBack(a.journey, a.state) }, true);
  publish();
}
/** Stop following: `end` forgets the trip; otherwise it stays stored and the resume bar offers it. */
export function closeFollow(end: boolean): void {
  if (fol) {
    if (fol.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(fol.watch);
    for (const id of fol.timers) clearInterval(id);
    if (fol.wake) {
      try {
        fol.wake.release();
      } catch {
        /* already released */
      }
    }
    if (end) activeTrip.clear();
    else activeTrip.set({ ...fol.a, view: 'hidden' });
    fol = null;
    follow.publish(null);
    follow.liveBadge.value = null;
    tripStatus(null);
  }
  map.showVehicles('follow', 'ride', null);
  map.showRider(null);
  updateResumeBar();
}
function updateResumeBar(): void {
  const a = stored();
  if (!a || fol || tripStale(a)) {
    follow.resumable.value = null;
    if (a && tripStale(a)) activeTrip.clear();
    return;
  }
  follow.resumable.value = a;
}
/** At start, a trip in progress comes back first, timetable or not: on screen if it was, else as the resume bar. */
export function resumeAtStart(): void {
  const a = stored();
  if (a && !tripStale(a)) {
    updateResumeBar();
    if (a.view === 'follow') openFollow(a);
  } else if (a) activeTrip.clear();
}

/** "Next step" and "Back": the rider corrects the state machine by hand. */
export const skipStep = (): void => step(1);
export const backStep = (): void => step(-1);
/** The trip is over: forgotten, its screen closed. */
export function endTrip(): void {
  closeFollow(true);
  nav.close('follow');
  toast(t('tripEnded'));
}
/** The follow screen folded away; the trip goes on and the resume bar offers it. */
export const hideFollow = (): void => nav.close('follow');
/** The resume bar tapped: the stored trip's screen again, over everything. */
export function resumeTrip(): void {
  const a = stored();
  if (a) {
    nav.closeAll();
    openFollow(a);
  }
}
/** The faster way proposed, declined: not again for a while. */
export function dismissAlt(alt: Alt): void {
  if (!fol) return;
  fol.dismissed[alt.key] = Date.now();
  fol.alt = null;
  publish();
}

/** Start: the screen kept on and the trip stepped when the phone is looked at again; the resume bar kept current; the followed vehicle once the map has drawn the trip; the console's re-plan helpers. */
export function install(): void {
  document.addEventListener('visibilitychange', () => {
    if (fol && document.visibilityState === 'visible') {
      requestWake();
      stepFollow();
    }
  });
  // for trying at the console: re-plan now, or with another gain
  debug('replan', () => replanCheck(true));
  debug('setReplanGain', (g: number) => {
    replanGain = g;
  });
  // a phone keeps the app open for days: a trip over since goes from the resume bar on return and within a minute
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateResumeBar();
  });
  window.setInterval(updateResumeBar, 60000);
  // the followed trip's vehicle and the rider, once the map has drawn the trip
  map.afterDraw.follow = () => {
    if (fol) {
      stepFollow();
      followLive();
    }
  };
}
