// A line's chip, styled by what runs on it: a bus in its operator's colour with its number, a train in navy with
// the train icon, light rail in red with the tram icon, the Carmelit and the cable car in teal with the cabin, a
// shared taxi in yellow, an on-demand line outlined.
import { Icon } from './Icon';
import type { IconName } from './icons';
import { chipColors } from '../journey/colors';
import { lineText } from '../journey/format';

export type LineMode = 'bus' | 'rail' | 'lrt' | 'cable' | 'taxi' | 'flex';
const MODE_ICON: Partial<Record<LineMode, IconName>> = { rail: 'train', lrt: 'tram', cable: 'cable', taxi: 'taxi' };
/** The mode of a GTFS route type, as the worker names it. */
const modeOfType = (type?: number | null): LineMode =>
  (type === 2 ? 'rail' : type === 0 ? 'lrt' : type === 5 || type === 6 || type === 7 ? 'cable' : type === 8 ? 'taxi' : type === 715 ? 'flex' : 'bus');

export function LineChip({ line, routeType, agency, mode = modeOfType(routeType), big = false }: { line: string; routeType?: number | null; agency?: string | null; mode?: LineMode; big?: boolean }) {
  const icon = MODE_ICON[mode];
  const c = chipColors(routeType, agency);
  const style = mode === 'flex' ? { borderColor: c.background, color: c.background } : c;
  return (
    <span class={`chip lchip m-${mode}${big ? ' big' : ''}`} style={style}>
      {icon && <Icon name={icon} />}<bdi>{lineText(line)}</bdi>
    </span>
  );
}
