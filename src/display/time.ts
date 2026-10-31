// Time as the rider reads it: how long, how soon ("leave in 5 min", "in 3 min"), and a time past midnight marked.
import * as clock from '../engine/clock.ts';
import { t } from '../lib/i18n';
import { fmt } from '../lib/time';

/** A walk's or a ride's length in whole minutes, never 0. */
export const legMinutes: (sec: number) => number = clock.legMinutes;
export const dur = (sec: number): string => {
  const mn = Math.round(sec / 60);
  return mn >= 60 ? `${Math.floor(mn / 60)} ${t('hour')} ${mn % 60} ${t('min')}` : `${mn} ${t('min')}`;
};
/** Minutes until a departure on a service day, from the real clock. */
const minutesUntil = (sec: number, day: string): number => Math.round((sec - clock.nowOn(day)) / 60);
/** "Leave now", "Leave in 5 min", "Departed", or nothing when it is hours away. */
export function leaveText(sec: number, day: string): string {
  const n = minutesUntil(sec, day);
  if (n > 180 || n < -180) return '';
  if (n < -1) return t('departed');
  if (n <= 0) return t('leaveNow');
  return t('leaveIn', { n });
}
/** "in n min" for the near future only; beyond two hours the clock time says enough. */
export const inShort = (n: number): string => (n > 120 || n < 0 ? '' : ` (${t('inMin', { n })})`);
/** "now", "in n min" (up to two hours), or nothing. */
export function inText(sec: number, day: string): string {
  const n = minutesUntil(sec, day);
  if (n <= 0) return t('nowDep');
  if (n > 120) return '';
  return t('inMin', { n });
}
/** A time past midnight on the same service day gets a mark. */
export const fmtPlus = (sec: number): string => fmt(sec) + (sec >= 86400 ? '⁺' : '');
