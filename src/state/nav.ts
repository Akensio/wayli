// Where the rider is: the base screen (plan, nearby, saved, more) and the panels open over it (a detail, a
// page, the drawer, the map picker). Every panel and every screen change is a history entry, so the phone's
// back button (or the browser's) closes the panel or returns to the previous screen instead of leaving the
// app. Closing with an in-app button goes through history too, so both paths look the same.
// A close steps history back; the browser performs that later, and a pushState made meanwhile would be
// swallowed by it (the traversal is measured from where the call was made). So while a step back is
// pending, new entries wait in `queued` and are pushed once its popstate arrives.
import { signal, computed } from '@preact/signals';
import { t } from '../i18n';
import * as sheet from './sheet';
import * as results from './results';
import * as search from './search';
import * as chooser from './chooser';
import * as app from './app';

export type Entry = { kind: 'overlay'; id: string } | { kind: 'tab'; from: string } | { kind: 'plan' };
export const stack = signal<Entry[]>([]);
export const screen = signal('plan');
let settling = false;
const queued: Entry[] = [];

/** What the app does when panels close or change. Filled in by the app at start. */
export const hooks = {
  closed: (_id: string) => {},       // a panel closed: its timers, markers, promises
  clearPlan: () => {},               // the plan entry was undone
  changed: () => {},                 // something shows differently: the map redraws
  screenShown: (_name: string) => {},
};

export const isOpen = (id: string): boolean => stack.value.some((e) => e.kind === 'overlay' && e.id === id);
/** The panel on top, if any (the drawer sits beside the panels, not over them). */
export function topPanel(): string | null { const st = stack.value; for (let i = st.length - 1; i >= 0; i--) { const e = st[i]; if (e.kind === 'overlay' && e.id !== 'drawer') return e.id; } return null; }
/** What the sheet shows: a panel id, or 'screen-<name>'. */
export const key = computed(() => topPanel() || 'screen-' + screen.value);
export const picking = computed(() => key.value === 'picker');   // picking a point: the sheet and the bar go, the crosshair bar shows
// pages over the whole screen (the sheet grows to it; the bar, the map's buttons and the handle go)
const PAGE_TITLE: Record<string, string | null> = { 'screen-more': 'settings', 'screen-saved': 'tabSaved', chooser: null };
export const page = computed(() => !picking.value && key.value in PAGE_TITLE);
export const pageTitle = (): string => { const k = key.value; return PAGE_TITLE[k] ? t(PAGE_TITLE[k]!) : chooser.title.value; };
/** How open the sheet is when a panel or screen comes up. */
const SHEET_FOR: Record<string, sheet.SheetState | (() => sheet.SheetState)> = {
  'screen-plan': () => (results.showing.value || search.from.value || search.to.value ? 'half' : 'peek'), 'screen-nearby': 'half', 'screen-saved': 'full', 'screen-more': 'full', chooser: 'full',
};

/** Apply what is on top: the drawer, the page look, the sheet's size; the map follows. */
export function renderPanels(): void {
  app.drawerOpen.value = isOpen('drawer');
  document.body.classList.toggle('page', page.value);
  if (page.value) { const b = document.getElementById('sheetBody'); if (b) b.scrollTop = 0; }
  if (!picking.value) { const st = SHEET_FOR[key.value]; sheet.set(typeof st === 'function' ? st() : st || 'half'); }
  hooks.changed();
}

export function push(entry: Entry): void {
  stack.value = [...stack.value, entry];
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
  else hooks.clearPlan();
}
/** Close the given panel (or the plan) now; history steps back one entry to match (its popstate then finds nothing left to undo). */
export function close(id: string): void {
  const i = stack.value.findIndex((e) => (e.kind === 'overlay' && e.id === id) || (e.kind === 'plan' && id === 'plan'));
  if (i < 0) { if (id === 'plan') hooks.clearPlan(); return; }
  const entry = stack.value[i];
  stack.value = stack.value.filter((_, k) => k !== i);
  if (entry.kind === 'plan') hooks.clearPlan(); else hideOverlay(id);
  stepBack(1);
}
/** Replace one open panel by another in place (the trip detail becomes the trip being followed). */
export function swap(oldId: string, newId: string): boolean {
  const i = stack.value.findIndex((e) => e.kind === 'overlay' && e.id === oldId);
  if (i < 0) return false;
  stack.value = stack.value.map((e, k) => (k === i ? { kind: 'overlay', id: newId } : e));
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
  for (const e of old) if (e.kind === 'overlay') hooks.closed(e.id);
  renderPanels();
  stepBack(old.length);
}
export function showOverlay(id: string): void {
  if (isOpen(id)) { hooks.changed(); return; }
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
export function back(): void { if (topPanel() === 'chooser') chooser.finish(null); else if (stack.value.length) history.back(); else showScreen('plan'); }

window.addEventListener('popstate', (e) => {
  if (settling) { settled(); return; }   // our own step back: the stack is already right
  const depth = e.state && e.state.wayli ? e.state.wayli : 0;
  while (stack.value.length > depth) { const top = stack.value[stack.value.length - 1]; stack.value = stack.value.slice(0, -1); undo(top); }
});
try { history.replaceState({ wayli: 0 }, ''); } catch { /* history unavailable */ }
