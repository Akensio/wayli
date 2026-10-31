// One leg in the journey detail (Detail): a ride with both its times (struck and live when the vehicle moved them), its
// headsign and live badge, from, to, stops and operator, its stops along as a fold, and the other rides doing the same
// leg as a fold (RideOptions); a walk or bicycle ride in words. A tap on a ride focuses it on the map, on its chip
// opens the line.
import { useState } from 'preact/hooks';
import type { ComponentChildren, ComponentProps } from 'preact';
import { LegFrame, StopsAlongFold, legTime } from './LegFrame';
import { RideOptions } from './RideOptions';
import { t } from '../../lib/i18n';
import { fmt } from '../../lib/time';
import { FromTo } from '../../widgets/FromTo';
import { Fold } from '../../widgets/Fold';
import { stopsText } from '../../journey/format';
import { agencyName } from '../../journey/agencies';
import { isRide } from '../../journey/types';
import type { Leg, RideLeg } from '../../journey/types';
import type { Badge } from '../../journey/format';

type Props = {
  l: Leg;
  focus?: boolean; // the leg focused on the map
  badge?: Badge | null; // a ride's vehicle, live
  onChip?: () => void; // a ride's chip opens the line
  onFocus?: () => void; // a tap on a ride focuses it on the map
  // every line that does this ride, from its stop to the one it is left at, with live times
  options?: Omit<ComponentProps<typeof RideOptions>, 'mine'>;
};

/** A ride's times down the side: boarding, and under it getting off, which says so ("to 21:48"), since the walk after
 *  starts at that same minute and shows it too (Gadi: two times with no cue read as two different things). The boarding
 *  time is the newest live look at the vehicle (`live`) when there is one, else the planned one; a live time a minute or
 *  more off the listed one stands under it struck. */
function rideTimes(l: RideLeg, live: number | null): ComponentChildren {
  const till = <small class="till">{t('till', { time: legTime(l, l.arrive) })}</small>;
  const dep = live ?? l.depart;
  if (l.schedDepart != null && Math.abs(l.schedDepart - dep) >= 60)
    return (
      <>
        <s>{fmt(l.schedDepart)}</s>
        <br />
        <b>{fmt(dep)}</b>
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

export function DetailLeg({ l, focus, badge, onChip, onFocus, options }: Props) {
  const [optsOpen, setOptsOpen] = useState(false);
  const cls = focus ? 'focus' : '';
  if (!isRide(l)) return <LegFrame l={l} cls={cls} times={legTime(l, l.depart)} />;
  const stopsAlong = l.stopsAlong || [];
  // one departure time: the newest live look at the vehicle (the badge) when there is one, else the planned one; the
  // badge then says only how late, so the planned and the live time never stand side by side (2026-10-22)
  const liveTime = badge && badge.time != null ? badge.time : null;
  let badgeText = '';
  if (badge) badgeText = liveTime != null && badge.delayText ? badge.delayText : badge.text;
  const stops = stopsAlong.length > 2;
  return (
    <LegFrame
      l={l}
      cls={cls}
      times={rideTimes(l, liveTime)}
      onClick={onFocus}
      onChip={onChip}
      head={
        <>
          {l.headsign}
          <span class={`live${badge ? ' ' + badge.cls : ''}`} data-live={String(l.trip ?? '')}>
            {badgeText}
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
