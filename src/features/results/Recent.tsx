// The history under the bar while there are no results, in three tabs (trips, lines, stops) that follow the bar's kind
// and switch on their own: in each what was saved, then what came lately. Trips have two histories, the searches (a tap
// plans the same trip from now) and the ways opened; for a line or a stop searching it and opening it are the same act,
// so one list: the lines opened, the stops and stations opened with the trains looked up between two stations.
import { Icon } from '../../ui/Icon';
import { placeName, named } from '../../state/names';
import { FromTo } from '../../ui/FromTo';
import { LineChip } from '../../ui/LineChip';
import type { LineMode } from '../../ui/LineChip';
import { t, lang } from '../../i18n';
import { dayLabel, calToday, calendarOf, secOf } from '../../time';
import { recentTrips, recentViews, favs } from '../../store.js';
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
      <span class="ic"><Icon name={v.mode === 'lrt' ? 'tram' : 'train'} /></span>
      <span class="txt"><span class="name"><FromTo from={v.from.name} to={v.to.name} /></span><small>{t(v.mode === 'lrt' ? 'directLrt' : 'directTrains')}</small></span>
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

type SavedTrip = { from: Recent['from']; to: Recent['to']; bike: string; folding?: boolean };
type SavedStop = { name: string; city?: string; code?: string; lat: number; lon: number };
const TABS = [{ k: 'trip', icon: 'route', label: 'kindTrip' }, { k: 'line', icon: 'bus', label: 'kindLine' }, { k: 'stop', icon: 'pin', label: 'kindStopSearch' }] as const;
const Sec = ({ title, saved = false }: { title: string; saved?: boolean }) => <h2 class="sec">{saved && <Icon name="star" class="secstar" />}{title}</h2>;

export function Recent() {
  void lang.value; void results.recentTick.value; void nav.key.value;   // the history grows while a panel is open
  const tab = results.recentTab.value, pair = search.kind.value === 'stop' && search.railPair.value;
  const views = recentViews.list() as View[];
  const savedTrips = Object.values(favs.get('trips') as Record<string, SavedTrip>);
  const savedLines = Object.values(favs.get('lines') as Record<string, View>);
  const savedStops = Object.values(favs.get('stops') as Record<string, SavedStop>);
  // what is saved is listed once, under Saved, not again among the recent
  const ends = (x: { from: { name: string }; to: { name: string } }) => `${x.from.name}|${x.to.name}`;
  const savedEnds = new Set(savedTrips.map(ends)), savedRefs = new Set(savedLines.map((v) => (v.type === 'line' ? v.ref : ''))), savedCodes = new Set(savedStops.map((x) => x.code || x.name));
  const searches = (recentTrips.list() as Recent[]).filter((r) => !savedEnds.has(ends(r))).slice(0, 5);
  const ways = views.filter((v) => v.type === 'trip').slice(0, 5);
  const lines = views.filter((v) => v.type === 'line' && !savedRefs.has(v.ref)).slice(0, 10);
  // the train timetable (two stations at the top) keeps to stations and the trains between them
  const stops = views.filter((v) => (pair ? v.type === 'trains' || v.type === 'station' : v.type === 'stop' || v.type === 'station' || v.type === 'trains'))
    .filter((v) => v.type !== 'stop' || !savedCodes.has(v.code || v.name)).slice(0, 10);
  const count = { trip: savedTrips.length + searches.length + ways.length, line: savedLines.length + lines.length, stop: savedStops.length + stops.length };
  const hidden = results.showing.value || !(count.trip + count.line + count.stop);
  const replan = (r: Recent | SavedTrip) => results.hooks.replan({ ...(r as Recent), from: named(r.from), to: named(r.to), at: (r as Recent).time || (r as Recent).at || '', day: (r as Recent).day || '', arriveBy: !!(r as Recent).arriveBy });
  return (
    <div id="recentBox" hidden={hidden}>
      <div class="rtabs" role="tablist">
        {TABS.map((x) => (
          <button type="button" role="tab" aria-selected={tab === x.k} class={`chipbtn${tab === x.k ? ' on' : ''}`} data-tab={x.k} onClick={() => { results.recentTab.value = x.k; }}>
            <Icon name={x.icon} />{t(x.label)}{count[x.k] > 0 && <small class="n">{count[x.k]}</small>}
          </button>
        ))}
      </div>
      {tab === 'trip' && <>
        {savedTrips.length > 0 && <Sec title={t('savedTitle')} saved />}
        {savedTrips.map((v) => (
          <div class="recent" onClick={() => replan(v)}>
            <span class="ic"><Icon name="star" /></span>
            <span class="txt"><span class="name"><FromTo from={placeName(v.from)} to={placeName(v.to)} /></span>
              <small>{v.bike && v.bike !== 'none' ? <><Icon name="bike" /> {t(v.bike === 'along' ? 'bikeAlong' : 'bikePark')}</> : t('bikeNone')}</small></span>
          </div>
        ))}
        {searches.length > 0 && <Sec title={t('recentTitle')} />}
        {searches.map((r) => (
          <div class="recent" onClick={() => replan(r)}>
            <span class="ic"><Icon name="history" /></span>
            <span class="txt">
              <span class="name"><FromTo from={placeName(r.from)} to={placeName(r.to)} /></span>
              <small>{whenText(r.day, r.time)}{r.bike && r.bike !== 'none' && <> · <Icon name="bike" /></>}{r.arriveBy ? ' · ' + t('arriveBy') : ''}</small>
            </span>
          </div>
        ))}
        {ways.length > 0 && <Sec title={t('openedWays')} />}
        {ways.map((v) => <ViewRow v={v} />)}
      </>}
      {tab === 'line' && <>
        {savedLines.length > 0 && <Sec title={t('savedTitle')} saved />}
        {savedLines.map((v) => <ViewRow v={v} />)}
        {lines.length > 0 && <Sec title={t('recentOnly')} />}
        {lines.map((v) => <ViewRow v={v} />)}
      </>}
      {tab === 'stop' && <>
        {savedStops.length > 0 && <Sec title={t('savedTitle')} saved />}
        {savedStops.map((s) => <ViewRow v={{ type: 'stop', code: s.code || '', name: s.name, city: s.city, lat: s.lat, lon: s.lon }} />)}
        {stops.length > 0 && <Sec title={t('recentOnly')} />}
        {stops.map((v) => <ViewRow v={v} />)}
      </>}
      {!count[tab] && <div class="empty">{t('recentNone')}</div>}
    </div>
  );
}
