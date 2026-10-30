// One way to get there: times and duration, the legs as chips, the lines and where they head, the other
// departures of the same lines, when to leave (counting down), when the first ride reaches its stop, and the map
// button that draws it on the map or takes it off.
import { Icon } from '../../widgets/Icon';
import { LiveMark } from '../../widgets/LiveMark';
import { TimeRange } from '../../widgets/TimeRange';
import { t } from '../../lib/i18n';
import { fmt } from '../../lib/time';
import { now } from '../../state/clock';
import * as results from '../../state/results';
import { dur, transfersText, lineText, leaveText, inText, liveClass } from '../../journey/format';
import { LegChips } from './LegChips';
import type { Card } from '../../state/results';
import type { Leg } from '../../journey/types';

/** The countdown line; it re-renders with the clock. */
export function Leave({ sec, day, liveInfo }: { sec: number; day: string; liveInfo?: Leg['live'] }) {
  void now.value;
  const txt = leaveText(sec, day);
  const cls = liveClass(liveInfo);
  return <div class={`leave${cls}${txt === t('departed') ? ' past' : ''}`}>{txt}</div>;
}
/** When the first ride reaches the stop it is boarded at, counting down ("60 at the stop in 14 min"): the time the
 *  plan was made with, live when its vehicle was seen (marked, a ? when the report is old), the timetable's otherwise.
 *  How late it runs is not said: against a planned time the card never shows, it told the rider nothing (Gadi). */
const RideIn = ({ l, day }: { l?: Leg; day: string }) => {
  void now.value;
  if (!l) return null;
  const when = inText(l.depart!, day);
  if (!when) return null;
  return (
    <div class="muted ridein">
      {l.live && (
        <>
          <LiveMark stale={l.live.stale} />{' '}
        </>
      )}
      {t(l.routeType === 2 ? 'rideAtStation' : 'rideAtStop', { line: lineText(l.line), when })}
    </div>
  );
};

export function JourneyCard({ card }: { card: Card }) {
  const { j, q, options, lines, idx } = card;
  const rides = j.legs.filter((l) => l.type === 'ride');
  const shown = results.altShown.value.has(idx),
    sel = shown && results.altSel.value === idx;
  void now.value; // the "also at" times grey out as they pass
  return (
    <div class={`journey${sel ? ' sel' : ''}`} data-idx={idx} onClick={() => results.hooks.openDetail(j, q)}>
      <div class="top">
        {rides.some((l) => l.estimated) && <span class="est">~</span>}
        <TimeRange from={j.depart} to={j.arrive} />
        <span class="dur">
          {dur(j.arrive - j.depart)} · {transfersText(j.transfers)}
        </span>
      </div>
      <div class="chips">
        <LegChips legs={j.legs} lines={lines} />
      </div>
      <div class="sub">
        {rides.map((l) => `${lineText(l.line)} ${t('toward', { headsign: l.headsign || '' })}`).join(' · ')}
      </div>
      {options.length > 1 && (
        <div class="opts">
          <span class="muted">{t('alsoAt')}</span>
          {options
            .slice(1)
            .sort((a, b) => a.depart - b.depart)
            .map((o) => (
              // an earlier one that arrives later (the train at the platform) says when it arrives
              <button
                type="button"
                class={`opt${o.slower ? ' slower' : ''}${leaveText(o.depart, q.day) === t('departed') ? ' past' : ''}`}
                title={o.slower ? t('arrivesLater') : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  results.hooks.openDetail(o, q);
                }}
              >
                {fmt(o.depart)}
                {o.slower && <small dir="ltr">→{fmt(o.arrive)}</small>}
              </button>
            ))}
        </div>
      )}
      {rides.some((l) => l.estimated) && <div class="muted est">{t('estNote')}</div>}
      <Leave sec={j.depart} day={q.day} liveInfo={rides[0]?.live} />
      <RideIn l={rides[0]} day={q.day} />
      <button
        type="button"
        class={`mapbtn${shown ? ' on' : ''}`}
        title={t('onMap')}
        aria-label={t('onMap')}
        onClick={(e) => {
          e.stopPropagation();
          results.toggleAlt(idx);
        }}
      >
        <Icon name="map" />
      </button>
    </div>
  );
}
