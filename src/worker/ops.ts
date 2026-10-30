// What the page may ask the data worker, and what each answer is: one table for both sides. The page's `call`
// (client.ts) takes its argument and answer types from it; the worker's dispatch (worker.js) declares that it
// implements it. The shapes are the ones the worker modules build (named after them below): a change there is a
// change here, and the compiler then finds every reader on the page.
import type { LatLon, PlanResult } from '../journey/types';
import type { Place, LineGroup, StopGroup } from '../state/search';
import type { LineInfo, LineTime } from '../state/line';
import type { StopInfo, Departure } from '../state/stop';
import type { Dest, TrainRow } from '../state/station';
import type { estimateDelay } from '../engine/delays.js';

/** A delay estimate for one vehicle (engine/delays.js estimateDelay), null when it cannot be told. */
export type Estimate = ReturnType<typeof estimateDelay>;
/** A point to search near, or to measure from. */
export type Near = { lat: number; lon: number } | null;
/** A stop as the worker hands it out (names.js stopOut), in the rider's language. */
export type StopOut = { stop: number; name: string; city: string; code: string; lat: number; lon: number };
/** One trip's stops with its times (trips.js tripStops), and what identifies it in the live data. */
export type TripStop = StopOut & { arr: number; dep: number };
export type TripStops = {
  trip: number;
  route: number;
  routeId: number | string | null;
  estimated: boolean;
  line: string;
  headsign: string;
  routeType: number;
  agency: string;
  firstDep: number;
  stops: TripStop[];
};
/** A reported vehicle as engine/feed.js parses it, or as the map sends it over (the times as milliseconds); the worker
 *  reads these fields of it. */
export type Vehicle = {
  lineRef: number | string | null;
  lat: number | null;
  lon: number | null;
  recordedAt: Date | number;
  scheduledStart: Date | number;
  [k: string]: unknown;
};
/** Which trip a reported vehicle runs and how late it is (vehicles.js vehiclesStatus); trip -1 when it is not found. */
export type VehicleStatus =
  | { trip: -1 }
  | {
      trip: number;
      delay: number | null;
      stale: boolean;
      index: number;
      headsign: string;
      route: number;
      line: string;
      agency: string;
      routeType: number;
    };
/** A ride's course between two of its stops with the stops along it (courses.js rideCourses); `course` says the
 *  path follows the road or the track, else it joins the stops straight and must not be drawn as a route. */
export type RideCourse = { path: LatLon[]; course: boolean; stops: { lat: number; lon: number; stop: number }[] };
/** A whole pattern's course with every stop as [lat, lon, name, stop] (courses.js patternCourse). */
export type PatternCourse = { path: LatLon[]; course: boolean; stops: [number, number, string, number][] };
/** What a point on the map is: an address, a place or a street from the address book, else the nearest stop, else a
 *  bare point (search.js reverse). */
export type ReverseHit = {
  name: string;
  kind: string;
  distance: number;
  lat?: number;
  lon?: number;
  [k: string]: unknown;
};
/** One hit of the place search: a stop (with its platforms), or an address-book entry (search.js search). */
export type SearchHit = {
  kind: string;
  name: string;
  city?: string;
  lat: number;
  lon: number;
  stops?: number[];
  code?: string;
  platforms?: number;
  approx?: number | null;
  label?: string | null;
  rank: number;
  [k: string]: unknown;
};
/** A line's label for a live-data line ref (lines.js routeLabels); `offDay` for a line not running on the loaded day. */
export type RouteLabel = {
  line: string;
  type: number;
  agency: string;
  headsign: string;
  route: number | null;
  offDay?: boolean;
};
/** A station found again on another day (stops.js findRecent). */
export type RecentStation = { name: string; stops: number[]; lat: number; lon: number };
/** A data file to load: its address and, when known, its size (fetched in pieces then). */
export type DataFileArgs = { url: string; bytes?: number };
/** A box on the map. */
export type Box = { south: number; west: number; north: number; east: number };

export type Ops = {
  // data.js: what the worker holds
  loadTimetable: {
    args: DataFileArgs;
    result: {
      date: string;
      counts: { trips: number; stops: number; [k: string]: number };
      feed?: unknown;
      streets: boolean;
    };
  };
  loadStreets: { args: DataFileArgs; result: { nodes: number } };
  loadShapes: { args: DataFileArgs; result: Record<string, number> };
  loadPlaces: { args: DataFileArgs; result: Record<string, number> };
  loadBusTimes: { args: DataFileArgs; result: { sections: number; built?: string } };
  setRailTimes: { args: { m: unknown }; result: true };
  setLang: { args: { lang: string }; result: string };
  // search.js: places
  search: {
    args: { q: string; limit?: number; lang?: string; near?: Near };
    result: { results: SearchHit[]; placesLoaded: boolean };
  };
  reverse: { args: { lat: number; lon: number }; result: ReverseHit };
  localize: { args: { places: Place[]; lang: string; words: unknown }; result: (string | null | false)[] };
  // plan.js: journeys
  plan: {
    args: {
      from: Place;
      to: Place;
      fromTime: number;
      toTime: number;
      bike?: string;
      folding?: boolean;
      weekday?: boolean;
      maxTransfers?: number;
      maxWalk?: number;
      arriveBy?: boolean;
      vehicles?: unknown[] | null;
    };
    result: PlanResult;
  };
  // stops.js: stops and stations
  stopGroups: {
    args: { q?: string; mode?: string; near?: Near; limit?: number; from?: number[] | null };
    result: StopGroup[];
  };
  stationReach: { args: { stops: number[]; fromTime: number; mode?: 'rail' | 'lrt' | string }; result: Dest[] };
  stopRoutes: {
    args: { stop: number; stops?: number[] | null };
    result: { pattern: number; ref: number | string | null; type: number; agency: string }[];
  };
  findRecent: {
    args: {
      kind: 'line' | 'stop' | 'station' | string;
      ref?: string | null;
      code?: string;
      lat?: number;
      lon?: number;
      mode?: string;
    };
    result: number | RecentStation | null; // a line's or a stop's index (-1 when not found), a station, or null
  };
  stopsGeo: { args: void; result: GeoJSON.FeatureCollection };
  stopInfo: { args: { stop: number; station?: number; stops?: number[] | null }; result: StopInfo };
  nearbyRoutes: { args: { lat: number; lon: number; radius?: number }; result: string[] };
  departures: {
    args: { stop: number; stops?: number[] | null; fromTime: number; limit?: number };
    result: Departure[];
  };
  // lines.js: lines
  routeLabels: { args: { ids: string[] }; result: Record<string, RouteLabel> };
  lineGroups: { args: { q?: string; mode?: string; near?: Near; limit?: number }; result: LineGroup[] };
  lineTimes: { args: { route: number; from: number[] }; result: LineTime[] };
  lineInfo: { args: { route: number }; result: LineInfo };
  // trips.js: trips
  rideOptions: { args: { from: number[]; to: number[]; fromTime: number; limit?: number }; result: TrainRow[] };
  trainsBetween: { args: { from: number[]; to: number[]; fromTime: number; limit?: number }; result: TrainRow[] };
  tripFor: { args: { routeId: number | string | null; scheduledStart: string | number }; result: number };
  tripStops: { args: { trip: number }; result: TripStops };
  // courses.js: where rides and walks run on the map
  streetPaths: { args: { legs: { from: LatLon; to: LatLon; mode: string }[] }; result: (LatLon[] | null)[] };
  ridePaths: {
    args: { legs: { pattern: number; boardPos: number; alightPos: number }[] };
    result: (LatLon[] | null)[];
  };
  rideCourses: { args: { legs: { pattern: number; boardPos: number; alightPos: number }[] }; result: RideCourse[] };
  patternCourse: { args: { patterns: number[] }; result: PatternCourse[] };
  // vehicles.js: live vehicles
  liveQuery: { args: { urls: string[]; filter: object }; result: Vehicle[] };
  estimate: { args: { vehicle: Vehicle; stops: TripStop[]; day: string }; result: Estimate };
  vehiclesStatus: { args: { vehicles: Vehicle[] }; result: VehicleStatus[] };
  // traffic.js: how the roads run
  traffic: { args: { box: Box }; result: GeoJSON.FeatureCollection };
};
export type OpName = keyof Ops;
/** The arguments an operation takes, as `call` spells them: none for an operation without. */
export type OpArgs<K extends OpName> = Ops[K]['args'] extends void ? [] : [args: Ops[K]['args']];
/** What the worker's side has to provide: every operation by name (a missing or renamed one fails the build). The
 *  arguments and answers are declared here and read so on the page; against the worker's JavaScript the compiler can
 *  only infer (a default of null reads as "null only", an array of pairs as number[][]), so they are not checked
 *  there until the modules move to TypeScript. */
export type OpsImpl = Record<OpName, (args: any) => unknown>;
