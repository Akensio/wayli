// Names as the rider reads them, in the language set (setLang), falling back to the feed's Hebrew: stops, stations,
// cities, headsigns, a line's label; a stop as the app passes it around (stopOut); a route's id in the live data.
import { routeLabel, stopName, stationName, stopOrStationName, cityName, routeHeadsign } from '../engine/raptor.js';
import { lang, tt } from './data.js';

/** What a line is called: its number; trains, each a route of its own with its train number, are one line "train". */
export const lineLabel = (r) => (r[3] === 2 ? 'train' : routeLabel(r));
export const headsign = (ri) => routeHeadsign(tt, ri, lang);
export const sName = (s) => stopName(tt, s, lang);
export const stName = (p) => stationName(tt, p, lang);
export const cName = (c) => cityName(tt, c, lang);
/** A stop's name, or its station's where it is part of one. */
export const ssName = (s) => stopOrStationName(tt, s, lang);
export function stopOut(s) {
  return { stop: s, name: sName(s), city: cName(tt.stops[s][3]), code: tt.stops[s][2], lat: tt.stopLat[s], lon: tt.stopLon[s] };
}
/** A route's id in the real-time feed: its GTFS route id, or null for a line with estimated times (pipeline/weekend.py),
 *  which no live feed carries. */
export const liveId = (r) => (r[6] ? null : r[4] ?? null);
