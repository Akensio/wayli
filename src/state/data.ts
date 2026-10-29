// What data is loaded: the manifest, the day's timetable, and whether each file is at hand.
import { signal } from '@preact/signals';

/** One data file as the manifest lists it: `hash` is what is in it (the cache key, pipeline/container.py), `built` when it was written. */
export type DataFile = { file: string; built?: string; hash?: string };
export type Manifest = { built?: string; feed?: { start?: string; end?: string }; days: (DataFile & { date: string })[]; places?: DataFile; shapes?: DataFile; streets?: DataFile; railtimes?: DataFile; bustimes?: DataFile };
export const manifest = signal<Manifest | null>(null);
export const dayInfo = signal<{ date: string; counts: { trips: number } } | null>(null);
export const ttReady = signal(false);   // the timetable
export const stReady = signal(false);   // the street graph
export const plReady = signal(false);   // the address book
export const shReady = signal(false);   // the courses (shapes)
