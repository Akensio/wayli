// A line's chip, the one used everywhere a line is named (cards, a trip's rides, a stop's departures and lines, pages,
// search, history, the map's bubbles): styled by what runs on it, a bus in its operator's colour
// with its number, a train in navy with Israel Railways' mark, light rail in red with the tram icon, the Carmelit and
// the cable car in teal with the cabin, a shared taxi in yellow, an on-demand line outlined. (The badges on the map
// are markers, not chips: map/render.ts, with the same inside.)
import { Icon } from './Icon';
import type { IconName } from './icons';
import { chipColors } from '../journey/colors';
import { LineName } from './RailLogo';
import { modeOfType, type Mode } from '../engine/modes.ts';

export type LineMode = Mode; // the same word everywhere, from the engine
const MODE_ICON: Partial<Record<LineMode, IconName>> = { lrt: 'tram', cable: 'cable', taxi: 'taxi' }; // a train: Israel Railways' mark (LineName)

type Line = { line?: string | null; routeType?: number | null; agency?: string | null; mode?: LineMode };
/** The chip's class and colours. */
function look({ routeType, agency, mode = modeOfType(routeType) }: Line, extra = '') {
  const c = chipColors(routeType, agency);
  return {
    mode,
    cls: `chip lchip m-${mode}${extra}`,
    style: mode === 'flex' ? { borderColor: c.background, color: c.background } : c,
  };
}

/** `text` replaces the name (a card's several lines: "285 / 287"); `onClick` makes it a button-like chip (opens the line). */
export function LineChip({
  line,
  routeType,
  agency,
  mode,
  text,
  big = false,
  onClick,
}: Line & { text?: string; big?: boolean; onClick?: (e: MouseEvent) => void }) {
  const l = look({ routeType, agency, mode }, `${big ? ' big' : ''}${onClick ? ' btn' : ''}`),
    icon = MODE_ICON[l.mode];
  return (
    <span class={l.cls} style={l.style} onClick={onClick}>
      {icon && <Icon name={icon} />}
      <LineName line={line} routeType={l.mode === 'rail' ? 2 : routeType} text={text} />
    </span>
  );
}
