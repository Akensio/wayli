// A time as the rider should read it: the live one where a vehicle is seen, with the planned one struck beside it
// when they differ by a minute or more; the planned one alone otherwise. One look for a stop's departures, a station's
// trains, a ride's other rides and the line page, so a late bus reads "18:07 18:55", never a bare 18:55 (2026-10-29).
import { fmt } from '../lib/time';

type Props = { planned: number; live?: number | null; class?: string; prefix?: string };

export function ShownTime({ planned, live, class: cls = '', prefix = '' }: Props) {
  const shifted = live != null && Math.abs(live - planned) >= 60;
  return <span class={`shown${cls ? ' ' + cls : ''}`}>{shifted && <s>{fmt(planned)}</s>}{prefix}{fmt(live ?? planned)}</span>;
}
