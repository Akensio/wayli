// The line the collapsed sheet shows: the journey highlighted on the map, with when its first ride leaves; nothing
// without results.
// Only collapsed: once the sheet opens the list says the same (the line folds away, styles/results.css).
import { useEffect } from 'preact/hooks';
import { lang } from '../../common/i18n';
import { TimeRange } from '../../widgets/TimeRange';
import * as results from '../../state/results';
import type { Journey } from '../../trip/journey';
import { dur, soonText } from '../../text/durations';
import { transfersText, lineText } from '../../text/travel';
import { sureness } from '../../text/live';
import { now } from '../../state/clock';
import { ridesOf } from '../../trip/journey';
import * as sheet from '../../state/sheet';
import { revealCard } from '../../controllers/planner';

/** The first ride and when it leaves its stop ("980 · now"), coloured by how sure that is; re-rendered with the clock. */
function FirstRide({ j, day }: { j: Journey; day: string }) {
  void now.value;
  const r = ridesOf(j.legs)[0];
  if (!r) return null;
  return (
    <span class={`leave${sureness(r, day)}`}>
      {lineText(r.line)} · {soonText(r.depart, day)}
    </span>
  );
}
export function PeekLine() {
  void lang.value;
  const c = results.highlighted.value;
  // the collapsed sheet's height follows: measured after the line appears or goes
  useEffect(() => {
    if (sheet.state.value === 'peek') sheet.set('peek');
  }, [!!c]);
  const tap = () => {
    if (c) revealCard(c.idx, true);
    else sheet.set('half');
  };
  return (
    <button type="button" class="peekline" id="peekLine" hidden={!c} onClick={tap}>
      {c && (
        <>
          <TimeRange from={c.j.depart} to={c.j.arrive} />
          <span class="muted">
            {dur(c.j.arrive - c.j.depart)} · {transfersText(c.j.transfers)}
          </span>
          <FirstRide j={c.j} day={c.q.day} />
        </>
      )}
    </button>
  );
}
