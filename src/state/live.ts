// The live times of the trips on screen: one store, filled on one timer (controllers/live.ts) from the worker's one
// answer per trip (worker/vehicles.ts liveTrips), read by every screen through `at`. A screen holds no live times of
// its own. (`atIn` reads the same of the times a plan was routed on: the search results use it once, to decide which
// trips they list and in what order, state/results.ts.)
import { signal } from '@preact/signals';
import type { TripLive } from '../worker/ops';
import type { At } from '../trip/now';

/** What is known live, by trip (of the day's timetable). Replaced whole at every look, so nothing old lingers. */
export const trips = signal<Record<number, TripLive>>({});
/** When the newest vehicle of the last look reported (ms), or null: no vehicle did, or there was no look. */
export const asOf = signal<number | null>(null);
/** How the last look went: not asked (live times off, another day), answered, or failed (the times shown are then
 *  the timetable's). */
export const state = signal<'off' | 'ok' | 'failed'>('off');

/** What a set of answers knows of a trip at one of its stops (its place on the trip), or null. */
export const atIn =
  (known: Record<number, TripLive>): At =>
  (trip, pos) => {
    const l = known[trip];
    if (!l || pos < 0) return null;
    const time = pos >= l.from ? (l.times[pos - l.from] ?? null) : null;
    return { time, sure: l.sure, passed: pos < l.passed };
  };
/** The same of the store. Reading it in a view makes the view follow the store. */
export const at: At = (trip, pos) => atIn(trips.value)(trip, pos);
