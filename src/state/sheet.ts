// The bottom sheet: collapsed to a strip (peek), half open, or full. It is always as tall as the screen and slides by
// a transform (composited: no layout per frame, the snap animates on the GPU); `--sheet-h` is the visible part, which
// the body's height and the map's buttons follow. This module holds what the sheet is (signals, sizes worked out from
// the screen's layout); the Sheet component (views/shell/Sheet.tsx) applies it to the page.
import { signal } from '@preact/signals';
import * as results from './results';
import { unset } from '../lib/unset';

export type SheetState = 'peek' | 'half' | 'full';
export const ORDER: SheetState[] = ['peek', 'half', 'full'];
export const state = signal<SheetState>('peek');
/** The visible height while a finger drags it, else null. */
export const dragH = signal<number | null>(null);
/** The screen as the sheet sizes itself by, measured by the views (views/shell/layout.ts): its height, where the top
 *  bar ends, and the phone's bottom inset (the gesture strip), in CSS pixels. */
export const layout = signal({ h: 800, barBottom: 0, sab: 0 });
/** Bumped to bring the sheet's body back to its top (a new list, a new size from collapsed). */
export const scrollReset = signal(0);

/** What the app does when the sheet changes size (the map's live layer, the list's scroll). */
export const hooks = { changed: (_prev: SheetState, _st: SheetState): void => unset('sheet.changed') };

/** Where the map's controls start: under the top bar. */
export const topPad = (): number => Math.round(layout.value.barBottom + 12);
/** The full size: the screen under the bar. */
export const fullPx = (): number => Math.max(200, layout.value.h - topPad() + 4);
/**
 * The sheet's own box: always the whole screen, whatever the bar does, and slid down to show only its visible height.
 * It used to be as tall as the full size, so the bar growing on entering search mode shrank it at once (its top edge
 * jumped) while its slide eased after (the jitter).
 */
export const boxPx = (): number => layout.value.h;
/** The visible height of each size; collapsed, the handle (and the peek line) sit above the phone's gesture strip. */
export function px(st: SheetState): number {
  if (st === 'peek') return (results.highlighted.value ? 80 : 44) + 16 + layout.value.sab;
  return st === 'half' ? Math.round(layout.value.h * 0.46) : fullPx();
}
export const visible = (): number => dragH.value ?? px(state.value);
/** Follow the finger: slide to a visible height without changing the state. */
export function drag(h: number): void {
  dragH.value = h;
}
export function dragEnd(): void {
  dragH.value = null;
}
export function set(st: SheetState): void {
  const prev = state.value;
  state.value = st;
  hooks.changed(prev, st);
}
export function toggle(): void {
  if (state.value === 'peek') set('half');
  else if (state.value === 'half') set('full');
  else set('peek');
}
/** The body back to its top. */
export const scrollToTop = (): void => {
  scrollReset.value++;
};
