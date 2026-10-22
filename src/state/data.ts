// What data is loaded: the manifest, the day's timetable, and whether each file is at hand.
import { signal } from '@preact/signals';

export type Manifest = { built?: string; feed?: { start?: string; end?: string }; days: { date: string; file: string }[]; places?: { file: string; built?: string }; shapes?: { file: string; built?: string }; streets?: { file: string; built?: string }; railtimes?: { file: string; built?: string } };
export const manifest = signal<Manifest | null>(null);
export const dayInfo = signal<{ date: string; counts: { trips: number } } | null>(null);
export const ttReady = signal(false);   // the timetable
export const stReady = signal(false);   // the street graph
export const plReady = signal(false);   // the address book
export const shReady = signal(false);   // the courses (shapes)
