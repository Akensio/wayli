// A line: where it heads, its operator, trips and hours, the other directions, and the line as a timetable at the
// rider's stop: the day's times there (a row per hour), and the stops in order with the time chosen at each, and how
// long before or after the rider's stop (a tap on a stop makes it the rider's); the vehicles on it now are drawn on
// the map and counted here.
import { Icon } from '../../widgets/Icon';
import { StarButton } from '../../widgets/StarButton';
import { agencyName } from '../../journey/agencies';
import { t, lang } from '../../lib/i18n';
import * as line from '../../state/line';
import { fmtPlus } from '../../journey/format';
import { fmt } from '../../lib/time';
import { Timetable } from '../../widgets/Timetable';
import { LineChip } from '../../widgets/LineChip';
import { favs, stored } from '../../lib/store.js';
import { CloseAll } from '../../widgets/CloseAll';

export function LineDetail() {
  void lang.value;
  const info = line.info.value;
  if (!info) return null;
  const lv = line.liveText.value;
  void stored.value;
  // saved by the line's number in the feed (its route id), as the history keeps it: a timetable's route index changes daily
  const key = info.ref ? 'line:' + info.ref : '', on = !!key && favs.has('lines', key);
  const toggleFav = () => { if (!key) return; favs.toggle('lines', key, { type: 'line', ref: info.ref, line: info.line, routeType: info.routeType, agency: info.agency, headsign: info.headsign, mode: info.mode }); };
  const ai = line.anchor.value, a = info.stops[ai], times = line.times.value, sel = line.selTimes.value, base = sel[ai] ?? null;
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="lineBack" onClick={line.hooks.close}>{t('back')}</button>
        <LineChip line={info.line} routeType={info.routeType} agency={info.agency} mode={info.mode} big />
        <span class={`livebadge ${line.liveOk.value ? 'ok' : ''}`} id="lineLive" hidden={!lv}>{lv}</span>
        {key && <StarButton id="lineStar" on={on} onClick={toggleFav} />}
        <CloseAll />
      </div>
      <div class="legs">
        <h2 id="lineTitle"><bdi>{info.mode === 'rail' && info.ends ? t('lineEnds', { a: info.ends[0], b: info.ends[1] }) : t('toward', { headsign: info.headsign })}</bdi></h2>
        <div class="muted" id="lineMeta"><bdi>{agencyName(info.agency || '')}</bdi> · {t('tripsToday', { n: info.trips })} · <span dir="ltr">{fmtPlus(info.first)}–{fmtPlus(info.last)}</span> · {t('stopsN', { n: info.stops.length })}</div>
        {info.estimated && <div class="muted est">{t('estNote')}</div>}
        <div class="chips" id="lineDirs" style="margin:8px 0">
          {info.others.map((o) => <button type="button" class="chipbtn" onClick={() => line.hooks.openLine(o.route)}><Icon name="arrowsLR" /> {t('toward', { headsign: o.headsign })}</button>)}
        </div>
        {a && <>
          <h2 class="sec" style="margin:12px 0 2px">{t('timesAtStop', { name: a.name })}</h2>
          <div class="muted small">{t('pickStopHint')}</div>
          {times === null ? <div class="empty">{t('loading')}</div>
            : !times.length ? <div class="empty">{t('noTimesHere')}</div>
            : <Timetable rows={times} now={line.now.value} sel={line.sel.value} onPick={line.hooks.pick} dim={line.loading.value} />}
        </>}
        <div id="lineStops">
          {info.stops.map((st, i) => {
            const at = sel[i], rel = at != null && base != null ? Math.round((at - base) / 60) : null;
            return (
              <div class={`linerow${i === ai ? ' anchor' : ''}${i < ai ? ' before' : ''}`} data-i={i} key={i} onClick={() => line.hooks.setAnchor(i)}>
                <span class="idx">{i + 1}</span>
                <span class="name">{st.name}<small class="muted"> {st.city || ''}</small>{i === ai && <small class="tag">{t('yourStop')}</small>}</span>
                {i === ai ? <button type="button" class="ghost slim" onClick={(e) => { e.stopPropagation(); line.hooks.openStop(st.stop); }}>{t('stopDetails')}</button>
                  : rel != null && <span class="rel">{rel > 0 ? '+' : rel < 0 ? '−' : ''}{Math.abs(rel)}′</span>}
                {at != null && <span class="at">{fmt(at)}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
