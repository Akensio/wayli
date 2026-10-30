// The history under the bar while there are no results, in three tabs (trips, lines, stops) that follow the bar's kind
// and switch on their own, each with a second level: trips are the ways opened, the searches (a tap plans the same trip
// from now) and the saved; for a line or a stop searching it and opening it are the same act, so the recent (the lines
// opened; the stops and stations opened with the trains looked up between two stations) and the saved. Each level opens
// on the first list with something in it, the rider's choice kept for the session.
import { signal } from '@preact/signals';
import { Icon } from '../../widgets/Icon';
import { placeName, named } from '../../state/names';
import { FromTo } from '../../widgets/FromTo';
import { LineChip } from '../../widgets/LineChip';
import type { LineMode } from '../../widgets/LineChip';
import { t, lang } from '../../lib/i18n';
import { bikeText } from '../../journey/format';
import { dayLabel, calToday, calendarOf, secOf } from '../../lib/time';
import { recentTrips, recentViews, favs, recentKeep, stored } from '../../lib/store.js';
import * as results from '../../state/results';
import * as search from '../../state/search';
import * as nav from '../../state/nav';
import type { View } from '../../state/results';
import type { Query, SavedTrip } from '../../journey/types';
import { LegChips } from './LegChips';
import { agencyName } from '../../journey/agencies';

/** A day and time as the rider reads them: the calendar day (a service day's night is the next day). */
const clock = (day: string, sec: number): string => {
  const c = calendarOf(day, sec);
  return `${dayLabel(c.cal)} ${c.time}`;
};
/** A search's day and time, or its day alone when it was for now. */
const whenText = (day?: string, time?: string): string =>
  time ? clock(day || calToday(), secOf(time)) : dayLabel(day || calToday());

type Recent = Query & { time?: string };

function ViewRow({ v }: { v: View }) {
  const open = () => results.hooks.openView(v);
  if (v.type === 'trip') {
    const rides = v.j.legs.filter((l) => l.type === 'ride');
    return (
      <div class="recent" onClick={open}>
        <span class="ic">
          <Icon name="route" />
        </span>
        <span class="txt">
          <span class="name">
            <FromTo from={placeName(named(v.q.from))} to={placeName(named(v.q.to))} />
          </span>
          <small class="legs">
            {clock(v.q.day, v.j.depart)} · <LegChips legs={rides.length ? rides : v.j.legs} />
          </small>
        </span>
      </div>
    );
  }
  if (v.type === 'line')
    return (
      <div class="recent" onClick={open}>
        <LineChip line={v.line} routeType={v.routeType} agency={v.agency} mode={v.mode as LineMode | undefined} />
        <span class="txt">
          <span class="name">
            <bdi>{t('toward', { headsign: v.headsign })}</bdi>
          </span>
          <small>{agencyName(v.agency)}</small>
        </span>
      </div>
    );
  if (v.type === 'trains')
    return (
      <div class="recent" onClick={open}>
        <span class="ic">
          <Icon name={v.mode === 'lrt' ? 'tram' : 'train'} />
        </span>
        <span class="txt">
          <span class="name">
            <FromTo from={v.from.name} to={v.to.name} />
          </span>
          <small>{t(v.mode === 'lrt' ? 'directLrt' : 'directTrains')}</small>
        </span>
      </div>
    );
  return (
    <div class="recent" onClick={open}>
      <span class="ic">
        <Icon name={v.type === 'station' ? 'train' : 'pin'} />
      </span>
      <span class="txt">
        <span class="name">
          <bdi>{v.name}</bdi>
        </span>
        {v.type === 'stop' && <small>{[v.city, v.code].filter(Boolean).join(' · ')}</small>}
      </span>
    </div>
  );
}

type SavedStop = { name: string; city?: string; code?: string; lat: number; lon: number };
type Tab = 'trip' | 'line' | 'stop';
const TABS = [
  { k: 'trip', icon: 'route', label: 'kindTrip' },
  { k: 'line', icon: 'bus', label: 'kindLine' },
  { k: 'stop', icon: 'pin', label: 'kindStopSearch' },
] as const;
// the second level: what was opened comes first, as it is what is usually wanted again
const SUBS: Record<Tab, { k: string; label: string; empty: string }[]> = {
  trip: [
    { k: 'opened', label: 'subOpened', empty: 'recentNone' },
    { k: 'searched', label: 'subSearched', empty: 'recentNone' },
    { k: 'saved', label: 'savedTitle', empty: 'favEmptyTrips' },
  ],
  line: [
    { k: 'recent', label: 'recentOnly', empty: 'recentNone' },
    { k: 'saved', label: 'savedTitle', empty: 'favEmptyLines' },
  ],
  stop: [
    { k: 'recent', label: 'recentOnly', empty: 'recentNone' },
    { k: 'saved', label: 'savedTitle', empty: 'favEmptyStops' },
  ],
};
const sub = signal<Partial<Record<Tab, string>>>({}); // the rider's choice per tab, for the session

export function Recent() {
  void lang.value;
  void stored.value;
  void nav.key.value; // the history grows while a panel is open
  const tab = results.recentTab.value,
    pair = search.kind.value === 'stop' && search.railPair.value;
  const views = recentViews.list() as View[];
  const savedTrips = Object.values(favs.get('trips') as Record<string, SavedTrip>);
  const savedLines = Object.values(favs.get('lines') as Record<string, View>);
  const savedStops = Object.values(favs.get('stops') as Record<string, SavedStop>);
  const keep = recentKeep();
  const searches = (recentTrips.list() as Recent[]).slice(0, keep);
  const ways = views.filter((v) => v.type === 'trip').slice(0, keep);
  const lines = views.filter((v) => v.type === 'line').slice(0, keep);
  // the train timetable (two stations at the top) keeps to stations and the trains between them
  const stops = views
    .filter((v) =>
      pair
        ? v.type === 'trains' || v.type === 'station'
        : v.type === 'stop' || v.type === 'station' || v.type === 'trains',
    )
    .slice(0, keep);
  const n: Record<Tab, Record<string, number>> = {
    trip: { opened: ways.length, searched: searches.length, saved: savedTrips.length },
    line: { recent: lines.length, saved: savedLines.length },
    stop: { recent: stops.length, saved: savedStops.length },
  };
  const total = (k: Tab) => Object.values(n[k]).reduce((a, b) => a + b, 0);
  const hidden = results.showing.value || !(total('trip') + total('line') + total('stop'));
  // the sub-tab chosen, else the first with something in it
  const cur = sub.value[tab] ?? (SUBS[tab].find((x) => n[tab][x.k] > 0) ?? SUBS[tab][0]).k;
  const curSub = SUBS[tab].find((x) => x.k === cur)!;
  const replan = (r: Recent | SavedTrip) =>
    results.hooks.replan({
      ...(r as Recent),
      from: named(r.from),
      to: named(r.to),
      at: (r as Recent).time || (r as Recent).at || '',
      day: (r as Recent).day || '',
      arriveBy: !!(r as Recent).arriveBy,
    });
  const list = `${tab}:${cur}`;
  return (
    <div id="recentBox" hidden={hidden}>
      <div class="rtabs" role="tablist">
        {TABS.map((x) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === x.k}
            class={`chipbtn${tab === x.k ? ' on' : ''}`}
            data-tab={x.k}
            onClick={() => {
              results.recentTab.value = x.k;
            }}
          >
            <Icon name={x.icon} />
            {t(x.label)}
            {total(x.k) > 0 && <small class="n">{total(x.k)}</small>}
          </button>
        ))}
      </div>
      <div class="rsubs" role="tablist">
        {SUBS[tab].map((x) => (
          <button
            type="button"
            role="tab"
            aria-selected={cur === x.k}
            class={cur === x.k ? 'on' : ''}
            data-sub={x.k}
            onClick={() => {
              sub.value = { ...sub.value, [tab]: x.k };
            }}
          >
            {x.k === 'saved' && <Icon name="star" class="secstar" />}
            {t(x.label)}
            {n[tab][x.k] > 0 && <small class="n">{n[tab][x.k]}</small>}
          </button>
        ))}
      </div>
      {list === 'trip:saved' &&
        savedTrips.map((v) => (
          <div class="recent" onClick={() => replan(v)}>
            <span class="ic">
              <Icon name="star" />
            </span>
            <span class="txt">
              <span class="name">
                <FromTo from={placeName(v.from)} to={placeName(v.to)} />
              </span>
              <small>
                {v.bike && v.bike !== 'none' && (
                  <>
                    <Icon name="bike" />{' '}
                  </>
                )}
                {bikeText(v.bike)}
              </small>
            </span>
          </div>
        ))}
      {list === 'trip:searched' &&
        searches.map((r) => (
          <div class="recent" onClick={() => replan(r)}>
            <span class="ic">
              <Icon name="history" />
            </span>
            <span class="txt">
              <span class="name">
                <FromTo from={placeName(r.from)} to={placeName(r.to)} />
              </span>
              <small>
                {whenText(r.day, r.time)}
                {r.bike && r.bike !== 'none' && (
                  <>
                    {' '}
                    · <Icon name="bike" />
                  </>
                )}
                {r.arriveBy ? ' · ' + t('arriveBy') : ''}
              </small>
            </span>
          </div>
        ))}
      {list === 'trip:opened' && ways.map((v) => <ViewRow v={v} />)}
      {list === 'line:saved' && savedLines.map((v) => <ViewRow v={v} />)}
      {list === 'line:recent' && lines.map((v) => <ViewRow v={v} />)}
      {list === 'stop:saved' &&
        savedStops.map((s) => (
          <ViewRow v={{ type: 'stop', code: s.code || '', name: s.name, city: s.city, lat: s.lat, lon: s.lon }} />
        ))}
      {list === 'stop:recent' && stops.map((v) => <ViewRow v={v} />)}
      {!n[tab][cur] && <div class="empty">{t(curSub.empty)}</div>}
    </div>
  );
}
