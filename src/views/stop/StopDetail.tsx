// A stop, the one view of it wherever it was opened: name, city and code, its lines (a tap opens one), from here / to
// here, the next departures with their countdowns and the live times as they arrive (a departure that passed greys
// out); a station is all its platforms, and below its departures where its trains go without a change (a tap: the
// trains between the two).
import { Icon } from '../../widgets/Icon';
import { StarButton } from '../../widgets/StarButton';
import { t, lang } from '../../lib/i18n';
import { fmt, byShownTime } from '../../lib/time';
import { favs, stored } from '../../lib/store.js';
import * as stop from '../../state/stop';
import { now } from '../../state/clock';
import { inText, dur } from '../../journey/format';
import { LineChip } from '../../widgets/LineChip';
import { LiveMark } from '../../widgets/LiveMark';

export function StopDetail() {
  void lang.value; void now.value; void stored.value;
  const info = stop.info.value;
  if (!info) return null;
  const key = 'stop:' + info.stop, on = favs.has('stops', key), deps = stop.deps.value, day = stop.day.value, isNow = stop.isNow.value;
  const toggleFav = () => { favs.toggle('stops', key, { stop: info.stop, name: info.name, city: info.city, code: info.code, lat: info.lat, lon: info.lon, lines: info.lines.slice(0, 8) }); };
  return (
    <>
      <div class="bar">
        <h2 id="stopTitle">{info.name}</h2>
        <StarButton id="stopStar" on={on} onClick={toggleFav} />
      </div>
      <div class="legs">
        <div class="muted" id="stopMeta">{info.city || ''}{info.code ? ' · ' + info.code : ''}</div>
        {info.lines.length > 0 && (
          <div class="stoplines" id="stopLines">
            {info.lines.map((l) => <button type="button" class="linkchip" onClick={() => l.route != null && stop.hooks.openLine(l.route)}><LineChip line={l.label} routeType={l.type} agency={l.agency} /></button>)}
          </div>
        )}
        <div class="row" style="margin:8px 0">
          <button type="button" class="ghost" id="stopFrom" onClick={stop.hooks.fromHere}>{t('fromHere')}</button>
          <button type="button" class="ghost" id="stopTo" onClick={stop.hooks.toHere}>{t('toHere')}</button>
          <span class="spacer" style="flex:1" />
          <button type="button" class="ghost" id="stopLive" onClick={stop.hooks.refresh}><Icon name="refresh" /> <span>{t('refresh')}</span></button>
        </div>
        <div class="row"><h2 class="sec" style="margin:8px 0">{t('nextDeps')}</h2><span class="muted" id="stopLiveNote">{stop.liveNote.value}</span></div>
        <div id="stopDeps">
          {deps && !deps.length && <div class="empty">{t('noDeps')}</div>}
          {byShownTime(deps || [], (d) => { const lv = stop.liveDeps.value[String(d.trip)]; return lv ? lv.time : d.time; }).map((d) => {
            const lv = stop.liveDeps.value[String(d.trip)];
            const timeCls = !lv ? 'time' : lv.passed ? 'time gone' : `time ${lv.stale ? 'unsure' : 'live'}`;
            return (
              <div class="dep" data-trip={d.trip} key={d.trip} onClick={() => stop.hooks.openTrip(d.trip, info.stop)}>
                <span class={timeCls}>{lv && !lv.passed ? fmt(lv.time) : (d.estimated ? '~' : '') + fmt(d.time)}</span>
                <LineChip line={d.line} routeType={d.routeType} agency={d.agency} />
                <span class="head">{d.headsign}{d.estimated && <small class="est">{t('estShort')}</small>}</span>
                <span class="in">
                  {lv ? (lv.passed ? t('livePassed') : <>{inText(lv.time, day)} <LiveMark delayMin={lv.delayMin} stale={lv.stale} /></>) : isNow ? inText(d.time, day) : ''}
                </span>
              </div>
            );
          })}
        </div>
        {info.reach && (
          <>
            <h2 class="sec" style="margin:14px 0 6px">{t(info.reach === 'lrt' ? 'directLrt' : 'directTrains')}</h2>
            {stop.dests.value === null && <div class="empty">{t('loading')}</div>}
            {stop.dests.value && !stop.dests.value.length && <div class="empty">{t(info.reach === 'lrt' ? 'noLrt' : 'noTrains')}</div>}
            <div id="stationDests">
              {(stop.dests.value || []).map((d) => (
                <button type="button" class="destrow" key={d.key} onClick={() => stop.hooks.openTo(d)}>
                  <span class="name">{d.name}</span>
                  <small>{d.next != null ? t('nextTrain', { time: fmt(d.next), ride: dur(d.ride || 0) }) : t(info.reach === 'lrt' ? 'noMoreLrt' : 'noMoreTrains')} · {t('tripsToday', { n: d.trips })}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
