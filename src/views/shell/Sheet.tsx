// The bottom sheet: the handle row (the grip, and on a panel Back and Close, always an expand/contract toggle: the
// row is above the scrolling body, so they never scroll away), the page head (back and a title, on pages over the
// whole screen), and the body with every screen and panel, one shown at a time.
import { Icon } from '../../widgets/Icon';
import { t, lang } from '../../lib/i18n';
import * as nav from '../../state/nav';
import * as sheet from '../../state/sheet';
import { PlanScreen } from '../results/PlanScreen';
import { Saved } from '../saved/Saved';
import { Detail } from '../detail/Detail';
import { StopDetail } from '../stop/StopDetail';
import { LineDetail } from '../line/LineDetail';
import { TrainTimes } from '../station/TrainTimes';
import { Chooser } from '../chooser/Chooser';
import { Follow } from '../follow/Follow';

export function Sheet() {
  void lang.value;
  const k = nav.key.value, picking = nav.picking.value;
  const show = (id: string) => !picking && k === id;
  const panel = !picking && !k.startsWith('screen-');   // a panel over the map: Back is one step, Close is the map
  const full = sheet.state.value === 'full';
  return (
    <div class="sheet" id="sheet" data-state={sheet.state.value} hidden={picking}>
      <div class="handle" id="sheetHandle">
        <button type="button" class="hbtn" id="sheetBack" hidden={!panel} aria-label={t('back')} title={t('back')} onClick={nav.back}><Icon name="back" class="chev" /></button>
        <span class="grip" />
        <span class="hend">
          <button type="button" class="hbtn" id="sheetExpand" aria-label={t(full ? 'contract' : 'expand')} title={t(full ? 'contract' : 'expand')} onClick={() => sheet.set(full ? 'half' : 'full')}><Icon name={full ? 'chevronDown' : 'chevronUp'} /></button>
          <button type="button" class="hbtn" id="sheetClose" hidden={!panel} aria-label={t('closeAll')} title={t('closeAll')} onClick={() => nav.closeAll()}><Icon name="close" /></button>
        </span>
      </div>
      <div class="pagehead"><button type="button" class="iconbtn flat" id="pageBack" aria-label={t('back')} onClick={nav.back}><Icon name="back" class="chev" /></button><h2 id="pageTitle">{nav.pageTitle()}</h2></div>
      <div class="sheet-body" id="sheetBody">
        <section class="screen" id="screen-plan" hidden={!show('screen-plan')}><PlanScreen /></section>
        <section class="screen" id="screen-saved" hidden={!show('screen-saved')}><Saved /></section>
        <div class="detail" id="detail" hidden={!show('detail')}><Detail /></div>
        <div class="detail" id="stopDetail" hidden={!show('stopDetail')}><StopDetail /></div>
        <div class="detail" id="lineDetail" hidden={!show('lineDetail')}><LineDetail /></div>
        <div class="detail" id="trainTimes" hidden={!show('trainTimes')}><TrainTimes /></div>
        <div class="detail" id="chooser" hidden={!show('chooser')}><Chooser /></div>
        <div class="detail follow" id="follow" hidden={!show('follow')}><Follow /></div>
      </div>
    </div>
  );
}
