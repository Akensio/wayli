// A ride of a journey as a station sees it, for that trip only: every line that goes from where the ride boards straight
// to where it gets off, by departure, with live times for the next ones (refreshed every 45 s while open) and when each
// gets there. The ride planned is marked. A few at first, the rest of the day at a tap; a row opens its line at the
// boarding stop with that trip chosen. Trains the same: every train from the station that stops at the other.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../../widgets/Icon';
import { t } from '../../lib/i18n';
import { ShownTime } from '../../widgets/ShownTime';
import { dur, liveClass } from '../../journey/format';
import type { TrainRow, LiveTrain } from '../../state/station';
import { LineChip } from '../../widgets/LineChip';
import { InCell } from '../../widgets/LiveMark';
import { Fold } from '../../widgets/Fold';

type Props = {
  mine: number | null; // the trip the journey rides
  load: () => Promise<TrainRow[]>;
  liveFor: (rows: TrainRow[]) => Promise<Record<string, LiveTrain>>;
  day: string;
  now: number | null; // seconds on the ride's day, when it is today
  onOpen: (trip: number, stop: number) => void;
};
const FIRST = 6;

export function RideOptions({ mine, load, liveFor, day, now, onOpen }: Props) {
  const [rows, setRows] = useState<TrainRow[] | null>(null);
  const [lv, setLv] = useState<Record<string, LiveTrain>>({});
  const [all, setAll] = useState(false);
  useEffect(() => {
    let gone = false,
      timer = 0;
    load()
      .then((r) => {
        if (gone) return;
        setRows(r);
        if (now == null) return;
        const tick = () =>
          liveFor(r)
            .then((x) => {
              if (!gone) setLv((o) => ({ ...o, ...x }));
            })
            .catch(() => {});
        tick();
        timer = window.setInterval(tick, 45000);
      })
      .catch(() => {
        if (!gone) setRows([]);
      });
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, []);
  if (rows === null) return <div class="muted small">{t('loading')}</div>;
  if (!rows.length) return <div class="muted small">{t('noRideOptions')}</div>;
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <div class="rideopts">
      {shown.map((r) => {
        const l = lv[String(r.trip)],
          dep = l ? l.dep : r.dep,
          arr = l ? l.arr : r.arr,
          cls = liveClass(l);
        return (
          <div
            class={`trainrow${l && l.passed ? ' gone' : ''}${r.trip === mine ? ' mine' : ''}`}
            key={r.trip}
            onClick={() => onOpen(r.trip, r.fromStop)}
          >
            <ShownTime planned={r.dep} live={l ? l.dep : null} class={`time${cls}`} />
            <span class="arrow">
              <Icon name="chevronEnd" class="chev" />
            </span>
            <ShownTime planned={r.arr} live={l ? l.arr : null} class={`time${cls}`} />
            <span class="what">
              <span>
                <LineChip line={r.line} routeType={r.routeType} agency={r.agency} /> {dur(arr - dep)}
              </span>
              <small>
                <bdi>{t('toward', { headsign: r.headsign })}</bdi>
              </small>
            </span>
            <InCell live={l} time={dep} day={day} counting={now != null} />
          </div>
        );
      })}
      {rows.length > FIRST && (
        <div class="tt-bar">
          <Fold pill open={all} onClick={() => setAll(!all)}>
            {all ? t('ttLess') : t('ttMore', { n: rows.length - FIRST })}
          </Fold>
        </div>
      )}
    </div>
  );
}
