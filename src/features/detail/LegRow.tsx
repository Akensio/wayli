// One leg of a journey as a row: the times down the side, a dot in the line's colour, and what to do:
// ride a line toward its headsign (from, to, stops, operator), or walk or ride the bicycle somewhere.
import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { fmt } from '../../time';
import { FromTo } from '../../ui/FromTo';
import { routeColor, chipColors } from '../../journey/colors';
import { lineText, stopsText } from '../../journey/format';
import { agencyName } from '../../journey/agencies';
import type { Leg } from '../../journey/types';
import type { Badge } from '../../journey/format';

type StopAlong = { arr: number; name: string };
type Props = {
  l: Leg;
  mode: 'detail' | 'follow';   // the detail shows both times, a live badge, the stops along; the follow shows the departure
  cls?: string;                // done, current, focus
  badge?: Badge | null;
  onChip?: () => void;         // the line chip opens the line
  onClick?: () => void;        // a ride focuses on the map
};

const walkText = (l: Leg, mins: number) => {
  if (l.type === 'egress') return l.mode === 'bike' ? t('bikeFrom', { min: mins, name: l.from!.name }) : t('walkFrom', { min: mins, name: l.from!.name });
  return l.mode === 'bike' ? t('bikeTo', { min: mins, name: l.to!.name }) : t('walkTo', { min: mins, name: l.to!.name });
};

export function LegRow({ l, mode, cls = '', badge, onChip, onClick }: Props) {
  const [stopsOpen, setStopsOpen] = useState(false);
  const ride = l.type === 'ride';
  const mins = Math.max(1, Math.round(l.seconds / 60));
  const stopsAlong = (l.stopsAlong as StopAlong[] | undefined) || [];
  // one departure time: the newest live look at the vehicle (the badge) when there is one, else the planned one; the
  // badge then says only how late, so the planned and the live time never stand side by side (2026-10-22)
  const liveTime = mode === 'detail' && ride && badge && badge.time != null ? badge.time : null;
  const dep = liveTime ?? l.depart!;
  const shifted = mode === 'detail' && ride && l.schedDepart != null && Math.abs((l.schedDepart as number) - dep) >= 60;
  const est = ride && l.estimated, tf = (sec: number) => (est ? '~' : '') + fmt(sec);   // an estimated time says so
  const times = mode === 'follow' ? tf(l.depart!)
    : shifted ? <><s>{fmt(l.schedDepart as number)}</s><br /><b>{fmt(dep)}</b><br />{fmt(l.arrive!)}</>
    : <>{tf(l.depart!)}{ride && <><br />{tf(l.arrive!)}</>}</>;
  return (
    <div class={`leg ${l.type}${ride ? ' t' + l.routeType : ''}${cls ? ' ' + cls : ''}`}
      onClick={onClick && ride ? (e) => { if ((e.target as HTMLElement).closest('.toggle, .stoplist')) return; onClick(); } : undefined}>
      <span class="t">{times}</span>
      <span class="dot" style={ride ? { background: routeColor(l.routeType, l.agency) } : undefined} />
      <span class="what">
        {ride ? <>
          <span class={`chip${onChip && l.route != null && l.route !== '' ? ' btn' : ''} t${l.routeType}`} style={chipColors(l.routeType, l.agency)} onClick={onChip && l.route != null && l.route !== '' ? (e) => { e.stopPropagation(); onChip(); } : undefined}>{lineText(l.line)}</span>
          {mode === 'detail' ? <> {l.headsign}<span class={`live${badge ? ' ' + badge.cls : ''}`} data-live={String(l.trip ?? '')}>{badge ? (liveTime != null && badge.delayText ? badge.delayText : badge.text) : ''}</span><small><FromTo from={l.from!.name} to={l.to!.name} /> · {stopsText(l.stops as number)} · <bdi>{agencyName(l.agency || '')}</bdi>{est ? <span class="est"> · {t('estShort')}</span> : null}</small></>
            : <> <FromTo from={l.from!.name} to={l.to!.name} /> · {stopsText(l.stops as number)}</>}
          {mode === 'detail' && stopsAlong.length > 2 && <>
            <button type="button" class="toggle" onClick={() => setStopsOpen(!stopsOpen)}>{stopsOpen ? t('hideStops') : t('showStops')}</button>
            <div class="stoplist" hidden={!stopsOpen}>{stopsAlong.map((s) => <div><span>{fmt(s.arr)}</span><span>{s.name}</span></div>)}</div>
          </>}
        </> : walkText(l, mins)}
      </span>
    </div>
  );
}
