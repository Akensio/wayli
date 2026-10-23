// The bottom sheet: the handle, the page head (back and a title, on pages over the whole screen), and the
// body with every screen and panel, one shown at a time.
import { Icon } from '../../ui/Icon';
import { t, lang } from '../../i18n';
import * as nav from '../../state/nav';
import * as sheet from '../../state/sheet';
import { PlanScreen } from '../results/PlanScreen';
import { Nearby } from '../pages/Nearby';
import { Saved } from '../pages/Saved';
import { Detail } from '../detail/Detail';
import { StopDetail } from '../pages/StopDetail';
import { TripDetail } from '../pages/TripDetail';
import { LineDetail } from '../pages/LineDetail';
import { StationDetail } from '../pages/StationDetail';
import { TrainTimes } from '../pages/TrainTimes';
import { Chooser } from '../pages/Chooser';
import { Follow } from '../follow/Follow';

export function Sheet() {
  void lang.value;
  const k = nav.key.value, picking = nav.picking.value;
  const show = (id: string) => !picking && k === id;
  return (
    <div class="sheet" id="sheet" data-state={sheet.state.value} hidden={picking}>
      <div class="handle" id="sheetHandle"><span /></div>
      <div class="pagehead"><button type="button" class="iconbtn flat" id="pageBack" aria-label={t('back')} onClick={nav.back}><Icon name="back" class="chev" /></button><h2 id="pageTitle">{nav.pageTitle()}</h2></div>
      <div class="sheet-body" id="sheetBody">
        <section class="screen" id="screen-plan" hidden={!show('screen-plan')}><PlanScreen /></section>
        <section class="screen" id="screen-nearby" hidden={!show('screen-nearby')}><Nearby /></section>
        <section class="screen" id="screen-saved" hidden={!show('screen-saved')}><Saved /></section>
        <div class="detail" id="detail" hidden={!show('detail')}><Detail /></div>
        <div class="detail" id="stopDetail" hidden={!show('stopDetail')}><StopDetail /></div>
        <div class="detail" id="tripDetail" hidden={!show('tripDetail')}><TripDetail /></div>
        <div class="detail" id="lineDetail" hidden={!show('lineDetail')}><LineDetail /></div>
        <div class="detail" id="stationDetail" hidden={!show('stationDetail')}><StationDetail /></div>
        <div class="detail" id="trainTimes" hidden={!show('trainTimes')}><TrainTimes /></div>
        <div class="detail" id="chooser" hidden={!show('chooser')}><Chooser /></div>
        <div class="detail follow" id="follow" hidden={!show('follow')}><Follow /></div>
      </div>
    </div>
  );
}
