// The chips of a journey's legs: a line in its operator's colour, a walk or a ride on the bicycle with its minutes.
import { Icon } from '../../ui/Icon';
import { chipColors } from '../../journey/colors';
import { lineText } from '../../journey/format';
import type { Leg } from '../../journey/types';

const LegChip = ({ l, alts }: { l: Leg; alts?: string[] | null }) => l.type === 'ride'
  ? <span class={`chip t${l.routeType}`} style={chipColors(l.routeType, l.agency)}>{alts && alts.length > 1 ? alts.map(lineText).join(' / ') : lineText(l.line)}</span>
  : <span class={`chip ${l.mode === 'bike' ? 'bike' : 'walk'}`}><Icon name={l.mode === 'bike' ? 'bike' : 'walk'} /> {Math.round(l.seconds / 60)}</span>;

/** Every leg with arrows between them; `lines` gives the other lines a group's options use for each leg. */
export const LegChips = ({ legs, lines }: { legs: Leg[]; lines?: string[][] | null }) => (
  <>{legs.map((l, i) => <>{i > 0 && <span class="muted">›</span>}<LegChip l={l} alts={lines ? lines[i] : null} /></>)}</>
);
