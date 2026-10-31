// The history under the bar while there are no results, in three tabs (trips, lines, stops) that follow the bar's kind
// and switch on their own, each with a second level: trips are the ways opened, the searches (a tap plans the same trip
// from now) and the saved; for a line or a stop searching it and opening it are the same act, so the recent (the lines
// opened; the stops and stations opened with the trains looked up between two stations) and the saved. Each level opens
// on the first list with something in it, the rider's choice kept for the session.
import { signal } from '@preact/signals';
import { Icon } from '../../widgets/Icon';
import { placeName, named } from '../../state/names';
import { FromTo } from '../../widgets/FromTo';
import { t, lang } from '../../lib/i18n';
import { bikeText } from '../../display/travel';
import { dayLabel, calToday, calendarOf, secOf } from '../../lib/time';
import { recentTrips, recentViews, favs, recentKeep, stored, tripKey, type RecentTrip } from '../../state/store.ts';
import * as results from '../../state/results';
import * as search from '../../state/search';
import * as nav from '../../state/nav';
import type { View } from '../../state/results';
import type { SavedTrip } from '../../state/store.ts';
import { LegChips } from './LegChips';
import { ViewRow } from '../../widgets/ViewRow';
import { openView, replan } from '../../controllers/planner';
import { Tappable } from '../../widgets/Tappable';

/** A day and time as the rider reads them: the calendar day (a service day's night is the next day). */
const clock = (day: string, sec: number): string => {
  const c = calendarOf(day, sec);
  return `${dayLabel(c.cal)} ${c.time}`;
};
/** A search's day and time, or its day alone when it was for now. */
const whenText = (day?: string, time?: string): string =>
  time ? clock(day || calToday(), secOf(time)) : dayLabel(day || calToday());

/** A trip opened before, as the history says it: its places, when, its rides. */
const tripText = (v: Extract<View, { type: 'trip' }>) => {
  const rides = v.j.legs.filter((l) => l.type === 'ride');
  return (
    <>
      <span class="name">
        <FromTo from={placeName(named(v.q.from))} to={placeName(named(v.q.to))} />
      </span>
      <small class="legs">
        {clock(v.q.day, v.j.depart)} · <LegChips legs={rides.length ? rides : v.j.legs} />
      </small>
    </>
  );
};
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
  const views = recentViews.list();
  const savedTrips = Object.values(favs.get('trips'));
  const savedLines = Object.values(favs.get('lines'));
  const savedStops = Object.values(favs.get('stops'));
  const keep = recentKeep();
  const searches = recentTrips.list().slice(0, keep);
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
  // a recent search as it was asked (its day and time); a saved trip from now
  const planAgain = (r: RecentTrip | SavedTrip) =>
    replan({
      from: named(r.from),
      to: named(r.to),
      bike: r.bike,
      folding: !!r.folding,
      at: ('time' in r && r.time) || '',
      day: ('day' in r && r.day) || '',
      arriveBy: 'arriveBy' in r && !!r.arriveBy,
    });
  const list = `${tab}:${cur}`;
  return (
    <div id="recentBox" hidden={hidden}>
      <div class="rtabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.k}
            type="button"
            role="tab"
            aria-selected={tab === x.k}
            class={`chipbtn${tab === x.k ? ' on' : ''}`}

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
            key={x.k}
            type="button"
            role="tab"
            aria-selected={cur === x.k}
            class={cur === x.k ? 'on' : ''}

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
          <Tappable key={tripKey(v)} class="recent" onClick={() => planAgain(v)}>
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
          </Tappable>
        ))}
      {list === 'trip:searched' &&
        searches.map((r) => (
          <Tappable key={`${tripKey(r)}|${r.at}`} class="recent" onClick={() => planAgain(r)}>
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
          </Tappable>
        ))}
      {list === 'trip:opened' &&
        ways.map((v, i) => <ViewRow key={`${v.at ?? ''}:${i}`} v={v} onOpen={openView} trip={tripText} />)}
      {list === 'line:saved' &&
        savedLines.map((v, i) => <ViewRow key={`${v.at ?? ''}:${i}`} v={v} onOpen={openView} trip={tripText} />)}
      {list === 'line:recent' &&
        lines.map((v, i) => <ViewRow key={`${v.at ?? ''}:${i}`} v={v} onOpen={openView} trip={tripText} />)}
      {list === 'stop:saved' &&
        savedStops.map((s) => (
          <ViewRow
            key={s.stop}
            v={{ type: 'stop', code: s.code || '', name: s.name, city: s.city, lat: s.lat, lon: s.lon }}
            onOpen={openView}
          />
        ))}
      {list === 'stop:recent' &&
        stops.map((v, i) => <ViewRow key={`${v.at ?? ''}:${i}`} v={v} onOpen={openView} trip={tripText} />)}
      {!n[tab][cur] && <div class="empty">{t(curSub.empty)}</div>}
    </div>
  );
}
