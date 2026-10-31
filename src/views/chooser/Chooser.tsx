// The place chooser (home, work, a saved place): a search box with the quick entries, plus my location and
// the map as chips.
import { Icon } from '../../widgets/Icon';
import { t, lang } from '../../lib/i18n';
import * as chooser from '../../state/chooser';
import { SearchField } from '../topbar/SearchField';
import { pickOnMap } from '../../map/index';
import { locate } from '../../controllers/shell';

export function Chooser() {
  void lang.value;
  const myLocation = async () => {
    const p = await locate();
    if (p) chooser.finish(p);
  };
  const fromMap = async () => {
    const p = await pickOnMap(null);
    if (p) chooser.finish(p);
  };
  return (
    <>
      <div class="bar">
        <h2 id="chTitle">{chooser.title.value}</h2>
      </div>
      <div class="legs">
        <SearchField
          id="chQ"
          dropId="chDrop"
          text={chooser.text}
          place={chooser.place}
          placeholder={t('toQ')}
          onPick={(p) => chooser.finish(p)}
          quickActions={{ locate: myLocation, map: fromMap }}
        >
          <span class="icon">
            <Icon name="search" />
          </span>
        </SearchField>
        <div class="chips-row">
          <button type="button" class="chipbtn" id="chLoc" onClick={myLocation}>
            <Icon name="locate" /> {t('myLoc')}
          </button>
          <button type="button" class="chipbtn" id="chMap" onClick={fromMap}>
            <Icon name="map" /> {t('pickTitle')}
          </button>
        </div>
      </div>
    </>
  );
}
