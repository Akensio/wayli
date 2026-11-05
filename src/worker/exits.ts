// Station entrances (pipeline/entrances.py, data/entrances.json): where a light rail, underground or train station
// opens onto the street. The timetable has one point per station near its middle; the Red Line's underground
// stations open up to 150 m away on different streets, lettered A to D. A walk to or from such a station goes to the
// entrance nearest the rider's way, and the leg says which (plan.ts legOut, the detail and follow screens).
import { haversine, type LatLon, type PathPoint } from '../engine/geo.ts';
import { reverseGeocode } from '../engine/places.ts';
import { patternsAt } from '../engine/raptor.ts';
import { route, type StreetMode } from '../engine/streets.ts';
import { lang, onNewDay, pl, st, tt } from './data.ts';
import type { EntrancesFile, ExitOut, OpsPart } from './ops.ts';

type Entrance = EntrancesFile['stations'][number]['entrances'][number];
const RAIL_TYPES = new Set([0, 1, 2]); // light rail, underground, train: the modes whose stations have entrances
let file: EntrancesFile | null = null;
let byStop: Map<number, Entrance[]> | null = null; // the timetable's stop -> its station's entrances, built per day
onNewDay(() => {
  byStop = null;
});

/** Whether stop `s` is called at by trains, light rail or the underground. */
function isRail(s: number): boolean {
  return patternsAt(tt!, s).some(({ p }) => RAIL_TYPES.has(tt!.routes[tt!.patRoute[p]][3]));
}
/** The file's stations tied to the timetable's stops: every rail stop within the file's distance of a station (the
 *  feed names a station's stops many ways, so the tie is by place and mode, not by name). */
function index(): Map<number, Entrance[]> {
  if (byStop) return byStop;
  byStop = new Map();
  if (!file || !tt) return byStop;
  const near = file.near_m || 200,
    box = (near / 111000) * 1.2;
  for (const stn of file.stations) {
    if (!stn.entrances.length) continue;
    for (let s = 0; s < tt.stops.length; s++) {
      if (Math.abs(tt.stopLat[s] - stn.lat) > box || Math.abs(tt.stopLon[s] - stn.lon) > box) continue;
      if (haversine(stn.lat, stn.lon, tt.stopLat[s], tt.stopLon[s]) > near || !isRail(s)) continue;
      byStop.set(s, stn.entrances);
    }
  }
  return byStop;
}
/** The street an entrance opens onto, from the address book: the nearest address's street, or the nearest street. */
function streetOf(lat: number, lon: number): string {
  if (!pl) return '';
  const r = reverseGeocode(pl, lat, lon, lang);
  if (!r) return '';
  if (r.kind === 'address') return r.name.replace(/\s+\d+[א-תa-z]?$/, '');
  return r.kind === 'street' ? r.name : '';
}
/**
 * The entrance of stop `s`'s station nearest the way between it and `point`: by the streets when the graph is in (the
 * walk's seconds), else as the crow flies; with the walk's path, from the point to the entrance, or the other way when
 * the walk leaves the station (`fromStation`). Null for a stop without entrances.
 */
export function bestEntrance(
  s: number,
  point: LatLon,
  mode: StreetMode | undefined,
  fromStation: boolean,
): { exit: ExitOut; path: PathPoint[] } | null {
  const ents = index().get(s);
  if (!ents || !ents.length) return null;
  let best: { e: Entrance; path: PathPoint[] } | null = null,
    bestCost = Infinity;
  for (const e of ents) {
    const r = st ? route(st, point.lat, point.lon, e.lat, e.lon, mode === 'bike' ? 'bike' : 'walk', 3600) : null;
    let cost: number, path: PathPoint[];
    if (r && r.path.length) {
      cost = r.seconds;
      path = [[point.lat, point.lon], ...r.path, [e.lat, e.lon]];
    } else {
      cost = haversine(point.lat, point.lon, e.lat, e.lon) / 1.1; // a walking pace with a detour, in seconds, as a street route would say
      path = [
        [point.lat, point.lon],
        [e.lat, e.lon],
      ];
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = { e, path };
    }
  }
  if (!best) return null;
  const exit: ExitOut = {
    ref: best.e.ref,
    name: best.e.name,
    lat: best.e.lat,
    lon: best.e.lon,
    street: streetOf(best.e.lat, best.e.lon),
  };
  return { exit, path: fromStation ? best.path.reverse() : best.path };
}

export const exitsOps = {
  /** The station entrances file (pipeline/entrances.py), or none. */
  setEntrances({ m }) {
    file = m || null;
    byStop = null;
    return true;
  },
} satisfies OpsPart<'setEntrances'>;
