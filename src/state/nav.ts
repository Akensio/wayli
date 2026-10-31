// Where the rider is: the base screen (plan, saved, more) and the panels open over it (a detail, a
// page, the drawer, the map picker). Every panel and every screen change is a history entry, so the phone's
// back button (or the browser's) closes the panel or returns to the previous screen instead of leaving the
// app. Closing with an in-app button goes through history too, so both paths look the same.
// How the phone's Back reaches the stack is a back-end chosen once (below): browser history, or on Android a
// CloseWatcher per entry, so back closes the panel with the app's own animation and the browser draws nothing.
import { signal, computed } from '@preact/signals';
import { t } from '../lib/i18n';
import * as sheet from './sheet';
import * as results from './results';
import * as search from './search';
import * as chooser from './chooser';
import { unset } from '../lib/unset';

// 'search': the bar searches lines or stops (a step back is the trip search again); 'ui': a search box's open list or
// its keyboard, which back closes first (Android only: see pushUi)
export type Entry =
  | { kind: 'overlay'; id: string }
  | { kind: 'tab'; from: string }
  | { kind: 'plan' }
  | { kind: 'search' }
  | { kind: 'ui'; undo: () => void };
export const stack = signal<Entry[]>([]);
export const screen = signal('plan');

/** What the app does when panels close or change. Filled in by the app at start. */
export const hooks = {
  closed: (_id: string): void => unset('nav.closed'), // a panel closed: its timers, markers, promises
  clearPlan: (): void => unset('nav.clearPlan'), // the plan entry was undone
  leaveSearch: (): void => unset('nav.leaveSearch'), // the line or stop search entry was undone
  changed: (_again = false): void => unset('nav.changed'), // something shows differently: the map redraws (again: the same panel, new content)
};

export const isOpen = (id: string): boolean => stack.value.some((e) => e.kind === 'overlay' && e.id === id);
/** Layers beside the panels, not over them: the drawer and the settings page leave the sheet and the map as they are. */
const LAYERS = new Set(['drawer', 'settings']);
/** The panel on top, if any. */
export function topPanel(): string | null {
  const st = stack.value;
  for (let i = st.length - 1; i >= 0; i--) {
    const e = st[i];
    if (e.kind === 'overlay' && !LAYERS.has(e.id)) return e.id;
  }
  return null;
}
/** What the sheet shows: a panel id, or 'screen-<name>'. */
export const key = computed(() => topPanel() || 'screen-' + screen.value);
export const picking = computed(() => key.value === 'picker'); // picking a point: the sheet and the bar go, the crosshair bar shows
// pages over the whole screen (the sheet grows to it; the bar, the map's buttons and the handle go)
const PAGE_TITLE: Record<string, string | null> = { 'screen-saved': 'savedTitle', chooser: null };
/** A page over the whole screen is up (the sheet grows to it; the bar, the map's buttons and the handle go). */
export const page = computed(() => !picking.value && key.value in PAGE_TITLE);
/** The menu drawer and the settings page: layers beside the panels. */
export const drawerOpen = computed(() => stack.value.some((e) => e.kind === 'overlay' && e.id === 'drawer'));
export const settingsOpen = computed(() => stack.value.some((e) => e.kind === 'overlay' && e.id === 'settings'));
export const pageTitle = (): string => {
  const k = key.value;
  return PAGE_TITLE[k] ? t(PAGE_TITLE[k]!) : chooser.title.value;
};
/** How open the sheet is when a panel or screen comes up. */
const SHEET_FOR: Record<string, sheet.SheetState | (() => sheet.SheetState)> = {
  // "my location" alone is no search: the sheet stays folded
  'screen-plan': () =>
    results.showing.value || (search.from.value && !search.from.value.auto) || search.to.value ? 'half' : 'peek',
  'screen-saved': 'full',
  chooser: 'full',
};

/** Apply what is on top: the drawer, the settings page, the page look, the sheet's size; the map follows. */
export function renderPanels(): void {
  if (!picking.value) {
    const st = SHEET_FOR[key.value];
    sheet.set(typeof st === 'function' ? st() : st || 'half');
  }
  hooks.changed();
}

// ---- how Back reaches the stack
/** The phone's Back and the stack, kept in step: browser history (an entry per panel), or on Android, where Chrome
 *  animates every history step as one page leaving another, a CloseWatcher per entry. Chosen once; the stack's own
 *  logic below does not know which. */
type BackEnd = {
  /** Back is one close request at a time (CloseWatcher): the bar's own steps (pushUi) can be entries too. */
  readonly closeRequests: boolean;
  /** An entry went on top. */
  pushed(entry: Entry): void;
  /** The app took entries off itself (a close button, closeAll): Back must not find them again. */
  removed(entries: Entry[]): void;
  /** An entry took another's place (the detail became the trip followed). */
  replaced(old: Entry, next: Entry): void;
  /** The in-app Back: as the phone's would. */
  back(): void;
};

/** History: a pushState per entry; a close steps history back. The browser performs that later, and a pushState made
 *  meanwhile would be swallowed by it (the traversal is measured from where the call was made), so while a step back is
 *  pending, new entries wait in `queued` and are pushed once its popstate arrives. */
function historyBackEnd(): BackEnd {
  let settling = false;
  const queued: Entry[] = [];
  const settled = () => {
    settling = false;
    for (const e of queued.splice(0)) {
      const i = stack.value.indexOf(e);
      if (i >= 0)
        try {
          history.pushState({ wayli: i + 1 }, '');
        } catch {
          /* history unavailable */
        }
    }
  };
  const stepBack = (n: number) => {
    settling = true;
    try {
      history.go(-n);
    } catch {
      settled();
      return;
    }
    setTimeout(() => {
      if (settling) settled();
    }, 600);
  };
  window.addEventListener('popstate', (e) => {
    if (settling) {
      settled();
      return;
    } // our own step back: the stack is already right
    const depth = e.state && e.state.wayli ? e.state.wayli : 0;
    while (stack.value.length > depth) {
      const top = stack.value[stack.value.length - 1];
      stack.value = stack.value.slice(0, -1);
      undo(top);
    }
  });
  try {
    history.replaceState({ wayli: 0 }, '');
  } catch {
    /* history unavailable */
  }
  return {
    closeRequests: false,
    pushed() {
      if (settling) {
        queued.push(stack.value[stack.value.length - 1]);
        return;
      }
      try {
        history.pushState({ wayli: stack.value.length }, '');
      } catch {
        /* history unavailable */
      }
    },
    removed(entries) {
      if (entries.length) stepBack(entries.length);
    },
    replaced() {},
    back() {
      history.back();
    },
  };
}

/** CloseWatchers: one per entry; Android's Back closes the newest, and with it whatever was opened over it. */
function watcherBackEnd(CW: new () => { onclose: (() => void) | null; destroy(): void }): BackEnd {
  const watchers = new Map<Entry, { onclose: (() => void) | null; destroy(): void }>();
  const watch = (entry: Entry) => {
    try {
      const w = new CW();
      w.onclose = () => {
        watchers.delete(entry);
        closeFrom(entry);
      };
      watchers.set(entry, w);
    } catch {
      /* back leaves the app then */
    }
  };
  const unwatch = (entry: Entry) => {
    const w = watchers.get(entry);
    watchers.delete(entry);
    if (w)
      try {
        w.destroy();
      } catch {
        /* already gone */
      }
  };
  /** Close an entry and every entry above it, top first. */
  const closeFrom = (entry: Entry) => {
    const i = stack.value.indexOf(entry);
    if (i < 0) return;
    const above = stack.value.slice(i).reverse();
    stack.value = stack.value.slice(0, i);
    for (const e of above) {
      unwatch(e);
      undo(e);
    }
  };
  return {
    closeRequests: true,
    pushed: watch,
    removed(entries) {
      for (const e of entries) unwatch(e);
    },
    replaced(old, next) {
      const w = watchers.get(old);
      if (!w) return;
      watchers.delete(old);
      watchers.set(next, w);
      w.onclose = () => {
        watchers.delete(next);
        closeFrom(next);
      };
    },
    back() {
      const top = stack.value[stack.value.length - 1];
      if (top) closeFrom(top);
    },
  };
}

const CW = (window as unknown as { CloseWatcher?: new () => { onclose: (() => void) | null; destroy(): void } })
  .CloseWatcher;
const backEnd: BackEnd =
  typeof CW === 'function' && /Android/i.test(navigator.userAgent) ? watcherBackEnd(CW) : historyBackEnd();
/** Back is a close request at a time here (CloseWatcher), not history. */
export const closeWatchers = backEnd.closeRequests;

// ---- the stack
export function push(entry: Entry): void {
  stack.value = [...stack.value, entry];
  backEnd.pushed(entry);
}
/** Undo an entry: what it stood for goes (from Back, or to close programmatically). */
function undo(entry: Entry): void {
  if (entry.kind === 'overlay') hideOverlay(entry.id);
  else if (entry.kind === 'tab') showScreen(entry.from, false);
  else if (entry.kind === 'search') hooks.leaveSearch();
  else if (entry.kind === 'ui') entry.undo();
  else hooks.clearPlan();
}
/** Close the given panel (or the plan, or the line or stop search) now; Back's record steps back to match. `undo`
 *  false drops the entry only: what it stood for is already undone (the bar's switch went back to the trip search). */
export function close(id: string, undo = true): void {
  const i = stack.value.findIndex(
    (e) => (e.kind === 'overlay' && e.id === id) || (e.kind === id && (id === 'plan' || id === 'search')),
  );
  if (i < 0) {
    if (id === 'plan') hooks.clearPlan();
    return;
  }
  const entry = stack.value[i];
  stack.value = stack.value.filter((_, k) => k !== i);
  if (!undo) {
    /* nothing left to undo */
  } else if (entry.kind === 'plan') hooks.clearPlan();
  else if (entry.kind === 'search') hooks.leaveSearch();
  else hideOverlay(id);
  backEnd.removed([entry]);
}
/**
 * A step back of the top bar's own (controllers/shell.ts): its keyboard, then its list, then the line or stop search.
 * Only where Back is one close request at a time (Android); elsewhere each focus and blur would be a history entry.
 * Returns null there.
 */
export function pushUi(undo: () => void): Entry | null {
  if (!backEnd.closeRequests) return null;
  const entry: Entry = { kind: 'ui', undo };
  push(entry);
  return entry;
}
/** The box's step is over by other means (the list closed, the box lost its focus): dropped, nothing undone. */
export function dropUi(entry: Entry | null): void {
  if (!entry || !stack.value.includes(entry)) return;
  stack.value = stack.value.filter((e) => e !== entry);
  backEnd.removed([entry]);
}
/** Replace one open panel by another in place (the trip detail becomes the trip being followed). */
export function swap(oldId: string, newId: string): boolean {
  const i = stack.value.findIndex((e) => e.kind === 'overlay' && e.id === oldId);
  if (i < 0) return false;
  const old = stack.value[i],
    next: Entry = { kind: 'overlay', id: newId };
  stack.value = stack.value.map((e, k) => (k === i ? next : e));
  backEnd.replaced(old, next);
  hooks.closed(oldId);
  renderPanels();
  return true;
}
/** Close every panel and return to the base screen (Back's record catches up on its own). */
export function closeAll(): void {
  const old = stack.value;
  if (!old.length) return;
  stack.value = [];
  const base = old.find((e) => e.kind === 'tab');
  if (base && base.kind === 'tab') screen.value = base.from;
  for (const e of old)
    if (e.kind === 'overlay') hooks.closed(e.id);
    else if (e.kind === 'search') hooks.leaveSearch();
  renderPanels();
  backEnd.removed(old);
}
/** A panel to the front: pushed when new. Already open, it is drawn anew (another stop or line in the same panel); if
 *  other panels were opened over it since (a stop's page over a line's page, whose chip asked for a line), those close
 *  first, so what was asked for is seen. */
export function showOverlay(id: string): void {
  const i = stack.value.findIndex((e) => e.kind === 'overlay' && e.id === id);
  if (i >= 0) {
    const above = stack.value.slice(i + 1);
    if (above.length) {
      stack.value = stack.value.slice(0, i + 1);
      for (const e of [...above].reverse()) undo(e);
      backEnd.removed(above);
    }
    hooks.changed(true);
    return;
  }
  push({ kind: 'overlay', id });
  renderPanels();
}
function hideOverlay(id: string): void {
  hooks.closed(id);
  renderPanels();
}
export function showScreen(name: string, record = true): void {
  if (record && name !== screen.value) push({ kind: 'tab', from: screen.value });
  screen.value = name;
  renderPanels();
}
/** The page's back button: the chooser cancels, a panel closes, else the plan screen. */
export function back(): void {
  if (topPanel() === 'chooser') chooser.finish(null);
  else if (stack.value.length) backEnd.back();
  else showScreen('plan');
}
