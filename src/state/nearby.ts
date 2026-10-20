// Stops near the rider: found on demand, listed with their lines, drawn on the map.
import { signal } from '@preact/signals';

export type StopLine = { type: number; route?: number | null; agency?: string; label: string };
export type Stop = { stop: number; name: string; city?: string; code?: string; lat: number; lon: number; distance?: number; lines?: StopLine[] };
export const stops = signal<Stop[]>([]);
export const status = signal<'idle' | 'locating' | 'noLocation' | 'ready'>('idle');

export const hooks = {
  load: async () => {},
  openStop: (_stop: number) => {},
  openLine: (_route: number) => {},
};
