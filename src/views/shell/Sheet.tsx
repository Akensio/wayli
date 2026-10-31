// The bottom sheet: the handle row (the grip, and on a panel Back and Close, always an expand/contract toggle: the
// row is above the scrolling body, so they never scroll away), the page head (back and a title, on pages over the
// whole screen), and the body with every screen and panel, one shown at a time. The two screens stay mounted (their
// lists keep their place); a panel is mounted only while shown, so what it held for one stop, line or journey is never
// shown for the next.
import { useEffect, useRef } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
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
import { attachSheetGestures } from './gestures';

export function Sheet() {
  void lang.value;
  const k = nav.key.value,
    picking = nav.picking.value;
  const show = (id: string) => !picking && k === id;
  const panel = !picking && !k.startsWith('screen-'); // a panel over the map: Back is one step, Close is the map
  const full = sheet.state.value === 'full';
  const box = useRef<HTMLDivElement>(null),
    handle = useRef<HTMLDivElement>(null),
    body = useRef<HTMLDivElement>(null);
  useEffect(() => attachSheetGestures(box.current!, handle.current!, body.current!), []);
  // the sheet on the page: its visible height (for the body and the map's buttons), its box, the bar's bottom, and
  // whether it is full or a page; while a finger drags, it follows by a transform (no render per frame)
  useSignalEffect(() => {
    const root = document.documentElement.style,
      st = sheet.state.value;
    root.setProperty('--sheet-h', `${sheet.px(st)}px`);
    root.setProperty('--sheet-box', `${sheet.boxPx()}px`);
    root.setProperty('--top-h', `${Math.round(sheet.layout.value.barBottom + 6)}px`);
    document.body.classList.toggle('sheet-full', st === 'full');
    document.body.classList.toggle('page', nav.page.value);
  });
  useSignalEffect(() => {
    const h = sheet.dragH.value,
      el = box.current,
      b = body.current;
    if (!el || !b) return;
    el.style.transform = h == null ? '' : `translateY(${Math.round(sheet.boxPx() - h)}px)`;
    b.style.height = h == null ? '' : `${Math.max(0, h - 36)}px`;
  });
  // back to the top: when asked (a new list, the sheet opened from collapsed), and on every page that comes up
  useSignalEffect(() => {
    void sheet.scrollReset.value;
    body.current?.scrollTo({ top: 0 });
  });
  useSignalEffect(() => {
    if (nav.page.value) body.current?.scrollTo({ top: 0 });
  });
  return (
    <div class="sheet" id="sheet" data-state={sheet.state.value} hidden={picking} ref={box}>
      <div class="handle" id="sheetHandle" ref={handle}>
        <button
          type="button"
          class="hbtn"
          id="sheetBack"
          hidden={!panel}
          aria-label={t('back')}
          title={t('back')}
          onClick={nav.back}
        >
          <Icon name="back" class="chev" />
        </button>
        <span class="grip" />
        <span class="hend">
          <button
            type="button"
            class="hbtn"
            id="sheetExpand"
            aria-label={t(full ? 'contract' : 'expand')}
            title={t(full ? 'contract' : 'expand')}
            onClick={() => sheet.set(full ? 'half' : 'full')}
          >
            <Icon name={full ? 'chevronDown' : 'chevronUp'} />
          </button>
          <button
            type="button"
            class="hbtn"
            id="sheetClose"
            hidden={!panel}
            aria-label={t('closeAll')}
            title={t('closeAll')}
            onClick={() => nav.closeAll()}
          >
            <Icon name="close" />
          </button>
        </span>
      </div>
      <div class="pagehead">
        <button type="button" class="iconbtn flat" id="pageBack" aria-label={t('back')} onClick={nav.back}>
          <Icon name="back" class="chev" />
        </button>
        <h2 id="pageTitle">{nav.pageTitle()}</h2>
      </div>
      <div class="sheet-body" id="sheetBody" ref={body}>
        <section class="screen" id="screen-plan" hidden={!show('screen-plan')}>
          <PlanScreen />
        </section>
        <section class="screen" id="screen-saved" hidden={!show('screen-saved')}>
          <Saved />
        </section>
        <div class="detail" id="detail" hidden={!show('detail')}>
          {show('detail') && <Detail />}
        </div>
        <div class="detail" id="stopDetail" hidden={!show('stopDetail')}>
          {show('stopDetail') && <StopDetail />}
        </div>
        <div class="detail" id="lineDetail" hidden={!show('lineDetail')}>
          {show('lineDetail') && <LineDetail />}
        </div>
        <div class="detail" id="trainTimes" hidden={!show('trainTimes')}>
          {show('trainTimes') && <TrainTimes />}
        </div>
        <div class="detail" id="chooser" hidden={!show('chooser')}>
          {show('chooser') && <Chooser />}
        </div>
        <div class="detail follow" id="follow" hidden={!show('follow')}>
          {show('follow') && <Follow />}
        </div>
      </div>
    </div>
  );
}
