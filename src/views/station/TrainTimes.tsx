// The direct trains between two stations: when each leaves and arrives (live when known), how long it takes, where
// it heads (the way back: the swap between the two boxes at the top). A tap opens the train's stops.
import { Icon } from '../../widgets/Icon';
import { t, lang } from '../../lib/i18n';

import * as st from '../../state/station';
import { dur, liveClass } from '../../journey/format';
import { now } from '../../state/clock';
import { LineChip } from '../../widgets/LineChip';
import { ShownTime } from '../../widgets/ShownTime';
import { InCell } from '../../widgets/LiveMark';

export function TrainTimes() {
  void lang.value;
  void now.value;
  const p = st.pair.value;
  if (!p) return null;
  const rows = st.trains.value,
    day = st.day.value;
  return (
    <>
      <div class="bar">
        <h2 id="trainsTitle">
          <bdi>{t('lineEnds', { a: p.from.name, b: p.to.name })}</bdi>
        </h2>
      </div>
      <div class="legs">
        <div class="row">
          <h2 class="sec" style="margin:8px 0">
            {t(st.mode.value === 'lrt' ? 'directLrt' : 'directTrains')}
          </h2>
          <span class="muted" id="trainsLive">
            {st.liveNote.value}
          </span>
        </div>
        {rows === null && <div class="empty">{t('loading')}</div>}
        {rows && !rows.length && (
          <div class="empty">{t(st.mode.value === 'lrt' ? 'noDirectLrt' : 'noDirectTrains')}</div>
        )}
        <div id="trainRows">
          {(rows || []).map((r) => {
            const lv = st.live.value[String(r.trip)];
            const dep = lv ? lv.dep : r.dep,
              arr = lv ? lv.arr : r.arr;
            return (
              <div
                class={`trainrow${lv && lv.passed ? ' gone' : ''}`}
                key={r.trip}
                onClick={() => st.hooks.openTrip(r.trip, r.fromStop)}
              >
                <ShownTime planned={r.dep} live={lv ? lv.dep : null} class={`time${liveClass(lv)}`} />
                <span class="arrow">
                  <Icon name="chevronEnd" class="chev" />
                </span>
                <ShownTime planned={r.arr} live={lv ? lv.arr : null} class={`time${liveClass(lv)}`} />
                <span class="what">
                  <span>
                    <LineChip line={r.line} routeType={r.routeType} agency={r.agency} /> {dur(arr - dep)} ·{' '}
                    {r.stops === 1 ? t('stops1') : t('stopsN', { n: r.stops })}
                  </span>
                  <small>
                    <bdi>{t('toward', { headsign: r.headsign })}</bdi>
                  </small>
                </span>
                <InCell live={lv} time={dep} day={day} counting={st.isNow.value} />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
