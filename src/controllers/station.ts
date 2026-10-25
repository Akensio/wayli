// The train timetable (the stop search's train chip: two stations at the top): the From station opens as the one stop
// view (its departures, where its trains go), and once To is set the direct trains between the two with their live
// times (every 45 s while open). A rider of trains thinks from station to station, not by line.
import * as live from '../live.js';
import { t } from '../i18n';
import { calToday } from '../time';
import { call, tripStopsCached, estimate } from '../worker/client';
import * as search from '../state/search';
import * as nav from '../state/nav';
import * as st from '../state/station';
import * as map from '../map/index';
import { clock } from '../map/popups';
import type { Station, TrainRow } from '../state/station';
import { openStop } from './stop';
import { openTrip } from './line';
import { recentViews } from '../store.js';

let seq = 0, timer = 0;
const when = () => {
  const day = search.day.value, isNow = day === live.serviceDay().day || day === calToday();
  return { day, isNow, from: isNow ? live.nowOn(day) - 60 : search.atSeconds() };
};

/** A station: the one stop view, for all its platforms (its departures, and where its trains go). */
export function openStation(s: Station): void { if (s.stops.length) openStop(s.stops[0], { stops: s.stops }); }

/** The direct trains between two stations, from now (or the bar's time on another day). */
export async function openTrains(from: Station, to: Station, mode: 'rail' | 'lrt' = search.railPair.value ? search.pairMode.value : 'rail'): Promise<void> {
  const my = ++seq;
  const w = when();
  recentViews.add({ type: 'trains', mode, from: { name: from.name, lat: from.lat, lon: from.lon }, to: { name: to.name, lat: to.lat, lon: to.lon } });
  st.pair.value = { from, to }; st.trains.value = null; st.live.value = {}; st.liveNote.value = ''; st.day.value = w.day; st.isNow.value = w.isNow; st.mode.value = mode;
  // the map draws both stations (map/render.ts)
  if (!nav.isOpen('trainTimes')) nav.showOverlay('trainTimes'); else map.redrawMap(true);
  const rows = await call<TrainRow[]>('trainsBetween', { from: from.stops, to: to.stops, fromTime: w.from });
  if (my !== seq) return;
  st.trains.value = rows;
  clearInterval(timer);
  if (w.isNow) {
    liveTrains(rows, w.day, my, from);
    timer = window.setInterval(() => { if (!nav.isOpen('trainTimes')) clearInterval(timer); else liveTrains(rows, w.day, my, from); }, 45000);
  }
}
export function closeTrains(): void { clearInterval(timer); seq++; }

/** Live times of the next trains between the two stations: every train in the country is one request; the light rail's
 *  are among the vehicles around the station. */
async function liveTrains(rows: TrainRow[], day: string, my: number, from: Station): Promise<void> {
  if (!map.liveOn()) { st.liveNote.value = t('liveOff'); return; }
  const now = live.nowOn(day);
  const soon = rows.filter((r) => r.routeId != null && r.dep - now < 7200).slice(0, 10);
  if (!soon.length) return;
  try {
    const vs: any[] = st.mode.value === 'lrt' ? await live.vehiclesNear(from.lat, from.lon, 20, { sinceSec: 1800, limit: 1500 }) : await live.trains();
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

/** A station chosen in one of the two boxes at the top: the trains between the two once both are set, else where
 *  trains from the first go (the To box waits for its station then). */
export function chooseStation(side: search.Side, g: Station): void {
  if (side === 'to' && !search.stFrom.value) { search.stToText.value = ''; side = 'from'; }   // the first station is where the ride starts
  const box = side === 'from' ? search.stFrom : search.stTo, text = side === 'from' ? search.stFromText : search.stToText;
  box.value = { name: g.name, stops: g.stops, lat: g.lat, lon: g.lon }; text.value = g.name;
  const f = search.stFrom.value, to = search.stTo.value;
  if (f && to) { openTrains(asStation(f), asStation(to)); return; }
  if (f) { openStation(asStation(f)); search.focusBox('toQ'); } else search.focusBox('fromQ');
}
export function swapStations(): void {
  const f = search.stFrom.value, ft = search.stFromText.value;
  search.stFrom.value = search.stTo.value; search.stFromText.value = search.stToText.value;
  search.stTo.value = f; search.stToText.value = ft;
  const a = search.stFrom.value, b = search.stTo.value;
  if (a && b) openTrains(asStation(a), asStation(b)); else if (a) openStation(asStation(a));
}
const asStation = (p: { name: string; stops?: number[]; lat?: number | null; lon?: number | null }): Station => ({ key: '', name: p.name, stops: p.stops || [], lat: p.lat || 0, lon: p.lon || 0 });

Object.assign(st.hooks, {
  closeTrains: () => nav.close('trainTimes'),
  openTrip: (trip: number, stop: number) => openTrip(trip, stop),
  refresh: () => { const p = st.pair.value; if (p) openTrains(p.from, p.to); },
} satisfies typeof st.hooks);
