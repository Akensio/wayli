// A stop in the sheet, any stop or a whole station: the stop, its next departures, what the live data says about each
// as it comes in, and for a station where its trains go.
import { signal } from '@preact/signals';
import type { Dest } from './station';

export type StopLine = { type: number; route?: number | null; agency?: string; label: string };
/** A stop in a list (saved stops): with its lines, and how far when that is known. */
export type Stop = { stop: number; name: string; city?: string; code?: string; lat: number; lon: number; distance?: number; lines?: StopLine[] };
// a station stands for all its platforms (`stops`); `rail`: trains call there
export type StopInfo = { stop: number; name: string; city?: string; code?: string; lat: number; lon: number; lines: StopLine[]; station?: number; stops?: number[]; rail?: boolean; reach?: 'rail' | 'lrt' | null };
export type Departure = { trip: number; time: number; routeType: number; agency?: string; line: string; headsign: string; routeId?: number | null; firstDep?: number; estimated?: boolean };
type LiveDep = { passed: true } | { passed: false; time: number; stale?: boolean; delayMin: number };

export const info = signal<StopInfo | null>(null);
export const day = signal('');
export const isNow = signal(false);                       // departures from now: countdowns and live times
export const deps = signal<Departure[] | null>(null);     // null while loading
export const liveDeps = signal<Record<string, LiveDep>>({});
export const liveNote = signal('');
export const favTick = signal(0);
export const dests = signal<Dest[] | null>(null);   // a station's: where its trains go without a change (null while loading)

export const hooks = {
  show: () => {},
  close: () => {},
  refresh: () => {},
  openTrip: (_trip: number, _stop: number) => {},
  fromHere: () => {},
  toHere: () => {},
  favChanged: () => {},
  openTo: (_d: Dest) => {},      // the trains between this station and that one
  openLine: (_route: number) => {},
};
export function open(i: StopInfo, d: string, now: boolean): void {
  info.value = i; day.value = d; isNow.value = now; deps.value = null; liveDeps.value = {}; liveNote.value = ''; dests.value = null;
  hooks.show();
}
export function setLive(trip: number, lv: LiveDep): void { liveDeps.value = { ...liveDeps.value, [String(trip)]: lv }; }
