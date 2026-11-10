// A ride's live standing as the rider reads it: how late, its badge, and the class a time carries for it. All of it is
// said from the same two facts every screen is given (trip/now.ts, state/live.ts): whether the time is sure, and whether
// the vehicle is past the stop.
import { t } from '../common/i18n';
import { fmt } from '../common/time';
import { nowOn } from '../engine/clock.ts';

/** What is known live of a ride at a stop; null or undefined: nothing, the time is the timetable's. */
export type Live = { sure: boolean; passed: boolean } | null | undefined;
/** Minutes late as the rider reads them: +3, -2, 0. */
export const signed = (n: number): string => (n > 0 ? '+' : '') + n;
/** How late a vehicle runs: "on time" or "+3 min late". */
export const delayText = (d: number): string => (d === 0 ? t('onTime') : t('liveDelay', { d: signed(d) }));
/** The class a time or a countdown carries for its live standing: live, unsure when it is not certain, none without. */
export const liveClass = (live: Live): '' | ' live' | ' unsure' => {
  if (!live) return '';
  return live.sure ? ' live' : ' unsure';
};
/** How sure a ride's departure time is, as a class for its chip (maintainer, 2026-11-08): ' sure' (green) for a live
 *  time, whatever the shift from the timetable; ' unsure' (orange) when the live time is not certain, or no vehicle is
 *  seen for a ride that leaves within 20 minutes (one should be reporting by then); ' guess' (red) for a line whose
 *  times are estimates; '' for the timetable's time of a ride still far off. */
export function sureness(
  r: { depart: number; estimated?: boolean; live?: Live },
  day: string,
): '' | ' sure' | ' unsure' | ' guess' {
  if (r.estimated) return ' guess';
  if (r.live) return r.live.sure ? ' sure' : ' unsure';
  return r.depart - nowOn(day) <= 20 * 60 ? ' unsure' : '';
}
/** A badge: its words in full and in short, and its class. */
export type Badge = { text: string; short: string; cls: 'ok' | 'unsure' | 'gone' };
/** A ride's live standing at a stop as a badge: passed, or its time there with how late that is against the listed
 *  one ("⦿ 16:56 (+5)", in short "⦿ +5"; a "?" when not certain). Null without live: nothing is claimed. */
export function liveBadge(live: Live, time: number, listed: number): Badge | null {
  if (!live) return null;
  if (live.passed) return { text: t('livePassed'), short: t('livePassed'), cls: 'gone' };
  const d = Math.round((time - listed) / 60),
    q = live.sure ? '' : ' ?';
  return {
    text: `⦿ ${fmt(time)}${d === 0 ? ' · ' + t('onTime') : ` (${signed(d)})`}${q}`,
    short: `⦿ ${d === 0 ? t('onTime') : signed(d)}${q}`,
    cls: live.sure ? 'ok' : 'unsure',
  };
}
