// The journey detail: the journey on the map (one ride alone when focused), and for a journey happening around
// now, a live badge on each ride and every vehicle of those lines on the map.
import * as clock from '../engine/clock.ts';
import * as delays from '../engine/delays.js';
import * as feed from '../engine/feed.js';
import * as search from '../state/search';
import { t } from '../lib/i18n';
import { call, tripStopsCached, estimate } from '../worker/client';
import * as data from '../state/data';
import * as detail from '../state/detail';
import * as nav from '../state/nav';
import * as map from '../map/index';
import { liveBadge } from '../journey/format';
import type { Journey, Query, RideLeg } from '../journey/types';
import { liveRides } from './liverides';
import type { TrainRow, LiveTrain } from '../state/station';
import { recentViews } from '../lib/store.ts';
import { isRide } from '../journey/types';

let seq = 0; // the journey shown; a live answer for an older one is dropped

export function openDetail(j: Journey, q: Query, bikeOnly = false): void {
  seq++;
  search.foldBar(); // a result opened: the rider has moved on from the boxes
  if (!bikeOnly) recentViews.add({ type: 'trip', q, j, built: data.manifest.value?.built });
  try {
    window.wayliDebug = { ...(window.wayliDebug || {}), journey: j };
  } catch {
    /* debugging only */
  }
  detail.open(j, q, bikeOnly); // the map draws it (map/render.ts); its vehicles follow once drawn
}
export function closeDetail(): void {
  seq++;
}
// the way's vehicles, once the map has drawn it (and again after each redraw: a ride focused, the courses in)
map.afterDraw.detail = () => {
  const j = detail.journey.value,
    q = detail.query.value;
  if (j && q && !detail.bikeOnly.value) liveForJourney(j, q.day, seq, detail.focus.value);
};

/** Live badges on the ride legs of a journey happening around now; every vehicle of those lines on the map. */
async function liveForJourney(j: Journey, day: string, my: number, focus = -1): Promise<void> {
  if (!map.liveOn() || !data.dayInfo.value || data.dayInfo.value.date !== day) return; // trip indices belong to the loaded day
  const now = clock.nowOn(day);
  if (j.depart - now > 5400 || now - j.arrive > 1800) return;
  const rides = j.legs
    .filter((l, i) => focus < 0 || i === focus)
    .filter(isRide)
    .filter((l) => l.routeId != null && l.depart - now < 5400 && now - l.arrive < 900)
    .slice(0, 4);
  await Promise.all(
    rides.map(async (l) => {
      const trip = l.trip;
      try {
        const vs = await feed.vehiclesByLine(l.routeId);
        if (my !== seq) return;
        const statuses = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
        if (my !== seq) return;
        const m = map.mapState.main;
        if (m && map.mapState.drawnFor === 'detail')
          map.lineVehicleMarkers(m, map.markers.live, vs, statuses, l.routeType, trip, {
            line: l.line,
            headsign: l.headsign,
            agency: l.agency,
            route: l.route,
          });
        const v = feed.matchTrip(vs, l.routeId, l.firstDep, day);
        if (!v) {
          detail.setBadge(trip, { text: t('liveNoVehicle'), cls: '' });
          return;
        }
        const ts = await tripStopsCached(trip);
        const est = await estimate(v, ts.stops, day);
        const at = delays.liveAt(est, ts.stops, l.boardPos);
        if (my !== seq) return;
        detail.setBadge(trip, liveBadge(at));
      } catch {
        detail.setBadge(trip, { text: t('liveFail'), cls: '' });
      }
    }),
  );
}

/** Every line doing the ride, from its boarding stop to the one it is left at: from now on today, else from a little
 *  before the ride planned. */
export function rideOptions(l: RideLeg, q: Query): Promise<TrainRow[]> {
  const along = l.stopsAlong || [];
  if (along.length < 2) return Promise.resolve([]);
  const fromTime = q.isNow ? clock.nowOn(q.day) - 120 : (l.depart ?? 0) - 1200;
  return call('rideOptions', { from: [along[0].stop], to: [along[along.length - 1].stop], fromTime, limit: 60 });
}
/** The live state of those rides, when live data is on. */
export async function rideLive(rows: TrainRow[], day: string): Promise<Record<string, LiveTrain>> {
  return map.liveOn() ? (await liveRides(rows, day)).live : {};
}
// What the detail's own flows need back from here: the panel's history entry, the map drawn when the focus changes.
Object.assign(detail.hooks, {
  show: () => nav.showOverlay('detail'),
  redraw: () => map.redrawMap(true),
});
