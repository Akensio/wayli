// A journey as the page holds it: its legs (rides on a trip, ways on foot or by bike), how the map draws a leg, and the
// answer to a plan. Shapes and two pure helpers; nothing here does anything. A journey from the planner is a plan: its
// rides' `schedDepart` and `schedArrive` are the listed times. The same journey as it stands now is made by trip/now.ts
// (tripNow), which sets every `depart` and `arrive` and each ride's `live`.
import type { PathPoint } from '../engine/geo.ts';
import type { LiveTrips } from '../worker/ops.ts';

/** A stop as a leg's end (names.js stopOut): its name, and where it is for the map and the lists. */
export type StopRef = { name: string; stop?: number; lat?: number; lon?: number; code?: string; city?: string };
/** One stop of a ride with the trip's time there; from tripNow, `arr` is the time as it stands now beside the listed
 *  one (`sched`), and `passed` says the vehicle is past it. */
export type StopAlong = {
  stop: number;
  name: string;
  lat: number;
  lon: number;
  arr: number;
  dep?: number;
  sched?: number;
  passed?: boolean;
};
type LegBase = { seconds: number; depart: number; arrive: number; from?: StopRef; to?: StopRef; path?: PathPoint[] };
/** A ride on one trip from a boarding stop to an alighting stop (plan.ts legOut; follow.ts builds the rest of a ride
 *  the same way). `schedDepart` and `schedArrive` are the listed times; `depart` and `arrive` the ones the plan was
 *  routed on, or from tripNow the ones that stand now, with `live`: what is known of its vehicle at the boarding stop
 *  (null: nothing, the times are the timetable's). */
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
  live?: { sure: boolean; passed: boolean } | null;
  /** A journey's first ride: the departures of its route from the boarding stop after it (the trip, where the stop is
   *  on it, its listed time). */
  next?: { trip: number; pos: number; sched: number }[];
  pathKind?: 'shape' | 'stops'; // along its course, or its stops joined straight (drawn dashed)
};
/** A way on foot or by bike: to the first stop (access), between stops (walk, transfer), from the last (egress). */
/** An entrance of a station (data/entrances.json): its letter (A..D at the Red Line's underground stations, '' where
 *  the map gives none), its name where it has one, where it is, and the street it opens onto ('' when unknown). */
export type Exit = { ref: string; name: string; name_en?: string; lat: number; lon: number; street: string };
export type WalkLeg = LegBase & {
  type: 'walk' | 'access' | 'egress' | 'transfer';
  mode?: string; // 'walk' or 'bike'
  pathKind?: 'street' | 'straight';
  entry?: Exit; // the station entrance this walk goes in by (its path ends there)
  exit?: Exit; // the station entrance this walk comes out of (its path starts there)
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
  entry?: { lat: number; lon: number; ref?: string }; // a station entrance the walk goes in by (on its path)
  exit?: { lat: number; lon: number; ref?: string }; // one it comes out of
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
  missed?: boolean;
  /** The walk at one end (s), when it is longer than the rider's longest walk and the way is offered all the same. */
  longWalk?: number;
  /** The way's effort from leaving to arriving, in seconds of riding (engine/best.ts): what "Best" sorts by. */
  effort?: number; // from tripNow: one of its rides now leaves before the rider can be there
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
  live?: LiveTrips | null; // the live times the plan was routed on
  [k: string]: unknown;
};
