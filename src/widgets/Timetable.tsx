// A line's times at a stop, the way a printed timetable at the stop has them: a row per hour, its minutes after it
// separated by commas (chips read as buttons, not as a timetable, 2026-10-28). The times already gone are grey, the next
// one stands out, the chosen one is filled; the list opens at the hour of the next
// one, a few hours tall and scrolling, or the whole day at a tap on "All day" above it (above, not under: under a box
// that runs past the half-open sheet nobody saw it, 2026-10-25). A tap on a time chooses it (what it means is the
// caller's: the stops' times on a line's page, the arrival on a ride).
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Fold } from './Fold';
import { t } from '../lib/i18n';
import { two } from '../lib/time';

type TimeRow = { trip: number; dep: number; arr?: number | null; estimated?: boolean };
type Props = { rows: TimeRow[]; now: number | null; sel: number | null; onPick: (r: TimeRow) => void; dim?: boolean };

export function Timetable({ rows, now, sel, onPick, dim = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  // closed again for every new set of times (another stop, line or ride): the same component stays mounted, and kept the
  // whole day open across them
  useLayoutEffect(() => {
    setFull(false);
  }, [rows]);
  const next = now == null ? null : rows.find((r) => r.dep >= now - 30) || null;
  // the hours of the day in order (a night's 24:10 is the next day's 00, after 23)
  const hours: { h: number; rows: TimeRow[] }[] = [];
  for (const r of rows) {
    const h = Math.floor(r.dep / 3600);
    if (!hours.length || hours[hours.length - 1].h !== h) hours.push({ h, rows: [] });
    hours[hours.length - 1].rows.push(r);
  }
  useLayoutEffect(() => {
    const el = box.current,
      at = el?.querySelector<HTMLElement>('.tt-m.next, .tt-m.sel');
    if (el && at && !full)
      el.scrollTop = Math.max(0, (at.parentElement!.parentElement as HTMLElement).offsetTop - el.offsetTop - 4);
  }, [rows, next?.trip, full]);
  return (
    <>
      {hours.length > 3 && (
        <div class="tt-bar">
          <Fold pill open={full} onClick={() => setFull(!full)}>
            {t(full ? 'ttLess' : 'ttAll')}
          </Fold>
        </div>
      )}
      <div class={`timetable${full ? ' full' : ''}${dim ? ' dim' : ''}`} ref={box}>
        {hours.map(({ h, rows: rs }) => (
          <div class="tt-row" key={h}>
            <span class="tt-h">{two(h % 24)}</span>
            <span class="tt-mins">
              {rs.map((r, i) => (
                <span key={r.trip}>
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    class={`tt-m${now != null && r.dep < now - 30 ? ' past' : ''}${next && r.trip === next.trip ? ' next' : ''}${r.trip === sel ? ' sel' : ''}`}
                  >
                    {r.estimated ? '~' : ''}
                    {two(Math.floor(r.dep / 60) % 60)}
                  </button>
                  {i < rs.length - 1 ? <span class="tt-sep">,</span> : null}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
