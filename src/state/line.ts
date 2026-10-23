// A line's page: its course, stops and other directions, and its vehicles now.
import { signal } from '@preact/signals';
import type { LineMode } from '../ui/LineChip';

export type LineStop = { stop: number; name: string; city?: string; lat: number; lon: number };
export type LineInfo = { route: number; ref?: string | null; routeId?: number | null; estimated?: boolean; routeIds?: number[]; mode?: LineMode; ends?: [string, string] | null; line: string; headsign: string; agency: string; routeType: number; trips: number; first: number; last: number; stops: LineStop[]; others: { route: number; headsign: string }[]; path?: [number, number][] };

export const info = signal<LineInfo | null>(null);
export const liveText = signal('');
export const liveOk = signal(false);

export const hooks = { close: () => {}, openLine: (_route: number) => {}, openStop: (_stop: number) => {} };
