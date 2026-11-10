// The live mark beside a departure: ⦿ when its vehicle is seen, with how many minutes late (or early) when it is
// not on time, and a ? when the time is not certain. Green when sure, amber when not.
import { t } from '../common/i18n';
import { signed, type Live } from '../text/live';
import { inText } from '../text/durations';

export function LiveMark({ delayMin, unsure }: { delayMin?: number | null; unsure?: boolean }) {
  return (
    <span class={`live ${unsure ? 'unsure' : 'ok'}`}>
      ⦿{delayMin ? ` ${signed(delayMin)}` : ''}
      {unsure ? '?' : ''}
    </span>
  );
}

/** The "in" cell of a departures row: the live mark (how late against the listed time) and the countdown when the
 *  vehicle is seen, the timetable's countdown when the list is for now, "passed" once the vehicle went by. One cell for
 *  the stop page, the trains between two stations and a ride's other rides. */
export function InCell({
  live,
  time,
  listed,
  day,
  counting,
}: {
  live: Live;
  time: number;
  listed: number;
  day: string;
  counting: boolean;
}) {
  if (live && live.passed) return <span class="in">{t('livePassed')}</span>;
  return (
    <span class="in">
      {live && (
        <>
          <LiveMark delayMin={Math.round((time - listed) / 60)} unsure={!live.sure} />{' '}
        </>
      )}
      {counting || live ? inText(time, day) : ''}
    </span>
  );
}
