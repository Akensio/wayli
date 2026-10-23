// One trip's page: every stop with its time, and where its vehicle is now.
import * as live from '../live.js';
import { tripStopsCached, estimate } from '../worker/client';
import * as search from '../state/search';
import * as nav from '../state/nav';
import * as tripPage from '../state/trip';
import * as map from '../map/index';
import type { TripStops } from '../state/trip';
import { openStop } from './stop';

export async function openTrip(trip: number, hereStop: number | null): Promise<void> {
  const ts: TripStops = await tripStopsCached(trip);
  tripPage.ts.value = ts; tripPage.hereStop.value = hereStop; tripPage.vehicle.value = null; tripPage.noVehicle.value = false;
  nav.showOverlay('tripDetail');
  const day = search.day.value;
  if (!map.liveOn() || ts.routeId == null) return;
  try {
    const vs = await live.vehiclesByLine(ts.routeId);
    const v = live.matchTrip(vs, ts.routeId, ts.firstDep, day);
    const est = v ? await estimate(v, ts.stops, day) : null;
    if (tripPage.ts.value !== ts) return;   // another trip opened meanwhile
    if (!est) { tripPage.noVehicle.value = true; return; }
    tripPage.vehicle.value = { index: est.index + (est.frac > 0.5 ? 1 : 0), delayMin: est.delay ? live.delayMinutes(est.delay) : 0 };
  } catch { /* no live, no problem */ }
}

Object.assign(tripPage.hooks, { close: () => nav.close('tripDetail'), openStop: (stop: number) => { nav.close('tripDetail'); openStop(stop); } });
