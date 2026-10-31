// What the page may ask the data worker, and what each answer is: one table for both sides. The page's `call`
// (client.ts) takes its argument and answer types from it; each worker module types its ops object with OpsPart and
// the message loop (worker.ts) the merged table, so a missing, misnamed or mistyped operation is a compile error. The
// shapes are the ones the worker modules build (named after them below): a change there is a change here, and the
// compiler then finds every reader on the page. The page re-exports these (state/stop, state/station, state/line,
// state/search) rather than keeping copies of its own.
import type { PathPoint } from '../engine/geo.ts';
import type { TimetableHeader } from '../engine/raptor.ts';
import type { StreetMode } from '../engine/streets.ts';
import type { Lang, PlaceKind, PlacesHeader } from '../engine/places.ts';
import type { Vehicle, Bounds, SnapshotFilter } from '../engine/feed.ts';
import type { DelayEstimate, RailTimes, VehicleReport } from '../engine/delays.ts';
import type { Mode } from '../engine/modes.ts';

/** A place as the worker takes it to plan from or to, or to name: its name, the point when it has one, a stop's or a
 *  station's stops, and what kind of place it is (the page's Place, model/journey.ts, adds what only the page uses). */
export type PlanPlace = {
  name: string;
  lat?: number | null;
  lon?: number | null;
  stops?: number[];
  platforms?: number;
  code?: string;
  kind?: string;
};
/** A line calling at a stop, as a stop's page and the stop search list it. */
export type StopLine = { type: number; route?: number | null; agency?: string; label: string };
export type StopInfo = {
  stop: number;
  name: string;
  city?: string;
  code?: string;
  lat: number;
  lon: number;
  lines: StopLine[];
  station?: number;
  stops?: number[];
  rail?: boolean;
  reach?: 'rail' | 'lrt' | null;
};
export type Station = { key: string; name: string; stops: number[]; lat: number; lon: number };
export type Dest = Station & { trips: number; next: number | null; ride: number | null };
/** A line as the line search lists it: its chip, where it runs, its directions (worker `lineGroups`). */
export type LineGroup = {
  estimated?: boolean;
  key: string;
  mode: 'bus' | 'rail' | 'lrt' | 'cable' | 'taxi' | 'flex';
  line: string;
  agency: string;
  routeType: number;
  trips: number;
  area: string[];
  dirs: { route: number; headsign: string; trips: number }[];
  dist: number | null;
};
/** A stop as the stop search lists it (worker `stopGroups`): a station is one entry with its platforms. */
export type StopGroup = {
  key: string;
  name: string;
  city?: string;
  code?: string;
  stops: number[];
  lat: number;
  lon: number;
  mode: 'bus' | 'rail' | 'lrt';
  dist: number | null;
  lines: { label: string; type: number; agency: string; route: number }[];
};
/** A reported vehicle (engine/feed.ts), as liveQuery hands them out; client.ts estimate takes one. */
export type { Vehicle } from '../engine/feed.ts';
/** A delay estimate for one vehicle (engine/delays.ts estimateDelay), null when it cannot be told. */
export type Estimate = DelayEstimate | null;
/** A point to search near, or to measure from. */
export type Near = { lat: number; lon: number } | null;
/** A stop as the worker hands it out (names.ts stopOut), in the rider's language: its index in the day's timetable,
 *  its name and city, the number on its sign ('' where it has none) and where it is (degrees). */
export type StopOut = { stop: number; name: string; city: string; code: string; lat: number; lon: number };
/** One trip's stops with its times (trips.ts tripStops), and what identifies it in the live data. */
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
/** A vehicle as the page sends it back to be placed on a trip (vehiclesStatus): the engine's report (delays.ts
 *  VehicleReport: where it is and when, a train's trail and call) with the ride it is on, its line ref and its
 *  scheduled start, each a Date or, once it crossed to the page and back, the milliseconds or ISO string of one. */
export type RideReport = VehicleReport & { lineRef: number | string | null; scheduledStart: Date | number | string };
/** Which trip a reported vehicle runs and how late it is (vehicles.ts vehiclesStatus); trip -1 when it is not found. */
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
/** A ride's course between two of its stops with the stops along it (courses.ts rideCourses); `course` says the
 *  path follows the road or the track, else it joins the stops straight and must not be drawn as a route. */
export type RideCourse = { path: PathPoint[]; course: boolean; stops: { lat: number; lon: number; stop: number }[] };
/** A whole pattern's course with every stop as [lat, lon, name, stop] (courses.ts patternCourse). */
export type PatternCourse = { path: PathPoint[]; course: boolean; stops: [number, number, string, number][] };
/** What a point on the map is (search.ts reverse): the nearest address, place or street from the address book, else
 *  the nearest stop within 600 m, else the bare point; `distance` in metres from the point asked about. */
export type ReverseHit = { name: string; kind: 'address' | 'poi' | 'street' | 'stop' | 'point'; distance: number };
/** A stop or station from the stop search, as the place search lists it (search.ts search): with its platforms
 *  (`stops`), the number on its sign, and `rank`, the score stops and address-book places are ordered by together. */
export type SearchStopHit = {
  kind: 'stop';
  key: string;
  name: string;
  city: string;
  stops: number[];
  lat: number;
  lon: number;
  code: string;
  platforms: number;
  rank: number;
};
/** An address-book hit as the place search lists it (engine/places.ts PlaceHit, with a place's kind named in `label`
 *  and `rank` as above). */
export type SearchPlaceHit = {
  kind: PlaceKind;
  name: string;
  city: string;
  lat: number;
  lon: number;
  approx: number | null;
  label: string | null;
  score: number;
  rank: number;
};
/** One hit of the place search: a stop (with its platforms), or an address-book entry. */
export type SearchHit = SearchStopHit | SearchPlaceHit;
/** The words a point picked on the map is named with (search.ts localize), per language: "near {name}" and "point". */
export type LocalizeWords = Record<Lang, { near: string; point: string }>;
/** A line's label for a live-data line ref (lines.ts routeLabels); `offDay` for a line not running on the loaded day. */
export type RouteLabel = {
  line: string;
  type: number;
  agency: string;
  headsign: string;
  route: number | null;
  offDay?: boolean;
};
/** A station found again on another day (stops.ts findRecent). */
export type RecentStation = { name: string; stops: number[]; lat: number; lon: number };
/** A departure from a stop (stops.ts departures): when (seconds on the service day), which line, trip and route id,
 *  the trip's first departure, and whether its times are estimates. */
export type Departure = {
  time: number;
  line: string;
  headsign: string;
  routeType: number;
  agency: string;
  trip: number;
  routeId: number | string | null;
  estimated: boolean;
  firstDep: number;
};
/** A direct trip between two places (trips.ts trainsBetween, rideOptions): when it leaves and arrives, its
 *  pattern and the positions boarded and left on it, the line, and what identifies the trip in the live data. */
export type TrainRow = {
  trip: number;
  pattern: number;
  dep: number;
  arr: number;
  stops: number;
  boardPos: number;
  alightPos: number;
  line: string;
  routeType: number;
  agency: string;
  routeId: number | string | null;
  estimated: boolean;
  headsign: string;
  firstDep: number;
  fromStop: number;
  toStop: number;
};
/** One trip of a line at a stop (lines.ts lineTimes): when it leaves there and its first departure; `arr` is never set. */
export type LineTime = {
  trip: number;
  dep: number;
  arr: null;
  routeId: number | string | null;
  firstDep: number;
  estimated: boolean;
};
/** One direction of a line (lines.ts lineInfo): its main pattern's stops and course, the day's trips, the other
 *  directions. A train line is every train between the same two stations (`ends`), their route ids in `routeIds`. */
export type LineInfo = {
  route: number;
  ref: string | null;
  routeId: number | string | null;
  routeIds: (number | string)[];
  estimated: boolean;
  mode: Mode;
  line: string;
  agency: string;
  routeType: number;
  headsign: string;
  ends: [string, string] | null;
  stops: StopOut[];
  path: PathPoint[];
  pathKind: 'shape' | 'stops';
  pattern: number | null;
  trips: number;
  first: number;
  last: number;
  variants: number;
  others: { route: number; headsign: string }[];
};
/** One stop of a ride with the trip's times there (seconds on the service day, as the plan used them). */
export type StopAlongOut = { stop: number; name: string; lat: number; lon: number; arr: number; dep: number };
/** A ride as plan.ts legOut dresses the router's (engine/raptor.ts RawRideLeg): the page's RideLeg
 *  (model/journey.ts), with every field the worker sets. The times are the ones the plan used, live-shifted when it
 *  had live data; `schedDepart` and `schedArrive` keep the listed ones then. `seconds` is set only on a ride that
 *  easierTransfers or slowerSiblings rewrote: the router's ride legs carry none, so it is undefined on the rest
 *  (the page's LegBase.seconds reads it as always there). */
export type RideLegOut = {
  type: 'ride';
  depart: number;
  arrive: number;
  seconds: number;
  from: StopOut;
  to: StopOut;
  stops: number;
  line: string;
  headsign: string;
  agency: string;
  routeType: number;
  trip: number;
  routeId: number | string | null;
  estimated: boolean;
  route: number;
  firstDep: number;
  boardPos: number;
  live: { delay: number; stale: boolean; seen: number } | null;
  schedDepart: number;
  schedArrive: number;
  pattern: number;
  alightPos: number;
  path: PathPoint[];
  pathKind: 'shape' | 'stops';
  stopsAlong: StopAlongOut[];
};
/** A way on foot or by bike as plan.ts dresses it: to the first stop (access), between stops (walk), from the last
 *  (egress); `path` along the streets ('street') or the two ends joined ('straight'). */
export type WalkLegOut = {
  depart: number;
  arrive: number;
  seconds: number;
  path: PathPoint[];
  pathKind: 'street' | 'straight';
} & (
  | { type: 'walk'; from: StopOut; to: StopOut }
  | { type: 'access'; to: StopOut; mode: StreetMode }
  | { type: 'egress'; from: StopOut; mode: StreetMode }
);
export type LegOut = RideLegOut | WalkLegOut;
/** A journey as the worker hands it to the page (the page's Journey, model/journey.ts): `slower` marks an earlier
 *  departure that arrives later than its card's first option (plan.ts slowerSiblings). */
export type JourneyOut = {
  depart: number;
  arrive: number;
  transfers: number;
  walkSeconds: number;
  legs: LegOut[];
  slower?: boolean;
};
/** Journeys that board and alight at the same stops (plan.ts groupJourneys): their indices and the lines per leg. */
export type PlanGroup = { options: number[]; lines: string[][] };
/** What a plan answers (plan.ts plan; the page's PlanResult): the journeys and their groups; with none in the window,
 *  `reason` when a place reaches no stop, else `nextAt`, when the next way leaves (null for none more that day);
 *  `bikeOnly` the way by bike alone; `live` how many vehicles the plan was given and how many it matched to trips. */
export type PlanOut = {
  journeys: JourneyOut[];
  groups: PlanGroup[];
  reason?: 'noOriginStops' | 'noDestStops';
  nextAt?: number | null;
  bikeOnly?: { seconds: number; metres: number; path: PathPoint[] } | null;
  candidates?: number;
  streets?: boolean;
  live: { matched: number; vehicles: number } | null;
  ms: number;
};
/** A data file to load: its address and, when known, its size (fetched in pieces then). */
export type DataFileArgs = { url: string; bytes?: number };

export type Ops = {
  // data.ts: what the worker holds
  loadTimetable: {
    args: DataFileArgs;
    result: {
      date: string;
      counts: TimetableHeader['counts'];
      feed: TimetableHeader['feed'];
      streets: boolean;
    };
  };
  loadStreets: { args: DataFileArgs; result: { nodes: number } };
  loadShapes: { args: DataFileArgs; result: { shapes: number; points: number } };
  loadPlaces: { args: DataFileArgs; result: PlacesHeader['counts'] };
  loadBusTimes: { args: DataFileArgs; result: { sections: number; built?: string } };
  setRailTimes: { args: { m: RailTimes | null | undefined }; result: true };
  setLang: { args: { lang: Lang }; result: Lang };
  // search.ts: places
  search: {
    args: { q: string; limit?: number; lang?: Lang; near?: Near };
    result: { results: SearchHit[]; placesLoaded: boolean };
  };
  reverse: { args: { lat: number; lon: number }; result: ReverseHit };
  localize: { args: { places: PlanPlace[]; lang: Lang; words: LocalizeWords }; result: (string | null | false)[] };
  // plan.ts: journeys
  plan: {
    args: {
      from: PlanPlace;
      to: PlanPlace;
      fromTime: number;
      toTime: number;
      bike?: string;
      folding?: boolean;
      weekday?: boolean;
      maxTransfers?: number;
      maxWalk?: number;
      arriveBy?: boolean;
      vehicles?: Vehicle[] | null;
    };
    result: PlanOut;
  };
  // stops.ts: stops and stations
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
  // lines.ts: lines
  routeLabels: { args: { ids: string[] }; result: Record<string, RouteLabel> };
  lineGroups: { args: { q?: string; mode?: string; near?: Near; limit?: number }; result: LineGroup[] };
  lineTimes: { args: { route: number; from: number[] }; result: LineTime[] };
  lineInfo: { args: { route: number }; result: LineInfo };
  // trips.ts: trips
  rideOptions: { args: { from: number[]; to: number[]; fromTime: number; limit?: number }; result: TrainRow[] };
  trainsBetween: { args: { from: number[]; to: number[]; fromTime: number; limit?: number }; result: TrainRow[] };
  tripFor: { args: { routeId: number | string | null; scheduledStart: string | number }; result: number };
  tripStops: { args: { trip: number }; result: TripStops };
  // courses.ts: where rides and walks run on the map
  streetPaths: {
    args: { legs: { from: PathPoint; to: PathPoint; mode: StreetMode }[] };
    result: (PathPoint[] | null)[];
  };
  ridePaths: {
    args: { legs: { pattern: number; boardPos: number; alightPos: number }[] };
    result: (PathPoint[] | null)[];
  };
  rideCourses: { args: { legs: { pattern: number; boardPos: number; alightPos: number }[] }; result: RideCourse[] };
  patternCourse: { args: { patterns: number[] }; result: PatternCourse[] };
  // vehicles.ts: live vehicles
  liveQuery: { args: { urls: string[]; filter: SnapshotFilter }; result: Vehicle[] };
  estimate: { args: { vehicle: VehicleReport; stops: TripStop[]; day: string }; result: Estimate };
  vehiclesStatus: { args: { vehicles: RideReport[] }; result: VehicleStatus[] };
  // traffic.ts: how the roads run
  traffic: { args: { box: Bounds }; result: GeoJSON.FeatureCollection };
};
export type OpName = keyof Ops;
/** The arguments an operation takes, as `call` spells them: none for an operation without. */
export type OpArgs<K extends OpName> = Ops[K]['args'] extends void ? [] : [args: Ops[K]['args']];
/** The operations a worker module (or the whole table, OpsPart<OpName>) provides: each by name, taking its arguments
 *  and answering its result, at once or as a promise. A module's ops object is typed with its names, so one missing,
 *  misnamed or answering another shape fails the build. */
export type OpsPart<K extends OpName> = {
  [N in K]: (args: Ops[N]['args']) => Ops[N]['result'] | Promise<Ops[N]['result']>;
};
/** A request as the page sends it (client.ts call): the operation, its arguments and the number its answer carries.
 *  Over postMessage nothing checks it: the worker's loop looks the operation up by name and hands the arguments on. */
export type Request = { id: number; op: OpName; args?: Ops[OpName]['args'] };
/** What the worker sends the page: a request's answer or its error, or a download's progress (client.ts Progress:
 *  `got` of `total` bytes of the file `label`, then `unpacking` while it is decompressed). */
export type Reply = { id: number; result: unknown } | { id: number; error: string };
export type ProgressMessage = { type: 'progress'; label: string; got: number; total?: number; unpacking?: boolean };
export type WorkerMessage = Reply | ProgressMessage;
