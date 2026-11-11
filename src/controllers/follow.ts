// Following a trip: the state machine (following/follow.ts, pure) advanced by the position and the clock every 5 s on
// the trip as it stands now (trip/now.ts: the plan's legs with the live times of the one store), the current ride's
// vehicles on the map every 30 s, a look for a faster way every minute when there is reason to; alerts on the way; the
// trip kept in the store so it survives a reload, with a bar to come back to it when hidden. The screen (views/follow)
// draws what is published into state/follow.ts.
import * as clock from '../engine/clock.ts';
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
} from '../following/follow.ts';
import { settings, activeTrip } from '../state/store.ts';
import { t } from '../common/i18n';
import { dateOf } from '../common/time';
import { toast } from '../widgets/toast';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as nav from '../state/nav';
import * as follow from '../state/follow';
import { notePos } from '../state/position';
import * as map from '../map/index';
import { lineText } from '../text/travel';
import type { Journey, RideLeg } from '../trip/journey';
import type { Query } from '../trip/query';
import type { ActiveTrip, Alt, Position } from '../state/follow';
import type { FollowView, ReplanOrigin } from '../following/follow.ts';
import * as live from '../state/live';
import * as results from '../state/results';
import { tripNow } from '../trip/now';
import * as liveTimes from './live';
import { effect } from '@preact/signals';
import { ensureAudio, requestAlertPermission, alertUser, tripStatus } from './alerts';
import { whyReplan, pickAlternative, REPLAN } from '../following/replan.ts';
import { statusLine } from '../following/status.ts';
import { isRide } from '../trip/journey';
import { debug } from '../common/debug';

/** The trip being followed, with everything that runs while it is. */
type Following = {
  a: ActiveTrip;
  pos: Position | null;
  watch: number | null;
  timers: number[];
  wake: WakeLockSentinel | null;
  alt: Alt | null;
  dismissed: Record<string, number>;
  replanAt: number;
  replanning: boolean;
  toldKey: string | null;
};
let fol: Following | null = null;
let replanGain = REPLAN.gainSec; // s: changeable from the console for trying (wayliDebug.setReplanGain)

export const isFollowing = (): boolean => fol != null;
/** The followed trip as it stands now: the plan kept in `a.journey` with the live times of the store. Everything
 *  below (the state machine, the screen, the notification, the changes, the look for a faster way) reads this. */
const nowTrip = (a: ActiveTrip): Journey => tripNow(a.journey, live.at, clock.nowOn(a.day));
const rideTrips = (j: Journey): number[] => j.legs.filter(isRide).map((l) => l.trip);
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
  liveTimes.watch('follow', rideTrips(fol!.a.journey), results.result.value?.live);
  follow.publish({ ...fol!.a, journey: nowTrip(fol!.a) }, follow.alt.value); // the map draws the trip from here (map/render.ts)
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
  const { state, events } = advance(nowTrip(a), a.state, pos, clock.nowOn(a.day));
  // saved on the phone only when the machine moved (every 5 s and every fix it mostly does not)
  if (JSON.stringify(state) !== JSON.stringify(a.state)) {
    const moved = setTrip(fol, { state }, true);
    for (const e of events) onFollowEvent(e, moved);
  }
  publish();
}
function onFollowEvent(e: string, a: ActiveTrip): void {
  const v: FollowView = followView(nowTrip(a), a.state, clock.nowOn(a.day));
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
  const now = clock.nowOn(fol.a.day),
    journey = nowTrip(fol.a);
  follow.publish({ ...fol.a, journey }, fol.alt);
  follow.changes.value = connections(journey.legs, fol.a.state.step);
  const sl = statusLine(followView(journey, fol.a.state, now), fol.a.q.to.name, now);
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

/** The current or next ride's vehicles on the map, every 30 s; then a look at whether a faster way is worth asking for. */
async function followLive(): Promise<void> {
  const f = fol;
  if (!f || !map.liveOn()) return;
  const now = clock.nowOn(f.a.day);
  const ride = f.a.journey.legs.find((l, i): l is RideLeg => i >= f.a.state.step && isRide(l));
  if (ride && ride.depart - now <= 3600) await liveTimes.showRideVehicles('follow', 'ride', ride, () => fol === f);
  if (fol === f) void replanCheck();
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
    now = clock.nowOn(a.day),
    journey = nowTrip(a);
  const shift = journey.arrive - a.journey.arrive; // how much later the trip now arrives than when it was started
  const origin: ReplanOrigin | null = replanOrigin(journey, a.state, now, 0);
  if (!origin) {
    replanSkip('nothing left to change');
    if (f.alt) {
      f.alt = null;
      publish();
    }
    return;
  }
  // reasons to look (following/replan.ts): the ride is late, a change ahead is missed, its vehicle is missing close to
  // departure, or five minutes passed
  const nextRide = journey.legs.slice(origin.rideStep).find(isRide);
  const decision = whyReplan({
    force,
    shiftSec: shift,
    missedChange: !!journey.missed,
    liveChecked: live.state.value === 'ok',
    vehicleSeen: !!(nextRide && nextRide.live),
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
      urls: feed.RELAY_URLS,
    });
    if (fol !== f) return;
    const picked = pickAlternative(
      r.journeys,
      {
        key: remainingKey(a.journey, a.state),
        arrive: journey.arrive, // as it stands now: nothing to add to it
        rides: a.journey.legs.slice(a.state.step).filter((l) => l.type === 'ride').length,
        shiftSec: 0,
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
  fol.toldKey = null;
  fol.replanAt = Date.now();
  liveTimes.watch('follow', rideTrips(journey));
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
    liveTimes.unwatch('follow');
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
  // new live times: the trip as it stands now has moved
  effect(() => {
    void live.trips.value;
    if (fol) stepFollow();
  });
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
