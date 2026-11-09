// A vehicle's live standing as the rider reads it: how late, its badge (its time at the stop, passed, or not seen), and
// the class a time carries for it.
import * as delays from '../engine/delays.ts';
import type { LiveTime } from '../engine/delays.ts';
import { t } from '../common/i18n';
import { fmt } from '../common/time';
import { nowOn } from '../engine/clock.ts';
import type { RideLive } from '../trip/journey';

/** Minutes late as the rider reads them: +3, -2, 0. */
export const signed = (n: number): string => (n > 0 ? '+' : '') + n;
/** How late a vehicle runs: "on time" or "+3 min late". */
export const delayText = (d: number): string => (d === 0 ? t('onTime') : t('liveDelay', { d: signed(d) }));
/** The class a time or a countdown carries for its live standing: live, unsure when the report is old, none without. */
export function liveClass(live?: { stale?: boolean } | null): '' | ' live' | ' unsure' {
  if (!live) return '';
  return live.stale ? ' unsure' : ' live';
}
/** How sure a ride's departure time is, as a class for its chip (maintainer, 2026-11-08): ' sure' (green) when its
 *  vehicle reported within the last four minutes, whatever the shift from the timetable; ' unsure' (orange) when the
 *  report is older, or no vehicle is seen for a ride that leaves within 20 minutes (one should be reporting by then);
 *  ' guess' (red) for a line whose times are estimates; '' for the timetable's time of a ride still far off. */
export function sureness(
  r: { depart: number; estimated?: boolean; live?: { stale?: boolean } | null },
  day: string,
): '' | ' sure' | ' unsure' | ' guess' {
  if (r.estimated) return ' guess';
  if (r.live) return r.live.stale ? ' unsure' : ' sure';
  return r.depart - nowOn(day) <= 20 * 60 ? ' unsure' : '';
}
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
/** A ride's live standing as a badge: as liveBadge, or that the live data could not be had. */
export const rideBadge = (r: RideLive): Badge => (r === 'failed' ? { text: t('liveFail'), cls: '' } : liveBadge(r.at));
