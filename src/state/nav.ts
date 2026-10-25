// Where the rider is: the base screen (plan, saved, more) and the panels open over it (a detail, a
// page, the drawer, the map picker). Every panel and every screen change is a history entry, so the phone's
// back button (or the browser's) closes the panel or returns to the previous screen instead of leaving the
// app. Closing with an in-app button goes through history too, so both paths look the same.
// A close steps history back; the browser performs that later, and a pushState made meanwhile would be
// swallowed by it (the traversal is measured from where the call was made). So while a step back is
// pending, new entries wait in `queued` and are pushed once its popstate arrives.
// On Android, Chrome plays its own "previous page" slide for every history step, which made closing a panel look
// like one page leaving another, on an app that is one map with things on top. There, where the browser has
// CloseWatcher, each entry gets one instead of a history entry: back closes the panel with the app's own
// animation and the browser draws nothing. Everywhere else, history as above.
import { signal, computed } from '@preact/signals';
import { t } from '../lib/i18n';
import * as sheet from './sheet';
import * as results from './results';
import * as search from './search';
import * as chooser from './chooser';
import * as app from './app';

// 'search': the bar searches lines or stops (a step back is the trip search again); 'ui': a search box's open list or
// its keyboard, which back closes first (Android only: see pushUi)
export type Entry = { kind: 'overlay'; id: string } | { kind: 'tab'; from: string } | { kind: 'plan' } | { kind: 'search' } | { kind: 'ui'; undo: () => void };
export const stack = signal<Entry[]>([]);
export const screen = signal('plan');
let settling = false;
const queued: Entry[] = [];

/** What the app does when panels close or change. Filled in by the app at start. */
export const hooks = {
  closed: (_id: string) => {},       // a panel closed: its timers, markers, promises
  clearPlan: () => {},               // the plan entry was undone
  leaveSearch: () => {},             // the line or stop search entry was undone
  changed: (_again = false) => {},   // something shows differently: the map redraws (again: the same panel, new content)
  screenShown: (_name: string) => {},
};

export const isOpen = (id: string): boolean => stack.value.some((e) => e.kind === 'overlay' && e.id === id);
/** Layers beside the panels, not over them: the drawer and the settings page leave the sheet and the map as they are. */
const LAYERS = new Set(['drawer', 'settings']);
/** The panel on top, if any. */
export function topPanel(): string | null { const st = stack.value; for (let i = st.length - 1; i >= 0; i--) { const e = st[i]; if (e.kind === 'overlay' && !LAYERS.has(e.id)) return e.id; } return null; }
/** What the sheet shows: a panel id, or 'screen-<name>'. */
export const key = computed(() => topPanel() || 'screen-' + screen.value);
export const picking = computed(() => key.value === 'picker');   // picking a point: the sheet and the bar go, the crosshair bar shows
// pages over the whole screen (the sheet grows to it; the bar, the map's buttons and the handle go)
const PAGE_TITLE: Record<string, string | null> = { 'screen-saved': 'tabSaved', chooser: null };
export const page = computed(() => !picking.value && key.value in PAGE_TITLE);
export const pageTitle = (): string => { const k = key.value; return PAGE_TITLE[k] ? t(PAGE_TITLE[k]!) : chooser.title.value; };
/** How open the sheet is when a panel or screen comes up. */
const SHEET_FOR: Record<string, sheet.SheetState | (() => sheet.SheetState)> = {
  // "my location" alone is no search: the sheet stays folded
  'screen-plan': () => (results.showing.value || (search.from.value && !search.from.value.auto) || search.to.value ? 'half' : 'peek'),
  'screen-saved': 'full', chooser: 'full',
};

/** Apply what is on top: the drawer, the settings page, the page look, the sheet's size; the map follows. */
export function renderPanels(): void {
  app.drawerOpen.value = isOpen('drawer');
  app.settingsOpen.value = isOpen('settings');
  document.body.classList.toggle('page', page.value);
  if (page.value) { const b = document.getElementById('sheetBody'); if (b) b.scrollTop = 0; }
  if (!picking.value) { const st = SHEET_FOR[key.value]; sheet.set(typeof st === 'function' ? st() : st || 'half'); }
  hooks.changed();
}

const CW = (window as any).CloseWatcher;
const WATCH = typeof CW === 'function' && /Android/i.test(navigator.userAgent);
/** Back is a close request at a time here (CloseWatcher), not history. */
export const closeWatchers = WATCH;
const watchers = new Map<Entry, any>();
/** An entry's CloseWatcher: Android's back closes it, and whatever was opened over it. */
function watch(entry: Entry): void {
  try { const w = new CW(); w.onclose = () => { watchers.delete(entry); backTo(entry); }; watchers.set(entry, w); } catch { /* back leaves the app then */ }
}
function unwatch(entry: Entry): void { const w = watchers.get(entry); watchers.delete(entry); if (w) try { w.destroy(); } catch { /* already gone */ } }
/** Close an entry and every entry above it, top first. */
function backTo(entry: Entry): void {
  const i = stack.value.indexOf(entry);
  if (i < 0) return;
  const above = stack.value.slice(i).reverse();
  stack.value = stack.value.slice(0, i);
  for (const e of above) { unwatch(e); undo(e); }
}

export function push(entry: Entry): void {
  stack.value = [...stack.value, entry];
  if (WATCH) { watch(entry); return; }
  if (settling) { queued.push(entry); return; }
  try { history.pushState({ wayli: stack.value.length }, ''); } catch { /* history unavailable */ }
}
/** History caught up with a close: push what waited, in stack order. */
function settled(): void {
  settling = false;
  for (const e of queued.splice(0)) { const i = stack.value.indexOf(e); if (i >= 0) try { history.pushState({ wayli: i + 1 }, ''); } catch { /* history unavailable */ } }
}
function stepBack(n: number): void {
  settling = true;
  try { history.go(-n); } catch { settled(); return; }
  setTimeout(() => { if (settling) settled(); }, 600);
}
/** Undo the top entry (from popstate, or to close programmatically). */
function undo(entry: Entry): void {
  if (entry.kind === 'overlay') hideOverlay(entry.id);
  else if (entry.kind === 'tab') showScreen(entry.from, false);
  else if (entry.kind === 'search') hooks.leaveSearch();
  else if (entry.kind === 'ui') entry.undo();
  else hooks.clearPlan();
}
/** Close the given panel (or the plan, or the line or stop search) now; history steps back one entry to match (its
 *  popstate then finds nothing left to undo). `undo` false drops the entry only: what it stood for is already undone
 *  (the bar's switch went back to the trip search). */
export function close(id: string, undo = true): void {
  const i = stack.value.findIndex((e) => (e.kind === 'overlay' && e.id === id) || (e.kind === id && (id === 'plan' || id === 'search')));
  if (i < 0) { if (id === 'plan') hooks.clearPlan(); return; }
  const entry = stack.value[i];
  stack.value = stack.value.filter((_, k) => k !== i);
  if (!undo) { /* nothing left to undo */ } else if (entry.kind === 'plan') hooks.clearPlan(); else if (entry.kind === 'search') hooks.leaveSearch(); else hideOverlay(id);
  if (WATCH) unwatch(entry); else stepBack(1);
}
/**
 * A step back of the top bar's own (controllers/shell.ts): its keyboard, then its list, then the line or stop search.
 * Android only (CloseWatcher), where back is one close request at a time; elsewhere each focus and blur would be a
 * history entry. Returns null there.
 */
export function pushUi(undo: () => void): Entry | null {
  if (!WATCH) return null;
  const entry: Entry = { kind: 'ui', undo };
  push(entry);
  return entry;
}
/** The box's step is over by other means (the list closed, the box lost its focus): dropped, nothing undone. */
export function dropUi(entry: Entry | null): void {
  if (!entry || !stack.value.includes(entry)) return;
  stack.value = stack.value.filter((e) => e !== entry);
  unwatch(entry);
}
/** Replace one open panel by another in place (the trip detail becomes the trip being followed). */
export function swap(oldId: string, newId: string): boolean {
  const i = stack.value.findIndex((e) => e.kind === 'overlay' && e.id === oldId);
  if (i < 0) return false;
  const old = stack.value[i], next: Entry = { kind: 'overlay', id: newId };
  stack.value = stack.value.map((e, k) => (k === i ? next : e));
  const w = watchers.get(old);
  if (w) { watchers.delete(old); watchers.set(next, w); w.onclose = () => { watchers.delete(next); backTo(next); }; }
  hooks.closed(oldId);
  renderPanels();
  return true;
}
/** Close every panel and return to the base screen (the history catches up on its own). */
export function closeAll(): void {
  const old = stack.value;
  if (!old.length) return;
  stack.value = [];
  const base = old.find((e) => e.kind === 'tab');
  if (base && base.kind === 'tab') screen.value = base.from;
  for (const e of old) if (e.kind === 'overlay') hooks.closed(e.id); else if (e.kind === 'search') hooks.leaveSearch();
  renderPanels();
  if (WATCH) for (const e of old) unwatch(e); else stepBack(old.length);
}
export function showOverlay(id: string): void {
  if (isOpen(id)) { hooks.changed(true); return; }   // another stop or line in the same panel: drawn anew
  push({ kind: 'overlay', id });
  renderPanels();
}
function hideOverlay(id: string): void { hooks.closed(id); renderPanels(); }
export function showScreen(name: string, record = true): void {
  if (record && name !== screen.value) push({ kind: 'tab', from: screen.value });
  screen.value = name;
  renderPanels();
  hooks.screenShown(name);
}
/** The page's back button: the chooser cancels, a panel closes, else the plan screen. */
export function back(): void {
  if (topPanel() === 'chooser') chooser.finish(null);
  else if (stack.value.length) { if (WATCH) backTo(stack.value[stack.value.length - 1]); else history.back(); }
  else showScreen('plan');
}

window.addEventListener('popstate', (e) => {
  if (WATCH) return;   // no history entries of ours there
  if (settling) { settled(); return; }   // our own step back: the stack is already right
  const depth = e.state && e.state.wayli ? e.state.wayli : 0;
  while (stack.value.length > depth) { const top = stack.value[stack.value.length - 1]; stack.value = stack.value.slice(0, -1); undo(top); }
});
try { history.replaceState({ wayli: 0 }, ''); } catch { /* history unavailable */ }
