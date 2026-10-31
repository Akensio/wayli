// A stop in the sheet, any stop or a whole station: the stop, its next departures, what the live data says about each
// as it comes in, and for a station where its trains go.
import { signal } from '@preact/signals';
import type { Dest } from '../worker/ops.ts';
export type { StopLine, StopInfo, Departure } from '../worker/ops.ts';
export type { SavedStop } from './store.ts';
import type { StopInfo, Departure } from '../worker/ops.ts';
import { unset } from '../lib/unset';

type LiveDep = { passed: true } | { passed: false; time: number; stale?: boolean; delayMin: number };

export const info = signal<StopInfo | null>(null);
export const day = signal('');
export const isNow = signal(false); // departures from now: countdowns and live times
export const deps = signal<Departure[] | null>(null); // null while loading
export const liveDeps = signal<Record<string, LiveDep>>({});
export const liveNote = signal('');
export const dests = signal<Dest[] | null>(null); // a station's: where its trains go without a change (null while loading)

/** What the page's own flow needs from the controllers: its history entry. */
export const hooks = {
  show: (): void => unset('stop.show'),
};
export function open(i: StopInfo, d: string, now: boolean): void {
  info.value = i;
  day.value = d;
  isNow.value = now;
  deps.value = null;
  liveDeps.value = {};
  liveNote.value = '';
  dests.value = null;
  hooks.show();
}
export function setLive(trip: number, lv: LiveDep): void {
  liveDeps.value = { ...liveDeps.value, [String(trip)]: lv };
}
