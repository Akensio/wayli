// One way to get there: times and duration, the legs as chips, the lines and where they head, when the first ride
// leaves its stop and the departures after it (the Moovit line: "leaves Rehovot: now, 20:56, 21:24", each coloured by
// how sure its time is), and the map button that draws it on the map or takes it off.
import { useRef } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import { Icon } from '../../widgets/Icon';
import { TimeRange } from '../../widgets/TimeRange';
import { t } from '../../common/i18n';
import { now } from '../../state/clock';
import * as results from '../../state/results';
import { dur, soonText, goneBy } from '../../text/durations';
import { transfersText, lineText } from '../../text/travel';
import { sureness } from '../../text/live';
import { LegChips } from './LegChips';
import type { Card } from '../../state/results';
import type { Journey } from '../../trip/journey';
import { ridesOf } from '../../trip/journey';
import { openDetail } from '../../controllers/detail';
import { Tappable } from '../../widgets/Tappable';

/** A departure's chip: "now", "18 min" or the time, in the colour of how sure it is (text/live.ts sureness), struck
 *  through once it has gone (its vehicle was past the stop when the plan was answered, or its time has gone by since); an
 *  option opens on a tap, a later ride of the route is told only. An earlier departure that arrives later than the card's own
 *  (the train at the platform) is dashed, its arrival not written on it (maintainer, 2026-11-09). */
function DepChip({ d, j, q, stop }: { d: results.Dep; j: Journey; q: Card['q']; stop: string }) {
  void now.value; // its words count down with the clock, and it is struck through as it passes (the list itself stays)
  const own = d.o === j,
    past = !!d.live?.passed || goneBy(d.depart, q.day);
  const cls = `opt${sureness(d, q.day)}${own ? ' own' : ''}${d.o?.slower ? ' slower' : ''}${past ? ' past' : ''}`;
  const body = (
    <>
      {soonText(d.depart, q.day)}
      {d.stop && d.stop !== stop && <small>{d.stop}</small>}
    </>
  );
  if (!d.o) return <span class={cls}>{body}</span>;
  const o = d.o;
  return (
    <button
      type="button"
      class={cls}
      title={o.slower ? t('arrivesLater') : undefined}
      onClick={(e) => {
        e.stopPropagation();
        openDetail(o, q);
      }}
    >
      {body}
    </button>
  );
}

export function JourneyCard({ card }: { card: Card }) {
  const el = useRef<HTMLDivElement>(null);
  // asked to come into view (results.reveal): scrolled to within the list only as far as needed, with a flash so the
  // eye finds it; after the sheet's own scroll reset, once it has its size
  useSignalEffect(() => {
    const r = results.reveal.value;
    if (!r || r.idx !== card.idx) return;
    const t = setTimeout(() => {
      el.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el.current?.animate(
        [
          { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, var(--surface))', offset: 0 },
          { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, var(--surface))', offset: 0.3 },
          { backgroundColor: 'var(--surface)', offset: 1 },
        ],
        { duration: 900, easing: 'ease-out' },
      );
    }, 60);
    return () => clearTimeout(t);
  });
  const { j, q, deps, lines, idx } = card;
  const rides = ridesOf(j.legs);
  const shown = results.altShown.value.has(idx),
    sel = shown && results.altSel.value === idx;
  return (
    <Tappable class={`journey${sel ? ' sel' : ''}`} elRef={el} onClick={() => openDetail(j, q)}>
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
      {rides[0] && (
        // when the first ride leaves its stop and the rides after it (maintainer, 2026-11-08, after Moovit: the vehicle's
        // departures, not when to set out), the stop named once when they share it, else on each chip
        <div class="opts">
          <span class="muted">{t('departsFrom', { stop: rides[0].from?.name || '' })}</span>
          {deps.map((d) => (
            <DepChip key={d.trip} d={d} j={j} q={q} stop={rides[0].from?.name || ''} />
          ))}
        </div>
      )}
      {rides.some((l) => l.estimated) && <div class="muted est">{t('estNote')}</div>}
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
    </Tappable>
  );
}
