// The rider's question: where from, where to, when (the service day and a time on it, departing or arriving by, or
// "now"), with what bicycle, and the days the data covers. No screen in it: the rules (a time after midnight belongs to
// the night of the day before, "now" follows the clock, the days offered) are tested in Node (tools/query-state.test.ts).
// The bar (state/search.ts) shows and edits it; the planner reads it.
import { signal, computed } from '@preact/signals';
import * as clock from '../engine/clock.ts';
import { calToday, hm, secOf, calendarOf } from '../lib/time';
import type { Place } from '../journey/types';

// ---- the places
export const from = signal<Place | null>(null);
export const to = signal<Place | null>(null);
export const sides = { from, to } as const;

// ---- when and how
export const timeMode = signal<'depart' | 'arrive'>('depart');
export const day = signal(''); // YYYYMMDD, one of `days`
export const at = signal('08:00'); // HH:MM on that day, past 24:00 for its night ("25:10")
export const bike = signal<'none' | 'park' | 'along'>('none');
export const folding = signal(false);
export const timeTouched = signal(false); // the rider set a day, a time or "arrive by"; until then every plan is from now
export const days = signal<string[]>([]); // the service days the data covers

/** What a change of the question must set off (state cannot import the controllers): another day's timetable loaded,
 *  and the day "now" is on. Filled in at start (controllers/loading.ts). */
export const hooks = {
  dayChanged: (_d: string) => {},
  startDay: (): string => '',
};
// ---- when
/** The time as seconds on the selected service day. */
export const atSeconds = (): number => secOf(at.value);
export function setAt(sec: number): void {
  at.value = hm(Math.max(0, Math.min(sec, 86400 * 2 - 60)));
  timeTouched.value = true;
}
/** The time now on the selected day ("25:10" on the night's day, "01:10" on a day that starts now), else 08:00. */
export function setDefaultTime(): void {
  const n = clock.nowOn(day.value);
  at.value = n >= 0 && n < 86400 * 2 ? hm(n) : '08:00';
}

/** What the time popover shows and sets: the calendar day and the clock, never the service day behind them. */
export type When = { mode: 'now' | 'depart' | 'arrive'; cal: string; hh: string; mm: string };
/** The question's time as the time popover shows it. */
export function whenNow(): When {
  const { cal, time } = calendarOf(day.value || calToday(), atSeconds()),
    [hh, mm] = time.split(':');
  return { mode: timeTouched.value ? timeMode.value : 'now', cal, hh, mm };
}
/** The calendar days the wheel offers: those the data covers from today on (today also after midnight, when the night
 *  is still in yesterday's timetable). */
export const calDays = computed(() => {
  const today = calToday(),
    svc = clock.serviceDay();
  const s = new Set(days.value.filter((d) => d >= today));
  if (svc.lateNight && days.value.includes(svc.day)) s.add(today);
  return s.size ? [...s].sort() : days.value;
});
/**
 * Set a calendar day and clock. Before 03:00 the service day is the one before, its night (a day's timetable carries
 * the night after it, the next day's early trips included); otherwise the day itself, or the nearest day the data has.
 */
export function setWhen(w: When): void {
  if (w.mode === 'now') {
    resetNow();
    return;
  }
  let sec = Number(w.hh) * 3600 + Number(w.mm) * 60,
    d = w.cal;
  const eve = clock.shiftDay(w.cal, -1);
  if (sec < 3 * 3600 && days.value.includes(eve)) {
    d = eve;
    sec += 86400;
  } else if (!days.value.includes(d)) d = days.value.find((x) => x >= d) || days.value[days.value.length - 1] || d;
  timeMode.value = w.mode;
  at.value = hm(sec);
  timeTouched.value = true;
  if (d !== day.value) {
    day.value = d;
    hooks.dayChanged(d);
  }
}
/** A service day the data has and a time on it, departing (the results' "plan from 20:23" and "tomorrow"). */
export function setDayAt(d: string, sec: number): void {
  if (!days.value.includes(d)) return;
  timeMode.value = 'depart';
  setAt(sec);
  if (d !== day.value) {
    day.value = d;
    hooks.dayChanged(d);
  }
}
/** Back to "now": the current service day, its time, departing. */
export function resetNow(): void {
  const d = hooks.startDay();
  const changed = d && d !== day.value;
  if (d) day.value = d;
  setDefaultTime();
  timeMode.value = 'depart';
  timeTouched.value = false;
  if (changed) hooks.dayChanged(day.value);
}
/** Apply a query's day, time and bicycle (a shared link, a recent trip, the last search); its places are the bar's to
 *  set, since the boxes show them (state/search.ts applyQuery). */
export function applyWhenAndHow(q: {
  bike?: string;
  folding?: boolean;
  day?: string;
  at?: string;
  arriveBy?: boolean;
}): void {
  bike.value = (q.bike as typeof bike.value) || 'none';
  folding.value = !!q.folding;
  if (q.day && days.value.includes(q.day)) day.value = q.day;
  if (q.at) at.value = q.at;
  timeMode.value = q.arriveBy ? 'arrive' : 'depart';
  timeTouched.value = !!(q.at || q.arriveBy);
}
/** The current options as the planner takes them. */
export const options = () => ({
  day: day.value,
  at: at.value,
  timeMode: timeMode.value,
  bike: bike.value,
  folding: folding.value,
  timeTouched: timeTouched.value,
  arriveBy: timeMode.value === 'arrive',
});
