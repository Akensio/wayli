// The line the collapsed sheet shows: the journey highlighted on the map, with its countdown; nothing without results.
// Only collapsed: once the sheet opens the list says the same (the line folds away, styles/results.css).
import { useEffect } from 'preact/hooks';
import { lang } from '../../lib/i18n';
import { TimeRange } from '../../widgets/TimeRange';
import * as results from '../../state/results';
import { dur } from '../../display/time';
import { transfersText } from '../../display/travel';
import { Leave } from './JourneyCard';
import * as sheet from '../../state/sheet';
import { revealCard } from '../../controllers/planner';

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
          <Leave sec={c.j.depart} day={c.q.day} />
        </>
      )}
    </button>
  );
}
