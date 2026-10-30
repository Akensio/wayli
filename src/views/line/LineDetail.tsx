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

import { Timetable } from '../../widgets/Timetable';
import { Fold } from '../../widgets/Fold';
import { ShownTime } from '../../widgets/ShownTime';
import { useEffect, useState } from 'preact/hooks';
import { LineChip } from '../../widgets/LineChip';
import { favs, stored } from '../../lib/store.ts';
import { LiveMark } from '../../widgets/LiveMark';
import * as delays from '../../engine/delays.js';
import { openOtherDirection, chooseTime, chooseAnchor } from '../../controllers/line';
import { openStop } from '../../controllers/stop';

/** The sign before a minutes difference: a plus, a proper minus, nothing for zero. */
function signGlyph(n: number): string {
  if (n > 0) return '+';
  if (n < 0) return '−';
  return '';
}
export function LineDetail() {
  void lang.value;
  const info = line.info.value;
  // the timetable starts folded, and folds again for another line (Gadi, 2026-10-28)
  const [ttOpen, setTtOpen] = useState(false);
  useEffect(() => {
    setTtOpen(false);
  }, [info]);
  if (!info) return null;
  const lv = line.liveText.value;
  void stored.value;
  // saved by the line's number in the feed (its route id), as the history keeps it: a timetable's route index changes daily
  const key = info.ref ? 'line:' + info.ref : '',
    on = !!key && favs.has('lines', key);
  const toggleFav = () => {
    if (!key || !info.ref) return;
    favs.toggle('lines', key, {
      type: 'line',
      ref: info.ref,
      line: info.line,
      routeType: info.routeType,
      agency: info.agency,
      headsign: info.headsign,
      mode: info.mode,
    });
  };
  // the chosen trip's time at each stop: live when its vehicle is seen (the time a trip with that ride shows too)
  const ai = line.anchor.value,
    a = info.stops[ai],
    times = line.times.value,
    sel = line.selTimes.value,
    live = line.selLive.value;
  const when = (i: number) => {
    const l = live[i];
    return l && !l.passed ? l.time : (sel[i] ?? null);
  };
  const base = when(ai);
  return (
    <>
      <div class="bar">
        <LineChip line={info.line} routeType={info.routeType} agency={info.agency} mode={info.mode} big />
        <span class={`livebadge ${line.liveOk.value ? 'ok' : ''}`} id="lineLive" hidden={!lv}>
          {lv}
        </span>
        {key && <StarButton id="lineStar" on={on} onClick={toggleFav} />}
      </div>
      <div class="legs">
        <h2 id="lineTitle">
          <bdi>
            {info.mode === 'rail' && info.ends
              ? t('lineEnds', { a: info.ends[0], b: info.ends[1] })
              : t('toward', { headsign: info.headsign })}
          </bdi>
        </h2>
        <div class="muted" id="lineMeta">
          <bdi>{agencyName(info.agency || '')}</bdi> · {t('tripsToday', { n: info.trips })} ·{' '}
          <span dir="ltr">
            {fmtPlus(info.first)}–{fmtPlus(info.last)}
          </span>{' '}
          · {t('stopsN', { n: info.stops.length })}
        </div>
        {info.estimated && <div class="muted est">{t('estNote')}</div>}
        <div class="chips" id="lineDirs" style="margin:8px 0">
          {info.others.map((o) => (
            <button type="button" class="chipbtn" onClick={() => openOtherDirection(o.route)}>
              <Icon name="arrowsLR" /> {t('toward', { headsign: o.headsign })}
            </button>
          ))}
        </div>
        {a && (
          <>
            <Fold class="sec" id="lineTtFold" open={ttOpen} onClick={() => setTtOpen(!ttOpen)}>
              {t('timesAtStop', { name: a.name })}
            </Fold>
            {ttOpen && (
              <>
                <div class="muted small">{t('pickStopHint')}</div>
                {times === null && <div class="empty">{t('loading')}</div>}
                {times !== null && !times.length && <div class="empty">{t('noTimesHere')}</div>}
                {times !== null && times.length > 0 && (
                  <Timetable
                    rows={times}
                    now={line.now.value}
                    sel={line.sel.value}
                    onPick={chooseTime}
                    dim={line.loading.value}
                  />
                )}
              </>
            )}
          </>
        )}
        <div id="lineStops">
          {info.stops.map((st, i) => {
            const at = when(i),
              rel = at != null && base != null ? Math.round((at - base) / 60) : null,
              l = live[i];
            const late = l && !l.passed && l.delay > 0 && sel[i] != null;
            return (
              <div
                class={`linerow${i === ai ? ' anchor' : ''}${i < ai ? ' before' : ''}`}
                data-i={i}
                key={i}
                onClick={() => chooseAnchor(i)}
              >
                <span class="idx">{i + 1}</span>
                <span class="name">
                  {st.name}
                  <small class="muted"> {st.city || ''}</small>
                  {i === ai && <small class="tag">{t('yourStop')}</small>}
                  {i === ai && l && !l.passed && (
                    <>
                      {' '}
                      <LiveMark delayMin={delays.delayMinutes(l.delay)} stale={l.stale} />
                    </>
                  )}
                </span>
                {i === ai ? (
                  <button
                    type="button"
                    class="ghost slim"
                    onClick={(e) => {
                      e.stopPropagation();
                      openStop(st.stop);
                    }}
                  >
                    {t('stopDetails')}
                  </button>
                ) : (
                  rel != null && (
                    <span class="rel">
                      {signGlyph(rel)}
                      {Math.abs(rel)}′
                    </span>
                  )
                )}
                {at != null && <ShownTime planned={late ? sel[i]! : at} live={late ? at : null} class="at" />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
