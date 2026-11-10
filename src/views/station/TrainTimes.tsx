// The direct trains between two stations: when each leaves and arrives (live when known), how long it takes, where
// it heads (the way back: the swap between the two boxes at the top). A tap opens the train's stops.
import { t, lang } from '../../common/i18n';

import * as st from '../../state/station';
import { railWords } from '../../text/travel';
import { openTrip } from '../../controllers/line';
import { LiveNote } from '../../widgets/LiveNote';
import { RideRows } from './RideRows';

export function TrainTimes() {
  void lang.value;
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
            {t(railWords(st.mode.value).direct)}
          </h2>
          {st.isNow.value && <LiveNote id="trainsLive" />}
        </div>
        {rows === null && <div class="empty">{t('loading')}</div>}
        {rows && !rows.length && <div class="empty">{t(railWords(st.mode.value).noDirect)}</div>}
        <div id="trainRows">
          <RideRows rows={rows || []} day={day} counting={st.isNow.value} stops onOpen={openTrip} />
        </div>
      </div>
    </>
  );
}
