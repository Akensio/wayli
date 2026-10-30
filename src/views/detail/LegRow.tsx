// One leg of a journey as a row: the times down the side, a dot in the line's colour, and what to do:
// ride a line toward its headsign (from, to, stops, operator), or walk or ride the bicycle somewhere.
import { useEffect, useState } from 'preact/hooks';
import { RideOptions } from './RideOptions';
import type { TrainRow, LiveTrain } from '../../state/station';
import { t } from '../../lib/i18n';
import { fmt } from '../../lib/time';
import { FromTo } from '../../widgets/FromTo';
import { routeColor } from '../../journey/colors';
import { stopsText, legMinutes } from '../../journey/format';
import { agencyName } from '../../journey/agencies';
import type { Leg } from '../../journey/types';
import type { Badge } from '../../journey/format';
import { LineChip } from '../../widgets/LineChip';
import { Fold } from '../../widgets/Fold';

type StopAlong = { arr: number; name: string };
type Props = {
  l: Leg;
  mode: 'detail' | 'follow';   // the detail shows both times, a live badge, the stops along; the follow shows the departure
  cls?: string;                // done, current, focus
  badge?: Badge | null;
  onChip?: () => void;         // the line chip opens the line
  onClick?: () => void;        // a ride focuses on the map
  // the detail: every line that does this ride, from its stop to the one it is left at, with live times
  options?: { load: () => Promise<TrainRow[]>; liveFor: (rows: TrainRow[]) => Promise<Record<string, LiveTrain>>; day: string; now: number | null; onOpen: (trip: number, stop: number) => void };
  // following: the stops open by themselves (the current ride), each at its shown time with the passed ones marked (the
  // vehicle's word, or the rider's own stop index on board), and the change into this ride from the ride before
  defaultStopsOpen?: boolean; stopLive?: { time: number; passed: boolean }[] | null; passedUpTo?: number | null;
  change?: { sec: number; arr: number; dep: number } | null;
};

const walkText = (l: Leg, mins: number) => {
  if (l.type === 'egress') return l.mode === 'bike' ? t('bikeFrom', { min: mins, name: l.from!.name }) : t('walkFrom', { min: mins, name: l.from!.name });
  return l.mode === 'bike' ? t('bikeTo', { min: mins, name: l.to!.name }) : t('walkTo', { min: mins, name: l.to!.name });
};

export function LegRow({ l, mode, cls = '', badge, onChip, onClick, options, defaultStopsOpen, stopLive, passedUpTo, change }: Props) {
  const [stopsOpen, setStopsOpen] = useState(!!defaultStopsOpen), [optsOpen, setOptsOpen] = useState(false);
  useEffect(() => { if (defaultStopsOpen) setStopsOpen(true); }, [defaultStopsOpen]);   // opens when the ride becomes the current one
  const ride = l.type === 'ride';
  const mins = legMinutes(l.seconds);
  const stopsAlong = (l.stopsAlong as StopAlong[] | undefined) || [];
  // one departure time: the newest live look at the vehicle (the badge) when there is one, else the planned one; the
  // badge then says only how late, so the planned and the live time never stand side by side (2026-10-22)
  const liveTime = mode === 'detail' && ride && badge && badge.time != null ? badge.time : null;
  const dep = liveTime ?? l.depart!;
  const shifted = mode === 'detail' && ride && l.schedDepart != null && Math.abs((l.schedDepart as number) - dep) >= 60;
  const est = ride && l.estimated, tf = (sec: number) => (est ? '~' : '') + fmt(sec);   // an estimated time says so
  // a ride's two times: boarding, and under it getting off, which says so ("to 21:48"), since the walk after starts at
  // that same minute and shows it too (Gadi: two times with no cue read as two different things)
  const till = (sec: number) => <small class="till">{t('till', { time: tf(sec) })}</small>;
  const times = mode === 'follow' ? tf(l.depart!)
    : shifted ? <><s>{fmt(l.schedDepart as number)}</s><br /><b>{fmt(dep)}</b><br />{till(l.arrive!)}</>
    : <>{tf(l.depart!)}{ride && <><br />{till(l.arrive!)}</>}</>;
  return (
    <div class={`leg ${l.type}${ride ? ' t' + l.routeType : ''}${cls ? ' ' + cls : ''}`}
      onClick={onClick && ride ? (e) => { if ((e.target as HTMLElement).closest('.fold, .stoplist, .wide')) return; onClick(); } : undefined}>
      <span class="t">{times}</span>
      <span class="dot" style={ride ? { background: routeColor(l.routeType, l.agency) } : undefined} />
      <span class="what">
        {ride ? <>
          <LineChip line={l.line} routeType={l.routeType} agency={l.agency} onClick={onChip && l.route != null && l.route !== '' ? (e) => { e.stopPropagation(); onChip(); } : undefined} />
          {mode === 'detail' ? <> {l.headsign}<span class={`live${badge ? ' ' + badge.cls : ''}`} data-live={String(l.trip ?? '')}>{badge ? (liveTime != null && badge.delayText ? badge.delayText : badge.text) : ''}</span><small><FromTo from={l.from!.name} to={l.to!.name} /> · {stopsText(l.stops as number)} · <bdi>{agencyName(l.agency || '')}</bdi>{est ? <span class="est"> · {t('estShort')}</span> : null}</small></>
            : <> <FromTo from={l.from!.name} to={l.to!.name} /> · {stopsText(l.stops as number)}{badge && <span class={`live ${badge.cls}`}>{badge.text}</span>}</>}
          {mode === 'follow' && change && <small class={`change ${change.sec < 0 ? 'missed' : change.sec < 120 ? 'tight' : 'ok'}`}>{change.sec < 0 ? t('changeMissed', { dep: fmt(change.dep), arr: fmt(change.arr) }) : t(change.sec < 120 ? 'changeTight' : 'changeOk', { n: Math.round(change.sec / 60) })}</small>}
          {(mode === 'detail' ? stopsAlong.length > 2 : stopsAlong.length > 1) && <>
            <Fold open={stopsOpen} onClick={() => setStopsOpen(!stopsOpen)}>{stopsOpen ? t('hideStops') : t('showStops')}</Fold>
            <div class="stoplist" hidden={!stopsOpen}>{stopsAlong.map((s, k) => {
              const lv = stopLive ? stopLive[k] : null, time = lv ? lv.time : s.arr;
              const passed = passedUpTo != null ? k <= passedUpTo : !!(lv && lv.passed), next = passedUpTo != null && k === passedUpTo + 1, last = k === stopsAlong.length - 1;
              return <div class={`${passed ? 'passed' : ''}${next ? ' next' : ''}${last ? ' last' : ''}`}><span>{lv && Math.abs(time - s.arr) >= 60 ? <><s>{fmt(s.arr)}</s> {fmt(time)}</> : fmt(time)}</span><span>{s.name}{next && <small class="tag"> {t('nextTag')}</small>}</span></div>;
            })}</div>
          </>}
          {mode === 'detail' && options && <Fold open={optsOpen} onClick={() => setOptsOpen(!optsOpen)}>{optsOpen ? t('hideTimes') : t('rideOptions', { name: l.from!.name })}</Fold>}
        </> : walkText(l, mins)}
      </span>
      {/* the other rides doing this leg: a row of their own under the leg, the whole width of the list, not the text column
          (there a narrow phone or large system text had nothing to give and the list scrolled sideways, 2026-10-28) */}
      {ride && mode === 'detail' && options && optsOpen && <div class="wide"><RideOptions mine={l.trip ?? null} {...options} /></div>}
    </div>
  );
}
