// Words for journeys: durations, transfers, line names, the countdown to a departure.
import * as clock from '../engine/clock.js';
import * as delays from '../engine/delays.js';
import { t, lang } from '../lib/i18n';
import { fmt } from '../lib/time';
import type { Place } from '../state/search';

/** A distance as the rider reads it: to the metre close by, by 50 m within a kilometre, then in km (one decimal under 10). */
export const distText = (m: number): string => (m < 100 ? t('distM', { m: Math.round(m) }) : m < 1000 ? t('distM', { m: Math.round(m / 50) * 50 })
  : t('distKm', { km: m < 10000 ? (Math.round(m / 100) / 10).toLocaleString(lang.value === 'he' ? 'he-IL' : 'en-GB') : Math.round(m / 1000) }));
/** A walk's or a ride's length in whole minutes, never 0. */
export const legMinutes: (sec: number) => number = clock.legMinutes;
export const dur = (sec: number): string => { const mn = Math.round(sec / 60); return mn >= 60 ? `${Math.floor(mn / 60)} ${t('hour')} ${mn % 60} ${t('min')}` : `${mn} ${t('min')}`; };
export const transfersText = (n: number): string => (n === 0 ? t('direct') : n === 1 ? t('transfer1') : t('transfers', { n }));
export const lineText = (line?: string | null): string => (line === 'train' ? t('train') : line || '');
export const stopsText = (n: number): string => (n === 1 ? t('stops1') : t('stopsN', { n }));
export const describePlace = (p: Place | null | undefined): string => (p ? p.name + ((p.platforms || 0) > 1 ? ` (${t('platforms', { n: p.platforms! })})` : '') : '');
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
/** A saved trip's key: the places and the bicycle choice. */
export const tripKey = (q: { from: { name: string }; to: { name: string }; bike?: string; folding?: boolean }): string => `trip:${q.from.name}|${q.to.name}|${q.bike}|${q.folding ? 'f' : ''}`;
type LiveAt = { time: number; delay: number; passed?: boolean; stale?: boolean } | null;
export type Badge = { text: string; cls: '' | 'ok' | 'unsure' | 'gone'; time?: number; delayText?: string };   // time: the live departure
/** A live vehicle's standing as a badge: its time at the stop and how late, passed, or no vehicle found. */
export function liveBadge(at: LiveAt): Badge {
  if (!at) return { text: t('liveNoVehicle'), cls: '' };
  if (at.passed) return { text: t('livePassed'), cls: 'gone' };
  const d = delays.delayMinutes(at.delay);
  const delayText = `⦿ ${d === 0 ? t('onTime') : `${d > 0 ? '+' : ''}${d}`}${at.stale ? ' ?' : ''}`;
  const text = `⦿ ${fmt(at.time)}${d === 0 ? ' · ' + t('onTime') : ` (${d > 0 ? '+' : ''}${d})`}${at.stale ? ' ?' : ''}`;
  return { text, cls: at.stale ? 'unsure' : 'ok', time: at.time, delayText };
}
/** "now", "in n min" (up to two hours), or nothing. */
export function inText(sec: number, day: string): string { const n = minutesUntil(sec, day); return n <= 0 ? t('nowDep') : n > 120 ? '' : t('inMin', { n }); }
/** A time past midnight on the same service day gets a mark. */
export const fmtPlus = (sec: number): string => fmt(sec) + (sec >= 86400 ? '⁺' : '');
