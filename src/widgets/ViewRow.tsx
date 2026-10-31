// Something opened before (a trip, a line, a stop, a station, the trains between two stations) as one row: what it was
// and where it led, the same in the history drawer, the saved page and the bar's list (one place for how a recent view
// reads; there were three).
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { FromTo } from './FromTo';
import { Tappable } from './Tappable';
import { t } from '../lib/i18n';
import { agencyName } from '../display/operators';
import { railWords } from '../display/travel';
import type { View } from '../state/store.ts';
import type { ComponentChildren } from 'preact';

/** What leads the row (its icon or its line's chip) and the two lines of text beside it. `trip` describes a trip view
 *  (its places and rides), which needs the page's names and chips: the history drawer gives it. */
export function viewParts(v: View, trip?: (v: Extract<View, { type: 'trip' }>) => ComponentChildren) {
  if (v.type === 'trip') return { lead: <Icon name="route" />, text: trip ? trip(v) : null };
  if (v.type === 'line')
    return {
      lead: <LineChip line={v.line} routeType={v.routeType} agency={v.agency} mode={v.mode as never} />,
      chip: true,
      text: (
        <>
          <span class="name">
            <bdi>{t('toward', { headsign: v.headsign })}</bdi>
          </span>
          <small>{agencyName(v.agency)}</small>
        </>
      ),
    };
  if (v.type === 'trains') {
    const w = railWords(v.mode);
    return {
      lead: <Icon name={w.icon} />,
      text: (
        <>
          <span class="name">
            <FromTo from={v.from.name} to={v.to.name} />
          </span>
          <small>{t(w.direct)}</small>
        </>
      ),
    };
  }
  return {
    lead: <Icon name={v.type === 'station' ? railWords(v.mode).icon : 'pin'} />,
    text: (
      <>
        <span class="name">
          <bdi>{v.name}</bdi>
        </span>
        {v.type === 'stop' && <small>{[v.city, v.code].filter(Boolean).join(' · ')}</small>}
      </>
    ),
  };
}

/** A recent view as a row of the history or the saved page. */
export function ViewRow({
  v,
  onOpen,
  trip,
}: {
  v: View;
  onOpen: (v: View) => void;
  trip?: (v: Extract<View, { type: 'trip' }>) => ComponentChildren;
}) {
  const p = viewParts(v, trip);
  return (
    <Tappable class="recent" onClick={() => onOpen(v)}>
      {p.chip ? p.lead : <span class="ic">{p.lead}</span>}
      <span class="txt">{p.text}</span>
    </Tappable>
  );
}
