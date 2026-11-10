// A stop in the sheet, any stop or a whole station: the stop, its next departures (their live times are the one
// store's, state/live.ts), and for a station where its trains go.
import { signal } from '@preact/signals';
import type { Dest } from '../worker/ops.ts';
export type { StopLine, StopInfo, Departure } from '../worker/ops.ts';
export type { SavedStop } from './store.ts';
import type { StopInfo, Departure } from '../worker/ops.ts';
import { unset } from '../common/unset';
import { timeAt, toCome, type At } from '../trip/now';

export const info = signal<StopInfo | null>(null);
export const day = signal('');
export const isNow = signal(false); // departures from now: countdowns and live times
export const deps = signal<Departure[] | null>(null); // null while loading
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
  dests.value = null;
  hooks.show();
}
/** A departure as it stands now: its time (the live one, else the listed one) and what is known of it live. */
export type DepNow = Departure & { at: number; live: { sure: boolean; passed: boolean } | null };
/** The departures as the page lists them: each as it stands now, and only those still to come (trip/now.ts toCome: a
 *  train listed earlier and running late is in the list, one that left is not), in the order they come. A list for
 *  another time than now is the timetable's, whole. */
export function visibleDeps(all: readonly Departure[], at: At, now: number | null): DepNow[] {
  if (now == null) return all.map((d) => ({ ...d, at: d.time, live: null }));
  return all
    .map((d) => ({ d, x: timeAt(at, d.trip, d.pos, d.time, now) }))
    .filter(({ x }) => toCome(x, now))
    .map(({ d, x }): DepNow => ({ ...d, at: x.time, live: x.live && { sure: x.live.sure, passed: x.live.passed } }))
    .sort((a, b) => a.at - b.at);
}
