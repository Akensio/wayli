// A stop, the one view of it wherever it was opened: name, city and code, its lines (a tap opens one), from here / to
// here, the next departures with their countdowns and the live times as they arrive (a departure that passed greys
// out); a station is all its platforms, and below its departures where its trains go without a change (a tap: the
// trains between the two).
import { Icon } from '../../widgets/Icon';
import { StarButton } from '../../widgets/StarButton';
import { t, lang } from '../../lib/i18n';
import { fmt } from '../../lib/time';
import { favs, stored } from '../../state/store.ts';
import * as stop from '../../state/stop';
import { now } from '../../state/clock';
import { dur, liveClass, railWords } from '../../journey/format';
import { LineChip } from '../../widgets/LineChip';
import { ShownTime } from '../../widgets/ShownTime';
import { InCell } from '../../widgets/LiveMark';
import { refreshStop, openLineAtStop } from '../../controllers/stop';
import { fromHere, toHere } from '../../controllers/planner';
import { openDestination } from '../../controllers/station';
import { openTrip } from '../../controllers/line';
import { Tappable } from '../../widgets/Tappable';

export function StopDetail() {
  void lang.value;
  void now.value;
  void stored.value;
  const info = stop.info.value;
  if (!info) return null;
  const key = 'stop:' + info.stop,
    on = favs.has('stops', key),
    deps = stop.deps.value,
    day = stop.day.value,
    isNow = stop.isNow.value;
  const toggleFav = () => {
    favs.toggle('stops', key, {
      stop: info.stop,
      name: info.name,
      city: info.city,
      code: info.code,
      lat: info.lat,
      lon: info.lon,
      lines: info.lines.slice(0, 8),
    });
  };
  return (
    <>
      <div class="bar">
        <h2 id="stopTitle">{info.name}</h2>
        <StarButton id="stopStar" on={on} onClick={toggleFav} />
      </div>
      <div class="legs">
        <div class="muted" id="stopMeta">
          {info.city || ''}
          {info.code ? ' · ' + info.code : ''}
        </div>
        {info.lines.length > 0 && (
          <div class="stoplines" id="stopLines">
            {info.lines.map((l) => (
              <button
                type="button"
                key={`${l.label}|${l.route}`}
                class="linkchip"
                onClick={() => l.route != null && openLineAtStop(l.route)}
              >
                <LineChip line={l.label} routeType={l.type} agency={l.agency} />
              </button>
            ))}
          </div>
        )}
        <div class="row" style="margin:8px 0">
          <button type="button" class="ghost" id="stopFrom" onClick={fromHere}>
            {t('fromHere')}
          </button>
          <button type="button" class="ghost" id="stopTo" onClick={toHere}>
            {t('toHere')}
          </button>
          <span class="spacer" style="flex:1" />
          <button type="button" class="ghost" id="stopLive" onClick={refreshStop}>
            <Icon name="refresh" /> <span>{t('refresh')}</span>
          </button>
        </div>
        <div class="row">
          <h2 class="sec" style="margin:8px 0">
            {t('nextDeps')}
          </h2>
          <span class="muted" id="stopLiveNote">
            {stop.liveNote.value}
          </span>
        </div>
        <div id="stopDeps">
          {deps && !deps.length && <div class="empty">{t('noDeps')}</div>}
          {(deps || []).map((d) => {
            const lv = stop.liveDeps.value[String(d.trip)];
            const timeCls = lv && lv.passed ? 'time gone' : 'time' + liveClass(lv);
            return (
              <Tappable class="dep" key={d.trip} onClick={() => openTrip(d.trip, info.stop)}>
                <ShownTime
                  planned={d.time}
                  live={lv && !lv.passed ? lv.time : null}
                  class={timeCls}
                  prefix={d.estimated ? '~' : ''}
                />
                <LineChip line={d.line} routeType={d.routeType} agency={d.agency} />
                <span class="head">
                  {d.headsign}
                  {d.estimated && <small class="est">{t('estShort')}</small>}
                </span>
                <InCell live={lv} time={lv && !lv.passed ? lv.time : d.time} day={day} counting={isNow} />
              </Tappable>
            );
          })}
        </div>
        {info.reach && (
          <>
            <h2 class="sec" style="margin:14px 0 6px">
              {t(railWords(info.reach).direct)}
            </h2>
            {stop.dests.value === null && <div class="empty">{t('loading')}</div>}
            {stop.dests.value && !stop.dests.value.length && <div class="empty">{t(railWords(info.reach).none)}</div>}
            <div id="stationDests">
              {(stop.dests.value || []).map((d) => (
                <button type="button" class="destrow" key={d.key} onClick={() => openDestination(d)}>
                  <span class="name">{d.name}</span>
                  <small>
                    {d.next != null
                      ? t('nextTrain', { time: fmt(d.next), ride: dur(d.ride || 0) })
                      : t(railWords(info.reach).noMore)}{' '}
                    · {t('tripsToday', { n: d.trips })}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
