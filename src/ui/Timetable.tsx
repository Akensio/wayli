// A line's times at a stop, the way a printed timetable at the stop has them: a row per hour, its minutes after it. The
// times already gone are grey, the next one stands out, the chosen one is filled; the list opens at the hour of the next
// one, a few hours tall and scrolling, or the whole day at a tap on "All day" above it (above, not under: under a box
// that runs past the half-open sheet nobody saw it, 2026-10-25). A tap on a time chooses it (what it means is the
// caller's: the stops' times on a line's page, the arrival on a ride).
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { t } from '../i18n';

export type TimeRow = { trip: number; dep: number; arr?: number | null; estimated?: boolean };
type Props = { rows: TimeRow[]; now: number | null; sel: number | null; onPick: (r: TimeRow) => void; dim?: boolean };

const two = (n: number) => String(n).padStart(2, '0');

export function Timetable({ rows, now, sel, onPick, dim = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const next = now == null ? null : rows.find((r) => r.dep >= now - 30) || null;
  // the hours of the day in order (a night's 24:10 is the next day's 00, after 23)
  const hours: { h: number; rows: TimeRow[] }[] = [];
  for (const r of rows) {
    const h = Math.floor(r.dep / 3600);
    if (!hours.length || hours[hours.length - 1].h !== h) hours.push({ h, rows: [] });
    hours[hours.length - 1].rows.push(r);
  }
  useLayoutEffect(() => {
    const el = box.current, at = el?.querySelector<HTMLElement>('.tt-m.next, .tt-m.sel');
    if (el && at && !full) el.scrollTop = Math.max(0, (at.parentElement!.parentElement as HTMLElement).offsetTop - el.offsetTop - 4);
  }, [rows, next?.trip, full]);
  return (
    <>
    {hours.length > 3 && <div class="tt-bar"><button type="button" class={`tt-more${full ? ' on' : ''}`} aria-expanded={full} onClick={() => setFull(!full)}><Icon name={full ? 'chevronUp' : 'chevronDown'} /> {t(full ? 'ttLess' : 'ttAll')}</button></div>}
    <div class={`timetable${full ? ' full' : ''}${dim ? ' dim' : ''}`} ref={box}>
      {hours.map(({ h, rows: rs }) => (
        <div class="tt-row" key={h}>
          <span class="tt-h">{two(h % 24)}</span>
          <span class="tt-mins">
            {rs.map((r) => (
              <button type="button" key={r.trip} onClick={() => onPick(r)}
                class={`tt-m${now != null && r.dep < now - 30 ? ' past' : ''}${next && r.trip === next.trip ? ' next' : ''}${r.trip === sel ? ' sel' : ''}`}>
                {r.estimated ? '~' : ''}{two(Math.floor(r.dep / 60) % 60)}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
    </>
  );
}
