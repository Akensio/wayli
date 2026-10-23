// A stop: name, city and code, from here / to here, the next departures with their countdowns, and the live
// times as they arrive (a departure that passed greys out).
import { Icon } from '../../ui/Icon';
import { t, lang } from '../../i18n';
import { fmt } from '../../time';
import { favs } from '../../store.js';
import * as stop from '../../state/stop';
import * as saved from '../../state/saved';
import { now } from '../../state/clock';
import { chipColors } from '../../journey/colors';
import { lineText, inText } from '../../journey/format';

export function StopDetail() {
  void lang.value; void now.value; void stop.favTick.value;
  const info = stop.info.value;
  if (!info) return null;
  const key = 'stop:' + info.stop, on = favs.has('stops', key), deps = stop.deps.value, day = stop.day.value, isNow = stop.isNow.value;
  const toggleFav = () => { favs.toggle('stops', key, { stop: info.stop, name: info.name, city: info.city, code: info.code, lat: info.lat, lon: info.lon, lines: info.lines.slice(0, 8) }); stop.favTick.value++; saved.refresh(); };
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="stopBack" onClick={stop.hooks.close}>{t('back')}</button>
        <h2 id="stopTitle">{info.name}</h2>
        <button type="button" class={`star${on ? ' on' : ''}`} id="stopStar" title={t('savePlace')} onClick={toggleFav}><Icon name="star" /></button>
      </div>
      <div class="legs">
        <div class="muted" id="stopMeta">{info.city || ''}{info.code ? ' · ' + info.code : ''}</div>
        <div class="row" style="margin:8px 0">
          <button type="button" class="ghost" id="stopFrom" onClick={stop.hooks.fromHere}>{t('fromHere')}</button>
          <button type="button" class="ghost" id="stopTo" onClick={stop.hooks.toHere}>{t('toHere')}</button>
          <span class="spacer" style="flex:1" />
          <button type="button" class="ghost" id="stopLive" onClick={stop.hooks.refresh}><Icon name="refresh" /> <span>{t('refresh')}</span></button>
        </div>
        <div class="row"><h2 class="sec" style="margin:8px 0">{t('nextDeps')}</h2><span class="muted" id="stopLiveNote">{stop.liveNote.value}</span></div>
        <div id="stopDeps">
          {deps && !deps.length && <div class="empty">{t('noDeps')}</div>}
          {(deps || []).map((d) => {
            const lv = stop.liveDeps.value[String(d.trip)];
            const timeCls = !lv ? 'time' : lv.passed ? 'time gone' : `time ${lv.stale ? 'unsure' : 'live'}`;
            return (
              <div class="dep" data-trip={d.trip} key={d.trip} onClick={() => stop.hooks.openTrip(d.trip, info.stop)}>
                <span class={timeCls}>{lv && !lv.passed ? fmt(lv.time) : (d.estimated ? '~' : '') + fmt(d.time)}</span>
                <span class={`chip t${d.routeType}`} style={chipColors(d.routeType, d.agency)}>{lineText(d.line)}</span>
                <span class="head">{d.headsign}{d.estimated && <small class="est">{t('estShort')}</small>}</span>
                <span class="in">
                  {lv ? (lv.passed ? t('livePassed') : <>{inText(lv.time, day)} <span class={`live ${lv.stale ? 'unsure' : 'ok'}`}>⦿{lv.delayMin ? ` ${lv.delayMin > 0 ? '+' : ''}${lv.delayMin}` : ''}{lv.stale ? '?' : ''}</span></>) : isNow ? inText(d.time, day) : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
