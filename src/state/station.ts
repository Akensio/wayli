// A train station's pages, the answers to the two stations at the top: the stations a train from the first reaches
// without a change (with the next train there and how long it takes), and, once the second is set, the direct
// trains between the two with their live times.
import { signal } from '@preact/signals';

export type Station = { key: string; name: string; stops: number[]; lat: number; lon: number };
export type Dest = Station & { trips: number; next: number | null; ride: number | null };
export type TrainRow = { trip: number; dep: number; arr: number; stops: number; boardPos: number; alightPos: number; line: string; routeType: number; agency: string;
  routeId: number | null; headsign: string; firstDep: number; fromStop: number; toStop: number };
export type LiveTrain = { passed: boolean; dep: number; arr: number; delayMin: number; stale: boolean };

export const station = signal<Station | null>(null);
export const dests = signal<Dest[] | null>(null);    // null while loading
export const pair = signal<{ from: Station; to: Station } | null>(null);
export const trains = signal<TrainRow[] | null>(null);
export const live = signal<Record<string, LiveTrain>>({});
export const liveNote = signal('');
export const day = signal('');
export const isNow = signal(false);

export const hooks = {
  close: () => {},
  closeTrains: () => {},
  openTo: (_d: Dest) => {},
  openTrip: (_trip: number, _stop: number) => {},
  refresh: () => {},
};
