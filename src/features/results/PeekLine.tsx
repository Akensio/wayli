// The line the collapsed sheet shows: the journey highlighted on the map, with its countdown; nothing without results.
import { useEffect } from 'preact/hooks';
import { lang } from '../../i18n';
import { fmt } from '../../time';
import * as results from '../../state/results';
import { dur, transfersText } from '../../journey/format';
import { Leave } from './JourneyCard';

export function PeekLine() {
  void lang.value;
  const c = results.highlighted.value;
  // the collapsed sheet's height follows: measured after the line appears or goes
  useEffect(() => { results.hooks.peekChanged(); }, [!!c]);
  const tap = () => { results.hooks.peekTap(); if (c) document.querySelector(`.journey[data-idx="${c.idx}"]`)?.scrollIntoView({ block: 'nearest' }); };
  return (
    <button type="button" class="peekline" id="peekLine" hidden={!c} onClick={tap}>
      {c && <><span class="times">{fmt(c.j.depart)} → {fmt(c.j.arrive)}</span><span class="muted">{dur(c.j.arrive - c.j.depart)} · {transfersText(c.j.transfers)}</span><Leave sec={c.dep} day={c.q.day} /></>}
    </button>
  );
}
