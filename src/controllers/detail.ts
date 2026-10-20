// The journey detail: the journey on the map (one ride alone when focused), and for a journey happening around
// now, a live badge on each ride and every vehicle of those lines on the map.
import * as live from '../live.js';
import { t } from '../i18n';
import { call, tripStopsCached } from '../worker/client';
import * as data from '../state/data';
import * as detail from '../state/detail';
import * as nav from '../state/nav';
import * as saved from '../state/saved';
import * as map from '../map/index';
import { liveBadge } from '../journey/format';
import type { Journey, Query } from '../journey/types';
import { openLine } from './line';
import { startTrip } from './follow';

let seq = 0;   // the journey shown; a live answer for an older one is dropped

export function openDetail(j: Journey, q: Query, bikeOnly = false): void {
  const my = ++seq;
  try { window.wayliDebug = { ...(window.wayliDebug || {}), journey: j }; } catch { /* debugging only */ }
  map.mapOf.detail = async (drawSeq) => {
    const m = await map.mapReady();
    if (!m || my !== seq || map.stale(drawSeq)) return;
    if (!bikeOnly) await map.withCourses(j);
    if (my !== seq || map.stale(drawSeq)) return;
    const focus = detail.focus.value;
    const b = map.drawJourney(m, j, map.markers.journey, focus);
    for (const mk of map.markers.live.splice(0)) mk.remove();
    map.fitMap(focus >= 0 && j.legs[focus] ? map.boundsOf(j.legs[focus].path) : b, 16);
    if (!bikeOnly) liveForJourney(j, q.day, my, focus);
  };
  detail.open(j, q, bikeOnly);
}
export function closeDetail(): void { seq++; delete map.mapOf.detail; }

/** Live badges on the ride legs of a journey happening around now; every vehicle of those lines on the map. */
async function liveForJourney(j: Journey, day: string, my: number, focus = -1): Promise<void> {
  if (!map.liveOn() || !data.dayInfo.value || data.dayInfo.value.date !== day) return;   // trip indices belong to the loaded day
  const now = live.nowOn(day);
  if (j.depart - now > 5400 || now - j.arrive > 1800) return;
  const rides = j.legs.filter((l, i) => l.type === 'ride' && l.routeId != null && (focus < 0 || i === focus) && l.depart! - now < 5400 && now - l.arrive! < 900).slice(0, 4);
  await Promise.all(rides.map(async (l) => {
    const trip = l.trip!;
    try {
      const vs = await live.vehiclesByLine(l.routeId);
      if (my !== seq) return;
      const statuses: any[] = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
      if (my !== seq) return;
      const m = map.mapState.main;
      if (m && map.mapState.drawnFor === 'detail') map.lineVehicleMarkers(m, map.markers.live, vs, statuses, l.routeType!, trip, { line: l.line, headsign: l.headsign, agency: l.agency, route: l.route as number });
      const v = live.matchTrip(vs, l.routeId, l.firstDep, day);
      if (!v) { detail.setBadge(trip, { text: t('liveNoVehicle'), cls: '' }); return; }
      const ts = await tripStopsCached(trip);
      const est = live.estimateDelay(v, ts.stops, day);
      const at = live.liveAt(est, ts.stops, l.boardPos);
      if (my !== seq) return;
      detail.setBadge(trip, liveBadge(at));
    } catch { detail.setBadge(trip, { text: t('liveFail'), cls: '' }); }
  }));
}

Object.assign(detail.hooks, {
  show: () => nav.showOverlay('detail'),
  close: () => nav.close('detail'),
  redraw: () => map.redrawMap(true),
  openLine: (route: number) => openLine(route),
  startTrip: (j: Journey, q: Query) => startTrip(j, q),
  favChanged: () => saved.refresh(),
});
