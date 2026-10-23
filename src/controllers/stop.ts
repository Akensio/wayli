// A stop's page: its next departures (from now, or from the bar's time on another day), refreshed with live
// times every 45 s while it is open; from here, to here.
import * as live from '../live.js';
import { t } from '../i18n';
import { calToday } from '../time';
import { call, tripStopsCached, estimate } from '../worker/client';
import * as search from '../state/search';
import * as sheet from '../state/sheet';
import * as nav from '../state/nav';
import * as stopPage from '../state/stop';
import * as map from '../map/index';
import { clock } from '../map/popups';
import type { StopInfo, Departure } from '../state/stop';
import type { Place } from '../state/search';
import { planTo, planFrom } from './planner';
import { openTrip } from './trip';
import { recentViews } from '../store.js';

let current: StopInfo | null = null, seq = 0, timer = 0;
/** A stop as a place to plan from or to. */
export const stopPlace = (s: { name: string; stop: number; lat: number; lon: number }): Place => ({ name: s.name, stops: [s.stop], lat: s.lat, lon: s.lon });

export async function openStop(stop: number): Promise<void> {
  const my = ++seq;
  const info = await call<StopInfo>('stopInfo', { stop });
  current = info;
  recentViews.add({ type: 'stop', code: info.code || '', name: info.name, city: info.city, lat: info.lat, lon: info.lon });
  map.mapOf.stopDetail = async (drawSeq) => {
    const m = await map.mapReady();
    if (!m || my !== seq || map.stale(drawSeq)) return;
    const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = 'var(--accent)';
    map.markers.journey.push(new maplibregl.Marker({ element: el }).setLngLat([info.lon, info.lat]).addTo(m));
    m.easeTo({ center: [info.lon, info.lat], zoom: Math.max(m.getZoom(), 15), offset: [0, -Math.round(sheet.px('half') / 2) + 30], duration: 500 });
  };
  const day = search.day.value, svc = live.serviceDay();
  const isNow = day === svc.day || day === calToday();
  stopPage.open(info, day, isNow);
  const deps = await call<Departure[]>('departures', { stop, fromTime: isNow ? live.nowOn(day) - 120 : search.atSeconds(), limit: 40 });
  if (my !== seq) return;
  stopPage.deps.value = deps;
  clearInterval(timer);
  if (isNow) {
    liveForStop(info, deps, day, my);
    timer = window.setInterval(() => { if (!nav.isOpen('stopDetail')) clearInterval(timer); else liveForStop(info, deps, day, my); }, 45000);
  }
}
export function closeStop(): void { clearInterval(timer); seq++; delete map.mapOf.stopDetail; }

/** Live times for the departures of a stop: one request for the vehicles around it, then by line for what it missed. */
async function liveForStop(info: StopInfo, deps: Departure[], day: string, my: number): Promise<void> {
  if (!map.liveOn()) { stopPage.liveNote.value = t('liveOff'); return; }
  const now = live.nowOn(day);
  const soon = deps.filter((d) => d.routeId != null && d.time - now < 3600 && d.time - now > -300).slice(0, 16);
  if (!soon.length) return;
  try {
    let vs: any[] = await live.vehiclesNear(info.lat, info.lon, 8);
    if (my !== seq) return;
    const unmatched = new Set(soon.filter((d) => !live.matchTrip(vs, d.routeId, d.firstDep, day) && d.time - now < 1800).map((d) => d.routeId));
    if (unmatched.size) {
      const more = await Promise.all(Array.from(unmatched).slice(0, 6).map((r) => live.vehiclesByLine(r).catch(() => [])));
      vs = vs.concat(more.flat());
    }
    if (my !== seq) return;
    for (const d of soon) {
      const v = live.matchTrip(vs, d.routeId, d.firstDep, day);
      if (!v) continue;
      const ts = await tripStopsCached(d.trip);
      if (my !== seq) return;
      const idx = ts.stops.findIndex((s: { stop: number; dep: number }) => s.stop === info.stop && s.dep === d.time);
      const est = await estimate(v, ts.stops, day);
      if (my !== seq) return;
      const at = live.liveAt(est, ts.stops, idx < 0 ? 0 : idx);
      if (!at) continue;
      stopPage.setLive(d.trip, at.passed ? { passed: true } : { passed: false, time: at.time, stale: !!at.stale, delayMin: live.delayMinutes(at.delay) });
    }
    const nw = live.newest(vs);
    stopPage.liveNote.value = nw ? t('liveUpdated', { time: clock(nw) }) : t('liveNoVehicle');
  } catch { stopPage.liveNote.value = t('liveFail'); }
}

Object.assign(stopPage.hooks, {
  show: () => nav.showOverlay('stopDetail'),
  close: () => nav.close('stopDetail'),
  refresh: () => { if (current) openStop(current.stop); },
  openTrip: (trip: number, stop: number) => openTrip(trip, stop),
  fromHere: () => { if (current) { planFrom(stopPlace(current)); sheet.set('half'); } },
  toHere: () => { if (current) planTo(stopPlace(current)); },
});
