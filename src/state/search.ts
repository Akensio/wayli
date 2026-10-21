// The search state: where from, where to, when, with what bicycle, and which parts of the bar are open.
// One place for the state that used to live in the bar's DOM. Components read the signals; the rest of the
// app sets them through the actions here. What the planner itself does (routing, results, the map) stays
// behind `hooks`, which the app fills in at start.
import { signal, computed, effect } from '@preact/signals';
import * as live from '../live.js';
import { t } from '../i18n';
import { fmt, calToday } from '../time';

export type Place = { name: string; lat?: number | null; lon?: number | null; stops?: number[]; platforms?: number; code?: string; kind?: string; transient?: boolean; auto?: boolean };
export type Side = 'from' | 'to';
export type OptPanel = '' | 'time' | 'bike';

// ---- the places
export const from = signal<Place | null>(null);
export const to = signal<Place | null>(null);
/** What the boxes show: a chosen place's name, or what is being typed. */
export const fromText = signal('');
export const toText = signal('');
export const sides = { from, to } as const;
export const texts = { from: fromText, to: toText } as const;

// ---- the bar
export const barOpen = signal(false);   // editing: both rows and the options show
export const leaving = signal(false);   // the moment after editing ends: the rows play out before they go
export const settling = signal(false);  // then the pill's icons pop back in
export const optOpen = signal<OptPanel>('');
export const optDirty = signal(false);  // an option changed while its popover was open: re-plan on close
export const toPlaceholder = signal<'goQ' | 'lineNumber'>('goQ');
export const toInputMode = signal<'' | 'numeric'>('');
export const busy = signal(true);       // the planner is not ready, or planning

// ---- when and how
export const timeMode = signal<'depart' | 'arrive'>('depart');
export const day = signal('');          // YYYYMMDD, one of `days`
export const at = signal('08:00');      // HH:MM on that day
export const bike = signal<'none' | 'park' | 'along'>('none');
export const folding = signal(false);
export const timeTouched = signal(false);   // the rider set a day, a time or "arrive by"; until then every plan is from now
export const days = signal<string[]>([]);   // the service days the data covers

// Leaving search mode, the rows play out (`leaving`) before they go. Set in the same moment the bar closes:
// set a frame later (after a render), the rows vanished for that frame and came back to play out.
let wasOpen = false, leaveTimer = 0, settleTimer = 0;
effect(() => {
  const open = barOpen.value;
  if (wasOpen && !open && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    leaving.value = true;
    clearTimeout(leaveTimer); clearTimeout(settleTimer);
    leaveTimer = window.setTimeout(() => {
      leaving.value = false; settling.value = true;
      settleTimer = window.setTimeout(() => { settling.value = false; }, 420);
    }, 480);
  } else if (open) { clearTimeout(leaveTimer); clearTimeout(settleTimer); leaving.value = false; settling.value = false; }
  wasOpen = open;
});

/** The bar's three looks: the prompt pill, the two rows with options, or the summary of a plan. */
export const mode = computed<'rest' | 'edit' | 'summary'>(() => {
  const has = !!(to.value || (from.value && !from.value.auto));
  if (barOpen.value || leaving.value) return 'edit';
  return has ? 'summary' : 'rest';
});

/** What the rest of the app provides to the bar. Filled in by the app at start. */
export const hooks = {
  plan: () => {},
  planTo: (_p: Place) => {},
  clearPlan: () => {},
  hasResults: () => false,
  lastQuery: (): { from: Place; to: Place } | null => null,
  search: async (_q: string): Promise<{ results: any[]; placesLoaded: boolean }> => ({ results: [], placesLoaded: false }),
  searchLines: async (_q: string): Promise<any[]> => [],
  lineChipHtml: (_r: any): string => '',
  openLine: (_r: any) => {},
  getPosition: async (): Promise<{ lat: number; lon: number }> => { throw new Error('no location'); },
  pickOnMap: async (_start: Place | null): Promise<Place | null> => null,
  openMenu: () => {},
  dayChanged: (_d: string) => {},
  startDay: (): string => '',
  layoutTop: () => {},
  toast: (_msg: string) => {},
  ttReady: () => false,
  lastPos: (): { lat: number; lon: number } | null => null,
};

// ---- actions
export const myLocation = (pos: { lat: number; lon: number }): Place => ({ name: t('myLoc'), lat: pos.lat, lon: pos.lon, transient: true });
export function setPlace(side: Side, p: Place | null): void { sides[side].value = p; texts[side].value = p ? p.name : ''; }
/** Focus one of the boxes once the bar has rendered its new shape (the signals render a moment later). */
export function focusBox(id: 'toQ' | 'fromQ'): void { setTimeout(() => (document.getElementById(id) as HTMLInputElement | null)?.focus(), 60); }
export function openBar(): void {
  if (barOpen.value) return;
  barOpen.value = true;
  // the origin starts as "my location" (resolved when the plan is made); typing or the menu replaces it
  if (!from.value) setPlace('from', { name: t('myLoc'), transient: true, auto: true });
}
export function foldBar(): void { barOpen.value = false; }
export function clearPlaces(): void { from.value = null; to.value = null; fromText.value = ''; toText.value = ''; barOpen.value = false; }
export function swapPlaces(): void {
  const f = from.value, tt = to.value;
  setPlace('from', tt); setPlace('to', f);   // Go plans; a swap by itself changes nothing else
}
/** Back from editing ends the search, like the summary's X: no places, no results, the plain pill. (A tap on the map
 *  folds the rows back to the summary instead.) */
export function back(): void {
  for (const id of ['toQ', 'fromQ']) (document.getElementById(id) as HTMLInputElement | null)?.blur();
  hooks.clearPlan();
}
/** The Go button: plan with what is set, or ask for a destination. */
export function go(): void {
  if (!to.value) { (document.getElementById('toQ') as HTMLInputElement | null)?.focus(); return; }
  if (from.value && !from.value.transient) hooks.plan(); else hooks.planTo(to.value);
}
/** A destination chosen in the To box: plans at once (from now), from the origin set or from where you are. */
export function chooseTo(p: Place): void {
  if (from.value && !from.value.transient) { setPlace('to', p); resetNow(); hooks.plan(); } else hooks.planTo(p);
}
export function chooseFrom(p: Place): void { setPlace('from', p); if (to.value) hooks.plan(); }
/** Search a line by number: the To box with a numeric keyboard until it is left. */
export function lineMode(): void {
  barOpen.value = true; toPlaceholder.value = 'lineNumber'; toInputMode.value = 'numeric'; toText.value = ''; to.value = null;
  focusBox('toQ');
}
export function leaveLineMode(): void { toPlaceholder.value = 'goQ'; toInputMode.value = ''; }

// ---- when
/** The time field as seconds on the selected service day (a late-night time on "tonight" is past 24:00). */
export function atSeconds(): number {
  const [h, m] = at.value.split(':').map(Number);
  let sec = (Number.isNaN(h) ? 8 : h) * 3600 + (m || 0) * 60;
  const svc = live.serviceDay();
  if (day.value === svc.day && svc.lateNight && h < 3) sec += 86400;
  return sec;
}
export function setAt(sec: number): void { at.value = fmt(Math.max(0, Math.min(sec, 86400 * 2 - 60))); timeTouched.value = true; }
/** A time typed by the rider: after midnight the planner is still on "tonight", so a time from 03:00 on means the coming day. */
export function typeAt(v: string): void {
  at.value = v; timeTouched.value = true;
  const svc = live.serviceDay(), h = Number(v.split(':')[0]);
  if (svc.lateNight && day.value === svc.day && h >= 3 && days.value.includes(calToday())) chooseDay(calToday());
}
export function setDefaultTime(): void { const svc = live.serviceDay(); at.value = day.value === svc.day ? fmt(svc.seconds) : '08:00'; }
export function chooseDay(d: string): void { if (d === day.value) return; day.value = d; timeTouched.value = true; hooks.dayChanged(d); }
/** Back to "now": the current service day, its time, departing. */
export function resetNow(): void {
  const d = hooks.startDay();
  const changed = d && d !== day.value;
  if (d) day.value = d;
  setDefaultTime(); timeMode.value = 'depart'; timeTouched.value = false;
  if (changed) hooks.dayChanged(day.value);
}
/** Apply a query's places and options (a shared link, a recent trip, the last search). */
export function applyQuery(q: { from: Place; to: Place; bike?: string; folding?: boolean; day?: string; at?: string; arriveBy?: boolean }): void {
  setPlace('from', q.from); setPlace('to', q.to);
  bike.value = (q.bike as typeof bike.value) || 'none'; folding.value = !!q.folding;
  if (q.day && days.value.includes(q.day)) day.value = q.day;
  if (q.at) at.value = q.at;
  timeMode.value = q.arriveBy ? 'arrive' : 'depart';
  timeTouched.value = !!(q.at || q.arriveBy);
}
/** The current options as the planner takes them. */
export const options = () => ({ day: day.value, at: at.value, timeMode: timeMode.value, bike: bike.value, folding: folding.value, timeTouched: timeTouched.value, arriveBy: timeMode.value === 'arrive' });
