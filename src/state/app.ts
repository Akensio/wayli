// What the app knows about itself: the data build, the version line, whether it can be installed, the
// connection, and whether the menu drawer is open.
import { signal } from '@preact/signals';

export const feedInfo = signal<{ start?: string; end?: string; built?: string } | null>(null);
export const version = signal('');
export const installable = signal(false);   // the install row shows (Chrome's prompt, or Safari's steps)
export const installHint = signal('');      // Safari's steps, shown under the row on a tap
export const online = signal(navigator.onLine !== false);
export const drawerOpen = signal(false);

export const hooks = {
  install: () => {},                       // Chrome's prompt, or the hint
  go: (_screen: string) => {},             // the drawer's screens
  lineSearch: () => {},
  closeDrawer: () => {},
  setLang: (_l: 'he' | 'en') => {},
  appearanceChanged: () => {},             // the map's look or the menus' theme changed
  requestAlertPermission: async () => {},
  testAlert: () => {},
};
