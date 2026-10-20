// Stops near the rider, with a refresh; the map shows them with a ring.
import { t, lang } from '../../i18n';
import * as nearby from '../../state/nearby';
import { StopList } from './StopList';

export function Nearby() {
  void lang.value;
  const st = nearby.status.value;
  return (
    <>
      <div class="row" style="margin-bottom:8px">
        <h2 class="sec" style="margin:0">{t('nearbyTitle')}</h2>
        <span class="spacer" style="flex:1" />
        <button type="button" class="ghost" id="nearbyRefresh" onClick={() => nearby.hooks.load()}>{t('refresh')}</button>
      </div>
      <div id="nearbyList" class="stops-list">
        {st === 'idle' ? <div class="empty">{t('nearbyEmpty')}</div>
          : st === 'locating' ? <div class="empty">{t('locating')}</div>
          : st === 'noLocation' ? <div class="empty">{t('noLocation')}</div>
          : <StopList stops={nearby.stops.value} withDistance onStop={nearby.hooks.openStop} onLine={nearby.hooks.openLine} />}
      </div>
    </>
  );
}
