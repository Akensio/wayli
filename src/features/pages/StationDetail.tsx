// A train station from the stop search: a box to find where to, and every station a train from here reaches
// without a change, with the next train there and how long it takes. A tap opens the trains between the two.
import { t, lang } from '../../i18n';
import { fmt } from '../../time';
import * as st from '../../state/station';
import { dur } from '../../journey/format';
import { now } from '../../state/clock';

export function StationDetail() {
  void lang.value; void now.value;
  const s = st.station.value;
  if (!s) return null;
  const f = st.filter.value.trim().toLowerCase(), list = st.dests.value;
  const shown = list ? list.filter((d) => !f || d.name.toLowerCase().includes(f)) : null;
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="stationBack" onClick={st.hooks.close}>{t('back')}</button>
        <h2 id="stationTitle">{s.name}</h2>
      </div>
      <div class="legs">
        <div class="field stationto"><input type="text" id="stationTo" placeholder={t('toStationQ')} autocomplete="off" enterkeyhint="search" value={st.filter.value}
          onInput={(e) => { st.filter.value = (e.currentTarget as HTMLInputElement).value; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && shown && shown.length) st.hooks.openTo(shown[0]); }} /></div>
        <div class="muted" style="margin:6px 0">{t('directFrom', { name: s.name })}</div>
        {list === null && <div class="empty">{t('loading')}</div>}
        {shown && !shown.length && <div class="empty">{list && list.length ? t('noMatch') : t('noTrains')}</div>}
        <div id="stationDests">
          {(shown || []).map((d) => (
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
