// A line: where it heads, its operator, trips and hours, the other directions, its stops in order; the
// vehicles on it now are drawn on the map and counted here.
import { Icon } from '../../ui/Icon';
import { agencyName } from '../../journey/agencies';
import { t, lang } from '../../i18n';
import * as line from '../../state/line';
import { fmtPlus } from '../../journey/format';
import { LineChip } from '../../ui/LineChip';

export function LineDetail() {
  void lang.value;
  const info = line.info.value;
  if (!info) return null;
  const lv = line.liveText.value;
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="lineBack" onClick={line.hooks.close}>{t('back')}</button>
        <LineChip line={info.line} routeType={info.routeType} agency={info.agency} mode={info.mode} big />
        <span class={`livebadge ${line.liveOk.value ? 'ok' : ''}`} id="lineLive" hidden={!lv}>{lv}</span>
      </div>
      <div class="legs">
        <h2 id="lineTitle"><bdi>{info.mode === 'rail' && info.ends ? t('lineEnds', { a: info.ends[0], b: info.ends[1] }) : t('toward', { headsign: info.headsign })}</bdi></h2>
        <div class="muted" id="lineMeta"><bdi>{agencyName(info.agency || '')}</bdi> · {t('tripsToday', { n: info.trips })} · {fmtPlus(info.first)}–{fmtPlus(info.last)} · {t('stopsCount', { n: info.stops.length })}</div>
        {info.estimated && <div class="muted est">{t('estNote')}</div>}
        <div class="chips" id="lineDirs" style="margin:8px 0">
          {info.others.map((o) => <button type="button" class="chipbtn" onClick={() => line.hooks.openLine(o.route)}><Icon name="arrowsLR" /> {t('otherDir', { headsign: o.headsign })}</button>)}
        </div>
        <div id="lineStops">
          {info.stops.map((st, i) => (
            <div class="linerow" data-i={i} key={i} onClick={() => line.hooks.openStop(st.stop)}><span class="idx">{i + 1}</span><span class="name">{st.name}<small class="muted"> {st.city || ''}</small></span></div>
          ))}
        </div>
      </div>
    </>
  );
}
