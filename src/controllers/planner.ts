// Planning: from the bar's places and options to results. "My location" is resolved at the moment of planning;
// a plan from now takes the delays of the vehicles on the road into account. Also: a destination chosen
// anywhere (a bubble, a saved place) planned from where you are, the last search shown again, the plan cleared.
import { effect } from '@preact/signals';
import * as live from '../live.js';
import { settings, recentPlaces, recentTrips, lastSearch } from '../store.js';
import { t, lang } from '../i18n';
import { dateOf } from '../time';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as search from '../state/search';
import * as results from '../state/results';
import * as sheet from '../state/sheet';
import * as nav from '../state/nav';
import { lastPos, getPosition } from '../state/position';
import * as map from '../map/index';
import { toast } from '../ui/toast';
import type { Place } from '../state/search';
import type { Query, PlanResult } from '../journey/types';
import { startDay } from './loading';
import { openLine } from './line';
import { openStop } from './stop';
import { chooseStation, swapStations, openStation, openTrains } from './station';
import { openDetail } from './detail';
import { startTrip } from './follow';
import { layoutTop } from './shell';

type Shared = Parameters<typeof search.applyQuery>[0];

export function showPlanError(msg: string): void { results.error.value = msg; if (msg && sheet.state.value === 'peek') sheet.set('half'); }

/** A shared link's plan: from and to as "lat,lon,name", the day, the time, the bicycle, arrive-by. */
export function parseShared(params: URLSearchParams): Shared | null {
  const pt = (s: string | null): Place | null => { if (!s) return null; const [lat, lon, ...rest] = s.split(','); const name = decodeURIComponent(rest.join(',')) || `${lat}, ${lon}`; return Number.isNaN(+lat) ? null : { name, lat: +lat, lon: +lon }; };
  const from = pt(params.get('from')), to = pt(params.get('to'));
  if (!from || !to) return null;
  return { from, to, day: params.get('day') || '', at: params.get('at') || '', bike: params.get('bike') || 'none', folding: params.get('folding') === '1', arriveBy: params.get('mode') === 'arrive' };
}

let waiting = false;
effect(() => { if (data.ttReady.value && waiting) plan(); });
export async function plan(opts: { maxWalk?: number } = {}): Promise<void> {
  showPlanError('');
  if (!search.from.value || !search.to.value) { showPlanError(t('pickBoth')); return; }
  if (!data.ttReady.value) { waiting = true; return; }   // a new day's timetable is loading: planned once it is in
  waiting = false;
  for (const side of ['from', 'to'] as const) {   // "my location" is resolved now, not when it was chosen
    const p = search.sides[side].value!;
    if (p.transient && p.lat == null) {
      search.texts[side].value = t('locating');
      try { search.setPlace(side, search.myLocation(await getPosition())); } catch { search.texts[side].value = t('myLoc'); showPlanError(t('noLocation')); return; }
    }
  }
  if (!search.timeTouched.value) { search.setDefaultTime(); if (data.manifest.value && search.day.value !== startDay()) search.day.value = startDay(); }
  if (!nav.stack.value.some((e) => e.kind === 'plan')) nav.push({ kind: 'plan' });   // the back button clears the plan
  const from = search.from.value!, to = search.to.value!, day = search.day.value;
  const weekday = dateOf(day).getDay() <= 4;
  const bike = search.bike.value, folding = search.folding.value, arriveBy = search.timeMode.value === 'arrive';
  const at = search.atSeconds();
  const isNow = !search.timeTouched.value && !arriveBy;   // a plan from now looks ten minutes back too: a ride just boarded can still be followed
  const fromTime = arriveBy ? Math.max(0, at - 7200) : isNow ? Math.max(0, at - 600) : at, toTime = arriveBy ? at : at + 3600;
  const maxWalk = (opts.maxWalk || settings.get().maxWalk) * 60;
  search.busy.value = true;
  results.status.value = 'planning';
  search.optOpen.value = '';
  const q: Query = { from, to, day, at: search.at.value, bike, folding, arriveBy, isNow, maxWalk: maxWalk / 60 };
  // a plan from now takes the delays of the vehicles on the road into account
  const svc = live.serviceDay();
  const liveTried = map.liveOn() && !arriveBy && day === svc.day && Math.abs(at - svc.seconds) < 1200;
  let vehicles: unknown[] | null = null, liveAsOf: Date | null = null;
  if (liveTried && from.lat != null) {
    try { vehicles = await live.vehiclesForPlanning(from.lat, from.lon, { timeoutMs: 8000 }); liveAsOf = live.newest(vehicles); } catch { vehicles = null; }
  }
  q.liveAsOf = liveAsOf ? liveAsOf.getTime() : null; q.liveTried = liveTried;
  try {
    const r = await call<PlanResult>('plan', { from, to, fromTime, toTime, bike, folding, weekday, maxWalk, arriveBy, vehicles });
    recentTrips.add(q); recentPlaces.add(from); recentPlaces.add(to);
    lastSearch.set({ q, result: r, at: Date.now() });
    results.setResults(r, q);
    results.refreshRecent();
  } catch (e) { showPlanError(e instanceof Error ? e.message : String(e)); results.result.value = null; results.status.value = 'idle'; }
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
  try { search.setPlace('from', search.myLocation(await getPosition())); }
  catch { const f = search.from.value; if (!f || f.transient) search.setPlace('from', null); else search.fromText.value = f.name; }
  if (!search.timeTouched.value) search.resetNow();   // from now, unless the rider set a time
  if (search.from.value) plan(); else { results.status.value = 'idle'; showPlanError(t('noLocation')); search.focusBox('toQ'); }
}
/** An origin chosen anywhere: in the From box, the bar open for the destination. */
export function planFrom(p: Place): void { nav.closeAll(); search.setPlace('from', p); nav.showScreen('plan'); search.barOpen.value = true; search.focusBox('toQ'); }

/** Back to a clean bar: no places, no results, the sheet down to its strip. */
export function clearPlan(): void {
  search.clearPlaces();
  results.clear();
  const l = lastSearch.get(); if (l) lastSearch.set({ ...l, dismissed: true });
  showPlanError('');
  search.optOpen.value = ''; search.resetNow();
  results.refreshRecent();
  map.applyLiveShow(); nav.renderPanels(); map.redrawMap(true);
}

// What the bar needs: planning, searching, the map, the menu.
Object.assign(search.hooks, {
  plan: () => { nav.closeAll(); nav.showScreen('plan'); plan(); },
  planTo: (p: Place) => planTo(p),
  clearPlan: () => { if (nav.stack.value.some((e) => e.kind === 'plan')) nav.close('plan'); else clearPlan(); },
  hasResults: () => !!(results.result.value && results.query.value),
  lastQuery: () => results.query.value,
  search: (q: string) => call('search', { q, limit: 10, lang: lang.value, near: lastPos }),
  lineGroups: (q: string, mode: search.LineFilter, limit = 30) => call<search.LineGroup[]>('lineGroups', { q, mode, near: lastPos, limit }),
  stopGroups: (q: string, mode: search.StopFilter, from?: number[]) => call<search.StopGroup[]>('stopGroups', { q, mode, near: lastPos, limit: 60, from }),
  // a station picked among all stops: the train timetable opens with it as the From station
  openStopGroup: (g: search.StopGroup) => { if (g.mode === 'rail') { search.stopFilter.value = 'rail'; chooseStation('from', g); } else openStop(g.stops[0]); },
  chooseStation: (side: search.Side, g: search.StopGroup) => chooseStation(side, g),
  swapStations: () => swapStations(),
  openLine: (r: any) => openLine(r.route),
  getPosition: () => getPosition(),
  pickOnMap: (start: Place | null) => map.pickOnMap(start),
  openMenu: () => nav.showOverlay('drawer'),
  layoutTop: () => layoutTop(),
  toast: (msg: string) => toast(msg),
  ttReady: () => data.ttReady.value,
  lastPos: () => lastPos,
});
/** Open again something from the history, found in the day loaded now. A trip opens as it was while that timetable is
 *  loaded and it has not ended; otherwise it is planned again from now, like a recent search. */
async function openView(v: results.View): Promise<void> {
  if (!data.ttReady.value) return;
  const gone = () => toast(t('notInDay'));
  if (v.type === 'trip') {
    const same = data.dayInfo.value?.date === v.q.day && v.built === data.manifest.value?.built && v.j.arrive > live.nowOn(v.q.day);
    if (same) { nav.closeAll(); nav.showScreen('plan'); openDetail(v.j, v.q); } else results.hooks.replan(v.q);
    return;
  }
  if (v.type === 'line') { const r = await call<number>('findRecent', { kind: 'line', ref: v.ref }); if (r >= 0) openLine(r); else gone(); return; }
  if (v.type === 'stop') { const s = await call<number>('findRecent', { kind: 'stop', code: v.code, lat: v.lat, lon: v.lon }); if (s >= 0) openStop(s); else gone(); return; }
  type Found = { name: string; stops: number[]; lat: number; lon: number } | null;
  const station = async (a: { name: string; lat: number; lon: number }) => {
    const f = await call<Found>('findRecent', { kind: 'station', lat: a.lat, lon: a.lon });
    return f ? { ...f, key: f.name, name: a.name } : null;
  };
  if (v.type === 'station') { const s = await station(v); if (s) openStation(s); else gone(); return; }
  const [a, b] = await Promise.all([station(v.from), station(v.to)]);
  if (a && b) openTrains(a, b); else gone();
}
// What the results need: the detail and follow screens, planning again, the sheet and the map.
Object.assign(results.hooks, {
  openDetail: (j, q, bikeOnly) => openDetail(j, q, bikeOnly),
  startTrip: (j, q) => startTrip(j, q),
  plan: (opts) => plan(opts),
  replan: (q) => { search.applyQuery(q); search.resetNow(); nav.closeAll(); nav.showScreen('plan'); plan(); },
  openView: (v) => openView(v),
  afterResults: () => {
    const body = document.getElementById('sheetBody'); if (body) body.scrollTop = 0;
    if (!nav.topPanel() && nav.screen.value === 'plan' && sheet.state.value === 'peek') sheet.set('half');
    map.applyLiveShow(); map.redrawMap(true);
  },
  redraw: () => map.redrawMap(true),
  peekChanged: () => { if (sheet.state.value === 'peek') sheet.set('peek'); },
  peekTap: () => sheet.set('half'),
} satisfies typeof results.hooks);
