// The journey detail: the journey on the map (one ride alone when focused), and for a journey happening around
// now, a live badge on each ride and every vehicle of those lines on the map.
import * as clock from '../engine/clock.ts';
import * as delays from '../engine/delays.ts';
import * as search from '../state/search';
import { t } from '../lib/i18n';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as detail from '../state/detail';
import * as nav from '../state/nav';
import * as map from '../map/index';
import { liveBadge } from '../journey/format';
import type { Journey, Query, RideLeg } from '../journey/types';
import { liveRides, seeRide } from './liverides';
import type { TrainRow, LiveTrain } from '../state/station';
import { recentViews } from '../state/store.ts';
import { isRide } from '../journey/types';
import { panelSession } from './session';
import { debug } from '../lib/debug';

const session = panelSession(); // the journey shown; a live answer for an older one is dropped

export function openDetail(j: Journey, q: Query, bikeOnly = false): void {
  session.begin();
  search.foldBar(); // a result opened: the rider has moved on from the boxes
  if (!bikeOnly) recentViews.add({ type: 'trip', q, j, built: data.manifest.value?.built });
  debug('journey', j);
  detail.open(j, q, bikeOnly); // the map draws it (map/render.ts); its vehicles follow once drawn
}
export function closeDetail(): void {
  session.end();
}

/** Live badges on the ride legs of a journey happening around now; every vehicle of those lines on the map. */
async function liveForJourney(j: Journey, day: string, my: number, focus = -1): Promise<void> {
  if (!map.liveOn() || !data.dayInfo.value || data.dayInfo.value.date !== day) return; // trip indices belong to the loaded day
  const now = clock.nowOn(day);
  if (j.depart - now > 5400 || now - j.arrive > 1800) return;
  const rides = j.legs
    .filter((l, i) => focus < 0 || i === focus)
    .filter(isRide)
    .filter(
      (l): l is RideLeg & { routeId: number | string; firstDep: number } =>
        l.routeId != null && l.firstDep != null && l.depart - now < 5400 && now - l.arrive < 900,
    )
    .slice(0, 4);
  await Promise.all(
    rides.map(async (l) => {
      const trip = l.trip;
      const seen = await seeRide(l, day, true);
      if (!session.isCurrent(my)) return;
      if (!seen) {
        detail.setBadge(trip, { text: t('liveFail'), cls: '' });
        return;
      }
      const { vs, statuses, v, ts, est } = seen;
      map.showVehicles('detail', String(trip), {
        vs,
        statuses,
        routeType: l.routeType,
        mine: trip,
        fallback: { line: l.line, headsign: l.headsign, agency: l.agency, route: l.route },
      });
      detail.setBadge(
        trip,
        v && ts ? liveBadge(delays.liveAt(est, ts.stops, l.boardPos)) : { text: t('liveNoVehicle'), cls: '' },
      );
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

/** Start: the way's vehicles once the map has drawn it; the detail's hooks. */
export function install(): void {
  // the way's vehicles, once the map has drawn it (and again after each redraw: a ride focused, the courses in)
  map.afterDraw.detail = () => {
    const j = detail.journey.value,
      q = detail.query.value;
    if (j && q && !detail.bikeOnly.value) liveForJourney(j, q.day, session.current(), detail.focus.value);
  };
  // What the detail's own flows need back from here: the panel's history entry, the map drawn when the focus changes.
  Object.assign(detail.hooks, {
    show: () => nav.showOverlay('detail'),
    redraw: () => map.redrawMap(true),
  });
}
