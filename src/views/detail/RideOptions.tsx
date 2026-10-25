// A ride of a journey as a station sees it, for that trip only: every line that goes from where the ride boards straight
// to where it gets off, by departure, with live times for the next ones (refreshed every 45 s while open) and when each
// gets there. The ride planned is marked. A few at first, the rest of the day at a tap; a row opens its line at the
// boarding stop with that trip chosen. Trains the same: every train from the station that stops at the other.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../../widgets/Icon';
import { t } from '../../lib/i18n';
import { fmt } from '../../lib/time';
import { dur, inText } from '../../journey/format';
import type { TrainRow, LiveTrain } from '../../state/station';
import { LineChip } from '../../widgets/LineChip';
import { LiveMark } from '../../widgets/LiveMark';

type Props = {
  mine: number | null;                         // the trip the journey rides
  load: () => Promise<TrainRow[]>;
  liveFor: (rows: TrainRow[]) => Promise<Record<string, LiveTrain>>;
  day: string;
  now: number | null;                          // seconds on the ride's day, when it is today
  onOpen: (trip: number, stop: number) => void;
};
const FIRST = 6;

export function RideOptions({ mine, load, liveFor, day, now, onOpen }: Props) {
  const [rows, setRows] = useState<TrainRow[] | null>(null);
  const [lv, setLv] = useState<Record<string, LiveTrain>>({});
  const [all, setAll] = useState(false);
  useEffect(() => {
    let gone = false, timer = 0;
    load().then((r) => {
      if (gone) return;
      setRows(r);
      if (now == null) return;
      const tick = () => liveFor(r).then((x) => { if (!gone) setLv((o) => ({ ...o, ...x })); }).catch(() => {});
      tick(); timer = window.setInterval(tick, 45000);
    }).catch(() => { if (!gone) setRows([]); });
    return () => { gone = true; clearInterval(timer); };
  }, []);
  if (rows === null) return <div class="muted small">{t('loading')}</div>;
  if (!rows.length) return <div class="muted small">{t('noRideOptions')}</div>;
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <div class="rideopts">
      {shown.map((r) => {
        const l = lv[String(r.trip)], dep = l ? l.dep : r.dep, arr = l ? l.arr : r.arr, cls = l ? (l.stale ? ' unsure' : ' live') : '';
        return (
          <div class={`trainrow${l && l.passed ? ' gone' : ''}${r.trip === mine ? ' mine' : ''}`} key={r.trip} onClick={() => onOpen(r.trip, r.fromStop)}>
            <span class={`time${cls}`}>{fmt(dep)}</span>
            <span class="arrow"><Icon name="chevronEnd" class="chev" /></span>
            <span class={`time${cls}`}>{fmt(arr)}</span>
            <span class="what"><span><LineChip line={r.line} routeType={r.routeType} agency={r.agency} /> {dur(arr - dep)}</span>
              <small><bdi>{t('toward', { headsign: r.headsign })}</bdi></small></span>
            <span class="in">{l && !l.passed ? <><LiveMark delayMin={l.delayMin} stale={l.stale} /> </> : null}{l && l.passed ? t('livePassed') : now != null ? inText(dep, day) : ''}</span>
          </div>
        );
      })}
      {rows.length > FIRST && <div class="tt-bar"><button type="button" class={`tt-more${all ? ' on' : ''}`} onClick={() => setAll(!all)}><Icon name={all ? 'chevronUp' : 'chevronDown'} /> {all ? t('ttLess') : t('ttMore', { n: rows.length - FIRST })}</button></div>}
    </div>
  );
}
