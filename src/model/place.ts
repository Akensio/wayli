// A place to plan from or to, as the worker takes it, and a stop (a station: all its platforms) as such a place.
import type { PlanPlace } from '../worker/ops.ts';

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
