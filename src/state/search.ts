// The bar: what its boxes show, which of its parts are open, what it searches for (a trip, a line, a stop, the two
// stations of a train timetable), and its actions. The question it edits (places, time, bicycle) is state/query.ts.
// What the planner itself does (routing, results, the map) stays behind `hooks`, which the app fills in at start.
import { signal, computed, effect } from '@preact/signals';
import { t } from '../lib/i18n';
import * as settings from './settings';
import type { Place } from '../journey/types';
import * as query from './query';
import { from, to, sides, timeTouched } from './query';

export type { LineGroup, StopGroup } from '../worker/ops.ts';
export type { Place } from '../journey/types';
export { stopPlace } from '../journey/types';
export type Side = 'from' | 'to';
type OptPanel = '' | 'time' | 'bike';

// ---- the places
/** What the boxes show: a chosen place's name, or what is being typed. */
export const fromText = signal('');
export const toText = signal('');
export const texts = { from: fromText, to: toText } as const;
/** The question's places, as the boxes show them (re-exported for the bar's components). */
export { from, to, sides };

// ---- the bar
export const barOpen = signal(false); // editing: both rows and the options show
export const typing = signal(''); // the bar's box with the keyboard (its id), for back
export const listing = signal(''); // the bar's box with its list open
/** What back does to a bar box: let go of its focus (the keyboard goes), close its list. */
/** The search boxes on screen, by id (SearchField registers itself): how state and the bar move the keyboard and close
 *  a list without looking elements up by id. */
export const boxes = new Map<
  string,
  { focus: () => void; blur: () => void; focused: () => boolean; closeList: () => void }
>();
export const leaving = signal(false); // the moment after editing ends: the rows play out before they go
export const settling = signal(false); // then the pill's icons pop back in
export const optOpen = signal<OptPanel>('');
export const optDirty = signal(false); // an option changed while its popover was open: re-plan on close
/** What the bar searches for: a trip to a place (the two boxes, time, bike), a line by its number, or a stop. */
export type LineFilter = 'all' | 'bus' | 'rail' | 'lrt' | 'cable';
export type StopFilter = 'all' | 'bus' | 'rail' | 'lrt';
export type Kind = 'trip' | 'line' | 'stop';
export const kind = signal<Kind>('trip');
export const lineFilter = signal<LineFilter>('all');
export const stopFilter = signal<StopFilter>('all');
export const toPlaceholder = computed<'goQ' | 'lineNumber' | 'stationQ' | 'stopQ'>(() => {
  if (kind.value === 'line') return lineFilter.value === 'rail' ? 'stationQ' : 'lineNumber';
  if (kind.value === 'stop') return stopFilter.value === 'rail' || stopFilter.value === 'lrt' ? 'stationQ' : 'stopQ';
  return 'goQ';
});
// the full keyboard everywhere: line numbers carry letters ("4א"), and words narrow them ("274 תל אביב")
export const toInputMode = computed<'' | 'numeric'>(() => '');
// The train timetable (the stop search for trains, and for the light rail): two stations at the top, as riders who plan
// their own trips from the schedule use it; the sheet answers with where trains from the first go, or those between the two.
export const railPair = computed(
  () => kind.value === 'stop' && (stopFilter.value === 'rail' || stopFilter.value === 'lrt'),
);
export const pairMode = computed<'rail' | 'lrt'>(() => (stopFilter.value === 'lrt' ? 'lrt' : 'rail'));
export const stFrom = signal<Place | null>(null);
export const stFromText = signal('');
export const stTo = signal<Place | null>(null);
export const stToText = signal('');
export const busy = signal(true); // the planner is not ready, or planning

// Leaving search mode, the rows play out (`leaving`) before they go. Set in the same moment the bar closes:
// set a frame later (after a render), the rows vanished for that frame and came back to play out.
let wasOpen = false,
  leaveTimer = 0,
  settleTimer = 0;
effect(() => {
  const open = barOpen.value;
  if (wasOpen && !open && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    leaving.value = true;
    clearTimeout(leaveTimer);
    clearTimeout(settleTimer);
    leaveTimer = window.setTimeout(() => {
      leaving.value = false;
      settling.value = true;
      settleTimer = window.setTimeout(() => {
        settling.value = false;
      }, 420);
    }, 480);
  } else if (open) {
    clearTimeout(leaveTimer);
    clearTimeout(settleTimer);
    leaving.value = false;
    settling.value = false;
  }
  wasOpen = open;
});

/** The bar's three looks: the prompt pill, the two rows with options, or the summary of a plan (or of the trains between
 *  two stations, once both are set). */
export const mode = computed<'rest' | 'edit' | 'summary'>(() => {
  // the line and stop searches rest as a pill, but for the two stations of a train timetable
  const has =
    kind.value === 'trip'
      ? !!(to.value || (from.value && !from.value.auto))
      : railPair.value && !!stFrom.value && !!stTo.value;
  if (barOpen.value || leaving.value) return 'edit';
  return has ? 'summary' : 'rest';
});

/** What the bar's own flows need from the controllers (state cannot import them): planning when a place is picked, the
 *  plan cleared when its panel closes, the search kind's history step. Filled in at start. */
export const hooks = {
  plan: () => {},
  planTo: (_p: Place) => {},
  clearPlan: () => {},
  kindChanged: (_k: Kind) => {}, // the line and stop searches are a step back can undo
};

// ---- actions
export const myLocation = (pos: { lat: number; lon: number }): Place => ({
  name: t('myLoc'),
  lat: pos.lat,
  lon: pos.lon,
  transient: true,
});
export function setPlace(side: Side, p: Place | null): void {
  sides[side].value = p;
  texts[side].value = p ? p.name : '';
}
/** Focus one of the boxes once the bar has rendered its new shape (the signals render a moment later). */
export function focusBox(id: string, afterMs = 60): void {
  setTimeout(() => boxes.get(id)?.focus(), afterMs);
}
export function openBar(): void {
  if (barOpen.value) return;
  barOpen.value = true;
  // the origin starts as "my location" (resolved when the plan is made); typing or the menu replaces it
  if (!from.value) setPlace('from', { name: t('myLoc'), transient: true, auto: true });
}
export function foldBar(): void {
  barOpen.value = false;
}
export function clearPlaces(): void {
  tripTo = null;
  leaveLineMode();
  from.value = null;
  to.value = null;
  fromText.value = '';
  toText.value = '';
  barOpen.value = false;
}
export function swapPlaces(): void {
  const f = from.value,
    tt = to.value;
  setPlace('from', tt);
  setPlace('to', f); // Go plans; a swap by itself changes nothing else
}
/** Back from editing ends a trip search, like the summary's X: no places, no results, the plain pill. The line and stop
 *  searches fold to their own pill instead (a step back from there is the trip pill). (A tap on the map folds the rows
 *  back to the summary or the pill.) */
export function back(): void {
  for (const id of ['toQ', 'fromQ']) boxes.get(id)?.blur();
  if (kind.value !== 'trip') foldBar();
  else hooks.clearPlan();
}
/** Plan with what is set: the places (where you are now, for "my location"), the time and the bicycle. */
function planSet(): void {
  const f = from.value;
  if (!f || f.transient) setPlace('from', { name: t('myLoc'), transient: true, auto: !f || f.auto }); // located afresh
  hooks.plan();
}
/** The Go button: plan with what is set, an open popover's choice included, or ask for a destination. */
export function go(): void {
  setOpt('', false);
  if (!to.value) {
    boxes.get('toQ')?.focus();
    return;
  }
  planSet();
}
/** A destination chosen in the To box: plans at once, from the origin set or from where you are, at the time set
 *  (from now unless the rider chose one). */
export function chooseTo(p: Place): void {
  if (from.value && !from.value.transient) {
    setPlace('to', p);
    if (!timeTouched.value) query.resetNow();
    hooks.plan();
  } else hooks.planTo(p);
}
/**
 * Open an option popover, or close it (''). The time popover works on a draft: closing it in any way (Done, a tap
 * elsewhere, Go) sets what it shows. Opened on "now", it shows "depart at" the time now (whoever taps the chip means
 * to set a time); closed untouched, it stays "now". Closing after a change plans again when there is a destination.
 */
export const whenDraft = signal<query.When | null>(null);
let whenOpened: query.When | null = null; // the draft as the popover opened, to tell a change from none
export function setOpt(which: OptPanel, replan = true): void {
  const was = optOpen.value;
  if (was === which) return;
  if (was === 'time' && whenDraft.value) {
    const d = whenDraft.value;
    if (JSON.stringify(d) !== JSON.stringify(whenOpened)) {
      query.setWhen(d);
      optDirty.value = true;
    }
    whenDraft.value = null;
    whenOpened = null;
  }
  if (which === 'time') {
    const w = query.whenNow();
    whenDraft.value = whenOpened = w.mode === 'now' ? { ...w, mode: 'depart' } : w;
  }
  optOpen.value = which;
  if (!which && optDirty.value) {
    optDirty.value = false;
    if (replan && to.value) planSet();
  }
}
export function chooseFrom(p: Place): void {
  setPlace('from', p);
  if (to.value) hooks.plan();
}
// The destination set before switching to the line or stop search, given back when switching to a trip again.
let tripTo: { to: Place | null; text: string } | null = null;
/** Switch what the bar searches for. The line and stop searches keep the To box for what they search. */
/** The drawer's history follows the bar's kind (state/results recentTab; set from there, to keep this module free of it). */
let tabHook = (_k: Kind): void => {};
export const onKind = (f: (k: Kind) => void): void => {
  tabHook = f;
};
export function setKind(k: Kind): void {
  if (kind.value === k) return;
  if (kind.value === 'trip') {
    tripTo = { to: to.value, text: toText.value };
    to.value = null;
    optOpen.value = '';
  }
  toText.value = '';
  // the stop search opens on the rider's usual kind of stop (settings: many look only for trains)
  if (k === 'stop') {
    const f = settings.get().stopFilter;
    stopFilter.value = f === 'bus' || f === 'rail' || f === 'lrt' ? f : 'all';
    clearStations();
  }
  if (k === 'trip') {
    if (tripTo) {
      to.value = tripTo.to;
      toText.value = tripTo.text;
      tripTo = null;
    } else toText.value = to.value ? to.value.name : '';
  }
  kind.value = k;
  tabHook(k);
  hooks.kindChanged(k);
}
/** Search a line by number: the bar opens on the line search. */
export function lineMode(): void {
  barOpen.value = true;
  setKind('line');
  focusBox('toQ');
}
/** Back to trips (what the To box held before is given back). */
export function leaveLineMode(): void {
  setKind('trip');
  lineFilter.value = 'all';
  stopFilter.value = 'all';
  clearStations();
}
export function clearStations(): void {
  stFrom.value = null;
  stFromText.value = '';
  stTo.value = null;
  stToText.value = '';
}
/** Search a stop: the bar opens on the stop search. */
export function stopMode(): void {
  barOpen.value = true;
  setKind('stop');
  focusBox('toQ');
}

/** Apply a query's places and options (a shared link, a recent trip, the last search). */
export function applyQuery(q: {
  from: Place;
  to: Place;
  bike?: string;
  folding?: boolean;
  day?: string;
  at?: string;
  arriveBy?: boolean;
}): void {
  setPlace('from', q.from);
  setPlace('to', q.to);
  query.applyWhenAndHow(q);
}
/** The bicycle choice from the popover: the plan is made again when the popover closes. */
export function setBike(v: 'none' | 'park' | 'along'): void {
  query.bike.value = v;
  optDirty.value = true;
}
export function setFolding(v: boolean): void {
  query.folding.value = v;
  optDirty.value = true;
}
/** A filter chip under the line or stop search; the two stations of a train timetable are not carried from trains to
 *  the light rail or back. Answers which timetable of two stations is now up, if any. */
export function setFilter(k: Kind, f: string): 'rail' | 'lrt' | null {
  const was = railPair.value ? pairMode.value : null;
  if (k === 'stop') stopFilter.value = f as StopFilter;
  else lineFilter.value = f as LineFilter;
  const now = railPair.value ? pairMode.value : null;
  if (was !== now) clearStations();
  return now;
}
