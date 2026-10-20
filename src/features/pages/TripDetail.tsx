// One trip: every stop with its time, the stop it was opened from marked, and where the vehicle is now.
import { useEffect } from 'preact/hooks';
import { Icon } from '../../ui/Icon';
import { t, lang } from '../../i18n';
import { fmt } from '../../time';
import * as trip from '../../state/trip';
import { lineText } from '../../journey/format';

export function TripDetail() {
  void lang.value;
  const ts = trip.ts.value, v = trip.vehicle.value;
  useEffect(() => { if (v) document.querySelector('#tripStops .stopsrow .veh')?.closest('.stopsrow')?.scrollIntoView({ block: 'center' }); }, [v]);
  if (!ts) return null;
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="tripBack" onClick={trip.hooks.close}>{t('back')}</button>
        <h2 id="tripTitle">{t('tripStopsTitle', { line: lineText(ts.line), headsign: ts.headsign })}</h2>
      </div>
      <div class="legs">
        <div class="muted" id="tripMeta">{ts.agency} · {t('stopsCount', { n: ts.stops.length })}{trip.noVehicle.value ? ` · ${t('liveNoVehicle')}` : ''}</div>
        <div id="tripStops">
          {ts.stops.map((s, i) => (
            <div class={`stopsrow${s.stop === trip.hereStop.value ? ' here' : ''}`} data-i={i} key={i} onClick={() => trip.hooks.openStop(s.stop)}>
              <span class="time">{fmt(s.arr)}</span><span>{s.name}</span>
              {v && v.index === i && <span class="veh"><Icon name="bus" /> {t('vehicleHere')}{v.delayMin ? ` (${v.delayMin > 0 ? '+' : ''}${v.delayMin})` : ''}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
