// Israel time and service days, whatever the phone's zone: the date and time parts in Israel, days as YYYYMMDD,
// the service day (a night's trips belong to the day before, until 03:00) and seconds on it, which is how the
// timetable counts time (a trip at 01:10 after midnight is at 25:10 on its service day).
const TZ = 'Asia/Jerusalem';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
/** Date/time parts in Israel, whatever the phone's zone. */
export function ilParts(date = new Date()) {
  const o = {};
  for (const p of fmt.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second, dow: DOW.indexOf(o.weekday) };
}
export const dayStr = (y, m, d) => `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
const utcDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
export function shiftDay(s, n) { const d = new Date(utcDay(s) + n * 86400000); return dayStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
/**
 * The service day a moment belongs to: a GTFS day runs past midnight, so 00:10 is "24:10 of yesterday".
 * Until 03:00 the previous day's timetable is the right one.
 */
export function serviceDay(date = new Date()) {
  const p = ilParts(date);
  let day = dayStr(p.y, p.m, p.d), sec = p.h * 3600 + p.mi * 60 + p.s;
  if (p.h < 3) { day = shiftDay(day, -1); sec += 86400; }
  return { day, seconds: sec, lateNight: p.h < 3 };
}
/** Seconds since the midnight (Israel) that starts the given service day. */
export function secondsOn(date, day) {
  const p = ilParts(date);
  const diff = Math.round((utcDay(dayStr(p.y, p.m, p.d)) - utcDay(day)) / 86400000);
  return diff * 86400 + p.h * 3600 + p.mi * 60 + p.s;
}
export const nowOn = (day) => secondsOn(new Date(), day);

