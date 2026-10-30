// The journey detail: the journey shown, one ride of it focused on the map (or none), and the live badges
// of its rides as they come in.
import { signal } from '@preact/signals';
import type { TrainRow, LiveTrain } from './station';
import type { Journey, Query, RideLeg } from '../journey/types';
import type { Badge } from '../journey/format';

export const journey = signal<Journey | null>(null);
export const query = signal<Query | null>(null);
export const bikeOnly = signal(false);
export const focus = signal(-1); // the leg focused on the map
export const badges = signal<Record<string, Badge>>({}); // by trip: what the live data says about each ride

/** What the detail needs from the rest of the app. Filled in by the app at start. */
export const hooks = {
  show: () => {}, // the panel opens (a history entry)
  close: () => {},
  redraw: () => {}, // the map draws the journey, the focused ride alone
  openLine: (_route: number, _stop?: number) => {}, // at the ride's boarding stop
  rideOptions: async (_l: RideLeg, _q: Query): Promise<TrainRow[]> => [], // every line doing a ride, from its stop to the one it is left at
  rideLive: async (_rows: TrainRow[], _day: string): Promise<Record<string, LiveTrain>> => ({}),
  openTrip: (_trip: number, _stop: number) => {}, // a row: its line at the stop, that trip chosen
  startTrip: (_j: Journey, _q: Query) => {},
};

export function open(j: Journey, q: Query, bike = false): void {
  journey.value = j;
  query.value = q;
  bikeOnly.value = bike;
  focus.value = -1;
  badges.value = {};
  hooks.show();
}
/** Focus one ride of the journey (or release it): its course alone, only its vehicles, the map on it. */
export function focusLeg(i: number): void {
  focus.value = focus.value === i ? -1 : i;
  hooks.redraw();
}
export function setBadge(trip: string | number, b: Badge): void {
  badges.value = { ...badges.value, [String(trip)]: b };
}
