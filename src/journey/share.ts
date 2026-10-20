// Sharing a journey: its legs as text and a link that opens the same plan.
import { t } from '../i18n';
import { fmt } from '../time';
import { toast } from '../ui/toast';
import { dur, lineText } from './format';
import type { Journey, Query } from './types';

export function shareJourney(j: Journey, q: Query, bikeOnly = false): void {
  const lines = [`${q.from.name} → ${q.to.name}`, `${fmt(j.depart)} → ${fmt(j.arrive)} (${dur(j.arrive - j.depart)})`];
  for (const l of j.legs) {
    const mins = Math.max(1, Math.round(l.seconds / 60));
    if (l.type === 'ride') lines.push(`${fmt(l.depart!)} ${lineText(l.line)} ${l.from!.name} → ${l.to!.name} ${fmt(l.arrive!)}`);
    else lines.push(`${l.mode === 'bike' ? '🚲' : '🚶'} ${mins} ${t('min')}`);
  }
  const u = new URL(location.href); u.search = ''; u.hash = '';
  const pt = (p: { lat?: number | null; lon?: number | null; name: string }) => `${(+p.lat!).toFixed(5)},${(+p.lon!).toFixed(5)},${encodeURIComponent(p.name)}`;
  if (q.from.lat != null && q.to.lat != null && !bikeOnly) {
    u.searchParams.set('from', pt(q.from)); u.searchParams.set('to', pt(q.to)); u.searchParams.set('day', q.day); u.searchParams.set('at', fmt(j.depart));
    if (q.bike !== 'none') u.searchParams.set('bike', q.bike);
    if (q.folding) u.searchParams.set('folding', '1');
  }
  const text = lines.join('\n');
  if (navigator.share) navigator.share({ title: 'Wayli', text, url: u.toString() }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(`${text}\n${u}`).then(() => toast(t('copied'))).catch(() => {});
}
