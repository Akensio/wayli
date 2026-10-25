// Times and days as the planner uses them: seconds on a service day, dates as YYYYMMDD strings, and the
// day labels the rider reads (Today, Tomorrow, or the date). The rider only ever sees calendar days: a service day
// runs past midnight, and its night is shown as the next calendar day's small hours.
import * as live from '../engine/live.js';
import { t } from './i18n';

/** Seconds on a service day as HH:MM (a late-night time past 24:00 wraps). */
export const fmt = (sec: number): string => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
/** A YYYYMMDD string as a local Date. */
export const dateOf = (s: string): Date => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
/** Today's calendar date in Israel, YYYYMMDD. */
export const calToday = (): string => { const p = live.ilParts(); return live.dayStr(p.y, p.m, p.d); };
/** "Today · Mon 20.10", "Tomorrow · ...", or the bare date, for a calendar day. */
export function dayLabel(s: string): string {
  const d = dateOf(s), today = calToday();
  const base = `${(t('dayFmt') as unknown as string[])[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  if (s === today) return `${t('today')} · ${base}`;
  if (s === live.shiftDay(today, 1)) return `${t('tomorrow')} · ${base}`;
  return base;
}
/** The short form for a pill: "Today", "Tomorrow", or "Mon 20.10". */
export const dayShort = (s: string): string => dayLabel(s).split(' · ')[0];
/** Seconds on a service day as the planner keeps them, "25:10" past midnight (never wrapped). */
export const hm = (sec: number): string => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
/** "25:10" (or "08:00") as seconds. */
export const secOf = (v: string): number => { const [h, m] = v.split(':').map(Number); return (Number.isNaN(h) ? 8 : h) * 3600 + (m || 0) * 60; };
/** A time on a service day as the rider reads it: the calendar day and the clock ("25:10" on the 21st is 01:10 on the 22nd). */
export const calendarOf = (day: string, sec: number): { cal: string; time: string } => ({ cal: live.shiftDay(day, Math.floor(sec / 86400)), time: fmt(sec) });
