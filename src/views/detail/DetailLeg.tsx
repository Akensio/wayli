// One leg in the journey detail (Detail), as it stands now: a ride with both its times (the listed one struck when the vehicle moved it), its
// headsign and live badge, from, to, stops and operator, its stops along as a fold, and the other rides doing the same
// leg as a fold (RideOptions); a walk or bicycle ride in words. A tap on a ride focuses it on the map, on its chip
// opens the line.
import { useState } from 'preact/hooks';
import type { ComponentChildren, ComponentProps } from 'preact';
import { LegFrame, StopsAlongFold, legTime } from './LegFrame';
import { RideOptions } from './RideOptions';
import { t } from '../../common/i18n';
import { fmt } from '../../common/time';
import { FromTo } from '../../widgets/FromTo';
import { Fold } from '../../widgets/Fold';
import { stopsText } from '../../text/travel';
import { agencyName } from '../../text/operators';
import { isRide } from '../../trip/journey';
import type { Leg, RideLeg } from '../../trip/journey';
import { liveBadge } from '../../text/live';

type Props = {
  l: Leg;
  focus?: boolean; // the leg focused on the map
  onChip?: () => void; // a ride's chip opens the line
  onFocus?: () => void; // a tap on a ride focuses it on the map
  // every line that does this ride, from its stop to the one it is left at, with live times
  options?: Omit<ComponentProps<typeof RideOptions>, 'mine'>;
};

/** A ride's times down the side: boarding, and under it getting off, which says so ("to 21:48"), since the walk after
 *  starts at that same minute and shows it too (maintainer: two times with no cue read as two different things). The
 *  times are the ones that stand now; a boarding time a minute or more off the listed one has that one struck above it. */
function rideTimes(l: RideLeg): ComponentChildren {
  const till = <small class="till">{t('till', { time: legTime(l, l.arrive) })}</small>;
  if (l.schedDepart != null && Math.abs(l.schedDepart - l.depart) >= 60)
    return (
      <>
        <s>{fmt(l.schedDepart)}</s>
        <br />
        <b>{fmt(l.depart)}</b>
        <br />
        {till}
      </>
    );
  return (
    <>
      {legTime(l, l.depart)}
      <br />
      {till}
    </>
  );
}

export function DetailLeg({ l, focus, onChip, onFocus, options }: Props) {
  const [optsOpen, setOptsOpen] = useState(false);
  const cls = focus ? 'focus' : '';
  if (!isRide(l)) return <LegFrame l={l} cls={cls} times={legTime(l, l.depart)} />;
  const stopsAlong = l.stopsAlong || [];
  // the time stands beside it, so the badge says only how late: the two never stand side by side (2026-10-22)
  const badge = liveBadge(l.live, l.depart, l.schedDepart ?? l.depart);
  const stops = stopsAlong.length > 2;
  return (
    <LegFrame
      l={l}
      cls={cls}
      times={rideTimes(l)}
      onClick={onFocus}
      onChip={onChip}
      head={
        <>
          {l.headsign}
          <span class={`live${badge ? ' ' + badge.cls : ''}`} data-live={String(l.trip ?? '')}>
            {badge ? badge.short : ''}
          </span>
          <small>
            <FromTo from={l.from!.name} to={l.to!.name} /> · {stopsText(l.stops)} ·{' '}
            <bdi>{agencyName(l.agency || '')}</bdi>
            {l.estimated ? <span class="est"> · {t('estShort')}</span> : null}
          </small>
        </>
      }
      folds={
        (stops || options) && (
          <>
            {stops && <StopsAlongFold stops={stopsAlong} />}
            {options && (
              <Fold open={optsOpen} onClick={() => setOptsOpen(!optsOpen)}>
                {optsOpen ? t('hideTimes') : t('rideOptions', { name: l.from!.name })}
              </Fold>
            )}
          </>
        )
      }
      // the other rides doing this leg: a row of their own under the leg, the whole width of the list, not the text
      // column (there a narrow phone or large system text had nothing to give and the list scrolled sideways, 2026-10-28)
      wide={options && optsOpen && <RideOptions mine={l.trip ?? null} {...options} />}
    />
  );
}
