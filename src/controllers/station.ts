// The train timetable (the stop search's train chip: two stations at the top): the From station opens as the one stop
// view (its departures, where its trains go), and once To is set the direct trains between the two with their live
// times (every 45 s while open). A rider of trains thinks from station to station, not by line.
import * as clock from '../engine/clock.js';
import { t } from '../lib/i18n';
import { calToday, timeOf } from '../lib/time';
import { call } from '../worker/client';
import * as search from '../state/search';
import * as nav from '../state/nav';
import * as st from '../state/station';
import * as map from '../map/index';
import { asStation, type Station, type TrainRow } from '../state/station';
import { openStop } from './stop';
import { liveRides } from './liverides';
import { openTrip } from './line';
import { recentViews } from '../lib/store.js';

let seq = 0, timer = 0;
const when = () => {
  const day = search.day.value, isNow = day === clock.serviceDay().day || day === calToday();
  return { day, isNow, from: isNow ? clock.nowOn(day) - 60 : search.atSeconds() };
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
  map.redrawMap(true);   // their courses and vehicles
  clearInterval(timer);
  if (w.isNow) {
    liveTrains(rows, w.day, my);
    timer = window.setInterval(() => { if (!nav.isOpen('trainTimes')) clearInterval(timer); else liveTrains(rows, w.day, my); }, 45000);
  }
}
export function closeTrains(): void { clearInterval(timer); seq++; }

/** Live times of the trains between the two stations (controllers/liverides). */
async function liveTrains(rows: TrainRow[], day: string, my: number): Promise<void> {
  if (!map.liveOn()) { st.liveNote.value = t('liveOff'); return; }
  try {
    const r = await liveRides(rows, day);
    if (my !== seq) return;
    st.live.value = { ...st.live.value, ...r.live };
    st.liveNote.value = r.newest ? t('liveUpdated', { time: timeOf(r.newest) }) : t('liveNoVehicle');
  } catch { st.liveNote.value = t('liveFail'); }
}

/** A station chosen in one of the two boxes at the top: the trains between the two once both are set, else where
 *  trains from the first go (the To box waits for its station then). */
export function chooseStation(side: search.Side, g: Station): void {
  if (side === 'to' && !search.stFrom.value) { search.stToText.value = ''; side = 'from'; }   // the first station is where the ride starts
  const box = side === 'from' ? search.stFrom : search.stTo, text = side === 'from' ? search.stFromText : search.stToText;
  box.value = { name: g.name, stops: g.stops, lat: g.lat, lon: g.lon }; text.value = g.name;
  const f = search.stFrom.value, to = search.stTo.value;
  if (f && to) { search.foldBar(); openTrains(asStation(f), asStation(to)); return; }   // the bar folds to its summary
  if (f) { openStation(asStation(f)); search.focusBox('toQ'); } else search.focusBox('fromQ');
}
/** The two stations' summary closed: their timetable goes, and the bar is the trip pill again. */
export function endStations(): void {
  closeTrains();
  for (const id of ['trainTimes', 'stopDetail']) if (nav.isOpen(id)) nav.close(id);
  search.clearStations(); search.setKind('trip'); search.foldBar();
}
export function swapStations(): void {
  const f = search.stFrom.value, ft = search.stFromText.value;
  search.stFrom.value = search.stTo.value; search.stFromText.value = search.stToText.value;
  search.stTo.value = f; search.stToText.value = ft;
  const a = search.stFrom.value, b = search.stTo.value;
  if (a && b) openTrains(asStation(a), asStation(b)); else if (a) openStation(asStation(a));
}

Object.assign(st.hooks, {
  closeTrains: () => nav.close('trainTimes'),
  openTrip: (trip: number, stop: number) => openTrip(trip, stop),
  refresh: () => { const p = st.pair.value; if (p) openTrains(p.from, p.to); },
} satisfies typeof st.hooks);
