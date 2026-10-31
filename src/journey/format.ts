// Words for journeys: durations, transfers, line names, the countdown to a departure.
import * as clock from '../engine/clock.ts';
import * as delays from '../engine/delays.ts';
import { t, lang } from '../lib/i18n';
import { fmt } from '../lib/time';
import { savedTripKey, type Place } from './types';
import type { LiveTime } from '../engine/delays.ts';

/** A distance as the rider reads it: to the metre close by, by 50 m within a kilometre, then in km (one decimal under 10). */
export function distText(m: number): string {
  if (m < 100) return t('distM', { m: Math.round(m) });
  if (m < 1000) return t('distM', { m: Math.round(m / 50) * 50 });
  const km =
    m < 10000
      ? (Math.round(m / 100) / 10).toLocaleString(lang.value === 'he' ? 'he-IL' : 'en-GB')
      : Math.round(m / 1000);
  return t('distKm', { km });
}
/** A walk's or a ride's length in whole minutes, never 0. */
export const legMinutes: (sec: number) => number = clock.legMinutes;
export const dur = (sec: number): string => {
  const mn = Math.round(sec / 60);
  return mn >= 60 ? `${Math.floor(mn / 60)} ${t('hour')} ${mn % 60} ${t('min')}` : `${mn} ${t('min')}`;
};
/** Minutes late as the rider reads them: +3, -2, 0. */
export const signed = (n: number): string => (n > 0 ? '+' : '') + n;
/** How late a vehicle runs: "on time" or "+3 min late". */
export const delayText = (d: number): string => (d === 0 ? t('onTime') : t('liveDelay', { d: signed(d) }));
/** The bicycle choice: none, to the stop, or taken along. */
export function bikeText(b?: string | null): string {
  if (b === 'along') return t('bikeAlong');
  if (b === 'park') return t('bikePark');
  return t('bikeNone');
}
export function transfersText(n: number): string {
  if (n === 0) return t('direct');
  if (n === 1) return t('transfer1');
  return t('transfers', { n });
}
/** The class a time or a countdown carries for its live standing: live, unsure when the report is old, none without. */
export function liveClass(live?: { stale?: boolean } | null): '' | ' live' | ' unsure' {
  if (!live) return '';
  return live.stale ? ' unsure' : ' live';
}
/** What a point on the map is called from what is found at it: a plain "point" when nothing is near, "near X" beyond
 *  40 m, else the name itself (the worker's `reverse`). */
export function reverseName(g: { kind: string; distance: number; name: string }): string {
  if (g.kind === 'point') return t('pointName');
  return g.distance > 40 ? t('nearName', { name: g.name }) : g.name;
}
export const lineText = (line?: string | null): string => (line === 'train' ? t('train') : line || '');
export const stopsText = (n: number): string => (n === 1 ? t('stops1') : t('stopsN', { n }));
export const describePlace = (p: Place | null | undefined): string =>
  p ? p.name + ((p.platforms || 0) > 1 ? ` (${t('platforms', { n: p.platforms! })})` : '') : '';
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
/** A saved trip's key among the favourites: the store's key of the trip (its places and the bicycle choice). */
export const tripKey = (q: {
  from: { name: string };
  to: { name: string };
  bike?: string;
  folding?: boolean;
}): string => 'trip:' + savedTripKey(q);
type LiveAt = LiveTime | null;
export type Badge = { text: string; cls: '' | 'ok' | 'unsure' | 'gone'; time?: number; delayText?: string }; // time: the live departure
/** A live vehicle's standing as a badge: its time at the stop and how late, passed, or no vehicle found. */
export function liveBadge(at: LiveAt): Badge {
  if (!at) return { text: t('liveNoVehicle'), cls: '' };
  if (at.passed) return { text: t('livePassed'), cls: 'gone' };
  const d = delays.delayMinutes(at.delay);
  const badgeDelay = `⦿ ${d === 0 ? t('onTime') : signed(d)}${at.stale ? ' ?' : ''}`;
  const text = `⦿ ${fmt(at.time)}${d === 0 ? ' · ' + t('onTime') : ` (${signed(d)})`}${at.stale ? ' ?' : ''}`;
  return { text, cls: at.stale ? 'unsure' : 'ok', time: at.time, delayText: badgeDelay };
}
/** "now", "in n min" (up to two hours), or nothing. */
export function inText(sec: number, day: string): string {
  const n = minutesUntil(sec, day);
  if (n <= 0) return t('nowDep');
  if (n > 120) return '';
  return t('inMin', { n });
}
/** A time past midnight on the same service day gets a mark. */
export const fmtPlus = (sec: number): string => fmt(sec) + (sec >= 86400 ? '⁺' : '');
