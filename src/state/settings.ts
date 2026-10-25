// The settings as the pages read them: the store is the truth (store.js; its `stored` says when it changed).
import { settings as store } from '../lib/store.js';

export type Settings = { theme?: string; map?: string; mapTint?: string; maxWalk: number; live?: boolean; traffic?: boolean; notify?: boolean; sound?: boolean; terrain?: boolean; stopFilter?: string; lookSplit?: boolean; [k: string]: unknown };
export const get = (): Settings => store.get() as Settings;
export function set(patch: Partial<Settings>): Settings { return store.set(patch) as Settings; }
/** The map's look as chosen: light, dark, or the device's. */
export const mapChoice = (): 'light' | 'dark' | 'system' => { const m = get().map; return m === 'light' || m === 'dark' ? m : 'system'; };
