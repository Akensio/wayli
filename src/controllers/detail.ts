// The journey detail: the journey on the map (one ride alone when focused), its rides looked up live while it is open,
// and for a journey happening around now every vehicle of its lines on the map.
import * as clock from '../engine/clock.ts';
import * as search from '../state/search';
import { call } from '../worker/client';
import * as data from '../state/data';
import * as detail from '../state/detail';
import * as nav from '../state/nav';
import * as results from '../state/results';
import * as map from '../map/index';
import type { Journey, RideLeg } from '../trip/journey';
import type { Query } from '../trip/query';
import * as liveTimes from './live';
import type { TrainRow } from '../state/station';
import { recentViews } from '../state/store.ts';
import { isRide } from '../trip/journey';
import { panelSession } from './session';
import { debug } from '../common/debug';

const session = panelSession(); // the journey shown; a live answer for an older one is dropped

export function openDetail(j: Journey, q: Query, bikeOnly = false): void {
  session.begin();
  search.foldBar(); // a result opened: the rider has moved on from the boxes
  if (!bikeOnly) recentViews.add({ type: 'trip', q, j, built: data.manifest.value?.built });
  debug('journey', j);
  detail.open(j, q, bikeOnly); // the map draws it (map/render.ts); its vehicles follow once drawn
  liveTimes.watch('detail', bikeOnly ? [] : j.legs.filter(isRide).map((l) => l.trip), results.result.value?.live);
}
export function closeDetail(): void {
  session.end();
  liveTimes.unwatch('detail');
}

/** The vehicles of the journey's lines on the map, for a journey happening around now (the rider's own marked). */
async function vehiclesOnMap(j: Journey, day: string, my: number, focus = -1): Promise<void> {
  const now = clock.nowOn(day);
  const rides = j.legs
    .filter((l, i) => focus < 0 || i === focus)
    .filter(isRide)
    .filter((l) => l.routeId != null && l.depart - now < 5400 && now - l.arrive < 900)
    .slice(0, 4);
  await Promise.all(
    rides.map((l) => liveTimes.showRideVehicles('detail', String(l.trip), l, () => session.isCurrent(my))),
  );
}

/** Every line doing the ride, from its boarding stop to the one it is left at: for a plan from now, the rides still to
 *  come (asked from an hour back: one listed earlier and running late is among them, views/station/RideRows), else
 *  from a little before the ride planned. */
export function rideOptions(l: RideLeg, q: Query): Promise<TrainRow[]> {
  const along = l.stopsAlong || [];
  if (along.length < 2) return Promise.resolve([]);
  const fromTime = q.isNow ? clock.nowOn(q.day) - liveTimes.LOOK_BACK_S : (l.depart ?? 0) - 1200;
  return call('rideOptions', { from: [along[0].stop], to: [along[along.length - 1].stop], fromTime, limit: 60 });
}
/** Start: the way's vehicles once the map has drawn it; the detail's hooks. */
export function install(): void {
  // the way's vehicles, once the map has drawn it (and again after each redraw: a ride focused, the courses in)
  map.afterDraw.detail = () => {
    const j = detail.journey.value,
      q = detail.query.value;
    if (j && q && !detail.bikeOnly.value) void vehiclesOnMap(j, q.day, session.current(), detail.focus.value);
  };
  // What the detail's own flows need back from here: the panel's history entry, the map drawn when the focus changes.
  Object.assign(detail.hooks, {
    show: () => nav.showOverlay('detail'),
    redraw: () => map.redrawMap(true),
  });
}
