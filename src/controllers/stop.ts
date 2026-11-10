// A stop in the sheet, the one view of a stop wherever it was opened (the map, a search, a line, a trip): its lines,
// next departures (from now, or from the bar's time on another day), looked up live while it is open, from here and
// to here; a station is all its platforms, and where its trains go without a change.
import * as clock from '../engine/clock.ts';
import { isNowDay } from '../common/time';
import { call } from '../worker/client';
import * as liveTimes from './live';
import { toast } from '../widgets/toast';
import { t } from '../common/i18n';
import * as nav from '../state/nav';
import * as stopPage from '../state/stop';
import type { StopInfo, Departure } from '../state/stop';
import { recentViews } from '../state/store.ts';
import { openLine } from './line';
import * as query from '../state/query';
import { panelSession } from './session';

let current: StopInfo | null = null;
const session = panelSession(); // the stop shown: older answers dropped, its live poll stopped with it

export async function openStop(stop: number, where: { station?: number; stops?: number[] } = {}): Promise<void> {
  const my = session.begin();
  let info: StopInfo;
  try {
    info = await call('stopInfo', { stop, station: where.station ?? -1, stops: where.stops || null });
  } catch {
    if (session.isCurrent(my)) toast(t('liveFail'));
    return;
  }
  if (!session.isCurrent(my)) return;
  current = info;
  const members = info.stops && info.stops.length ? info.stops : [stop];
  // a station, or a platform the trains of a station call at (one platform, a light rail stop): kept as a station
  recentViews.add(
    (info.station != null && info.station >= 0) || info.reach
      ? { type: 'station', name: info.name, lat: info.lat, lon: info.lon, mode: info.reach || undefined }
      : { type: 'stop', code: info.code || '', name: info.name, city: info.city, lat: info.lat, lon: info.lon },
  );
  // the map draws the stop and its lines' courses (map/render.ts)
  const day = query.day.value,
    isNow = isNowDay(day);
  stopPage.open(info, day, isNow);
  const from = isNow ? clock.nowOn(day) - 120 : query.atSeconds();
  // a station's trains: where they go without a change, the next one there and how long it takes
  if (info.reach)
    call('stationReach', { stops: members, fromTime: from + 120, mode: info.reach })
      .then((d) => {
        if (session.isCurrent(my)) stopPage.dests.value = d;
      })
      .catch(() => {
        if (session.isCurrent(my)) stopPage.dests.value = [];
      });
  let deps: Departure[];
  try {
    // the hour before too: a train listed earlier and still to come (delayed) belongs in the list, which the live
    // times decide (state/stop.ts visibleDeps)
    deps = await call('departures', {
      stop,
      stops: members,
      fromTime: from,
      limit: 40,
      back: isNow ? liveTimes.LOOK_BACK_S : 0,
    });
  } catch {
    if (session.isCurrent(my)) stopPage.deps.value = []; // the page says there is nothing to show, not "loading" for ever
    return;
  }
  if (!session.isCurrent(my)) return;
  stopPage.deps.value = deps;
  liveTimes.watch('stop', isNow ? deps.map((d) => d.trip) : []);
}
export function closeStop(): void {
  session.end();
  liveTimes.unwatch('stop');
}

/** The live times asked again. */
export function refreshStop(): void {
  if (current) openStop(current.stop, { stops: current.stops });
}
/** A line of the stop: its timetable at this stop. */
export function openLineAtStop(route: number): void {
  const c = current;
  void openLine(route, c ? { stop: c.stop, near: c } : {});
}

/** Start: the stop page's hook. */
export function install(): void {
  // What the page's own flow needs back from here: the panel's history entry.
  Object.assign(stopPage.hooks, { show: () => nav.showOverlay('stopDetail') });
}
