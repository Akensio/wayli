// A line in the sheet: its course, stops and other directions, its vehicles now, and its timetable at a stop.
import { signal } from '@preact/signals';
import type { LiveTime } from '../engine/delays.ts';
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
export const now = signal<number | null>(null); // seconds on the line's day, null when not today
export const sel = signal<number | null>(null); // the trip chosen
export const selTimes = signal<(number | null)[]>([]); // its time at each stop of the list
/** Its live time at each stop of the list, from its vehicle (delays.js liveAt: the time the rider is shown), or null. */
export type { LiveTime };
export const selLive = signal<(LiveTime | null)[]>([]);
