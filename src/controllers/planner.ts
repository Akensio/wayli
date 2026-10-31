// Planning: from the bar's places and options to results. "My location" is resolved at the moment of planning;
// a plan from now takes the delays of the vehicles on the road into account. Also: a destination chosen
// anywhere (a bubble, a saved place) planned from where you are, the last search shown again, the plan cleared.
import { effect } from '@preact/signals';
import * as clock from '../engine/clock.ts';
import * as feed from '../engine/feed.ts';
import type { Vehicle } from '../engine/feed.ts';
import { settings, recentPlaces, recentTrips, lastSearch } from '../state/store.ts';
import { t, lang } from '../lib/i18n';
import { dateOf } from '../lib/time';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as search from '../state/search';
import * as results from '../state/results';
import * as sheet from '../state/sheet';
import * as nav from '../state/nav';
import { lastPos, getPosition } from '../state/position';
import * as map from '../map/index';
import { toast } from '../widgets/toast';
import type { Place } from '../state/search';
import type { Query } from '../journey/types';
import { planWindow, withLive } from '../journey/query.ts';

import { openLine } from './line';
import { openStop } from './stop';
import { chooseStation, openStation, openTrains } from './station';
import * as stopPage from '../state/stop';
import { openDetail } from './detail';
import * as query from '../state/query';

type Shared = Parameters<typeof search.applyQuery>[0];

function showPlanError(msg: string): void {
  results.error.value = msg;
  if (msg && sheet.state.value === 'peek') sheet.set('half');
}

/** A shared link's plan: from and to as "lat,lon,name", the day, the time, the bicycle, arrive-by. */
export function parseShared(params: URLSearchParams): Shared | null {
  const pt = (s: string | null): Place | null => {
    if (!s) return null;
    const [lat, lon, ...rest] = s.split(',');
    const name = decodeURIComponent(rest.join(',')) || `${lat}, ${lon}`;
    return Number.isNaN(+lat) ? null : { name, lat: +lat, lon: +lon };
  };
  const from = pt(params.get('from')),
    to = pt(params.get('to'));
  if (!from || !to) return null;
  return {
    from,
    to,
    day: params.get('day') || '',
    at: params.get('at') || '',
    bike: params.get('bike') || 'none',
    folding: params.get('folding') === '1',
    arriveBy: params.get('mode') === 'arrive',
  };
}

let waiting = false;
let planSeq = 0; // the newest plan asked for: an older one finishing later is dropped
export async function plan(opts: { maxWalk?: number } = {}): Promise<void> {
  const my = ++planSeq;
  showPlanError('');
  if (!search.from.value || !search.to.value) {
    showPlanError(t('pickBoth'));
    return;
  }
  if (!data.ttReady.value) {
    waiting = true;
    return;
  } // a new day's timetable is loading: planned once it is in
  waiting = false;
  for (const side of ['from', 'to'] as const) {
    // "my location" is resolved now, not when it was chosen
    const p = search.sides[side].value!;
    if (p.transient && p.lat == null) {
      search.texts[side].value = t('locating');
      try {
        const pos = await getPosition();
        if (my !== planSeq) return;
        search.setPlace(side, search.myLocation(pos));
      } catch {
        if (my !== planSeq) return;
        search.texts[side].value = t('myLoc');
        showPlanError(t('noLocation'));
        return;
      }
    }
  }
  // a plan from now is from now: the service day may have turned (03:00) since the bar was set, and resetNow loads
  // that day's timetable through the day hook; the plan then waits for it like any other day change
  if (!query.timeTouched.value) {
    query.resetNow();
    if (!data.ttReady.value) {
      waiting = true;
      return;
    }
  }
  if (!nav.stack.value.some((e) => e.kind === 'plan')) nav.push({ kind: 'plan' }); // the back button clears the plan
  const from = search.from.value!,
    to = search.to.value!,
    day = query.day.value;
  const weekday = dateOf(day).getDay() <= 4;
  const bike = query.bike.value,
    folding = query.folding.value,
    arriveBy = query.timeMode.value === 'arrive';
  const at = query.atSeconds();
  const isNow = !query.timeTouched.value && !arriveBy;
  const { fromTime, toTime } = planWindow(at, arriveBy, isNow); // journey/query.ts
  const maxWalk = (opts.maxWalk || settings.get().maxWalk) * 60;
  search.busy.value = true;
  results.status.value = 'planning';
  search.optOpen.value = '';
  const q: Query = { from, to, day, at: query.at.value, bike, folding, arriveBy, isNow, maxWalk: maxWalk / 60 };
  // a plan from now takes the delays of the vehicles on the road into account
  const svc = clock.serviceDay();
  const liveTried = withLive({ liveOn: map.liveOn(), arriveBy, day, at, now: { day: svc.day, seconds: svc.seconds } });
  let vehicles: Vehicle[] | null = null,
    liveAsOf: Date | null = null;
  if (liveTried && from.lat != null && from.lon != null) {
    try {
      vehicles = await feed.vehiclesForPlanning(from.lat, from.lon, { timeoutMs: 8000 });
      liveAsOf = feed.newest(vehicles);
    } catch {
      vehicles = null;
    }
    if (my !== planSeq) return;
  }
  q.liveAsOf = liveAsOf ? liveAsOf.getTime() : null;
  q.liveTried = liveTried;
  try {
    const r = await call('plan', {
      from,
      to,
      fromTime,
      toTime,
      bike,
      folding,
      weekday,
      maxWalk,
      arriveBy,
      vehicles,
    });
    if (my !== planSeq) return;
    recentTrips.add(q);
    recentPlaces.add(from);
    recentPlaces.add(to);
    lastSearch.set({ q, result: r, at: Date.now() });
    results.setResults(r, q);
  } catch (e) {
    if (my !== planSeq) return;
    showPlanError(e instanceof Error ? e.message : String(e));
    results.result.value = null;
    results.status.value = 'idle';
  }
  search.busy.value = false;
}

/** A destination chosen anywhere: planned from where you are, from now (or at the time the rider set). */
export async function planTo(p: Place): Promise<void> {
  nav.closeAll();
  nav.showScreen('plan');
  search.setPlace('to', p);
  results.status.value = 'locating';
  sheet.set('half');
  search.fromText.value = t('locating');
  try {
    search.setPlace('from', search.myLocation(await getPosition()));
  } catch {
    const f = search.from.value;
    if (!f || f.transient) search.setPlace('from', null);
    else search.fromText.value = f.name;
  }
  if (!query.timeTouched.value) query.resetNow(); // from now, unless the rider set a time
  if (search.from.value) plan();
  else {
    results.status.value = 'idle';
    showPlanError(t('noLocation'));
    search.focusBox('toQ');
  }
}
/** An origin chosen anywhere: in the From box, the bar open for the destination. */
export function planFrom(p: Place): void {
  nav.closeAll();
  search.setPlace('from', p);
  nav.showScreen('plan');
  search.barOpen.value = true;
  search.focusBox('toQ');
}

/** Back to a clean bar: no places, no results, the sheet down to its strip. */
export function clearPlan(): void {
  search.clearPlaces();
  results.clear();
  const l = lastSearch.get();
  if (l) lastSearch.set({ ...l, dismissed: true });
  showPlanError('');
  search.optOpen.value = '';
  query.resetNow();
  map.applyLiveShow();
  nav.renderPanels();
  map.redrawMap(true);
}

// What the bar needs: planning, searching, the map, the menu.
/** Plan from the bar: over everything else, on the plan screen. */
export function planFromBar(): void {
  nav.closeAll();
  nav.showScreen('plan');
  plan();
}
/** The bar's X: the plan panel closes when one is open (its own history step), else the plan is cleared. */
export function cancelPlan(): void {
  if (nav.stack.value.some((e) => e.kind === 'plan')) nav.close('plan');
  else clearPlan();
}
/** A recent or saved trip planned again: the bar filled from its query, from now. */
export function replan(q: Query): void {
  search.applyQuery(q);
  query.resetNow();
  planFromBar();
}
/** Places matching what is typed, the nearest first. */
export const findPlaces = (q: string) => call('search', { q, limit: 10, lang: lang.value, near: lastPos });
/** Lines matching what is typed, grouped by number and operator. */
export const findLineGroups = (q: string, mode: search.LineFilter, limit = 30) =>
  call('lineGroups', { q, mode, near: lastPos, limit });
/** Stops matching the name or sign number (every station, for the trains), near the rider while nothing is typed. */
export const findStopGroups = (q: string, mode: search.StopFilter, from?: number[]) =>
  call('stopGroups', { q, mode, near: lastPos, limit: 60, from });
/** A group from the stop search: the one stop view (a station too; its train chip is the timetable of two stations). */
export const openStopGroup = (g: search.StopGroup): Promise<void> => openStop(g.stops[0], { stops: g.stops });
/** Open again something from the history, found in the day loaded now. A trip opens as it was while that timetable is
 *  loaded and it has not ended; otherwise it is planned again from now, like a recent search. */
export async function openView(v: results.View): Promise<void> {
  if (!data.ttReady.value) return;
  const gone = () => toast(t('notInDay'));
  if (v.type === 'trip') {
    const same =
      data.dayInfo.value?.date === v.q.day &&
      v.built === data.manifest.value?.built &&
      v.j.arrive > clock.nowOn(v.q.day);
    if (same) {
      nav.closeAll();
      nav.showScreen('plan');
      openDetail(v.j, v.q);
    } else replan(v.q);
    return;
  }
  if (v.type === 'line') {
    const r = await call('findRecent', { kind: 'line', ref: v.ref });
    if (typeof r === 'number' && r >= 0) openLine(r);
    else gone();
    return;
  }
  if (v.type === 'stop') {
    const s = await call('findRecent', { kind: 'stop', code: v.code, lat: v.lat, lon: v.lon });
    if (typeof s === 'number' && s >= 0) openStop(s);
    else gone();
    return;
  }
  const mode = v.mode === 'lrt' ? 'lrt' : 'rail';
  if (v.type === 'station') {
    const s = await findStation(v, mode);
    if (s) openStation(s);
    else gone();
    return;
  }
  const [a, b] = await Promise.all([findStation(v.from, mode), findStation(v.to, mode)]);
  if (a && b) openTrains(a, b, mode);
  else gone();
}
/** A station of the history, found in the day loaded now by where it is. */
async function findStation(a: { name: string; lat: number; lon: number }, mode: 'rail' | 'lrt') {
  const f = await call('findRecent', {
    kind: 'station',
    lat: a.lat,
    lon: a.lon,
    mode,
  });
  return f && typeof f !== 'number' ? { ...f, key: f.name, name: a.name } : null;
}
/** A recent line, stop or station picked in the list under the box. In the train timetable (two stations at the top) a
 *  station is the From one and a pair fills both; otherwise it opens as from the drawer and the bar folds. */
export async function openRecent(v: results.View): Promise<void> {
  if (!search.railPair.value || (v.type !== 'station' && v.type !== 'trains')) {
    await openView(v);
    search.foldBar();
    return;
  }
  const mode = search.pairMode.value;
  if (v.type === 'station') {
    const s = await findStation(v, mode);
    if (s) chooseStation('from', s);
    else toast(t('notInDay'));
    return;
  }
  const [a, b] = await Promise.all([findStation(v.from, mode), findStation(v.to, mode)]);
  if (!a || !b) {
    toast(t('notInDay'));
    return;
  }
  search.stFrom.value = { name: a.name, stops: a.stops, lat: a.lat, lon: a.lon };
  search.stFromText.value = a.name;
  search.stTo.value = { name: b.name, stops: b.stops, lat: b.lat, lon: b.lon };
  search.stToText.value = b.name;
  search.foldBar();
  openTrains(a, b, mode);
}
/** Bring a way's card into view in the sheet's list, with a flash so the eye finds it; a collapsed sheet opens first
 *  when asked (otherwise the peek line already says which way it is). */
export function revealCard(idx: number, open: boolean): void {
  if (sheet.state.value === 'peek') {
    if (open) sheet.set('half');
    return;
  } // opening brings the highlighted card itself (shell.ts)
  results.reveal.value = { idx, n: (results.reveal.peek()?.n ?? 0) + 1 }; // the card answers (JourneyCard)
}

/** Plan from the stop in the sheet, or to it. */
export function fromHere(): void {
  const s = stopPage.info.value;
  if (s) {
    planFrom(search.stopPlace(s));
    sheet.set('half');
  }
}
export function toHere(): void {
  const s = stopPage.info.value;
  if (s) planTo(search.stopPlace(s));
}

/** Start: a plan waiting for its day's timetable is made when it comes; the bar's and the results' hooks. */
export function install(): void {
  effect(() => {
    if (data.ttReady.value && waiting) plan();
  });
  // What the bar's own flows need back from here (state cannot import the controllers): planning when a place is picked,
  // the plan cleared when its panel closes.
  Object.assign(search.hooks, {
    plan: planFromBar,
    planTo,
    clearPlan: cancelPlan,
  });
  // What the results' own flows need back from here: the sheet and the map after results come, a way's card brought
  // into view.
  Object.assign(results.hooks, {
    afterResults: () => {
      sheet.scrollToTop();
      if (!nav.topPanel() && nav.screen.value === 'plan' && sheet.state.value === 'peek') sheet.set('half');
      map.applyLiveShow();
      map.redrawMap(true);
    },
    redraw: () => map.redrawMap(true),
    revealCard,
  } satisfies typeof results.hooks);
}
