// The history under the bar while there are no results, for what the bar searches: for a trip, the recent searches
// (a tap plans the same trip from now) and everything opened lately (trips, lines, stops, stations); for a line, the
// lines opened; for a stop, the stops and stations opened and the trains looked up between two stations.
import { Icon } from '../../ui/Icon';
import { placeName, named } from '../../state/names';
import { FromTo } from '../../ui/FromTo';
import { LineChip } from '../../ui/LineChip';
import type { LineMode } from '../../ui/LineChip';
import { t, lang } from '../../i18n';
import { dayLabel, calToday, calendarOf, secOf } from '../../time';
import { recentTrips, recentViews } from '../../store.js';
import * as results from '../../state/results';
import * as search from '../../state/search';
import * as nav from '../../state/nav';
import type { View } from '../../state/results';
import type { Query } from '../../journey/types';
import { LegChips } from './LegChips';
import { agencyName } from '../../journey/agencies';

/** A day and time as the rider reads them: the calendar day (a service day's night is the next day). */
const whenText = (day?: string, time?: string): string => {
  if (!time) return dayLabel(day || calToday());
  const c = calendarOf(day || calToday(), secOf(time));
  return `${dayLabel(c.cal)} ${c.time}`;
};
const clock = (day: string, sec: number): string => { const c = calendarOf(day, sec); return `${dayLabel(c.cal)} ${c.time}`; };

type Recent = Query & { time?: string };

function ViewRow({ v }: { v: View }) {
  const open = () => results.hooks.openView(v);
  if (v.type === 'trip') {
    const rides = v.j.legs.filter((l) => l.type === 'ride');
    return (
      <div class="recent" onClick={open}>
        <span class="ic"><Icon name="route" /></span>
        <span class="txt">
          <span class="name"><FromTo from={placeName(named(v.q.from))} to={placeName(named(v.q.to))} /></span>
          <small class="legs">{clock(v.q.day, v.j.depart)} · <LegChips legs={rides.length ? rides : v.j.legs} /></small>
        </span>
      </div>
    );
  }
  if (v.type === 'line') return (
    <div class="recent" onClick={open}>
      <LineChip line={v.line} routeType={v.routeType} agency={v.agency} mode={v.mode as LineMode | undefined} />
      <span class="txt"><span class="name"><bdi>{t('toward', { headsign: v.headsign })}</bdi></span><small>{agencyName(v.agency)}</small></span>
    </div>
  );
  if (v.type === 'trains') return (
    <div class="recent" onClick={open}>
      <span class="ic"><Icon name="train" /></span>
      <span class="txt"><span class="name"><FromTo from={v.from.name} to={v.to.name} /></span><small>{t('directTrains')}</small></span>
    </div>
  );
  return (
    <div class="recent" onClick={open}>
      <span class="ic"><Icon name={v.type === 'station' ? 'train' : 'pin'} /></span>
      <span class="txt"><span class="name"><bdi>{v.name}</bdi></span>
        {v.type === 'stop' && <small>{[v.city, v.code].filter(Boolean).join(' · ')}</small>}</span>
    </div>
  );
}

export function Recent() {
  void lang.value; void results.recentTick.value; void nav.key.value;   // the history grows while a panel is open
  const kind = search.kind.value, pair = search.railPair.value;
  const views = recentViews.list() as View[];
  // the trip search shows the searches and everything opened; the others, what they search for
  const searches = kind === 'trip' ? (recentTrips.list() as Recent[]).slice(0, 5) : [];
  const shown = kind === 'trip' ? views.slice(0, 8)
    : kind === 'line' ? views.filter((v) => v.type === 'line').slice(0, 10)
    : views.filter((v) => (pair ? v.type === 'trains' || v.type === 'station' : v.type === 'stop' || v.type === 'station' || v.type === 'trains')).slice(0, 10);
  const hidden = results.showing.value || (!searches.length && !shown.length);
  return (
    <div id="recentBox" hidden={hidden}>
      {searches.length > 0 && <h2 class="sec">{t('recentTitle')}</h2>}
      {searches.map((r) => (
        <div class="recent" onClick={() => results.hooks.replan({ ...r, from: named(r.from), to: named(r.to), at: r.time || r.at || '' })}>
          <span class="ic"><Icon name="history" /></span>
          <span class="txt">
            <span class="name"><FromTo from={placeName(r.from)} to={placeName(r.to)} /></span>
            <small>{whenText(r.day, r.time)}{r.bike && r.bike !== 'none' && <> · <Icon name="bike" /></>}{r.arriveBy ? ' · ' + t('arriveBy') : ''}</small>
          </span>
        </div>
      ))}
      {shown.length > 0 && <h2 class="sec">{kind === 'line' ? t('recentLines') : kind === 'stop' ? t('recentStops') : t('viewedTitle')}</h2>}
      {shown.map((v) => <ViewRow v={v} />)}
    </div>
  );
}
