// Sharing a journey: its legs as text and a link that opens the same plan.
import { t } from '../lib/i18n';
import { fmt, hm } from '../lib/time';
import { dur, lineText, legMinutes } from './format';
import type { Journey, Query } from './types';

/** Share a journey through the phone's share sheet, or copy it where there is none. `names` are the two places as the
 *  rider reads them (state/names). Answers what happened: shared, copied, or nothing (cancelled or not possible). */
export async function shareJourney(
  j: Journey,
  q: Query,
  names: { from: string; to: string },
  bikeOnly = false,
): Promise<'shared' | 'copied' | 'none'> {
  const lines = [`${names.from} → ${names.to}`, `${fmt(j.depart)} → ${fmt(j.arrive)} (${dur(j.arrive - j.depart)})`];
  for (const l of j.legs) {
    const mins = legMinutes(l.seconds);
    if (l.type === 'ride')
      lines.push(`${fmt(l.depart!)} ${lineText(l.line)} ${l.from!.name} → ${l.to!.name} ${fmt(l.arrive!)}`);
    else lines.push(`${l.mode === 'bike' ? '🚲' : '🚶'} ${mins} ${t('min')}`);
  }
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  const pt = (p: { lat?: number | null; lon?: number | null; name: string }) =>
    `${(+p.lat!).toFixed(5)},${(+p.lon!).toFixed(5)},${encodeURIComponent(p.name)}`;
  if (q.from.lat != null && q.to.lat != null && !bikeOnly) {
    u.searchParams.set('from', pt(q.from));
    u.searchParams.set('to', pt(q.to));
    u.searchParams.set('day', q.day);
    u.searchParams.set('at', hm(j.depart)); // past 24:00 for the night, as the planner keeps it
    if (q.bike !== 'none') u.searchParams.set('bike', q.bike);
    if (q.folding) u.searchParams.set('folding', '1');
  }
  const text = lines.join('\n');
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Wayli', text, url: u.toString() });
      return 'shared';
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${u}`);
      return 'copied';
    }
  } catch {
    /* the rider cancelled the share sheet, or the clipboard is not allowed */
  }
  return 'none';
}
