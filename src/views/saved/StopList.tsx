// Stops as rows: name, city and code, their lines as chips.
// A tap opens the stop; a tap on a chip opens that line.
import { t } from '../../lib/i18n';
import type { SavedStop as Stop } from '../../state/store.ts';
import { LineChip } from '../../widgets/LineChip';
import { Tappable } from '../../widgets/Tappable';

type Props = { stops: Stop[]; onStop: (stop: number) => void; onLine: (route: number) => void };

export function StopList({ stops, onStop, onLine }: Props) {
  if (!stops.length) return <div class="empty">{t('favEmptyStops')}</div>;
  return (
    <>
      {stops.map((s) => (
        <Tappable class="stop" key={s.stop} onClick={() => onStop(s.stop)}>
          <div class="name">{s.name}</div>
          <div class="meta">
            {s.city || ''}
            {s.code ? ` · ${s.code}` : ''}
          </div>
          <div class="chips">
            {(s.lines || []).map((l) => (
              <LineChip
                line={l.label}
                routeType={l.type}
                agency={l.agency}
                onClick={
                  l.route != null
                    ? (e) => {
                        e.stopPropagation();
                        onLine(+l.route!);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </Tappable>
      ))}
    </>
  );
}
