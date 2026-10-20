// Times and days as the planner uses them: seconds on a service day, dates as YYYYMMDD strings, and the
// day labels the rider reads (Today, Tomorrow, Tonight after midnight).
import * as live from './live.js';
import { t } from './i18n';

/** Seconds on a service day as HH:MM (a late-night time past 24:00 wraps). */
export const fmt = (sec: number): string => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
/** A YYYYMMDD string as a local Date. */
export const dateOf = (s: string): Date => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
/** Today's calendar date in Israel, YYYYMMDD. */
export const calToday = (): string => { const p = live.ilParts(); return live.dayStr(p.y, p.m, p.d); };
/** "Today · Mon 20.10", "Tonight · ..." (the night's service day, after midnight), "Tomorrow · ...", or the bare date. */
export function dayLabel(s: string): string {
  const d = dateOf(s), svc = live.serviceDay(), today = calToday();
  const base = `${(t('dayFmt') as unknown as string[])[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  if (s === svc.day && svc.lateNight) return `${t('tonight')} · ${base}`;
  if (s === today) return `${t('today')} · ${base}`;
  if (s === live.shiftDay(today, 1)) return `${t('tomorrow')} · ${base}`;
  return base;
}
/** The short form for a pill: "Today", "Tonight", or "Mon 20.10". */
export const dayShort = (s: string): string => dayLabel(s).split(' · ')[0];
