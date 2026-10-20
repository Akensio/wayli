// Stops as rows: name, city and code (and the distance and walk when known), their lines as chips.
// A tap opens the stop; a tap on a chip opens that line.
import { Icon } from '../../ui/Icon';
import { t } from '../../i18n';
import { chipColors } from '../../journey/colors';
import { lineText } from '../../journey/format';
import type { Stop } from '../../state/nearby';

type Props = { stops: Stop[]; withDistance?: boolean; onStop: (stop: number) => void; onLine: (route: number) => void };

export function StopList({ stops, withDistance = false, onStop, onLine }: Props) {
  if (!stops.length) return <div class="empty">{t('favEmptyStops')}</div>;
  return (
    <>
      {stops.map((s) => (
        <div class="stop" key={s.stop} onClick={() => onStop(s.stop)}>
          <div class="name">{s.name}</div>
          <div class="meta">
            {s.city || ''}
            {withDistance && s.distance != null && <> · {s.distance} {t('m')} · <Icon name="walk" /> {Math.max(1, Math.round(s.distance * 1.25 / 1.2 / 60))} {t('min')}</>}
            {s.code ? ` · ${s.code}` : ''}
          </div>
          <div class="chips">
            {(s.lines || []).map((l) => (
              <span class={`chip t${l.type}`} style={chipColors(l.type, l.agency)} onClick={l.route != null ? (e) => { e.stopPropagation(); onLine(+l.route!); } : undefined}>{lineText(l.label)}</span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
