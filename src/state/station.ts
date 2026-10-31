// The trains between two stations, the answer to the two stations at the top once both are set, with their live times
// (where a station's trains go is the stop view's: state/stop).
import { signal } from '@preact/signals';
export type { Station, Dest, TrainRow } from '../worker/ops.ts';
import type { Station, TrainRow } from '../worker/ops.ts';

/** A station from a place or a stop: its stops, where it is. */
export const asStation = (p: {
  name: string;
  stops?: number[] | null;
  lat?: number | null;
  lon?: number | null;
}): Station => ({ key: '', name: p.name, stops: p.stops || [], lat: p.lat || 0, lon: p.lon || 0 });
export type LiveTrain = { passed: boolean; dep: number; arr: number; delayMin: number; stale: boolean };

export const pair = signal<{ from: Station; to: Station } | null>(null);
export const trains = signal<TrainRow[] | null>(null);
export const live = signal<Record<string, LiveTrain>>({});
export const liveNote = signal('');
export const day = signal('');
export const isNow = signal(false);
export const mode = signal<'rail' | 'lrt'>('rail'); // trains, or the light rail
