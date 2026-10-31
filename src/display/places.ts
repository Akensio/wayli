// Places and distances as the rider reads them: how far, a place's name with its platforms, what a point on the map is
// called.
import { t, lang } from '../lib/i18n';
import type { Place } from '../model/place';

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
export const describePlace = (p: Place | null | undefined): string =>
  p ? p.name + ((p.platforms || 0) > 1 ? ` (${t('platforms', { n: p.platforms! })})` : '') : '';
/** What a point on the map is called from what is found at it: a plain "point" when nothing is near, "near X" beyond
 *  40 m, else the name itself (the worker's `reverse`). */
export function reverseName(g: { kind: string; distance: number; name: string }): string {
  if (g.kind === 'point') return t('pointName');
  return g.distance > 40 ? t('nearName', { name: g.name }) : g.name;
}
