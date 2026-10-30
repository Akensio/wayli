// The journey detail panel: back, the times and duration, a star to save the trip, start and share, then the
// legs; a tap on a ride focuses it on the map, a tap on its chip opens the line.
import { Icon } from '../../widgets/Icon';
import { StarButton } from '../../widgets/StarButton';
import { TimeRange } from '../../widgets/TimeRange';
import { t, lang } from '../../lib/i18n';
import * as clock from '../../engine/clock.js';
import { favs, stored } from '../../lib/store.js';
import * as detail from '../../state/detail';
import { now } from '../../state/clock';
import { dur, tripKey, liveBadge } from '../../journey/format';
import { shareJourney } from '../../journey/share';
import { LegRow } from './LegRow';
import { payLink } from '../../journey/pay';
import { isRide } from '../../journey/types';
import type { RideLeg } from '../../journey/types';
import { rideOptions, rideLive } from '../../controllers/detail';
import { openLine, openTrip } from '../../controllers/line';
import { startTrip } from '../../controllers/follow';

/** The ride's line, as a timetable at its boarding stop. */
const openRideLine = (l: RideLeg) => {
  const s = l.stopsAlong?.[0]?.stop;
  return openLine(l.route, s != null ? { stop: s } : {});
};

/** A ride's live badge: the newest look at its vehicle, else the lateness the plan used at its boarding stop. */
const rideBadge = (l: RideLeg) =>
  detail.badges.value[String(l.trip)] ||
  (l.live ? liveBadge({ time: l.depart, delay: l.live.delay, passed: false, stale: l.live.stale }) : null);
export function Detail() {
  void lang.value;
  void now.value;
  void stored.value;
  const j = detail.journey.value,
    q = detail.query.value,
    bikeOnly = detail.bikeOnly.value,
    focus = detail.focus.value;
  if (!j || !q) return null;
  const key = tripKey(q),
    saved = !bikeOnly && favs.has('trips', key);
  const over = clock.nowOn(q.day) > j.arrive + 1800;
  const title = bikeOnly ? (
    t('bikeAllWay', { min: Math.round(j.arrive / 60) })
  ) : (
    <>
      <TimeRange from={j.depart} to={j.arrive} class="" /> · {dur(j.arrive - j.depart)}
    </>
  );
  const toggleFav = () => {
    if (bikeOnly) return;
    favs.toggle('trips', key, { from: q.from, to: q.to, bike: q.bike, folding: q.folding });
  };
  return (
    <>
      <div class="bar">
        <h2 id="detailTitle">{title}</h2>
        <StarButton id="detailStar" on={saved} onClick={toggleFav} />
      </div>
      <div class="actions">
        <button
          type="button"
          class="primary slim"
          id="detailStart"
          hidden={bikeOnly}
          disabled={over}
          title={over ? t('tripOver') : ''}
          onClick={() => startTrip(j, q)}
        >
          <Icon name="play" /> <span>{t('startTrip')}</span>
        </button>
        <button type="button" class="ghost" id="detailShare" onClick={() => shareJourney(j, q, bikeOnly)}>
          <Icon name="share" /> <span>{t('share')}</span>
        </button>
        {!bikeOnly && (
          <a class="ghost btnlink" id="detailPay" href={payLink()} target="_blank" rel="noopener" title={t('payHint')}>
            <Icon name="card" /> <span>{t('pay')}</span>
          </a>
        )}
      </div>
      <div class="muted center" id="detailNote">
        {bikeOnly ? '' : t('legHint')}
      </div>
      <div class={`legs${focus >= 0 ? ' focused' : ''}`} id="detailLegs">
        {j.legs.map((l, i) => (
          <LegRow
            key={i}
            l={l}
            mode="detail"
            cls={i === focus ? 'focus' : ''}
            badge={isRide(l) ? rideBadge(l) : null}
            onChip={isRide(l) ? () => openRideLine(l) : undefined}
            onClick={() => detail.focusLeg(i)}
            options={
              isRide(l) && (l.stopsAlong?.length ?? 0) >= 2
                ? {
                    load: () => rideOptions(l, q),
                    liveFor: (rows) => rideLive(rows, q.day),
                    day: q.day,
                    now: q.isNow ? clock.nowOn(q.day) : null,
                    onOpen: openTrip,
                  }
                : undefined
            }
          />
        ))}
      </div>
    </>
  );
}
