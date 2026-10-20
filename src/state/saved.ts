// Saved places, trips and stops live in the store (this device only); the pages re-read them on `tick`.
import { signal } from '@preact/signals';
import type { Place } from './search';

export const tick = signal(0);
export const refresh = (): void => { tick.value++; };

export const hooks = {
  planTo: (_p: Place) => {},
  choosePlace: async (_title: string): Promise<Place | null> => null,
  openStop: (_stop: number) => {},
  openLine: (_route: number) => {},
};
