// How a trip is made, in words: a line's name, how many stops and changes, the bicycle choice, and what trains or the
// light rail are called between two stations.
import { t } from '../lib/i18n';

export const lineText = (line?: string | null): string => (line === 'train' ? t('train') : line || '');
export const stopsText = (n: number): string => (n === 1 ? t('stops1') : t('stopsN', { n }));
export function transfersText(n: number): string {
  if (n === 0) return t('direct');
  if (n === 1) return t('transfer1');
  return t('transfers', { n });
}
/** The bicycle choice: none, to the stop, or taken along. */
export function bikeText(b?: string | null): string {
  if (b === 'along') return t('bikeAlong');
  if (b === 'park') return t('bikePark');
  return t('bikeNone');
}
/** What a timetable of two stations calls its trains, by what runs: the icon, the vehicle's name, and the lines that
 *  say there are direct ones, none, none between the two, or none more today. One table for every place that says it
 *  (the stop's page, the trains between two stations, the history, the bar's summary). */
export const RAIL_WORDS = {
  rail: {
    icon: 'train',
    name: 'train',
    direct: 'directTrains',
    none: 'noTrains',
    noDirect: 'noDirectTrains',
    noMore: 'noMoreTrains',
  },
  lrt: { icon: 'tram', name: 'lrt', direct: 'directLrt', none: 'noLrt', noDirect: 'noDirectLrt', noMore: 'noMoreLrt' },
} as const;
/** The words for trains or the light rail; anything but 'lrt' is a train. */
export const railWords = (mode: string | null | undefined) => RAIL_WORDS[mode === 'lrt' ? 'lrt' : 'rail'];
