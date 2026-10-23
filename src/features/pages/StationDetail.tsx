// A train station, the answer to the From box of the train timetable: every station a train from here reaches without
// a change, with the next train there and how long it takes. A tap sets it as the To station, and the trains between
// the two follow.
import { t, lang } from '../../i18n';
import { fmt } from '../../time';
import * as st from '../../state/station';
import { dur } from '../../journey/format';
import { now } from '../../state/clock';

export function StationDetail() {
  void lang.value; void now.value;
  const s = st.station.value;
  if (!s) return null;
  const list = st.dests.value;
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="stationBack" onClick={st.hooks.close}>{t('back')}</button>
        <h2 id="stationTitle">{s.name}</h2>
      </div>
      <div class="legs">
        <div class="muted" style="margin:6px 0">{t('directFrom', { name: s.name })}</div>
        {list === null && <div class="empty">{t('loading')}</div>}
        {list && !list.length && <div class="empty">{t('noTrains')}</div>}
        <div id="stationDests">
          {(list || []).map((d) => (
            <button type="button" class="destrow" key={d.key} onClick={() => st.hooks.openTo(d)}>
              <span class="name">{d.name}</span>
              <small>{d.next != null ? t('nextTrain', { time: fmt(d.next), ride: dur(d.ride || 0) }) : t('noMoreTrains')} · {t('tripsToday', { n: d.trips })}</small>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
