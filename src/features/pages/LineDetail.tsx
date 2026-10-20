// A line: where it heads, its operator, trips and hours, the other directions, its stops in order; the
// vehicles on it now are drawn on the map and counted here.
import { Icon } from '../../ui/Icon';
import { t, lang } from '../../i18n';
import * as line from '../../state/line';
import { lineText, fmtPlus } from '../../journey/format';

export function LineDetail() {
  void lang.value;
  const info = line.info.value;
  if (!info) return null;
  const lv = line.liveText.value;
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="lineBack" onClick={line.hooks.close}>{t('back')}</button>
        <h2 id="lineTitle">{t('lineTitle', { line: lineText(info.line) })} · {t('toward', { headsign: info.headsign })}</h2>
        <span class={`livebadge ${line.liveOk.value ? 'ok' : ''}`} id="lineLive" hidden={!lv}>{lv}</span>
      </div>
      <div class="legs">
        <div class="muted" id="lineMeta">{info.agency} · {t('tripsToday', { n: info.trips })} · {fmtPlus(info.first)}–{fmtPlus(info.last)} · {t('stopsCount', { n: info.stops.length })}</div>
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
