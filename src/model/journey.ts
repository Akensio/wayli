// A journey as the page holds it: its legs (rides on a trip, ways on foot or by bike), what the plan knew live at each
// ride, how the map draws a leg, and the answer to a plan. Shapes and two pure helpers; nothing here does anything.
import type { PathPoint } from '../engine/geo.ts';
import type { LiveTime } from '../engine/delays.ts';

/** What the live data says about a ride's vehicle at a stop, as it comes in: its time there (late by, passed, how old
 *  the report; null when no vehicle of the trip is seen), or `failed` when the live data could not be had. Data, not
 *  words: the views word it (display/live.ts rideBadge), in the language shown. */
export type RideLive = { at: LiveTime | null } | 'failed';
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
