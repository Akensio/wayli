// The line the collapsed sheet shows: the journey highlighted on the map, with its countdown; nothing without results.
// Only collapsed: once the sheet opens the list says the same (the line folds away, styles/results.css).
import { useEffect } from 'preact/hooks';
import { lang } from '../../lib/i18n';
import { TimeRange } from '../../widgets/TimeRange';
import * as results from '../../state/results';
import { dur, transfersText } from '../../journey/format';
import { Leave } from './JourneyCard';

export function PeekLine() {
  void lang.value;
  const c = results.highlighted.value;
  // the collapsed sheet's height follows: measured after the line appears or goes
  useEffect(() => {
    results.hooks.peekChanged();
  }, [!!c]);
  const tap = () => {
    if (c) results.hooks.revealCard(c.idx, true);
    else results.hooks.peekTap();
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
