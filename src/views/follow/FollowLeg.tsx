// One leg of the trip being followed (Follow), the detail's frame (detail/LegFrame) with what following needs: the
// departure alone down the side; a ride's from, to and stops with its vehicle's badge, the change into it from the ride
// before (to spare, tight, or missed), and its stops along, open by themselves on the current ride, each at its time
// as it stands now with the passed ones marked; a walk or bicycle ride in words.
import { LegFrame, StopsAlongFold, legTime } from '../detail/LegFrame';
import { t } from '../../common/i18n';
import { fmt } from '../../common/time';
import { FromTo } from '../../widgets/FromTo';
import { stopsText } from '../../text/travel';
import { isRide } from '../../trip/journey';
import type { Leg } from '../../trip/journey';
import { liveBadge } from '../../text/live';
import type { Connection as Change } from '../../state/follow';

type Props = {
  l: Leg;
  stage?: 'done' | 'current'; // behind the rider, or the step they are on
  change?: Change | null; // the change into this ride from the ride before
  stopsOpen?: boolean; // the stops open by themselves: the current ride, or the next one while walking or waiting
  passedUpTo?: number | null; // on board: the rider's own stop index, which outranks the vehicle's word
};

/** A change's standing from its margin: missed below zero, tight under two minutes, else fine. */
function changeClass(sec: number): 'missed' | 'tight' | 'ok' {
  if (sec < 0) return 'missed';
  return sec < 120 ? 'tight' : 'ok';
}
/** A change in words: the minutes to spare, or when the ride left against when the rider got there. */
function changeText(change: Change): string {
  if (change.sec < 0) return t('changeMissed', { dep: fmt(change.dep), arr: fmt(change.arr) });
  return t(change.sec < 120 ? 'changeTight' : 'changeOk', { n: Math.round(change.sec / 60) });
}

export function FollowLeg({ l, stage, change, stopsOpen, passedUpTo }: Props) {
  const times = legTime(l, l.depart);
  if (!isRide(l)) return <LegFrame l={l} cls={stage} times={times} />;
  const stopsAlong = l.stopsAlong || [],
    badge = liveBadge(l.live, l.depart, l.schedDepart ?? l.depart); // its vehicle at the boarding stop
  return (
    <LegFrame
      l={l}
      cls={stage}
      times={times}
      head={
        <>
          <FromTo from={l.from!.name} to={l.to!.name} /> · {stopsText(l.stops)}
          {badge && <span class={`live ${badge.cls}`}>{badge.short}</span>}
          {change && <small class={`change ${changeClass(change.sec)}`}>{changeText(change)}</small>}
        </>
      }
      folds={stopsAlong.length > 1 && <StopsAlongFold stops={stopsAlong} opens={stopsOpen} passedUpTo={passedUpTo} />}
    />
  );
}
