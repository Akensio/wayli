// The settings as the pages read them: the store is the truth (store.js), this signal says when it changed.
import { signal } from '@preact/signals';
import { settings as store } from '../store.js';

export type Settings = { theme?: string; map?: string; mapTint?: string; maxWalk: number; live?: boolean; traffic?: boolean; notify?: boolean; sound?: boolean; terrain?: boolean; [k: string]: unknown };
export const tick = signal(0);
export const get = (): Settings => store.get() as Settings;
export function set(patch: Partial<Settings>): Settings { const s = store.set(patch) as Settings; tick.value++; return s; }
/** The map's look as chosen: light, dark, or the device's. */
export const mapChoice = (): 'light' | 'dark' | 'system' => { const m = get().map; return m === 'light' || m === 'dark' ? m : 'system'; };
