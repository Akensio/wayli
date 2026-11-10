// The journey detail: the journey shown (a plan; the view draws it as it stands now, trip/now.ts) and the one ride of
// it focused on the map (or none).
import { signal } from '@preact/signals';
import type { Query } from '../trip/query';
import type { Journey } from '../trip/journey';
import { unset } from '../common/unset';

export const journey = signal<Journey | null>(null);
export const query = signal<Query | null>(null);
export const bikeOnly = signal(false);
export const focus = signal(-1); // the leg focused on the map

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
  hooks.show();
}
/** Focus one ride of the journey (or release it): its course alone, only its vehicles, the map on it. */
export function focusLeg(i: number): void {
  focus.value = focus.value === i ? -1 : i;
  hooks.redraw();
}
