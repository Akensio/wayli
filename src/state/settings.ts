// The settings as the pages read them: the store is the truth (lib/store.ts; its `stored` says when it changed).
import { settings as store, type Settings } from '../lib/store.ts';

export type { Settings };
export const get = (): Settings => store.get();
export function set(patch: Partial<Settings>): Settings {
  return store.set(patch);
}
/** The map's look as chosen: light, dark, or the device's. */
export const mapChoice = (): 'light' | 'dark' | 'system' => {
  const m = get().map;
  return m === 'light' || m === 'dark' ? m : 'system';
};
