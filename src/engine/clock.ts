// Israel time and service days, whatever the phone's zone: the date and time parts in Israel, days as YYYYMMDD,
// the service day (a night's trips belong to the day before, until 03:00) and seconds on it, which is how the
// timetable counts time (a trip at 01:10 after midnight is at 25:10 on its service day).
const TZ = 'Asia/Jerusalem';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ilFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});
/** A moment's parts in Israel: year, month, day, hour, minute, second and day of the week (0 = Sunday). */
export type IlParts = { y: number; m: number; d: number; h: number; mi: number; s: number; dow: number };
/** A moment as the clock takes one: a Date, or milliseconds since the epoch. */
export type Moment = Date | number;
/** Date/time parts in Israel, whatever the phone's zone. */
export function ilParts(date: Moment = new Date()): IlParts {
  const o: Record<string, string> = {};
  for (const p of ilFormat.formatToParts(date)) o[p.type] = p.value;
  return {
    y: +o.year,
    m: +o.month,
    d: +o.day,
    h: +o.hour % 24,
    mi: +o.minute,
    s: +o.second,
    dow: DOW.indexOf(o.weekday),
  };
}
/** A number in two digits: 7 → "07". */
export const two = (n: number): string => String(n).padStart(2, '0');
/** Seconds on a service day as HH:MM (a late-night time past 24:00 wraps). */
export const hhmm = (sec: number): string =>
  `${two(Math.floor(sec / 3600) % 24)}:${two(Math.floor((sec % 3600) / 60))}`;
/** A walk's or a ride's length as the rider reads it, in whole minutes, never 0. */
export const legMinutes = (sec: number): number => Math.max(1, Math.round(sec / 60));
/** A day as the timetable names it: YYYYMMDD. */
export const dayStr = (y: number, m: number, d: number): string => `${y}${two(m)}${two(d)}`;
const utcDay = (s: string): number => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
export function shiftDay(s: string, n: number): string {
  const d = new Date(utcDay(s) + n * 86400000);
  return dayStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
/** A moment on the service clock: the day it belongs to, the seconds on that day, and whether it is the small hours. */
export type ServiceMoment = { day: string; seconds: number; lateNight: boolean };
/**
 * The service day a moment belongs to: a GTFS day runs past midnight, so 00:10 is "24:10 of yesterday".
 * Until 03:00 the previous day's timetable is the right one.
 */
export function serviceDay(date: Moment = new Date()): ServiceMoment {
  const p = ilParts(date);
  let day = dayStr(p.y, p.m, p.d),
    sec = p.h * 3600 + p.mi * 60 + p.s;
  if (p.h < 3) {
    day = shiftDay(day, -1);
    sec += 86400;
  }
  return { day, seconds: sec, lateNight: p.h < 3 };
}
/** Seconds since the midnight (Israel) that starts the given service day. */
export function secondsOn(date: Moment, day: string): number {
  const p = ilParts(date);
  const diff = Math.round((utcDay(dayStr(p.y, p.m, p.d)) - utcDay(day)) / 86400000);
  return diff * 86400 + p.h * 3600 + p.mi * 60 + p.s;
}
export const nowOn = (day: string): number => secondsOn(new Date(), day);
