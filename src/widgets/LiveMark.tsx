// The live mark beside a departure: ⦿ when its vehicle is seen, with how many minutes late (or early) when it is
// not on time, and a ? when the report is old. Green when sure, amber when not.
import { t } from '../lib/i18n';
import { signed, inText } from '../journey/format';

export function LiveMark({ delayMin, stale }: { delayMin?: number | null; stale?: boolean }) {
  return (
    <span class={`live ${stale ? 'unsure' : 'ok'}`}>
      ⦿{delayMin ? ` ${signed(delayMin)}` : ''}
      {stale ? '?' : ''}
    </span>
  );
}

/** The "in" cell of a departures row: the live mark and the countdown when the vehicle is seen, the timetable's
 *  countdown when the list is for now, "passed" once the vehicle went by. One cell for the stop page, the trains
 *  between two stations and a ride's other rides. */
export function InCell({
  live,
  time,
  day,
  counting,
}: {
  live?: { passed: boolean; stale?: boolean; delayMin?: number | null } | null;
  time: number;
  day: string;
  counting: boolean;
}) {
  if (live && live.passed) return <span class="in">{t('livePassed')}</span>;
  return (
    <span class="in">
      {live && (
        <>
          <LiveMark delayMin={live.delayMin} stale={live.stale} />{' '}
        </>
      )}
      {counting || live ? inText(time, day) : ''}
    </span>
  );
}
