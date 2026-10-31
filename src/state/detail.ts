// The journey detail: the journey shown, one ride of it focused on the map (or none), and what the live data says
// about each of its rides as it comes in.
import { signal } from '@preact/signals';
import type { Query } from '../model/query';
import type { Journey, RideLive } from '../model/journey';
import { unset } from '../lib/unset';

export const journey = signal<Journey | null>(null);
export const query = signal<Query | null>(null);
export const bikeOnly = signal(false);
export const focus = signal(-1); // the leg focused on the map
export const live = signal<Record<string, RideLive>>({}); // by trip: what the live data says about each ride

/** What the detail's own flows need from the controllers: the panel's history entry, the map drawn on a focus change. */
export const hooks = {
  show: (): void => unset('detail.show'),
  redraw: (): void => unset('detail.redraw'), // the map draws the journey, the focused ride alone
};

export function open(j: Journey, q: Query, bike = false): void {
  journey.value = j;
  query.value = q;
  bikeOnly.value = bike;
  focus.value = -1;
  live.value = {};
  hooks.show();
}
/** Focus one ride of the journey (or release it): its course alone, only its vehicles, the map on it. */
export function focusLeg(i: number): void {
  focus.value = focus.value === i ? -1 : i;
  hooks.redraw();
}
export function setLive(trip: string | number, r: RideLive): void {
  live.value = { ...live.value, [String(trip)]: r };
}
