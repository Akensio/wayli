// The journey detail panel: back, the times and duration, a star to save the trip, start and share, then the
// legs; a tap on a ride focuses it on the map, a tap on its chip opens the line.
import { Icon } from '../../ui/Icon';
import { TimeRange } from '../../ui/TimeRange';
import { t, lang } from '../../i18n';
import * as live from '../../live.js';
import { favs } from '../../store.js';
import * as detail from '../../state/detail';
import { now } from '../../state/clock';
import { dur, tripKey, liveBadge } from '../../journey/format';
import { shareJourney } from '../../journey/share';
import { LegRow } from './LegRow';
import { CloseAll } from '../../ui/CloseAll';
import { payLink } from '../../journey/pay';

export function Detail() {
  void lang.value; void now.value; void detail.favTick.value;
  const j = detail.journey.value, q = detail.query.value, bikeOnly = detail.bikeOnly.value, focus = detail.focus.value;
  if (!j || !q) return null;
  const key = tripKey(q), saved = !bikeOnly && favs.has('trips', key);
  const over = live.nowOn(q.day) > j.arrive + 1800;
  const title = bikeOnly ? t('bikeOnly', { min: Math.round(j.arrive / 60), km: '' }).replace(', ', '').replace(' ק"מ', '').replace(' km', '')
    : <><TimeRange from={j.depart} to={j.arrive} class="" /> · {dur(j.arrive - j.depart)}</>;
  const toggleFav = () => { if (bikeOnly) return; favs.toggle('trips', key, { from: q.from, to: q.to, bike: q.bike, folding: q.folding }); detail.favTick.value++; detail.hooks.favChanged(); };
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="detailBack" onClick={detail.hooks.close}>{t('back')}</button>
        <h2 id="detailTitle">{title}</h2>
        <button type="button" class={`star${saved ? ' on' : ''}`} id="detailStar" title={t('savePlace')} onClick={toggleFav}><Icon name="star" /></button>
        <CloseAll />
      </div>
      <div class="actions">
        <button type="button" class="primary slim" id="detailStart" hidden={bikeOnly} disabled={over} title={over ? t('tripOver') : ''} onClick={() => detail.hooks.startTrip(j, q)}><Icon name="play" /> <span>{t('startTrip')}</span></button>
        <button type="button" class="ghost" id="detailShare" onClick={() => shareJourney(j, q, bikeOnly)}><Icon name="share" /> <span>{t('share')}</span></button>
        {!bikeOnly && <a class="ghost btnlink" id="detailPay" href={payLink()} target="_blank" rel="noopener" title={t('payHint')}><Icon name="card" /> <span>{t('pay')}</span></a>}
      </div>
      <div class="muted center" id="detailNote">{bikeOnly ? '' : t('legHint')}</div>
      <div class={`legs${focus >= 0 ? ' focused' : ''}`} id="detailLegs">
        {j.legs.map((l, i) => (
          <LegRow key={i} l={l} mode="detail" cls={i === focus ? 'focus' : ''}
            badge={detail.badges.value[String(l.trip ?? '')] || (l.live ? liveBadge({ time: l.depart!, delay: l.live.delay, passed: false, stale: l.live.stale }) : null)}
            onChip={() => detail.hooks.openLine(+l.route!, l.stopsAlong?.[0]?.stop)} onClick={() => detail.focusLeg(i)}
            options={l.type === 'ride' && (l.stopsAlong?.length ?? 0) >= 2 ? { load: () => detail.hooks.rideOptions(l, q), liveFor: (rows) => detail.hooks.rideLive(rows, q.day), day: q.day, now: q.isNow ? live.nowOn(q.day) : null, onOpen: detail.hooks.openTrip } : undefined} />
        ))}
      </div>
    </>
  );
}
