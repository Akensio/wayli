// Names as the rider reads them, in the language set (setLang), falling back to the feed's Hebrew: stops, stations,
// cities, headsigns, a line's label; a stop as the app passes it around (stopOut); a route's id in the live data.
import {
  routeLabel,
  stopName,
  stationName,
  stopOrStationName,
  cityName,
  routeHeadsign,
  type Route,
} from '../engine/raptor.ts';
import { lang, tt } from './data.ts';
import type { StopOut } from './ops.ts';

/** What a line is called: its number; trains, each a route of its own with its train number, are one line "train". */
export const lineLabel = (r: Route): string => (r[3] === 2 ? 'train' : routeLabel(r));
export const headsign = (ri: number): string => routeHeadsign(tt!, ri, lang);
export const sName = (s: number): string => stopName(tt!, s, lang);
export const stName = (p: number): string => stationName(tt!, p, lang);
export const cName = (c: string): string => cityName(tt!, c, lang);
/** A stop's name, or its station's where it is part of one. */
export const ssName = (s: number): string => stopOrStationName(tt!, s, lang);
export function stopOut(s: number): StopOut {
  return {
    stop: s,
    name: sName(s),
    city: cName(tt!.stops[s][3]),
    code: tt!.stops[s][2],
    lat: tt!.stopLat[s],
    lon: tt!.stopLon[s],
  };
}
/** A route's id in the real-time feed: its GTFS route id, or null for a line with estimated times (pipeline/weekend.py),
 *  which no live feed carries. */
export const liveId = (r: Route): number | string | null => (r[6] ? null : (r[4] ?? null));
