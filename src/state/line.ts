// A line in the sheet: its course, stops and other directions, its vehicles now, and its timetable at a stop.
import { signal } from '@preact/signals';
import type { LineMode } from '../widgets/LineChip';

type LineStop = { stop: number; name: string; city?: string; lat: number; lon: number };
export type LineInfo = { route: number; ref?: string | null; routeId?: number | null; estimated?: boolean; routeIds?: number[]; mode?: LineMode; ends?: [string, string] | null; line: string; headsign: string; agency: string; routeType: number; trips: number; first: number; last: number; stops: LineStop[]; others: { route: number; headsign: string }[]; path?: [number, number][] };

export const info = signal<LineInfo | null>(null);
export const liveText = signal('');
export const liveOk = signal(false);
// the line as a timetable at the rider's stop: which of its stops that is, the day's times there, the time chosen and
// that trip's times at every stop of the list (by its index)
export type LineTime = { trip: number; dep: number; arr?: number | null; estimated?: boolean };
export const anchor = signal(-1);
export const times = signal<LineTime[] | null>(null);   // null before the first load
export const loading = signal(false);                   // another stop's times on their way: the old ones stay, dimmed
export const now = signal<number | null>(null);         // seconds on the line's day, null when not today
export const sel = signal<number | null>(null);         // the trip chosen
export const selTimes = signal<(number | null)[]>([]);  // its time at each stop of the list

export const hooks = { close: () => {}, openLine: (_route: number) => {}, openStop: (_stop: number) => {}, setAnchor: (_i: number) => {}, pick: (_t: LineTime) => {} };
