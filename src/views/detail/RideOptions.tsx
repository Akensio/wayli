// A ride of a journey as a station sees it, for that trip only: every line that goes from where the ride boards straight
// to where it gets off, by departure, as each stands now (RideRows). The ride planned is marked. A few at first, the
// rest of the day at a tap; a row opens its line at the boarding stop with that trip chosen.
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../common/i18n';
import type { TrainRow } from '../../worker/ops.ts';
import { Fold } from '../../widgets/Fold';
import { RideRows } from '../station/RideRows';
import * as liveTimes from '../../controllers/live';

type Props = {
  mine: number | null; // the trip the journey rides
  load: () => Promise<TrainRow[]>;
  day: string;
  counting: boolean; // the ride's day is today and the plan is from now
  onOpen: (trip: number, stop: number) => void;
};
const FIRST = 6;

export function RideOptions({ mine, load, day, counting, onOpen }: Props) {
  const [rows, setRows] = useState<TrainRow[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let gone = false;
    load().then(
      (r) => {
        if (gone) return;
        setRows(r);
        liveTimes.watch(
          'rideOptions',
          r.map((x) => x.trip),
        );
      },
      () => {
        if (!gone) setRows([]);
      },
    );
    return () => {
      gone = true;
      liveTimes.unwatch('rideOptions');
    };
  }, []);
  if (rows === null) return <div class="muted small">{t('loading')}</div>;
  if (!rows.length) return <div class="muted small">{t('noRideOptions')}</div>;
  return (
    <div class="rideopts">
      <RideRows rows={all ? rows : rows.slice(0, FIRST)} day={day} counting={counting} mine={mine} onOpen={onOpen} />
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
