// The journey detail panel: back, the times and duration, a star to save the trip, start and share, then the
// legs; a tap on a ride focuses it on the map, a tap on its chip opens the line.
import { Icon } from '../../widgets/Icon';
import { StarButton } from '../../widgets/StarButton';
import { TimeRange } from '../../widgets/TimeRange';
import { t, lang } from '../../lib/i18n';
import * as clock from '../../engine/clock.ts';
import { favs, stored } from '../../state/store.ts';
import * as detail from '../../state/detail';
import { now } from '../../state/clock';
import { dur } from '../../display/time';
import { tripKey } from '../../state/store.ts';
import { liveBadge, rideBadge } from '../../display/live';
import { shareJourney } from './share';
import { DetailLeg } from './DetailLeg';
import { payLink } from './pay';
import { isRide } from '../../model/journey';
import type { RideLeg } from '../../model/journey';
import { rideOptions, rideLive } from '../../controllers/detail';
import { openLine, openTrip } from '../../controllers/line';
import { startTrip } from '../../controllers/follow';
import { placeName } from '../../state/names';
import { toast } from '../../widgets/toast';

/** The ride's line, as a timetable at its boarding stop. */
const openRideLine = (l: RideLeg) => {
  const s = l.stopsAlong?.[0]?.stop;
  return openLine(l.route, s != null ? { stop: s } : {});
};

/** A ride's live badge: the newest look at its vehicle, else the lateness the plan used at its boarding stop. */
/** A ride's badge: what the live data says now, else the lateness the plan used, else none. */
function badgeOf(l: RideLeg) {
  const r = detail.live.value[String(l.trip)];
  if (r) return rideBadge(r);
  return l.live ? liveBadge({ time: l.depart, delay: l.live.delay, passed: false, stale: !!l.live.stale }) : null;
}
export function Detail() {
  void lang.value;
  void now.value;
  void stored.value;
  const j = detail.journey.value,
    q = detail.query.value,
    bikeOnly = detail.bikeOnly.value,
    focus = detail.focus.value;
  if (!j || !q) return null;
  // which journey this is: the rows below are keyed by it, so another journey's rows never reuse their state
  const jkey = `${j.depart}|${j.arrive}|${j.legs.map((l) => (isRide(l) ? l.trip : l.type)).join(',')}`;
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
        <button
          type="button"
          class="ghost"
          id="detailShare"
          onClick={() =>
            shareJourney(j, q, { from: placeName(q.from), to: placeName(q.to) }, bikeOnly).then(
              (r) => r === 'copied' && toast(t('copied')),
            )
          }
        >
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
          <DetailLeg
            key={`${jkey}:${i}`}
            l={l}
            focus={i === focus}
            badge={isRide(l) ? badgeOf(l) : null}
            onChip={isRide(l) ? () => openRideLine(l) : undefined}
            onFocus={() => detail.focusLeg(i)}
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
