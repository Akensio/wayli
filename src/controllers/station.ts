// A train station from the stop search: where a train from it goes without a change, then the direct trains to the
// station chosen, with their live times (every 45 s while open). A rider of trains thinks from station to station,
// not by line: which trains go from here to there, and when.
import type { Map as MLMap } from 'maplibre-gl';
import * as live from '../live.js';
import { t } from '../i18n';
import { calToday } from '../time';
import { call, tripStopsCached, estimate } from '../worker/client';
import * as search from '../state/search';
import * as sheet from '../state/sheet';
import * as nav from '../state/nav';
import * as st from '../state/station';
import * as map from '../map/index';
import { clock } from '../map/popups';
import type { Station, Dest, TrainRow } from '../state/station';
import { openTrip } from './trip';

let seq = 0, timer = 0;
const when = () => {
  const day = search.day.value, isNow = day === live.serviceDay().day || day === calToday();
  return { day, isNow, from: isNow ? live.nowOn(day) - 60 : search.atSeconds() };
};
const pin = (m: MLMap, s: Station) => {
  const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = 'var(--accent)';
  map.markers.journey.push(new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(m));
};

/** A station: the stations its trains reach directly. */
export async function openStation(s: Station): Promise<void> {
  const my = ++seq;
  const w = when();
  st.station.value = s; st.dests.value = null; st.filter.value = ''; st.day.value = w.day; st.isNow.value = w.isNow;
  map.mapOf.stationDetail = async (drawSeq) => {
    const m = await map.mapReady();
    if (!m || my !== seq || map.stale(drawSeq)) return;
    pin(m, s);
    m.easeTo({ center: [s.lon, s.lat], zoom: Math.max(m.getZoom(), 14), offset: [0, -Math.round(sheet.px('half') / 2) + 30], duration: 500 });
  };
  nav.showOverlay('stationDetail');
  const d = await call<Dest[]>('stationReach', { stops: s.stops, fromTime: w.from });
  if (my === seq) st.dests.value = d;
}
export function closeStation(): void { seq++; delete map.mapOf.stationDetail; }

/** The direct trains between two stations, from now (or the bar's time on another day). */
export async function openTrains(from: Station, to: Station): Promise<void> {
  const my = ++seq;
  const w = when();
  st.pair.value = { from, to }; st.trains.value = null; st.live.value = {}; st.liveNote.value = ''; st.day.value = w.day; st.isNow.value = w.isNow;
  map.mapOf.trainTimes = async (drawSeq) => {
    const m = await map.mapReady();
    if (!m || my !== seq || map.stale(drawSeq)) return;
    pin(m, from); pin(m, to);
    const b = new maplibregl.LngLatBounds([from.lon, from.lat], [from.lon, from.lat]).extend([to.lon, to.lat]);
    map.fitMap(b, 13);
  };
  if (!nav.isOpen('trainTimes')) nav.showOverlay('trainTimes'); else map.redrawMap(true);
  const rows = await call<TrainRow[]>('trainsBetween', { from: from.stops, to: to.stops, fromTime: w.from });
  if (my !== seq) return;
  st.trains.value = rows;
  clearInterval(timer);
  if (w.isNow) {
    liveTrains(rows, w.day, my);
    timer = window.setInterval(() => { if (!nav.isOpen('trainTimes')) clearInterval(timer); else liveTrains(rows, w.day, my); }, 45000);
  }
}
export function closeTrains(): void { clearInterval(timer); seq++; delete map.mapOf.trainTimes; }

/** Live times of the next trains between the two stations: every train in the country is one request. */
async function liveTrains(rows: TrainRow[], day: string, my: number): Promise<void> {
  if (!map.liveOn()) { st.liveNote.value = t('liveOff'); return; }
  const now = live.nowOn(day);
  const soon = rows.filter((r) => r.routeId != null && r.dep - now < 7200).slice(0, 10);
  if (!soon.length) return;
  try {
    const vs: any[] = await live.trains();
    if (my !== seq) return;
    for (const r of soon) {
      const v = live.matchTrip(vs, r.routeId, r.firstDep, day);
      if (!v) continue;
      const ts = await tripStopsCached(r.trip);
      const est = await estimate(v, ts.stops, day);
      if (my !== seq) return;
      const a = live.liveAt(est, ts.stops, r.boardPos), b = live.liveAt(est, ts.stops, r.alightPos);
      if (!a || !b) continue;
      st.live.value = { ...st.live.value, [String(r.trip)]: { passed: a.passed, dep: a.time, arr: b.time, delayMin: live.delayMinutes(a.delay), stale: !!a.stale } };
    }
    const nw = live.newest(vs);
    st.liveNote.value = nw ? t('liveUpdated', { time: clock(nw) }) : t('liveNoVehicle');
  } catch { st.liveNote.value = t('liveFail'); }
}

Object.assign(st.hooks, {
  close: () => nav.close('stationDetail'),
  closeTrains: () => nav.close('trainTimes'),
  openTo: (d: Dest) => { const s = st.station.value; if (s) openTrains(s, d); },
  swap: () => { const p = st.pair.value; if (p) openTrains(p.to, p.from); },
  openTrip: (trip: number, stop: number) => openTrip(trip, stop),
  refresh: () => { const p = st.pair.value; if (p) openTrains(p.from, p.to); },
} satisfies typeof st.hooks);
