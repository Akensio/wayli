// What the app knows about itself: the data build, the version line, whether it can be installed, the
// connection, and whether the menu drawer and the settings page are open.
import { signal } from '@preact/signals';

export const feedInfo = signal<{ start?: string; end?: string; built?: string } | null>(null);
export const version = signal('');
export const installable = signal(false); // the install row shows (Chrome's prompt, or Safari's steps)
export const installHint = signal(''); // Safari's steps, shown under the row on a tap
export const online = signal(navigator.onLine !== false);
export const drawerOpen = signal(false);
export const settingsOpen = signal(false); // the settings page, a layer over everything (the drawer stays under it)
export const status = signal<{ text: string; error: boolean; frac: number | null; hidden?: boolean } | null>(null); // the loading pill (its last text stays readable once it hides)
export const liveNote = signal(''); // the live map's line at the bottom
export const liveLag = signal(false);
