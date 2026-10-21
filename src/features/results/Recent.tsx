// Recent trips, under the bar while there are no results: a tap plans the same trip from now.
import { Icon } from '../../ui/Icon';
import { placeName, named } from '../../state/names';
import { FromTo } from '../../ui/FromTo';
import { t, lang } from '../../i18n';
import { dayLabel, calToday, calendarOf, secOf } from '../../time';

/** A recent trip's day and time as the rider reads them: the calendar day (a service day's night is the next day). */
const whenText = (day?: string, time?: string): string => {
  if (!time) return dayLabel(day || calToday());
  const c = calendarOf(day || calToday(), secOf(time));
  return `${dayLabel(c.cal)} ${c.time}`;
};
import { recentTrips } from '../../store.js';
import * as results from '../../state/results';
import type { Query } from '../../journey/types';

type Recent = Query & { time?: string };

export function Recent() {
  void lang.value; void results.recentTick.value;
  const l = recentTrips.list() as Recent[];
  const hidden = results.showing.value || !l.length;
  return (
    <div id="recentBox" hidden={hidden}>
      {l.length > 0 && <h2 class="sec">{t('recentTitle')}</h2>}
      {l.map((r) => (
        <div class="recent" onClick={() => results.hooks.replan({ ...r, from: named(r.from), to: named(r.to), at: r.time || r.at || '' })}>
          <span class="ic"><Icon name="history" /></span>
          <span class="txt">
            <span class="name"><FromTo from={placeName(r.from)} to={placeName(r.to)} /></span>
            <small>{whenText(r.day, r.time)}{r.bike && r.bike !== 'none' && <> · <Icon name="bike" /></>}{r.arriveBy ? ' · ' + t('arriveBy') : ''}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
