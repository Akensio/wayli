// Saved places, trips and stops live in the store (this device only; lib/store.js, read again on its `stored`).
import type { Place } from './search';

export const hooks = {
  planTo: (_p: Place) => {},
  choosePlace: async (_title: string): Promise<Place | null> => null,
  openStop: (_stop: number) => {},
  openLine: (_route: number) => {},
};
