// Following a trip: the state machine (follow.js, pure) advanced by the position and the clock every 5 s, the
// next ride's vehicle every 30 s, a look for a faster way every minute when there is reason to; alerts on the
// way; the trip kept in the store so it survives a reload, with a bar to come back to it when hidden. The
// screen (features/follow) draws what is published into state/follow.ts.
import * as live from '../live.js';
import { initialState, aboardState, advance, view as followView, replanOrigin, ridesKey, remainingKey, spliceJourney } from '../follow.js';
import { settings, activeTrip } from '../store.js';
import { t } from '../i18n';
import { dateOf } from '../time';
import { toast } from '../ui/toast';
import { call, tripStopsCached } from '../worker/client';
import * as data from '../state/data';
import * as nav from '../state/nav';
import * as follow from '../state/follow';
import { notePos } from '../state/position';
import * as map from '../map/index';
import { lineText, liveBadge } from '../journey/format';
import type { Journey, Query, PlanResult } from '../journey/types';
import type { ActiveTrip, Alt, FollowState, Position } from '../state/follow';
import { ensureAudio, requestAlertPermission, alertUser } from './alerts';

type LiveEst = { est: { delay: number; [k: string]: unknown } | null; at: unknown } | null;
/** The trip being followed, with everything that runs while it is. */
type Following = {
  a: ActiveTrip; pos: Position | null; watch: number | null; timers: number[]; wake: WakeLockSentinel | null;
  liveEst: LiveEst; liveChecked: boolean; alt: Alt | null; dismissed: Record<string, number>; replanAt: number; replanning: boolean; toldKey: string | null;
};
let fol: Following | null = null;
let replanGain = 240;   // s: an alternative has to arrive this much earlier (plus 3 min per extra transfer) to be proposed

export const isFollowing = (): boolean => fol != null;
/** A trip over by 45 minutes, or started 12 hours ago, is not resumed. */
const tripStale = (a: ActiveTrip): boolean => live.nowOn(a.day) > a.journey.arrive + 2700 || Date.now() - (a.startedAt || 0) > 12 * 3600e3;
const stored = (): ActiveTrip | null => activeTrip.get() as ActiveTrip | null;

export function startTrip(j: Journey, q: Query): void {
  const day = q.day;
  if (live.nowOn(day) > j.arrive + 1800) { toast(t('tripOver')); return; }
  ensureAudio();
  const firstRide = j.legs.find((l) => l.type === 'ride');
  const aboard = firstRide && live.nowOn(day) > firstRide.depart! + 60;   // started after the ride left: the rider is on it
  const a: ActiveTrip = {
    journey: { ...j, to: q.to.lat != null ? { name: q.to.name, lat: q.to.lat, lon: q.to.lon } : null },
    q: { from: q.from, to: q.to, bike: q.bike, folding: q.folding }, day,
    state: (aboard ? aboardState(j, live.nowOn(day)) : initialState()) as FollowState, view: 'follow', startedAt: Date.now(),
  };
  activeTrip.set(a);
  requestAlertPermission();
  if (!nav.swap('detail', 'follow')) nav.closeAll();
  openFollow(a);
}

export function openFollow(a: ActiveTrip): void {
  if (fol && fol.a !== a) closeFollow(false);
  if (!fol) {
    const f: Following = { a, pos: null, watch: null, timers: [], wake: null, liveEst: null, liveChecked: false, alt: null, dismissed: {}, replanAt: 0, replanning: false, toldKey: null };
    fol = f;
    if (navigator.geolocation) {
      f.watch = navigator.geolocation.watchPosition((p) => {
        f.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
        follow.pos.value = f.pos; notePos(f.pos.lat, f.pos.lon); stepFollow();
      }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
    f.timers = [window.setInterval(stepFollow, 5000), window.setInterval(followLive, 30000), window.setInterval(() => replanCheck(), 60000)];
    requestWake();
  }
  a.view = 'follow'; activeTrip.set(a);
  map.mapOf.follow = async (drawSeq) => {
    const m = await map.mapReady();
    if (!m || !fol || fol.a !== a || map.stale(drawSeq)) return;
    await map.withCourses(a.journey);
    if (!fol || fol.a !== a || map.stale(drawSeq)) return;
    map.fitMap(map.drawJourney(m, a.journey, map.markers.journey), 16);
    stepFollow(); followLive();
  };
  nav.showOverlay('follow');
  follow.resumable.value = null;
  stepFollow();
}
/** The screen stays on while following (where the browser allows it). */
async function requestWake(): Promise<void> {
  try { if (fol && navigator.wakeLock && document.visibilityState === 'visible') fol.wake = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => { if (fol && document.visibilityState === 'visible') { requestWake(); stepFollow(); } });

/** Advance the state machine with the position (when fresh) and the clock; alert on what happened; publish. */
function stepFollow(): void {
  if (!fol) return;
  const a = fol.a;
  const pos = fol.pos && Date.now() - fol.pos.at < 90000 ? fol.pos : null;
  const { state, events } = advance(a.journey, a.state, pos, live.nowOn(a.day));
  a.state = state as FollowState;
  activeTrip.set(a);
  for (const e of events) onFollowEvent(e, a);
  publish();
}
function onFollowEvent(e: string, a: ActiveTrip): void {
  const v: any = followView(a.journey, a.state, live.nowOn(a.day));
  if (e === 'getOffNext') { const leg = a.journey.legs[a.state.step]; alertUser(t('alertSoon'), t('alertSoonBody', { name: leg.to ? leg.to.name : '' })); }
  else if (e === 'getOff') alertUser(t('alertOff'), '');
  else if (e === 'arrived') alertUser(t('alertArrived'), t('arrived'));
  else if (e === 'boarded') toast(t('boarded', { line: lineText(v.leg ? v.leg.line : '') }));
}
/** The screen draws from the published trip; the map gets the rider's dot here. */
function publish(): void {
  if (!fol) return;
  follow.publish(fol.a, fol.alt);
  if (map.mapState.drawnFor === 'follow' && fol.pos) map.drawMe(fol.pos);
  if (fol.a.state.done) setTimeout(() => { if (fol && fol.a.state.done) { closeFollow(true); nav.close('follow'); toast(t('arrived'), 4000); } }, 15000);
}

/** The vehicle of the current or next ride, every 30 s: on the map, as a badge, and its delay for re-planning. */
async function followLive(): Promise<void> {
  if (!fol || !map.liveOn()) return;
  const a = fol.a, now = live.nowOn(a.day);
  const leg = a.journey.legs.slice(a.state.step).find((l) => l.type === 'ride');
  if (!leg || leg.routeId == null || leg.depart! - now > 3600 || !data.dayInfo.value || data.dayInfo.value.date !== a.day) { fol.liveEst = null; return; }
  fol.liveChecked = true;
  try {
    const vs = await live.vehiclesByLine(leg.routeId);
    if (!fol) return;
    const statuses: any[] = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
    if (!fol) return;
    for (const mk of map.markers.followVehicle.splice(0)) mk.remove();
    const m = map.mapState.main;
    if (m && map.mapState.drawnFor === 'follow') map.lineVehicleMarkers(m, map.markers.followVehicle, vs, statuses, leg.routeType!, leg.trip!, { line: leg.line, headsign: leg.headsign, agency: leg.agency, route: leg.route as number });
    const v = live.matchTrip(vs, leg.routeId, leg.firstDep, a.day);
    if (!v) { fol.liveEst = null; follow.liveBadge.value = null; publish(); replanCheck(); return; }
    const ts = await tripStopsCached(leg.trip!);
    if (!fol) return;
    const est = live.estimateDelay(v, ts.stops, a.day);
    const at = live.liveAt(est, ts.stops, leg.boardPos);
    fol.liveEst = est ? { est, at } : null;
    follow.liveBadge.value = at ? liveBadge(at) : null;
    publish();
    replanCheck();
  } catch { /* live is a bonus */ }
}

// ---- re-planning on the way: when delays make another way faster, say so and offer to switch
const replanSkip = (why: string) => { try { window.wayliDebug = { ...(window.wayliDebug || {}), lastReplan: { skipped: why } }; } catch { /* debugging only */ } };
async function replanCheck(force = false): Promise<void> {
  if (!fol || fol.replanning) return;
  if (!map.liveOn() || !data.dayInfo.value || data.dayInfo.value.date !== fol.a.day || document.hidden) { replanSkip(!map.liveOn() ? 'live off' : document.hidden ? 'hidden' : 'other day'); return; }
  const f = fol, a = f.a, now = live.nowOn(a.day);
  const delay = f.liveEst && f.liveEst.est ? f.liveEst.est.delay : 0;
  const origin: any = replanOrigin(a.journey, a.state, now, delay);
  if (!origin) { replanSkip('nothing left to change'); if (f.alt) { f.alt = null; publish(); } return; }
  // reasons to look: the ride is late, its vehicle is missing close to departure, or five minutes passed
  const nextRide = a.journey.legs.slice(origin.rideStep).find((l) => l.type === 'ride');
  const late = delay >= 180;
  const missing = f.liveChecked && !f.liveEst && nextRide && nextRide.depart! - now < 600 && nextRide.depart! - now > -300;
  const due = Date.now() - f.replanAt > 300000;
  if (!force && !(late || missing || due)) { replanSkip('no reason yet'); return; }
  if (!force && Date.now() - f.replanAt < 90000) { replanSkip('too soon'); return; }
  f.replanning = true; f.replanAt = Date.now();
  try {
    let vehicles: unknown[] | null = null;
    try { vehicles = await live.vehiclesForPlanning(origin.from.lat, origin.from.lon, { timeoutMs: 8000, radiusKm: 8 }); } catch { vehicles = null; }
    if (fol !== f) return;
    const q = a.q;
    const r = await call<PlanResult>('plan', { from: origin.from, to: q.to, fromTime: origin.fromTime, toTime: origin.fromTime + 3600, bike: q.bike === 'along' ? 'along' : 'none', folding: !!q.folding, weekday: dateOf(a.day).getDay() <= 4, maxWalk: settings.get().maxWalk * 60, vehicles });
    if (fol !== f) return;
    const curKey = remainingKey(a.journey, a.state);
    const remainingRides = a.journey.legs.slice(a.state.step).filter((l) => l.type === 'ride').length;
    let curArrive = a.journey.arrive + Math.max(0, delay);
    const same = r.journeys.find((j) => ridesKey(j.legs) === curKey);
    if (same) curArrive = Math.min(curArrive, same.arrive);   // staying, with the delays the planner knows of
    let best: Alt | null = null;
    for (const j of r.journeys) {
      const key = ridesKey(j.legs) || 'walk';
      if (key === curKey) continue;
      const rides = j.legs.filter((l) => l.type === 'ride').length;
      if (curArrive - j.arrive < replanGain + 180 * Math.max(0, rides - remainingRides)) continue;
      if (f.dismissed[key] && Date.now() - f.dismissed[key] < 900000) continue;
      best = { journey: j, origin, key, gain: curArrive - j.arrive };
      break;
    }
    f.alt = best;
    try { window.wayliDebug = { ...(window.wayliDebug || {}), lastReplan: { origin, found: r.journeys.length, curArrive, same: !!same, best: best && { arrive: best.journey.arrive, gain: best.gain, key: best.key } } }; } catch { /* debugging only */ }
    publish();
    if (best && best.key !== f.toldKey) { f.toldKey = best.key; toast(t('fasterWay'), 5000); try { if (settings.get().sound && navigator.vibrate) navigator.vibrate(200); } catch { /* no vibration */ } }
  } catch (e) { replanSkip('failed: ' + (e instanceof Error ? e.message : String(e))); } finally { f.replanning = false; }
}
function switchJourney(alt: Alt): void {
  if (!fol) return;
  const a = fol.a;
  const { journey, state } = spliceJourney(a.journey, a.state, alt.journey, alt.origin);
  a.journey = journey; a.state = state as FollowState; a.replanned = (a.replanned || 0) + 1;
  fol.alt = null; fol.liveEst = null; fol.toldKey = null; fol.replanAt = Date.now();
  activeTrip.set(a);
  follow.liveBadge.value = null;
  map.redrawMap(true);
  stepFollow(); followLive();
  toast(t('routeSwitched'));
}
try { window.wayliDebug = { ...(window.wayliDebug || {}), replan: () => replanCheck(true), setReplanGain: (g: number) => { replanGain = g; } }; } catch { /* debugging only */ }
/** "Next step": the rider says the state machine lags behind. */
function skipStep(): void {
  if (!fol) return;
  const a = fol.a, legs = a.journey.legs, s = a.state;
  const leg = legs[s.step];
  if (leg && leg.type === 'ride' && !s.onBoard) { s.onBoard = true; s.rideIdx = 0; }
  else if (s.step >= legs.length - 1) { s.done = true; }
  else { s.step++; s.onBoard = false; s.rideIdx = 0; }
  activeTrip.set(a); publish();
}
/** Stop following: `end` forgets the trip; otherwise it stays stored and the resume bar offers it. */
export function closeFollow(end: boolean): void {
  if (fol) {
    if (fol.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(fol.watch);
    for (const id of fol.timers) clearInterval(id);
    if (fol.wake) { try { fol.wake.release(); } catch { /* already released */ } }
    if (end) activeTrip.clear(); else { fol.a.view = 'hidden'; activeTrip.set(fol.a); }
    fol = null;
    follow.publish(null); follow.liveBadge.value = null;
  }
  for (const mk of map.markers.followVehicle.splice(0)) mk.remove();
  if (map.markers.me) { map.markers.me.remove(); map.markers.me = null; }
  delete map.mapOf.follow;
  updateResumeBar();
}
function updateResumeBar(): void {
  const a = stored();
  if (!a || fol || tripStale(a)) { follow.resumable.value = null; if (a && tripStale(a)) activeTrip.clear(); return; }
  follow.resumable.value = a;
}
/** At start, a trip in progress comes back first, timetable or not: on screen if it was, else as the resume bar. */
export function resumeAtStart(): void {
  const a = stored();
  if (a && !tripStale(a)) { updateResumeBar(); if (a.view === 'follow') openFollow(a); } else if (a) activeTrip.clear();
}

Object.assign(follow.hooks, {
  skip: () => skipStep(),
  end: () => { closeFollow(true); nav.close('follow'); toast(t('tripEnded')); },
  hide: () => nav.close('follow'),
  resume: () => { const a = stored(); if (a) { nav.closeAll(); openFollow(a); } },
  switchTo: (alt: Alt) => switchJourney(alt),
  dismiss: (alt: Alt) => { if (!fol) return; fol.dismissed[alt.key] = Date.now(); fol.alt = null; publish(); },
});
