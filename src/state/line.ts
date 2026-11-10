// A line in the sheet: its course, stops and other directions, its vehicles now, and its timetable at a stop.
import { signal } from '@preact/signals';
export type { LineInfo, LineTime } from '../worker/ops.ts';
import type { LineInfo, LineTime } from '../worker/ops.ts';

export const info = signal<LineInfo | null>(null);
export const liveText = signal('');
export const liveOk = signal(false);
// the line as a timetable at the rider's stop: which of its stops that is, the day's times there, the time chosen and
// that trip's times at every stop of the list (by its index)
export const anchor = signal(-1);
export const times = signal<LineTime[] | null>(null); // null before the first load
export const loading = signal(false); // another stop's times on their way: the old ones stay, dimmed
export const today = signal(false); // the line's day is the service day that is on: times count against the clock
export const sel = signal<number | null>(null); // the trip chosen
/** The chosen trip at each stop of the list: its listed time there and where that stop is on the trip (to ask its live
 *  time, state/live.ts), or null for a stop it does not call at. */
export const selTimes = signal<({ time: number; pos: number } | null)[]>([]);
