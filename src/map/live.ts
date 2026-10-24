// The live layer: every vehicle reporting in view (Hasadna's Open Bus data), or only the lines of the current
// results, or none while a journey, line or trip draws its own; the stops of the loaded day; what the note
// at the bottom says about freshness.
import type { Map as MLMap } from 'maplibre-gl';
import * as live from '../live.js';
import { t } from '../i18n';
import { routeColor, textOn } from '../journey/colors';
import { lineText } from '../journey/format';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as settings from '../state/settings';
import * as results from '../state/results';
import * as nav from '../state/nav';
import * as sheet from '../state/sheet';
import * as app from '../state/app';
import { lastPos } from '../state/position';
import { state, EMPTY, stopKinds } from './shared';
import { arrowImage } from './images';
import { heading, vehiclePopup } from './popups';

export const liveOn = (): boolean => !!settings.get().live && navigator.onLine !== false;
const LIVE_LAYERS = ['lm-veh', 'lm-veh-dir', 'lm-veh-label', 'lm-traffic'];
// every vehicle in view, only those of some lines (the results'), every one with those of some lines brought forward
// (the lines near the rider), or none
type Show = 'all' | 'none' | string[] | { near: string[] };
let liveShow: Show | null = null;
let nearRoutes: { lat: number; lon: number; ids: string[] } | null = null;   // the lines serving stops within 500 m of the last position
export const lm = { seq: 0, applied: 0, stops: false, labels: new Map<string, any>(), moveTimer: 0 };
export const resetLive = (): void => { lm.labels.clear(); lm.stops = false; nearRoutes = null; updateNearRoutes(); };
export const resetShow = (): void => { liveShow = null; };

/** Which vehicles the layer shows for what is on top: every one in view, only the lines of the results, or none. */
const nearOf = (s: Show | null): string[] | null => (s && typeof s === 'object' && !Array.isArray(s) ? s.near : null);
function liveShowFor(key: string): Show {
  if (key === 'detail' || key === 'lineDetail' || key === 'follow') return 'none';
  const r = results.result.value;
  if (key === 'screen-plan' && r && r.journeys && r.journeys.length && results.showing.value) {
    const ids = new Set<string>();
    for (const j of r.journeys) for (const l of j.legs) if (l.type === 'ride' && l.routeId != null) ids.add(String(l.routeId));
    if (ids.size) return Array.from(ids).sort();
  }
  // nothing searched: around you, every vehicle, those of the lines you can take from here in front and the rest faded
  // (they used to be hidden: zooming in on yourself emptied the map when none of your lines was running); elsewhere,
  // everything alike
  if (nearRoutes && nearRoutes.ids.length && state.main && lastPos) {
    const c = state.main.getCenter();
    if (live.metres(c.lat, c.lng, lastPos.lat, lastPos.lon) < 2500) return { near: nearRoutes.ids };
  }
  return 'all';
}
/** Refresh the lines around the rider when the position moved; applies the layer filter when it arrives. */
export async function updateNearRoutes(): Promise<void> {
  if (!lastPos || !data.ttReady.value) return;
  if (nearRoutes && live.metres(nearRoutes.lat, nearRoutes.lon, lastPos.lat, lastPos.lon) < 150) return;
  const at = { lat: lastPos.lat, lon: lastPos.lon };
  try {
    const ids: string[] = await call('nearbyRoutes', { lat: at.lat, lon: at.lon, radius: 500 });
    nearRoutes = { ...at, ids: ids.sort() };
    applyLiveShow();
  } catch { /* everything stays visible */ }
}
export function applyLiveShow(): void {
  const want = liveShowFor(nav.key.value);
  const same = liveShow != null && JSON.stringify(want) === JSON.stringify(liveShow);
  liveShow = want;
  const m = state.main;
  if (same || !m || !state.styled || !m.getLayer('lm-veh')) return;
  for (const id of LIVE_LAYERS) m.setLayoutProperty(id, 'visibility', want === 'none' ? 'none' : 'visible');
  if (want !== 'none') {
    const f: any = Array.isArray(want) ? ['in', ['get', 'ref'], ['literal', want]] : null;
    m.setFilter('lm-veh', f); m.setFilter('lm-veh-label', f);
    m.setFilter('lm-veh-dir', f ? ['all', ['>', ['get', 'bearing'], -1], f] : ['>', ['get', 'bearing'], -1]);
    // the lines near the rider in front, the others faded and under them
    const near = nearOf(want), isNear: any = near ? ['in', ['get', 'ref'], ['literal', near]] : null;
    const op: any = isNear ? ['*', ['get', 'opacity'], ['case', isNear, 1, 0.45]] : ['get', 'opacity'];
    m.setPaintProperty('lm-veh', 'circle-opacity', op); m.setPaintProperty('lm-veh', 'circle-stroke-opacity', op);
    m.setPaintProperty('lm-veh-dir', 'icon-opacity', op); m.setPaintProperty('lm-veh-label', 'text-opacity', op);
    m.setLayoutProperty('lm-veh', 'circle-sort-key', isNear ? ['case', isNear, 1, 0] : 0);
    refreshLiveMap();
  } else app.liveNote.value = '';
}
/** The stops of the loaded day on the map, and which of them are stations. */
export async function loadStopsGeo(): Promise<void> {
  const m = state.main;
  if (lm.stops || !data.ttReady.value || !m || !state.styled) return;
  try {
    const geo: GeoJSON.FeatureCollection = await call('stopsGeo');
    stopKinds.clear();
    for (const f of geo.features) { const p = f.properties as any; if (p.kind === 'platform') stopKinds.set(p.stop, p.st); else if (p.kind !== 'bus' && p.station == null) stopKinds.set(p.stop, p.kind); }
    const src = state.main && (state.main.getSource('lm-stops') as any);
    if (src) { src.setData(geo); lm.stops = true; }
  } catch { /* stops are a bonus */ }
}
export async function refreshLiveMap(): Promise<void> {
  const m = state.main;
  if (!m || !state.styled || document.hidden || sheet.state.value === 'full') return;
  if (nav.isOpen('picker') || liveShow === 'none') { app.liveNote.value = ''; return; }
  const veh = m.getSource('lm-veh') as any;
  // no vehicles is never silent: the note says when live times are switched off, or the phone is offline
  if (!liveOn()) { app.liveNote.value = t(settings.get().live ? 'liveOffline' : 'liveOff'); veh.setData(EMPTY); (m.getSource('lm-traffic') as any)?.setData(EMPTY); return; }
  if (m.getZoom() < 10) { app.liveNote.value = t('liveMapZoom'); veh.setData(EMPTY); return; }
  // requests overlap (a move, the 20 s timer): a slow answer still shows unless a newer one already has (on a slow
  // connection every answer came after the next request had started, and none ever showed); until the first, the note
  // says the positions are on their way
  const my = ++lm.seq;
  if (!app.liveNote.value) app.liveNote.value = t('liveLoading');
  const b = m.getBounds();
  try {
    const vs: any[] = await live.vehiclesInBounds({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() });
    if (my < lm.applied || !state.main || !state.styled) return;
    const need = Array.from(new Set(vs.map((v) => String(v.lineRef)).filter((id) => !lm.labels.has(id))));
    if (need.length && data.ttReady.value) {
      const labels: Record<string, any> = await call('routeLabels', { ids: need });
      for (const id of need) lm.labels.set(id, labels[id] || null);
      if (my < lm.applied || !state.main || !state.styled) return;
    }
    if ((liveShow as Show | null) === 'none') return;   // a journey or line drew its own while this was on its way
    lm.applied = my;
    const now = Date.now();
    const nwAll = live.newest(vs);
    const feedLag = nwAll ? (now - nwAll.getTime()) / 60000 : 0;   // minutes the whole feed is behind the clock
    const features: GeoJSON.Feature[] = vs.filter((v) => live.isFresh(v, 300, nwAll)).map((v) => {   // fresh against this area's own newest report
      const lb = lm.labels.get(String(v.lineRef));
      const age = nwAll ? (nwAll.getTime() - v.recordedAt.getTime()) / 1000 : 0;   // behind the feed, not the clock
      const color = routeColor(lb ? lb.type : 3, lb && lb.agency);
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        properties: { line: lb ? lineText(lb.line) : '?', type: lb ? lb.type : 3, color, ckey: color.slice(1), tcol: textOn(color), opacity: feedLag >= 4 ? 0.4 : age > 120 ? 0.55 : 1, bearing: heading(v),
          headsign: lb ? lb.headsign : '', agency: lb ? lb.agency : '', lineRef: v.lineRef, ref: String(v.lineRef), start: v.scheduledStart.getTime(), seen: v.recordedAt.getTime(), velocity: v.velocity || 0 } };
    });
    for (const ck of new Set(features.map((f) => f.properties!.ckey as string))) if (!m.hasImage('wayli-arrow-' + ck)) m.addImage('wayli-arrow-' + ck, arrowImage('#' + ck), { pixelRatio: 2 });
    veh.setData({ type: 'FeatureCollection', features });
    refreshTraffic(m, b);
    const nw = live.newest(vs);
    const ageMin = nw ? Math.round((now - nw.getTime()) / 60000) : 0;
    const near = nearOf(liveShow);
    const shown = Array.isArray(liveShow) ? features.filter((f) => (liveShow as string[]).includes(f.properties!.ref as string)).length : features.length;
    const nNear = near ? features.filter((f) => near.includes(f.properties!.ref as string)).length : 0;
    const scope = Array.isArray(liveShow) ? t('liveScopeSearch') : near ? t('liveNearOf', { n: nNear }) : '';
    const age = ageMin >= 4 ? t('liveAgeBehind', { n: ageMin }) : ageMin >= 3 ? t('liveAge', { n: ageMin }) : '';
    // when the relay could not answer, the note says so and why (Hasadna's database runs behind at rush hour)
    const via = live.source.relay ? '' : t('liveViaDb', { why: live.source.why });
    app.liveNote.value = (shown ? t(shown === 1 ? 'liveMapOne' : 'liveMapCount', { n: shown, scope, time: nw!.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }), age }) : t('liveMapNone', { scope })) + via;
    app.liveLag.value = !!shown && ageMin >= 4;
    try { window.wayliDebug = { ...(window.wayliDebug || {}), liveMapVehicles: features.length }; } catch { /* debugging only */ }
  } catch { if (my === lm.seq && my > lm.applied) app.liveNote.value = t('liveFail'); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLiveMap(); });
/** Traffic from the buses in view (the worker follows them across the snapshots), unless switched off in settings. */
async function refreshTraffic(m: MLMap, b: { getSouth(): number; getNorth(): number; getWest(): number; getEast(): number }): Promise<void> {
  const src = m.getSource('lm-traffic') as any;
  if (!src) return;
  if (settings.get().traffic === false || m.getZoom() < 11) { src.setData(EMPTY); return; }
  try { src.setData(await call('traffic', { box: { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() } })); } catch { /* traffic is a bonus */ }
}
/** A tap on a live vehicle: which trip it runs and how late, in its bubble. */
export async function selectVehicle(m: MLMap, p: any, coords: [number, number]): Promise<void> {
  if (nav.isOpen('picker')) return;
  const lb = lm.labels.get(String(p.lineRef));
  let st: any = { trip: -1 };
  try { st = (await call('vehiclesStatus', { vehicles: [{ lineRef: p.lineRef, scheduledStart: +p.start, lat: coords[1], lon: coords[0], recordedAt: +p.seen }] }))[0] || st; } catch { /* schedule only */ }
  vehiclePopup(m, coords, { line: st.line || (lb ? lb.line : '?'), routeType: st.routeType ?? (lb ? lb.type : 3), headsign: st.headsign || (lb ? lb.headsign : ''), agency: st.agency || (lb ? lb.agency : ''), delay: st.delay, stale: !!st.stale, seen: new Date(+p.seen), velocity: +p.velocity, trip: st.trip, route: st.route ?? (lb ? lb.route : null), offDay: !!(lb && lb.offDay) });
}
