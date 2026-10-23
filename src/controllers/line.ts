// A line's page: its course and stops on the map, and its vehicles with their delays, every 20 s while open.
import * as live from '../live.js';
import { t } from '../i18n';
import { toast } from '../ui/toast';
import { call } from '../worker/client';
import * as nav from '../state/nav';
import * as linePage from '../state/line';
import * as map from '../map/index';
import { clock } from '../map/popups';
import type { LineInfo } from '../state/line';
import type { Journey } from '../journey/types';
import { openStop } from './stop';

let seq = 0, timer = 0, current: LineInfo | null = null;

export async function openLine(route: number): Promise<void> {
  const my = ++seq;
  let info: LineInfo;
  try { info = await call<LineInfo>('lineInfo', { route }); } catch { toast(t('liveFail')); return; }
  if (my !== seq) return;
  current = info;
  map.mapOf.lineDetail = async (drawSeq) => {
    const m = await map.mapReady();
    if (!m || my !== seq || map.stale(drawSeq)) return;
    const course: Journey = { depart: 0, arrive: 0, transfers: 0, legs: [{ type: 'ride', seconds: 0, routeType: info.routeType, agency: info.agency, path: info.path, pattern: null }] };
    const b = map.drawJourney(m, course, map.markers.journey);
    // every stop of the line as a dot
    (m.getSource('stops') as any).setData({ type: 'FeatureCollection', features: info.stops.map((st) => ({ type: 'Feature', properties: { stop: st.stop, ...map.stopKindProp(st.stop) }, geometry: { type: 'Point', coordinates: [st.lon, st.lat] } })) });
    map.fitMap(b, 15);
    lineLive();
  };
  linePage.info.value = info; linePage.liveText.value = ''; linePage.liveOk.value = false;
  nav.showOverlay('lineDetail');
  clearInterval(timer);
  timer = window.setInterval(lineLive, 20000);
}
export function closeLine(): void { clearInterval(timer); seq++; current = null; delete map.mapOf.lineDetail; }

/** The line's vehicles on its map, with how late each runs. */
async function lineLive(): Promise<void> {
  const info = current;
  const ids = info?.routeIds?.length ? info.routeIds : info?.routeId != null ? [info.routeId] : [];
  if (!info || !nav.isOpen('lineDetail') || !map.liveOn() || !ids.length) return;
  const my = seq;
  try {
    // a train line is many routes in the feed (one per train): every train in the country, then those of this line
    const vs = ids.length > 1 ? (await live.trains()).filter((v: { lineRef: unknown }) => ids.includes(Number(v.lineRef))) : await live.vehiclesByLine(ids[0]);
    if (my !== seq) return;
    const st: any[] = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
    if (my !== seq) return;
    for (const mk of map.markers.lineVeh.splice(0)) mk.remove();
    const m = map.mapState.main;
    if (m && map.mapState.drawnFor === 'lineDetail') map.lineVehicleMarkers(m, map.markers.lineVeh, vs, st, info.routeType, null, { line: info.line, headsign: info.headsign, agency: info.agency, route: info.route });
    const nw = live.newest(vs);
    linePage.liveText.value = vs.length && nw ? `${t('vehiclesOnLine', { n: vs.length })} · ${clock(nw)}` : t('noLineVehicles');
    linePage.liveOk.value = vs.length > 0;
  } catch { /* the schedule stays */ }
}

Object.assign(linePage.hooks, { close: () => nav.close('lineDetail'), openLine: (route: number) => openLine(route), openStop: (stop: number) => openStop(stop) });
