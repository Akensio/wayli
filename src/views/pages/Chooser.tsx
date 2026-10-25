// The place chooser (home, work, a saved place): a search box with the quick entries, plus my location and
// the map as chips.
import { Icon } from '../../widgets/Icon';
import { t, lang } from '../../lib/i18n';
import * as chooser from '../../state/chooser';
import { SearchField } from '../topbar/SearchField';

export function Chooser() {
  void lang.value;
  const locate = async () => { const p = await chooser.hooks.locate(); if (p) chooser.finish(p); };
  const map = async () => { const p = await chooser.hooks.pickOnMap(); if (p) chooser.finish(p); };
  return (
    <>
      <div class="bar">
        <button type="button" class="ghost" id="chCancel" onClick={() => chooser.finish(null)}>{t('cancel')}</button>
        <h2 id="chTitle">{chooser.title.value}</h2>
      </div>
      <div class="legs">
        <SearchField id="chQ" dropId="chDrop" text={chooser.text} place={chooser.place} placeholder={t('toQ')} onPick={(p) => chooser.finish(p)} onLocate={locate} onMap={map}>
          <span class="icon"><Icon name="search" /></span>
        </SearchField>
        <div class="chips-row"><button type="button" class="chipbtn" id="chLoc" onClick={locate}><Icon name="locate" /> {t('btnLoc')}</button><button type="button" class="chipbtn" id="chMap" onClick={map}><Icon name="map" /> {t('btnMap')}</button></div>
      </div>
    </>
  );
}
