// Wayli: compact timetable loader + RAPTOR trip planner.
// Plain ES module, runs in the browser and in Node (see measure/bench.ts).
//
// plan()    one departure time, earliest arrival per number of transfers.
// profile() a departure window (range RAPTOR): every journey worth showing.
// Both take sets of origin and destination stops with access/egress walking
// times, so a station with many platforms, or a location with several stops
// nearby, is one query.

import { readContainer, type ContainerHeader } from './container.ts';
import { hhmm } from './clock.ts';
import { norm, byScore } from './text.ts';
import type { LatLon } from './geo.ts';

const INF = 0x7fffffff;

// ---------------------------------------------------------------- the timetable

/** A route as the header lists it: one line in one direction (in the Israel feed every route_id is one direction of
 *  one line). Its number (empty for a train), the MOT long name "origin-city<->destination-city-1#", the operator, the
 *  GTFS route type (0 light rail, 2 rail, 3 bus, 8 shared taxi, 715 on demand; modes.ts names them), the GTFS route id
 *  (the live data's line ref, a number when it is all digits), the line's code from route_desc (what a line's
 *  directions and variants share; null in old files) and 1 for a line whose times are estimates (pipeline/weekend.py;
 *  the tests write false). */
export type Route = [
  short: string,
  longName: string,
  agency: string,
  type: number,
  routeId: number | string | null, // the feed's route_id (a number in Israel's GTFS, text kept as text); null for a line with estimated times
  lineCode: string | null,
  estimated: number | boolean,
];
/** A stop as the header lists it: its GTFS id, its name as the feed gives it (Hebrew), the number on its sign and its
 *  city (from stop_desc; '' when the feed gives none). */
export type Stop = [id: string, name: string, code: string, city: string];
/** A station (a GTFS parent station): its id and name. Its index is what stopParent holds. */
export type Station = [id: string, name: string];
/** The names in one other language, from the feed's translations.txt: per stop and per station (indexed as the
 *  timetable's, '' where none), cities by their Hebrew name, and headsigns per route ('' where none). */
export type NamesIn = { stops: string[]; stations: string[]; cities: Record<string, string>; routes: string[] };
/** How the compiler built the footpaths (metres, metres per second, seconds), and the two values the router reads:
 *  `transfer_slack_s` between getting off and boarding at the same stop, `chain_max_s` the longest chain of footpaths
 *  it may string together. */
export type WalkParams = {
  radius_m: number;
  speed_mps: number;
  min_s: number;
  buffer_s: number;
  station_min_s: number;
  transfer_slack_s: number;
  chain_max_s: number;
};
/** The timetable container's header, as pipeline/compile.py writes it (docs/architecture.md, "Compact timetable"). */
export type TimetableHeader = ContainerHeader & {
  format: number; // 3
  date: string; // the service day, YYYYMMDD
  feed?: Record<string, string>; // feed_info.txt: publisher, dates, version
  built?: string; // when it was built, ISO
  hash?: string; // the content hash (pipeline/container.py)
  counts: {
    stops: number;
    patterns: number;
    trips: number;
    events: number; // (trip, stop) pairs: the length of depDelta
    footpaths: number;
    routes: number;
    stations: number;
    [k: string]: number;
  };
  walk?: WalkParams;
  routes: Route[];
  /** Every other line of the feed by its route id (number, operator, type, where it heads): a vehicle reporting live
   *  on a line with no trips that day is still named. */
  otherRoutes?: Record<string, [line: string, agency: string, type: number, headsign: string]>;
  stops: Stop[];
  stations?: Station[];
  names?: Record<string, NamesIn> | null; // by language code ('en'); null or missing in a file built without
  streets?: { file: string; max_walk_s: number; footpaths: number } | null;
  shapes?: { file: string; patterns: number } | null;
  rail?: { pairs: number; patterns: number; straight: number } | null;
};
/** The sections the timetable file has; the last nine only when the compiler was run with --shapes or --rail. */
type TimetableSection =
  | 'patStopsOff'
  | 'patStops'
  | 'patTripsOff'
  | 'tripTimesOff'
  | 'patRoute'
  | 'patIntercity'
  | 'tripStart'
  | 'depDelta'
  | 'dwell'
  | 'stopPatsOff'
  | 'stopPats'
  | 'trOff'
  | 'trTo'
  | 'trTime'
  | 'stopLat'
  | 'stopLon'
  | 'stopParent'
  | 'stopNode'
  | 'patShape'
  | 'patShapeSeg'
  | 'patShapeFrac'
  | 'railPairOff'
  | 'railLat'
  | 'railLon';
/** A stop's name and city in one other language, normalised for the search as the Hebrew ones are (buildSearchIndex). */
export type AltNames = { lang: string; name: string[]; city: string[] };
/**
 * The day's timetable: the container's sections viewed in place, the header's lists, and what the parser derives.
 * Times are seconds on the service day (past 86400 after midnight); stops, patterns, trips, routes and stations are
 * indices into their arrays. A pattern is one stop sequence of one route; its trips are sorted by departure and do not
 * overtake. Trip t of pattern p has its i-th stop's times at tripTimesOff[p] + (t - patTripsOff[p]) * ns + i, where
 * ns = patStopsOff[p + 1] - patStopsOff[p] is the pattern's number of stops.
 */
export type Timetable = {
  header: TimetableHeader;
  // ---- the sections
  /** Pattern p's stops are patStops[patStopsOff[p] .. patStopsOff[p + 1]). */
  patStopsOff: Int32Array;
  patStops: Int32Array;
  /** Pattern p's trips are patTripsOff[p] .. patTripsOff[p + 1]), by departure. */
  patTripsOff: Int32Array;
  /** Where pattern p's times start in depDelta, dwell, dep and arr (see above). */
  tripTimesOff: Int32Array;
  /** Pattern -> its route (an index into routes). */
  patRoute: Int32Array;
  /** Pattern -> 1 for an intercity bus (a bike may ride in its luggage compartment); missing in old files. */
  patIntercity?: Uint8Array;
  /** Trip -> its departure from its first stop. */
  tripStart: Int32Array;
  /** Per (trip, stop): seconds from the previous stop's departure to this one's (0 at the first stop). */
  depDelta: Uint16Array;
  /** Per (trip, stop): seconds the vehicle waits there (its arrival is the departure minus this). */
  dwell: Uint16Array;
  /** Stop s's (pattern, position) pairs are stopPats[2i], stopPats[2i + 1] for i in stopPatsOff[s] .. stopPatsOff[s + 1]). */
  stopPatsOff: Int32Array;
  stopPats: Int32Array;
  /** The footpaths from stop s: to trTo[i] in trTime[i] seconds (the compiler's margins included), i in
   *  trOff[s] .. trOff[s + 1]); along the streets within 10 minutes, and platform to platform inside a station. */
  trOff: Int32Array;
  trTo: Int32Array;
  trTime: Int32Array;
  stopLat: Float32Array;
  stopLon: Float32Array;
  /** Stop -> its station (an index into stations), -1 for a stop on its own (all -1 when the file lacks it). */
  stopParent: Int32Array;
  /** Stop -> its node in the street graph (streets.ts), -1 when none within reach (all -1 without --streets). */
  stopNode: Int32Array;
  /** With --shapes or --rail: pattern -> its GTFS shape id in the courses file, -2 for a train (its course is the
   *  track, railPairOff), -1 for none. */
  patShape?: Int32Array;
  /** Per pattern stop (as patStops): the course segment the stop falls on (for a train, its rail pair's index) and
   *  how far along it, 0..65535 for 0..1. */
  patShapeSeg?: Int32Array;
  patShapeFrac?: Uint16Array;
  /** With --rail: rail pair k's track is railLat/railLon[railPairOff[k] .. railPairOff[k + 1]), in 1e-5 degrees. */
  railPairOff?: Int32Array;
  railLat?: Int32Array;
  railLon?: Int32Array;
  // ---- from the header
  counts: TimetableHeader['counts'];
  routes: Route[];
  stops: Stop[];
  stations: Station[];
  /** The names in other languages by language code; {} when the file carries none. */
  names: Record<string, NamesIn>;
  /** Seconds between getting off and boarding at the same stop (header walk.transfer_slack_s; 90). */
  slack: number;
  /** The longest chain of footpaths between two rides, seconds (header walk.chain_max_s; 900). */
  chainMax: number;
  // ---- derived on load
  /** Per (trip, stop), as depDelta: the departure and the arrival, absolute (expandTimes). The worker shifts them in
   *  place with live data for the length of a plan. */
  dep: Int32Array;
  arr: Int32Array;
  /** Trip -> its pattern. */
  tripPat: Int32Array;
  /** Pattern -> its route's GTFS route type. */
  patType: Int16Array; // GTFS route types reach 715 (on demand)
  /** Per stop: its name and its city normalised for the search (text.ts norm), in Hebrew. */
  stopName: string[];
  stopCity: string[];
  /** The same in each other language the timetable carries. */
  altNames: AltNames[];
  /** Station -> its stops (every platform). */
  stationStops: Map<number, number[]>;
};

// ---- reading the layout: the router's own loops read the arrays above directly (they are the hot path); everything
// else asks these, so the arithmetic of where a pattern's stops or a trip's times sit is written once.
/** How many stops pattern p has. */
export const patternLength = (tt: Timetable, p: number): number => tt.patStopsOff[p + 1] - tt.patStopsOff[p];
/** Where position i of pattern p sits in the arrays kept per pattern stop (patStops, patShapeSeg, patShapeFrac). */
export const patternIndex = (tt: Timetable, p: number, i: number): number => tt.patStopsOff[p] + i;
/** The stop at position i of pattern p. */
export const patternStop = (tt: Timetable, p: number, i: number): number => tt.patStops[patternIndex(tt, p, i)];
/** Pattern p's last stop. */
export const lastStop = (tt: Timetable, p: number): number => tt.patStops[tt.patStopsOff[p + 1] - 1];
/** Pattern p's stops from position a to b, both included. */
export const stopsBetween = (tt: Timetable, p: number, a: number, b: number): number[] =>
  Array.from(tt.patStops.subarray(tt.patStopsOff[p] + a, tt.patStopsOff[p] + b + 1));
/** Pattern p's trips, by departure: t from `first` up to (not including) `end`. */
export const tripRange = (tt: Timetable, p: number): { first: number; end: number } => ({
  first: tt.patTripsOff[p],
  end: tt.patTripsOff[p + 1],
});
/** How many trips pattern p has. */
export const tripCount = (tt: Timetable, p: number): number => tt.patTripsOff[p + 1] - tt.patTripsOff[p];
/** The patterns calling at stop s, each with the stop's position on it. */
export function patternsAt(tt: Timetable, s: number): { p: number; pos: number }[] {
  const out: { p: number; pos: number }[] = [];
  for (let i = tt.stopPatsOff[s]; i < tt.stopPatsOff[s + 1]; i++)
    out.push({ p: tt.stopPats[2 * i], pos: tt.stopPats[2 * i + 1] });
  return out;
}
/** Where trip t's times are: its i-th stop departs at dep[timesRow(tt, t) + i] and arrives at arr[timesRow(tt, t) + i]. */
export function timesRow(tt: Timetable, t: number): number {
  const p = tt.tripPat[t];
  return tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * patternLength(tt, p);
}

/** Parse the decompressed timetable container into typed arrays. */
export function parseTimetable(ab: ArrayBuffer): Timetable {
  const tt = readContainer<TimetableSection, TimetableHeader>(ab) as Timetable, // the rest is added below
    header = tt.header;
  Object.assign(tt, {
    counts: header.counts,
    routes: header.routes,
    stops: header.stops,
    stations: header.stations || [],
    names: header.names || {},
  });
  const w: Partial<WalkParams> = header.walk || {};
  tt.slack = w.transfer_slack_s ?? 90;
  tt.chainMax = w.chain_max_s ?? 900;
  if (!tt.stopParent) tt.stopParent = new Int32Array(tt.stops.length).fill(-1);
  expandTimes(tt);
  buildSearchIndex(tt);
  return tt;
}

/** Turn (tripStart, depDelta, dwell) into absolute arrival/departure arrays. */
function expandTimes(tt: Timetable): void {
  const n = tt.depDelta.length;
  const dep = new Int32Array(n),
    arr = new Int32Array(n);
  const { patStopsOff, patTripsOff, tripTimesOff, tripStart, depDelta, dwell } = tt;
  const P = patStopsOff.length - 1;
  const tripPat = new Int32Array(tripStart.length);
  for (let p = 0; p < P; p++) {
    const ns = patStopsOff[p + 1] - patStopsOff[p];
    let idx = tripTimesOff[p];
    for (let t = patTripsOff[p]; t < patTripsOff[p + 1]; t++) {
      tripPat[t] = p;
      let cur = tripStart[t];
      for (let i = 0; i < ns; i++, idx++) {
        cur += depDelta[idx];
        dep[idx] = cur;
        arr[idx] = cur - dwell[idx];
      }
    }
  }
  tt.dep = dep;
  tt.arr = arr;
  tt.tripPat = tripPat;
  // GTFS route_type per pattern (0 light rail, 2 rail, 3 bus), for "bike on board" filtering
  const patType = new Int16Array(P);
  for (let p = 0; p < P; p++) patType[p] = tt.routes[tt.patRoute[p]][3];
  tt.patType = patType;
}

/**
 * Bikes on board, Israel (sources in docs/architecture.md):
 *  - folding bikes: any bus, light rail and train, at any hour;
 *  - other bikes: trains outside the weekday peaks (Sun-Thu 06:00-09:00, 15:00-19:00),
 *    intercity buses in the luggage compartment (space permitting); not city buses or light rail.
 */
const BIKE_RULES = {
  trainPeak: [
    [6 * 3600, 9 * 3600],
    [15 * 3600, 19 * 3600],
  ],
};
function bikeAllowed(tt: Timetable, p: number, depTime: number, folding: boolean, weekday = true): boolean {
  if (folding) return true;
  const type = tt.patType[p];
  if (type === 2) {
    if (!weekday) return true;
    for (const [a, b] of BIKE_RULES.trainPeak) if (depTime >= a && depTime < b) return false;
    return true;
  }
  if (type === 3) return tt.patIntercity ? tt.patIntercity[p] === 1 : false;
  return false;
}

// ---------------------------------------------------------------- search

function buildSearchIndex(tt: Timetable): void {
  const S = tt.stops.length;
  tt.stopName = new Array(S);
  tt.stopCity = new Array(S);
  for (let i = 0; i < S; i++) {
    tt.stopName[i] = norm(tt.stops[i][1]);
    tt.stopCity[i] = norm(tt.stops[i][3] || '');
  }
  // the same names in the other languages the timetable carries, so a stop matches whichever one is typed
  tt.altNames = [];
  for (const [lang, n] of Object.entries(tt.names)) {
    if (!n || !n.stops) continue;
    const name: string[] = new Array(S),
      city: string[] = new Array(S);
    for (let i = 0; i < S; i++) {
      name[i] = n.stops[i] ? norm(n.stops[i]) : '';
      city[i] = norm((n.cities && n.cities[tt.stops[i][3]]) || '');
    }
    tt.altNames.push({ lang, name, city });
  }
  // station groups: parent index -> member stops
  tt.stationStops = new Map();
  for (let i = 0; i < S; i++) {
    const p = tt.stopParent[i];
    if (p >= 0) {
      if (!tt.stationStops.has(p)) tt.stationStops.set(p, []);
      tt.stationStops.get(p)!.push(i);
    }
  }
}

// ---------------------------------------------------------------- names in the rider's language

const other = (tt: Timetable, lang: string | undefined): NamesIn | null =>
  (lang && lang !== 'he' && tt.names[lang]) || null;
/** A stop's name in `lang` when the timetable carries it, else as the feed names it (Hebrew). */
export function stopName(tt: Timetable, s: number, lang?: string): string {
  const n = other(tt, lang);
  return (n && n.stops[s]) || tt.stops[s][1];
}
export function stationName(tt: Timetable, p: number, lang?: string): string {
  const n = other(tt, lang);
  return (n && n.stations[p]) || (tt.stations[p] && tt.stations[p][1]) || '';
}
/** A stop's name where it is part of a station: the station's, else its own. */
export function stopOrStationName(tt: Timetable, s: number, lang?: string): string {
  const p = tt.stopParent[s];
  return (p >= 0 && stationName(tt, p, lang)) || stopName(tt, s, lang);
}
/** The stops of the station a stop is part of (every platform), or the stop alone; a new array. */
export function stationStopsOf(tt: Timetable, s: number): number[] {
  const p = tt.stopParent[s];
  return p >= 0 ? (tt.stationStops.get(p) || [s]).slice() : [s];
}
/** Where some stops are together: their mean position. */
export function centreOf(tt: Timetable, stops: number[]): LatLon {
  let lat = 0,
    lon = 0;
  for (const s of stops) {
    lat += tt.stopLat[s];
    lon += tt.stopLon[s];
  }
  return { lat: lat / stops.length, lon: lon / stops.length };
}
export function cityName(tt: Timetable, city: string, lang?: string): string {
  const n = other(tt, lang);
  return (n && n.cities && n.cities[city]) || city || '';
}
/** Where a route is headed: the destination half of the MOT route_long_name "origin-city<->destination-city-1#". */
export function parseHeadsign(longName: string): string {
  const parts = longName.split('<->');
  if (parts.length !== 2) return longName;
  const dest = parts[1].replace(/-\d+[#א-ת]*$/, '').trim();
  const i = dest.lastIndexOf('-');
  return i > 0 ? dest.slice(0, i).trim() : dest;
}
export function routeHeadsign(tt: Timetable, ri: number, lang?: string): string {
  const n = other(tt, lang);
  return (n && n.routes && n.routes[ri]) || parseHeadsign(tt.routes[ri][1]);
}

/** How well a name (with its city) answers the typed tokens; null when a token matches neither. */
function matchScore(name: string, city: string, tokens: string[]): number | null {
  if (!name) return null;
  let score = 0;
  for (const tok of tokens) {
    if (name === tok || name.startsWith(tok + ' '))
      score += 4; // a whole first word (הל"ה/הדרים for "הלה"), not just a prefix (הלהב)
    else if (name.startsWith(tok)) score += 3;
    else if (name.includes(' ' + tok)) score += 2.5;
    else if (name.includes(tok)) score += 2;
    else if (city.startsWith(tok) || city.includes(' ' + tok)) score += 1;
    else if (city.includes(tok)) score += 0.5;
    else return null;
  }
  if (tokens.join(' ') === name) score += 1.5; // the whole name, typed in full
  return score - name.length / 200;
}

/** A hit of the stop search: a station with all its platforms, or a stop on its own, named in the rider's language.
 *  `key` tells which ('p' + the station's index, 's' + the stop's); `stops` its stops; `lat`/`lon` their centre;
 *  `code` the number on the sign of the first stop matched; `score` how well it matched (matchScore, +1 for a
 *  station; byScore in text.ts orders by it). */
export type StopHit = {
  key: string;
  name: string;
  city: string;
  stops: number[];
  score: number;
  lat: number;
  lon: number;
  code: string;
};

/**
 * Search stops by name and city, in Hebrew or any language the timetable carries names in. Returns groups:
 * a station with all its platforms is one result, a plain stop is a group of one, named in `lang`.
 * [{ name, city, stops: [idx...], lat, lon, score }]
 */
export function searchStops(tt: Timetable, query: string, limit = 12, lang = 'he'): StopHit[] {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const S = tt.stops.length;
  const groups = new Map<string, StopHit>();
  for (let i = 0; i < S; i++) {
    let score = matchScore(tt.stopName[i], tt.stopCity[i], tokens);
    for (const a of tt.altNames) {
      const s2 = matchScore(a.name[i], a.city[i], tokens);
      if (s2 != null && (score == null || s2 > score)) score = s2;
    }
    if (score == null) continue;
    const p = tt.stopParent[i];
    if (p >= 0) score += 1;
    const key = p >= 0 ? 'p' + p : 's' + i;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: stopOrStationName(tt, i, lang),
        city: cityName(tt, tt.stops[i][3], lang),
        stops: [],
        score: -Infinity,
        lat: 0,
        lon: 0,
        code: tt.stops[i][2],
      };
      groups.set(key, g);
    }
    g.stops.push(i);
    if (score > g.score) g.score = score;
  }
  const out = Array.from(groups.values());
  for (const g of out) {
    // a station with a partial name match: include all its platforms, not only the matching ones
    if (tt.stopParent[g.stops[0]] >= 0) g.stops = stationStopsOf(tt, g.stops[0]);
    Object.assign(g, centreOf(tt, g.stops));
  }
  out.sort(byScore);
  return out.slice(0, limit);
}

// ---------------------------------------------------------------- routing

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** A stop at one end of a query: its index, and the seconds from the door to it (an origin) or from it to the door
 *  (a destination); 0 when the rider is at the stop. */
export type StopAccess = { stop: number; walk: number };
/** One end of a query as profile and plan take it: a stop index, stops (each with its access or bare), or a search
 *  hit (all its stops, no walk). */
export type StopSet = number | (number | StopAccess)[] | { stops: number[] };

/** Normalise an origin/destination argument: a stop index, a search group, or [{stop, walk}]. */
function asPlaces(x: StopSet): StopAccess[] {
  if (typeof x === 'number') return [{ stop: x, walk: 0 }];
  if (Array.isArray(x)) return x.map((e) => (typeof e === 'number' ? { stop: e, walk: 0 } : e));
  if (x && x.stops) return x.stops.map((s) => ({ stop: s, walk: 0 }));
  throw new Error('bad place');
}

/** What profile and plan may be told. Every time is seconds. */
export type ProfileOptions = {
  /** Vehicles boarded, minus one; 3 unless said. */
  maxTransfers?: number;
  /** Between getting off and boarding at the same stop; the timetable's (90) unless said. */
  slack?: number;
  /** Only vehicles of these GTFS route types ([2]: trains only). */
  routeTypes?: number[];
  /** The bike rides along: only vehicles, and hours, that allow it (bikeAllowed). */
  bikeOnBoard?: boolean;
  /** A folding bike, allowed on everything at any hour. */
  folding?: boolean;
  /** A Sunday to Thursday, when the trains' peak rule applies; true unless said. */
  weekday?: boolean;
  /** The longest chain of footpaths between two rides; the timetable's chain_max_s capped at 600 unless said. */
  maxWalkChain?: number;
  /** The whole walk at the start, the access leg and any footpath chained to it; unset: the footpaths alone, bounded
   *  by maxWalkChain. */
  maxAccess?: number | null;
  /** The same at the end: the footpaths walked to the last stop and the egress leg. */
  maxEgress?: number | null;
  /** The journeys as found, in no order and with the ones rank would drop. */
  raw?: boolean;
};

/**
 * A leg of a journey as the router finds it (the worker, src/worker/plan.ts, dresses it into the page's Leg,
 * src/journey/types.ts). Times are seconds on the service day; `from` and `to` are stop indices, -1 for the door.
 */
/** From the door to the first stop; `origin` is the index, in the query's origins, of the stop it reaches. */
export type RawAccessLeg = {
  type: 'access';
  from: -1;
  to: number;
  seconds: number;
  depart: number;
  arrive: number;
  origin: number;
};
/** A footpath between two stops, `seconds` as the timetable's trTime (margins included). */
export type RawWalkLeg = { type: 'walk'; from: number; to: number; seconds: number; depart: number; arrive: number };
/** From the last stop to the door; only when the destination has a walk. */
export type RawEgressLeg = { type: 'egress'; from: number; to: -1; seconds: number; depart: number; arrive: number };
/** A ride on trip `trip` of pattern `pattern`, boarded at `from` and left at `to`: `depart` the departure at `from`,
 *  `arrive` the arrival at `to`, `stops` how many stops are ridden (the alighting position minus the boarding one),
 *  `via` every stop from `from` to `to` inclusive, `route` the pattern's route. */
export type RawRideLeg = {
  type: 'ride';
  trip: number;
  pattern: number;
  route: Route;
  from: number;
  to: number;
  depart: number;
  arrive: number;
  stops: number;
  via: number[];
};
export type RawLeg = RawRideLeg | RawWalkLeg | RawAccessLeg | RawEgressLeg;
/** A journey as the router finds it: leaving the door at `depart`, at the other door at `arrive`, `transfers` the
 *  rides minus one, `walkSeconds` every leg that is not a ride. The page's Journey (src/journey/types.ts) is this with
 *  dressed legs. */
export type RawJourney = {
  depart: number;
  arrive: number;
  transfers: number;
  walkSeconds: number;
  legs: RawLeg[];
};
/** What profile answers: the journeys (ranked unless `raw`), how many departure times it ran RAPTOR from (`runs`, of
 *  the `candidates` found in the window) and how long it took, milliseconds. */
export type ProfileResult = { journeys: RawJourney[]; runs: number; candidates: number; ms: number };
/** What plan answers: the journeys, the most rounds any of them took (rides) and how long it took, milliseconds. */
export type SinglePlanResult = { journeys: RawJourney[]; rounds: number; ms: number };

/**
 * Range RAPTOR over [fromTime, toTime] (seconds since midnight).
 * origins / dests: stop index, search group, or [{stop, walk}] with access/egress seconds.
 * Returns { journeys, runs, candidates, ms }.
 */
export function profile(
  tt: Timetable,
  originSet: StopSet,
  destSet: StopSet,
  fromTime: number,
  toTime: number,
  opts: ProfileOptions = {},
): ProfileResult {
  const t0 = now();
  const origins = asPlaces(originSet);
  const dests = asPlaces(destSet);
  const maxTransfers = opts.maxTransfers ?? 3;
  const slack = opts.slack ?? tt.slack;
  // optional restriction to vehicle types (GTFS route_type), and the bike-on-board rules
  let allowed: Set<number> | null = null;
  if (opts.routeTypes) {
    allowed = new Set(opts.routeTypes);
  }
  const patType = tt.patType;
  const bike = opts.bikeOnBoard ? { folding: !!opts.folding, weekday: opts.weekday ?? true } : null;
  const patOk = (p: number) =>
    (!allowed || allowed.has(patType[p])) &&
    (!bike || bike.folding || patType[p] === 2 || (patType[p] === 3 && tt.patIntercity && tt.patIntercity[p] === 1));
  const tripOk = (p: number, d: number) => !bike || bikeAllowed(tt, p, d, bike.folding, bike.weekday);
  const chainMax = opts.maxWalkChain ?? Math.min(tt.chainMax, 600);
  // the whole walk at either end, the access or egress leg and any footpath chained to it, within the rider's longest
  // walk (seconds; unset: the footpaths only bounded by chainMax). A 15-minute walk to one stop plus 2 to the next
  // came out as a 17-minute start against a 15-minute setting (2026-10-22).
  const accessMax = opts.maxAccess ?? null,
    egressMax = opts.maxEgress ?? null;
  const S = tt.stops.length,
    K = maxTransfers + 1;
  const { patStopsOff, patStops, patTripsOff, tripTimesOff, stopPatsOff, stopPats, trOff, trTo, trTime, dep, arr } = tt;

  const tau: Int32Array[] = [],
    lblType: Int8Array[] = [],
    lblTrip: Int32Array[] = [],
    lblBoardPos: Int32Array[] = [],
    lblAlightPos: Int32Array[] = [],
    lblFrom: Int32Array[] = [],
    lblWalk: Int32Array[] = [],
    lblRide: Int8Array[] = [];
  for (let k = 0; k <= K; k++) {
    tau.push(new Int32Array(S).fill(INF));
    lblType.push(new Int8Array(S));
    lblRide.push(new Int8Array(S));
    lblTrip.push(new Int32Array(S));
    lblBoardPos.push(new Int32Array(S));
    lblAlightPos.push(new Int32Array(S));
    lblFrom.push(new Int32Array(S));
    lblWalk.push(new Int32Array(S));
  }
  const best = new Int32Array(S).fill(INF);
  const bestK = new Int8Array(S).fill(127); // round that achieved best[]; a tie with fewer rounds still counts
  const destWalk = new Int32Array(S).fill(-1);
  for (const d of dests) if (destWalk[d.stop] < 0 || d.walk < destWalk[d.stop]) destWalk[d.stop] = d.walk;
  let bestDest = INF;
  const marked = new Uint8Array(S);
  let markedList: number[] = [];

  const better = (k: number, s: number, t: number) => t < best[s] || (t === best[s] && k < bestK[s]);
  const improve = (k: number, s: number, t: number, w = 0): void => {
    tau[k][s] = t;
    best[s] = t;
    bestK[s] = k;
    if (destWalk[s] >= 0 && (egressMax == null || w + destWalk[s] <= egressMax) && t + destWalk[s] < bestDest)
      bestDest = t + destWalk[s];
    if (!marked[s]) {
      marked[s] = 1;
      markedList.push(s);
    }
  };

  // chained footpaths from the stops in `queue`, bounded by chainMax per chain
  const relaxWalks = (k: number, queue: number[]): void => {
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi];
      const tp = tau[k][p],
        wp = lblWalk[k][p];
      for (let i = trOff[p]; i < trOff[p + 1]; i++) {
        const w = wp + trTime[i];
        // round 0 walks on from the access leg: the whole of it within accessMax (lblWalk there includes the access)
        if (k === 0 && accessMax != null ? w > accessMax : w > chainMax) continue;
        const q = trTo[i],
          tq = tp + trTime[i];
        if (tq < tau[k][q] && better(k, q, tq) && tq <= bestDest + EGRESS_GRAIN) {
          improve(k, q, tq, w);
          lblType[k][q] = 2;
          lblFrom[k][q] = p;
          lblWalk[k][q] = w;
          lblRide[k][q] = 0;
          queue.push(q);
        }
      }
    }
  };

  // candidate departure times: trips leaving any stop reachable from an origin, inside the window.
  // One merged reach map over all origins (access time + walk chain), each stop enumerated once.
  const cands = new Set<number>();
  const reach = new Map<number, number>();
  const queue: number[] = [];
  for (const o of origins) {
    if (!reach.has(o.stop) || reach.get(o.stop)! > o.walk) {
      reach.set(o.stop, o.walk);
      queue.push(o.stop);
    }
  }
  const chainFrom = new Map<number, number>(origins.map((o) => [o.stop, 0])); // walking done since the access leg
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi],
      tp = reach.get(p)!,
      cp = chainFrom.get(p) ?? 0;
    for (let i = trOff[p]; i < trOff[p + 1]; i++) {
      const c = cp + trTime[i];
      if (c > chainMax || (accessMax != null && tp + trTime[i] > accessMax)) continue;
      const q = trTo[i],
        tq = tp + trTime[i];
      if (!reach.has(q) || reach.get(q)! > tq) {
        reach.set(q, tq);
        chainFrom.set(q, c);
        queue.push(q);
      }
    }
  }
  for (const [q, w] of reach) {
    for (let i = stopPatsOff[q]; i < stopPatsOff[q + 1]; i++) {
      const p = stopPats[2 * i],
        pos = stopPats[2 * i + 1];
      if (!patOk(p)) continue;
      const ns = patStopsOff[p + 1] - patStopsOff[p];
      if (pos === ns - 1) continue;
      const tFirst = patTripsOff[p],
        tEnd = patTripsOff[p + 1],
        base = tripTimesOff[p];
      // trips are sorted by time: binary search the first one in the window, stop at the end of it
      let lo = 0,
        hi = tEnd - tFirst;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dep[base + mid * ns + pos] - w < fromTime) lo = mid + 1;
        else hi = mid;
      }
      for (let t = tFirst + lo; t < tEnd; t++) {
        const d = dep[base + (t - tFirst) * ns + pos] - w;
        if (d > toTime) break;
        cands.add(Math.floor(d / 60) * 60);
      }
    }
  }
  if (fromTime === toTime || cands.size === 0) cands.add(fromTime);
  const departures = Array.from(cands).sort((a, b) => b - a);

  const journeys: RawJourney[] = [];
  const seen = new Set<string>();
  // the footpath walked into a stop at round k (the label may be inherited from an earlier round)
  const walkIn = (k: number, s: number): number => {
    while (k > 0 && lblType[k][s] === 0) k--;
    return lblType[k][s] === 2 ? lblWalk[k][s] : 0;
  };
  const endOk = (k: number, d: StopAccess) => egressMax == null || walkIn(k, d.stop) + d.walk <= egressMax;
  const destArr = (k: number): number => {
    let m = INF;
    for (const d of dests) {
      const v = tau[k][d.stop];
      if (v !== INF && v + d.walk < m && endOk(k, d)) m = v + d.walk;
    }
    return m;
  };
  const extract = (k: number): void => {
    // which destination stop to get off at in round k: the earliest arrival at the door, walk included; but among the
    // stops that arrive within EGRESS_GRAIN of it, the one with the least walking (the walk on from the stop reached
    // and the way to the door): once aboard, staying on to the stop by the door costs nothing, while getting off a
    // block early to arrive seconds sooner is a walk for nothing. The journey's arrival is the real one.
    let earliest = INF;
    for (const d of dests) {
      const v = tau[k][d.stop];
      if (v !== INF && v + d.walk < earliest && endOk(k, d)) earliest = v + d.walk;
    }
    if (earliest === INF) return;
    const walkOf = (d: StopAccess) => walkIn(k, d.stop) + d.walk;
    let found: StopAccess | null = null;
    for (const d of dests) {
      const v = tau[k][d.stop];
      if (v === INF || v + d.walk > earliest + EGRESS_GRAIN || !endOk(k, d)) continue;
      if (
        !found ||
        walkOf(d) < walkOf(found) ||
        (walkOf(d) === walkOf(found) && v + d.walk < tau[k][found.stop] + found.walk)
      )
        found = d;
    }
    const bestD = found!; // the stop that set `earliest` passes the test above, so one was found
    const bestT = tau[k][bestD.stop] + bestD.walk;
    const legs: RawLeg[] = [];
    let s = bestD.stop,
      kk = k,
      guard = 0;
    while (kk >= 0 && guard++ < 1000) {
      const type = lblType[kk][s];
      if (type === 0) {
        kk--;
        continue;
      }
      if (type === 3) {
        const o = origins[lblFrom[kk][s]];
        legs.push({
          type: 'access',
          from: -1,
          to: s,
          seconds: o.walk,
          depart: tau[0][s] - o.walk,
          arrive: tau[0][s],
          origin: lblFrom[kk][s],
        });
        break;
      }
      if (type === 2) {
        const from = lblFrom[kk][s];
        legs.push({
          type: 'walk',
          from,
          to: s,
          seconds: tau[kk][s] - tau[kk][from],
          depart: tau[kk][from],
          arrive: tau[kk][s],
        });
        s = from;
        continue;
      }
      const t = lblTrip[kk][s],
        p = tt.tripPat[t];
      const ns = patStopsOff[p + 1] - patStopsOff[p];
      const base = tripTimesOff[p] + (t - patTripsOff[p]) * ns;
      const bp = lblBoardPos[kk][s],
        ap = lblAlightPos[kk][s];
      const from = patStops[patStopsOff[p] + bp];
      legs.push({
        type: 'ride',
        trip: t,
        pattern: p,
        route: tt.routes[tt.patRoute[p]],
        from,
        to: s,
        depart: dep[base + bp],
        arrive: arr[base + ap],
        stops: ap - bp,
        via: Array.from(patStops.subarray(patStopsOff[p] + bp, patStopsOff[p] + ap + 1)),
      });
      s = from;
      kk--;
    }
    legs.reverse();
    // leave as late as the first vehicle allows: shift the walks before it
    const firstRide = legs.findIndex((l) => l.type === 'ride');
    if (firstRide > 0) {
      let t = legs[firstRide].depart;
      for (let i = firstRide - 1; i >= 0; i--) {
        const l = legs[i] as RawAccessLeg | RawWalkLeg; // before the first ride there is only walking
        l.arrive = t;
        t -= l.seconds;
        l.depart = t;
      }
    }
    if (bestD.walk > 0)
      legs.push({
        type: 'egress',
        from: bestD.stop,
        to: -1,
        seconds: bestD.walk,
        depart: tau[k][bestD.stop],
        arrive: bestT,
      });
    const sig = journeySig({ legs } as RawJourney);
    if (seen.has(sig)) return;
    seen.add(sig);
    const rides = legs.filter((l) => l.type === 'ride');
    let walk = 0;
    for (const l of legs) if (l.type !== 'ride') walk += l.seconds;
    journeys.push({
      depart: legs[0].depart,
      arrive: bestT,
      transfers: Math.max(0, rides.length - 1),
      walkSeconds: walk,
      legs,
    });
  };

  let runs = 0;
  for (const depTime of departures) {
    runs++;
    const before: number[] = [];
    for (let k = 0; k <= K; k++) before.push(destArr(k));
    for (let i = 0; i < markedList.length; i++) marked[markedList[i]] = 0;
    markedList = [];
    for (let oi = 0; oi < origins.length; oi++) {
      const o = origins[oi],
        t = depTime + o.walk;
      if (t < tau[0][o.stop] || (t === tau[0][o.stop] && lblType[0][o.stop] !== 3)) {
        improve(0, o.stop, t);
        lblType[0][o.stop] = 3;
        lblFrom[0][o.stop] = oi;
        lblWalk[0][o.stop] = accessMax != null ? o.walk : 0;
        lblRide[0][o.stop] = 0;
      }
    }
    relaxWalks(0, markedList.slice());

    for (let k = 1; k <= K && markedList.length; k++) {
      // inherit: tau[k] = min(tau[k], tau[k-1])
      const tk = tau[k],
        tp = tau[k - 1],
        rk = lblRide[k],
        rp = lblRide[k - 1],
        lk = lblType[k];
      for (let s = 0; s < S; s++)
        if (tp[s] < tk[s]) {
          tk[s] = tp[s];
          lk[s] = 0;
          rk[s] = rp[s];
        }
      const Q = new Map<number, number>();
      for (const s of markedList) {
        for (let i = stopPatsOff[s]; i < stopPatsOff[s + 1]; i++) {
          const p = stopPats[2 * i],
            pos = stopPats[2 * i + 1];
          if (!patOk(p)) continue;
          const cur = Q.get(p);
          if (cur === undefined || pos < cur) Q.set(p, pos);
        }
      }
      for (let i = 0; i < markedList.length; i++) marked[markedList[i]] = 0;
      markedList = [];
      const improved: number[] = [];
      for (const [p, startPos] of Q) {
        const ns = patStopsOff[p + 1] - patStopsOff[p],
          sBase = patStopsOff[p];
        const tFirst = patTripsOff[p],
          nTrips = patTripsOff[p + 1] - tFirst;
        if (nTrips === 0) continue;
        const base = tripTimesOff[p];
        let t = -1,
          boardPos = -1;
        for (let pos = startPos; pos < ns; pos++) {
          const stop = patStops[sBase + pos];
          if (t >= 0) {
            const a = arr[base + (t - tFirst) * ns + pos];
            if (better(k, stop, a) && a <= bestDest + EGRESS_GRAIN) {
              improve(k, stop, a);
              lblType[k][stop] = 1;
              lblTrip[k][stop] = t;
              lblBoardPos[k][stop] = boardPos;
              lblAlightPos[k][stop] = pos;
              lblWalk[k][stop] = 0;
              lblRide[k][stop] = 1;
              improved.push(stop);
            }
          }
          let ready = tau[k - 1][stop];
          if (ready === INF) continue;
          if (lblRide[k - 1][stop]) ready += slack;
          if (t < 0 || ready <= dep[base + (t - tFirst) * ns + pos]) {
            let lo = 0,
              hi = nTrips;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (dep[base + mid * ns + pos] < ready) lo = mid + 1;
              else hi = mid;
            }
            if (bike) while (lo < nTrips && !tripOk(p, dep[base + lo * ns + pos])) lo++; // skip departures the bike may not board
            if (lo < nTrips && (t < 0 || tFirst + lo < t)) {
              t = tFirst + lo;
              boardPos = pos;
            }
          }
        }
      }
      if (!improved.length) break;
      relaxWalks(k, improved);
    }
    for (let k = 1; k <= K; k++) if (destArr(k) < before[k]) extract(k);
  }
  return { journeys: opts.raw ? journeys : rank(journeys), runs, candidates: departures.length, ms: now() - t0 };
}

/** One departure time: earliest arrival per number of transfers. */
export function plan(
  tt: Timetable,
  origins: StopSet,
  dests: StopSet,
  depTime: number,
  maxTransfersOrOpts: number | ProfileOptions = 3,
): SinglePlanResult {
  const opts = typeof maxTransfersOrOpts === 'number' ? { maxTransfers: maxTransfersOrOpts } : maxTransfersOrOpts;
  const r = profile(tt, origins, dests, depTime, depTime, opts);
  return {
    journeys: r.journeys,
    rounds: r.journeys.length ? Math.max(...r.journeys.map((j) => j.transfers + 1)) : 0,
    ms: r.ms,
  };
}

const TRANSFER_PENALTY = 300; // s: an extra transfer has to save at least this much
const WALK_WEIGHT = 0.5; // a minute walking costs this many minutes of riding, on top of its time
const EGRESS_GRAIN = 60; // s: getting off earlier to walk has to bring the rider to the door sooner by at least this much

function cost(j: RawJourney): number {
  return j.arrive - j.depart + TRANSFER_PENALTY * j.transfers + WALK_WEIGHT * j.walkSeconds;
}

/** A journey that rides a train, as a rider sees the choice: a train is never hidden behind a bus, nor a bus behind a train. */
const byTrain = (j: RawJourney): boolean => j.legs.some((l) => l.type === 'ride' && l.route && l.route[3] === 2);
/** The same journey found twice (by two searches): its legs, trip by trip. */
export const journeySig = (j: RawJourney): string =>
  j.legs.map((l) => (l.type === 'ride' ? `r${l.trip}:${l.from}-${l.to}` : `${l.type[0]}${l.from}-${l.to}`)).join('|');

/**
 * Keep the journeys worth showing: Pareto by (later departure, earlier arrival,
 * fewer transfers), then drop ones whose extra transfers buy too little. Journeys
 * by train and journeys without one are compared only among themselves: a bus that
 * leaves a minute later and arrives a minute earlier must not hide the train.
 */
export function rank(journeys: RawJourney[]): RawJourney[] {
  const out: RawJourney[] = [];
  for (const j of journeys) {
    let dominated = false;
    const train = byTrain(j);
    for (const o of journeys) {
      if (o === j || byTrain(o) !== train) continue;
      const pareto =
        o.depart >= j.depart &&
        o.arrive <= j.arrive &&
        o.transfers <= j.transfers &&
        (o.depart > j.depart || o.arrive < j.arrive || o.transfers < j.transfers || cost(o) < cost(j));
      const penalty =
        o.depart >= j.depart - 60 &&
        o.transfers < j.transfers &&
        o.arrive <= j.arrive + TRANSFER_PENALTY * (j.transfers - o.transfers);
      if (pareto || penalty) {
        dominated = true;
        break;
      }
    }
    if (!dominated) out.push(j);
  }
  out.sort((a, b) => a.depart - b.depart || a.arrive - b.arrive);
  return out;
}

export function routeLabel(route: Route): string {
  return route[0] || (route[3] === 2 ? 'train' : route[1]);
}

/** Human-readable journey, for logs and the test page. */
export function describe(tt: Timetable, j: RawJourney): string {
  const name = (s: number): string => (s < 0 ? 'start/end' : tt.stops[s][1]);
  const lines = [
    `${hhmm(j.depart)} -> ${hhmm(j.arrive)}, ${Math.round((j.arrive - j.depart) / 60)} min, ${j.transfers} transfers, ${Math.round(j.walkSeconds / 60)} min walking`,
  ];
  for (const l of j.legs) {
    if (l.type === 'ride')
      lines.push(
        `  ${hhmm(l.depart)} ${routeLabel(l.route)} (${l.route[2]}) ${name(l.from)} -> ${name(l.to)} ${hhmm(l.arrive)}, ${l.stops} stops`,
      );
    else if (l.seconds > 0)
      lines.push(`  ${l.type} ${Math.round(l.seconds / 60)} min: ${name(l.from)} -> ${name(l.to)}`);
  }
  return lines.join('\n');
}
