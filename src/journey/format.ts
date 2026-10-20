// Words for journeys: durations, transfers, line names, the countdown to a departure.
import * as live from '../live.js';
import { t } from '../i18n';
import type { Place } from '../state/search';

export const dur = (sec: number): string => { const mn = Math.round(sec / 60); return mn >= 60 ? `${Math.floor(mn / 60)} ${t('hour')} ${mn % 60} ${t('min')}` : `${mn} ${t('min')}`; };
export const transfersText = (n: number): string => (n === 0 ? t('direct') : n === 1 ? t('transfer1') : t('transfers', { n }));
export const lineText = (line?: string | null): string => (line === 'train' ? t('train') : line || '');
export const stopsText = (n: number): string => (n === 1 ? t('stops1') : t('stopsN', { n }));
export const describePlace = (p: Place | null | undefined): string => (p ? p.name + ((p.platforms || 0) > 1 ? ` (${t('platforms', { n: p.platforms! })})` : '') : '');
/** Minutes until a departure on a service day, from the real clock. */
export const minutesUntil = (sec: number, day: string): number => Math.round((sec - live.nowOn(day)) / 60);
/** "Leave now", "Leave in 5 min", "Departed", or nothing when it is hours away. */
export function leaveText(sec: number, day: string): string {
  const n = minutesUntil(sec, day);
  if (n > 180 || n < -180) return '';
  if (n < -1) return t('departed');
  if (n <= 0) return t('leaveNow');
  return t('leaveIn', { n });
}
