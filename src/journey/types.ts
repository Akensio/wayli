// The shapes the planner returns and the app passes around. Loose where the worker's output is loose.
import type { Place } from '../state/search';

export type LatLon = [number, number];
export type LiveInfo = { delay: number; stale?: boolean };
export type Leg = {
  type: 'ride' | 'walk' | 'transfer' | 'access' | 'egress' | string;
  mode?: 'walk' | 'bike' | string;
  seconds: number;
  depart?: number; arrive?: number;
  line?: string; headsign?: string; agency?: string; route?: number | string; routeType?: number;
  from?: { name: string; [k: string]: unknown }; to?: { name: string; [k: string]: unknown };
  path?: LatLon[];
  pathKind?: 'shape' | 'stops' | string;
  live?: LiveInfo | null;
  // a ride's place in the timetable: its trip and pattern, where it boards and alights, the line's id for live data
  trip?: number; pattern?: number | null; boardPos?: number; alightPos?: number; routeId?: number | string | null; firstDep?: number;
  estimated?: boolean;   // a line with estimated times (the weekend lines no feed carries, pipeline/weekend.py)
  stops?: number; stopsAlong?: { stop: number; name: string; lat: number; lon: number; arr: number }[]; schedDepart?: number;
  [k: string]: unknown;
};
export type Journey = { depart: number; arrive: number; transfers: number; legs: Leg[]; [k: string]: unknown };
export type Group = { options: number[]; lines: string[][] | null };
export type PlanResult = {
  journeys: Journey[];
  groups?: Group[];
  reason?: string;
  streets?: boolean;
  bikeOnly?: { seconds: number; metres: number; path: LatLon[] } | null;
  [k: string]: unknown;
};
/** A plan as it was asked: the places, the service day, the options, and what live data went in. */
export type Query = {
  from: Place; to: Place; day: string; at: string;
  bike: 'none' | 'park' | 'along' | string; folding: boolean; arriveBy: boolean; isNow?: boolean; maxWalk?: number;
  liveAsOf?: number | null; liveTried?: boolean;
};
