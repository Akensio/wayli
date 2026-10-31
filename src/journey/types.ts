// The domain as the page holds it: places, a plan as asked (Query), journeys and their legs, and the records the phone
// keeps of them (recent views, saved trips and stops). Every layer above may use these; they use only the engine's
// and the worker's shapes below them.
import type { PathPoint } from '../engine/geo.ts';
import type { PlanPlace, StopLine } from '../worker/ops.ts';

/** The lateness a plan used at a ride's boarding stop: against the listed time there, with how old the report was. */
export type LiveInfo = { delay: number; stale?: boolean; seen?: number };
/** A stop as a leg's end (names.js stopOut): its name, and where it is for the map and the lists. */
export type StopRef = { name: string; stop?: number; lat?: number; lon?: number; code?: string; city?: string };
/** One stop of a ride with the trip's times there. */
export type StopAlong = { stop: number; name: string; lat: number; lon: number; arr: number; dep?: number };
type LegBase = { seconds: number; depart: number; arrive: number; from?: StopRef; to?: StopRef; path?: PathPoint[] };
/** A ride on one trip from a boarding stop to an alighting stop (plan.js legOut; follow.js builds the rest of a ride
 *  the same way). The times are the ones the plan used, live-shifted when it had live data; `schedDepart` and
 *  `schedArrive` keep the listed ones then. */
export type RideLeg = LegBase & {
  type: 'ride';
  line: string;
  headsign?: string;
  agency: string;
  route: number; // the route's index in the day's timetable
  routeType: number;
  routeId: number | string | null; // the line's id in the live data; null for a line with estimated times
  trip: number;
  pattern: number | null;
  boardPos: number;
  alightPos: number;
  firstDep?: number;
  estimated?: boolean; // a line with estimated times (the weekend lines no feed carries, pipeline/weekend.py)
  stops: number;
  stopsAlong?: StopAlong[];
  schedDepart?: number;
  schedArrive?: number;
  live?: LiveInfo | null;
  pathKind?: 'shape' | 'stops'; // along its course, or its stops joined straight (drawn dashed)
};
/** A way on foot or by bike: to the first stop (access), between stops (walk, transfer), from the last (egress). */
export type WalkLeg = LegBase & {
  type: 'walk' | 'access' | 'egress' | 'transfer';
  mode?: string; // 'walk' or 'bike'
  pathKind?: 'street' | 'straight';
};
export type Leg = RideLeg | WalkLeg;
export const isRide = (l: Leg): l is RideLeg => l.type === 'ride';
/** The rides of a journey, in order. */
export const ridesOf = (legs: Leg[]): RideLeg[] => legs.filter(isRide);
/** What the map needs of a leg to draw it: a Journey's legs fit, and so do the line page's and the station pair's
 *  made-up rides (map/render.ts), which have a path and a colour but no times. */
export type DrawLeg = {
  type: string;
  path?: PathPoint[];
  pathKind?: string;
  routeType?: number;
  agency?: string;
  mode?: string;
  from?: StopRef;
  to?: StopRef;
  stopsAlong?: { lon: number; lat: number; stop: number }[];
  pattern?: number | null;
  boardPos?: number;
  alightPos?: number;
};
export type Drawable = { legs: DrawLeg[] };
export type Journey = {
  depart: number;
  arrive: number;
  transfers: number;
  legs: Leg[];
  walkSeconds?: number;
  slower?: boolean; // an earlier departure that arrives later than the card's first option (the train at the platform)
  to?: { name: string; lat: number; lon: number } | null; // the destination as a point, kept when the trip is followed
};
type Group = { options: number[]; lines: string[][] | null };
export type PlanResult = {
  journeys: Journey[];
  groups?: Group[];
  reason?: string;
  nextAt?: number | null; // no journey in the window: when the next way leaves, or null for none more on that day
  streets?: boolean;
  bikeOnly?: { seconds: number; metres: number; path: PathPoint[] } | null;
  [k: string]: unknown;
};
/** A plan as it was asked: the places, the service day, the options, and what live data went in. */
export type Query = {
  from: Place;
  to: Place;
  day: string;
  at: string;
  bike: 'none' | 'park' | 'along' | string;
  folding: boolean;
  arriveBy: boolean;
  isNow?: boolean;
  maxWalk?: number;
  liveAsOf?: number | null;
  liveTried?: boolean;
};
/** A place to plan from or to: what the worker takes (PlanPlace), and `transient` for "my location", found afresh
 *  when the plan is made, `auto` when the bar set it itself (not the rider). */
export type Place = PlanPlace & { transient?: boolean; auto?: boolean };
/** A stop as a place to plan from or to; a station is all its platforms. */
export const stopPlace = (s: {
  name: string;
  stop: number;
  stops?: number[] | null;
  lat: number;
  lon: number;
}): Place => ({ name: s.name, stops: s.stops && s.stops.length ? s.stops : [s.stop], lat: s.lat, lon: s.lon });

/** A stop in a list (saved stops): with its lines, and how far when that is known. */
export type SavedStop = {
  stop: number;
  name: string;
  city?: string;
  code?: string;
  lat: number;
  lon: number;
  distance?: number;
  lines?: StopLine[];
};
/** A trip saved with its star: the places and the bicycle choice, planned again from now when chosen. */
export type SavedTrip = { from: Place; to: Place; bike: string; folding?: boolean };

/** Something opened, as the history keeps it (state/store.ts recentViews). */
type At = { name: string; lat: number; lon: number };
export type View = { at?: number } & (
  | { type: 'line'; ref: string; line: string; routeType: number; agency: string; headsign: string; mode?: string }
  | { type: 'stop'; code: string; name: string; city?: string; lat: number; lon: number }
  | ({ type: 'station'; mode?: 'rail' | 'lrt' } & At)
  | { type: 'trains'; from: At; to: At; mode?: 'rail' | 'lrt' }
  | { type: 'trip'; q: Query; j: Journey; built?: string }
);
/** What names a trip in the recent and saved lists: its two places and the bicycle choice. */
export const savedTripKey = (x: {
  from: { name: string };
  to: { name: string };
  bike?: string;
  folding?: boolean;
}): string => `${x.from.name}|${x.to.name}|${x.bike}|${x.folding ? 'f' : ''}`;
