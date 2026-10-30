// The bottom sheet: collapsed to a strip (peek), half open, or full. It is always as tall as its full size
// and slides by a transform (composited: no layout per frame, the snap animates on the GPU); `--sheet-h` is
// the visible part, which the body's height and the map's buttons follow.
import { signal } from '@preact/signals';
import * as results from './results';

export type SheetState = 'peek' | 'half' | 'full';
export const ORDER: SheetState[] = ['peek', 'half', 'full'];
export const state = signal<SheetState>('peek');
let dragH: number | null = null; // the visible height while a finger drags it, else null

/** What the app does when the sheet changes size (the map's live layer, the list's scroll). */
export const hooks = { changed: (_prev: SheetState, _st: SheetState) => {} };

const sheetEl = () => document.getElementById('sheet')!;
const bodyEl = () => document.getElementById('sheetBody')!;
const sab = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0;
/** Where the map's controls start: under the top bar. */
export const topPad = (): number => {
  const bar = document.getElementById('topbar');
  return Math.round((bar ? bar.getBoundingClientRect().bottom : 0) + 12);
};
/** The full size: the screen under the bar. */
export const fullPx = (): number => Math.max(200, innerHeight - topPad() + 4);
/**
 * The sheet's own box: always the whole screen, whatever the bar does, and slid down to show only its visible height.
 * It used to be as tall as the full size, so the bar growing on entering search mode shrank it at once (its top edge
 * jumped) while its slide eased after (the jitter).
 */
export const boxPx = (): number => innerHeight;
/** The visible height of each size; collapsed, the handle (and the peek line) sit above the phone's gesture strip. */
export function px(st: SheetState): number {
  if (st === 'peek') return (results.highlighted.value ? 80 : 44) + 16 + sab();
  return st === 'half' ? Math.round(innerHeight * 0.46) : fullPx();
}
export const visible = (): number => (dragH != null ? dragH : px(state.value));
/** Follow the finger: slide to a visible height without changing the state. */
export function drag(h: number): void {
  dragH = h;
  sheetEl().style.transform = `translateY(${Math.round(boxPx() - h)}px)`;
  bodyEl().style.height = `${Math.max(0, h - 36)}px`;
}
export function dragEnd(): void {
  dragH = null;
  sheetEl().style.transform = '';
  bodyEl().style.height = '';
}
export function set(st: SheetState): void {
  const prev = state.value;
  state.value = st;
  sheetEl().dataset.state = st;
  document.body.classList.toggle('sheet-full', st === 'full');
  document.documentElement.style.setProperty('--sheet-h', px(st) + 'px');
  document.documentElement.style.setProperty('--sheet-box', boxPx() + 'px');
  hooks.changed(prev, st);
}
export const toggle = (): void => set(state.value === 'peek' ? 'half' : state.value === 'half' ? 'full' : 'peek');
