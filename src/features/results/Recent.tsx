// Recent trips, under the bar while there are no results: a tap plans the same trip from now.
import { Icon } from '../../ui/Icon';
import { FromTo } from '../../ui/FromTo';
import { t, lang } from '../../i18n';
import { dayLabel, calToday } from '../../time';
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
        <div class="recent" onClick={() => results.hooks.replan({ ...r, at: r.time || r.at || '' })}>
          <span class="ic"><Icon name="history" /></span>
          <span class="txt">
            <span class="name"><FromTo from={r.from.name} to={r.to.name} /></span>
            <small>{dayLabel(r.day || calToday())} {r.time || ''}{r.bike && r.bike !== 'none' && <> · <Icon name="bike" /></>}{r.arriveBy ? ' · ' + t('arriveBy') : ''}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
