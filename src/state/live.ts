// The live times of the trips on screen: one store, filled on one timer (controllers/live.ts) from the worker's one
// answer per trip (worker/vehicles.ts liveTrips), read by every screen through `at`. A screen holds no live times of
// its own.
import { signal } from '@preact/signals';
import type { TripLive } from '../worker/ops';
import type { LiveAt } from '../trip/now';

/** What is known live, by trip (of the day's timetable). Replaced whole at every look, so nothing old lingers. */
export const trips = signal<Record<number, TripLive>>({});
/** When the newest vehicle of the last look reported (ms), or null: no vehicle did, or there was no look. */
export const asOf = signal<number | null>(null);
/** How the last look went: not asked (live times off, another day), answered, or failed (the times shown are then
 *  the timetable's). */
export const state = signal<'off' | 'ok' | 'failed'>('off');

/** What is known live of a trip at one of its stops (its place on the trip), or null. Reading it in a view makes the
 *  view follow the store. */
export function at(trip: number, pos: number): LiveAt | null {
  const l = trips.value[trip];
  if (!l || pos < 0) return null;
  const time = pos >= l.from ? (l.times[pos - l.from] ?? null) : null;
  return { time, sure: l.sure, passed: pos < l.passed };
}
