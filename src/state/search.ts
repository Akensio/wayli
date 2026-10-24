// The search state: where from, where to, when, with what bicycle, and which parts of the bar are open.
// One place for the state that used to live in the bar's DOM. Components read the signals; the rest of the
// app sets them through the actions here. What the planner itself does (routing, results, the map) stays
// behind `hooks`, which the app fills in at start.
import { signal, computed, effect } from '@preact/signals';
import * as live from '../live.js';
import { t } from '../i18n';
import { calToday, hm, secOf, calendarOf } from '../time';

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
export const typing = signal('');       // the bar's box with the keyboard (its id), for back
export const listing = signal('');      // the bar's box with its list open
/** What back does to a bar box: let go of its focus (the keyboard goes), close its list. */
export const boxes = new Map<string, { blur: () => void; closeList: () => void }>();
export const leaving = signal(false);   // the moment after editing ends: the rows play out before they go
export const settling = signal(false);  // then the pill's icons pop back in
export const optOpen = signal<OptPanel>('');
export const optDirty = signal(false);  // an option changed while its popover was open: re-plan on close
/** What the bar searches for: a trip to a place (the two boxes, time, bike), a line by its number, or a stop. */
export type LineFilter = 'all' | 'bus' | 'rail' | 'lrt' | 'cable';
export type StopFilter = 'all' | 'bus' | 'rail' | 'lrt';
export type Kind = 'trip' | 'line' | 'stop';
export const kind = signal<Kind>('trip');
export const lineFilter = signal<LineFilter>('all');
export const stopFilter = signal<StopFilter>('all');
export const toPlaceholder = computed<'goQ' | 'lineNumber' | 'stationQ' | 'stopQ'>(() =>
  (kind.value === 'line' ? (lineFilter.value === 'rail' ? 'stationQ' : 'lineNumber') : kind.value === 'stop' ? (stopFilter.value === 'rail' ? 'stationQ' : 'stopQ') : 'goQ'));
// the full keyboard everywhere: line numbers carry letters ("4א"), and words narrow them ("274 תל אביב")
export const toInputMode = computed<'' | 'numeric'>(() => '');
// The train timetable (the stop search for trains): two stations at the top, as riders who plan their own trips from
// the schedule use it; the sheet answers with where trains from the first go, or the trains between the two.
export const railPair = computed(() => kind.value === 'stop' && stopFilter.value === 'rail');
export const stFrom = signal<Place | null>(null);
export const stFromText = signal('');
export const stTo = signal<Place | null>(null);
export const stToText = signal('');
export const busy = signal(true);       // the planner is not ready, or planning

// ---- when and how
export const timeMode = signal<'depart' | 'arrive'>('depart');
export const day = signal('');          // YYYYMMDD, one of `days`
export const at = signal('08:00');      // HH:MM on that day, past 24:00 for its night ("25:10")
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
  const has = kind.value === 'trip' && !!(to.value || (from.value && !from.value.auto));   // the line and stop searches rest as a pill
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
  lineGroups: async (_q: string, _mode: LineFilter, _limit?: number): Promise<LineGroup[]> => [],
  stopGroups: async (_q: string, _mode: StopFilter, _from?: number[]): Promise<StopGroup[]> => [],
  openStopGroup: (_g: StopGroup) => {},
  chooseStation: (_side: Side, _g: StopGroup) => {},
  swapStations: () => {},
  openLine: (_r: any) => {},
  kindChanged: (_k: Kind) => {},   // the line and stop searches are a step back can undo
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
export function clearPlaces(): void { tripTo = null; leaveLineMode(); from.value = null; to.value = null; fromText.value = ''; toText.value = ''; barOpen.value = false; }
export function swapPlaces(): void {
  const f = from.value, tt = to.value;
  setPlace('from', tt); setPlace('to', f);   // Go plans; a swap by itself changes nothing else
}
/** Back from editing ends a trip search, like the summary's X: no places, no results, the plain pill. The line and stop
 *  searches fold to their own pill instead (a step back from there is the trip pill). (A tap on the map folds the rows
 *  back to the summary or the pill.) */
export function back(): void {
  for (const id of ['toQ', 'fromQ']) (document.getElementById(id) as HTMLInputElement | null)?.blur();
  if (kind.value !== 'trip') foldBar(); else hooks.clearPlan();
}
/** Plan with what is set: the places (where you are now, for "my location"), the time and the bicycle. */
function planSet(): void {
  const f = from.value;
  if (!f || f.transient) setPlace('from', { name: t('myLoc'), transient: true, auto: !f || f.auto });   // located afresh
  hooks.plan();
}
/** The Go button: plan with what is set, an open popover's choice included, or ask for a destination. */
export function go(): void {
  setOpt('', false);
  if (!to.value) { (document.getElementById('toQ') as HTMLInputElement | null)?.focus(); return; }
  planSet();
}
/** A destination chosen in the To box: plans at once, from the origin set or from where you are, at the time set
 *  (from now unless the rider chose one). */
export function chooseTo(p: Place): void {
  if (from.value && !from.value.transient) { setPlace('to', p); if (!timeTouched.value) resetNow(); hooks.plan(); } else hooks.planTo(p);
}
/**
 * Open an option popover, or close it (''). The time popover works on a draft: closing it in any way (Done, a tap
 * elsewhere, Go) sets what it shows. Opened on "now", it shows "depart at" the time now (whoever taps the chip means
 * to set a time); closed untouched, it stays "now". Closing after a change plans again when there is a destination.
 */
export const whenDraft = signal<When | null>(null);
let whenOpened: When | null = null;   // the draft as the popover opened, to tell a change from none
export function setOpt(which: OptPanel, replan = true): void {
  const was = optOpen.value;
  if (was === which) return;
  if (was === 'time' && whenDraft.value) {
    const d = whenDraft.value;
    if (JSON.stringify(d) !== JSON.stringify(whenOpened)) { setWhen(d); optDirty.value = true; }
    whenDraft.value = null; whenOpened = null;
  }
  if (which === 'time') { const w = whenNow(); whenDraft.value = whenOpened = w.mode === 'now' ? { ...w, mode: 'depart' } : w; }
  optOpen.value = which;
  if (!which && optDirty.value) { optDirty.value = false; if (replan && to.value) planSet(); }
}
export function chooseFrom(p: Place): void { setPlace('from', p); if (to.value) hooks.plan(); }
/** A line as the line search lists it: its chip, where it runs, its directions (worker `lineGroups`). */
export type LineGroup = { estimated?: boolean; key: string; mode: 'bus' | 'rail' | 'lrt' | 'cable' | 'taxi' | 'flex'; line: string; agency: string; routeType: number; trips: number; area: string[]; dirs: { route: number; headsign: string; trips: number }[]; dist: number | null };
/** A stop as the stop search lists it (worker `stopGroups`): a station is one entry with its platforms. */
export type StopGroup = { key: string; name: string; city?: string; code?: string; stops: number[]; lat: number; lon: number; mode: 'bus' | 'rail' | 'lrt'; dist: number | null; lines: { label: string; type: number; agency: string; route: number }[] };
// The destination set before switching to the line or stop search, given back when switching to a trip again.
let tripTo: { to: Place | null; text: string } | null = null;
/** Switch what the bar searches for. The line and stop searches keep the To box for what they search. */
export function setKind(k: Kind): void {
  if (kind.value === k) return;
  if (kind.value === 'trip') { tripTo = { to: to.value, text: toText.value }; to.value = null; optOpen.value = ''; }
  toText.value = '';
  if (k === 'trip') {
    if (tripTo) { to.value = tripTo.to; toText.value = tripTo.text; tripTo = null; }
    else toText.value = to.value ? to.value.name : '';
  }
  kind.value = k;
  hooks.kindChanged(k);
}
/** Search a line by number: the bar opens on the line search. */
export function lineMode(): void { barOpen.value = true; setKind('line'); focusBox('toQ'); }
/** Back to trips (what the To box held before is given back). */
export function leaveLineMode(): void { setKind('trip'); lineFilter.value = 'all'; stopFilter.value = 'all'; clearStations(); }
export function clearStations(): void { stFrom.value = null; stFromText.value = ''; stTo.value = null; stToText.value = ''; }
/** Search a stop: the bar opens on the stop search. */
export function stopMode(): void { barOpen.value = true; setKind('stop'); focusBox('toQ'); }

// ---- when
/** The time as seconds on the selected service day. */
export const atSeconds = (): number => secOf(at.value);
export function setAt(sec: number): void { at.value = hm(Math.max(0, Math.min(sec, 86400 * 2 - 60))); timeTouched.value = true; }
/** The time now on the selected day ("25:10" on the night's day, "01:10" on a day that starts now), else 08:00. */
export function setDefaultTime(): void { const n = live.nowOn(day.value); at.value = n >= 0 && n < 86400 * 2 ? hm(n) : '08:00'; }
export function chooseDay(d: string): void { if (d === day.value) return; day.value = d; timeTouched.value = true; hooks.dayChanged(d); }

/** What the time popover shows and sets: the calendar day and the clock, never the service day behind them. */
export type When = { mode: 'now' | 'depart' | 'arrive'; cal: string; hh: string; mm: string };
export function whenNow(): When {
  const { cal, time } = calendarOf(day.value || calToday(), atSeconds()), [hh, mm] = time.split(':');
  return { mode: timeTouched.value ? timeMode.value : 'now', cal, hh, mm };
}
/** The calendar days the wheel offers: those the data covers from today on (today also after midnight, when the night
 *  is still in yesterday's timetable). */
export const calDays = computed(() => {
  const today = calToday(), svc = live.serviceDay();
  const s = new Set(days.value.filter((d) => d >= today));
  if (svc.lateNight && days.value.includes(svc.day)) s.add(today);
  return s.size ? [...s].sort() : days.value;
});
/**
 * Set a calendar day and clock. Before 03:00 the service day is the one before, its night (a day's timetable carries
 * the night after it, the next day's early trips included); otherwise the day itself, or the nearest day the data has.
 */
export function setWhen(w: When): void {
  if (w.mode === 'now') { resetNow(); return; }
  let sec = Number(w.hh) * 3600 + Number(w.mm) * 60, d = w.cal;
  const eve = live.shiftDay(w.cal, -1);
  if (sec < 3 * 3600 && days.value.includes(eve)) { d = eve; sec += 86400; }
  else if (!days.value.includes(d)) d = days.value.find((x) => x >= d) || days.value[days.value.length - 1] || d;
  timeMode.value = w.mode;
  at.value = hm(sec); timeTouched.value = true;
  if (d !== day.value) { day.value = d; hooks.dayChanged(d); }
}
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
