// What floats over the map under the bar: the status pill (loading, errors), the offline tag, the resume bar,
// the pick bar while choosing a point, and the live note at the bottom.
import { useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { t, lang } from '../../i18n';
import { Icon } from '../../ui/Icon';
import * as app from '../../state/app';
import * as nav from '../../state/nav';
import { ResumeBar } from '../follow/ResumeBar';
import { SortPopover } from '../results/SortMenu';

export function Floating() {
  void lang.value;
  const st = app.status.value;
  return (
    <div class="floating">
      <div class={`status${st && st.error ? ' error' : ''}`} id="status" hidden={!st || st.hidden}>
        <span id="statusText">{st ? st.text : ''}</span>
        <div class="bar" id="statusBar" hidden={!st || st.frac == null}><div style={{ width: st && st.frac != null ? `${Math.round(st.frac * 100)}%` : '0%' }} /></div>
      </div>
      <span class="offline" id="offline" hidden={app.online.value}>{t('offline')}</span>
      <ResumeBar />
    </div>
  );
}
export function PickBar() {
  void lang.value;
  return (
    <div class="pickbar" id="pickbar" hidden={!nav.picking.value}>
      <div class="row"><span class="muted" id="pickHint">{t('pickHint')}</span><span class="spacer" style="flex:1" /><button type="button" class="ghost" id="pickCancel" onClick={app.hooks.pickCancel}>{t('cancel')}</button></div>
    </div>
  );
}
/** Menus drawn over everything (outside the sheet, so its scrolling never cuts them off). */
export const Menus = () => <SortPopover />;
/** The live map's note (what the vehicles shown are, or why there are none), folded into a small button at the map's
 *  corner: a tap opens it and another folds it (it folds by itself after a while); late live data colours the button. */
export function LiveNote() {
  void lang.value;
  const note = app.liveNote.value, lag = app.liveLag.value, open = useSignal(false), timer = useRef(0);
  const toggle = () => {
    open.value = !open.value;
    clearTimeout(timer.current);
    if (open.value) timer.current = window.setTimeout(() => { open.value = false; }, 8000);
  };
  return (
    <div class={`livenote${lag ? ' lag' : ''}${open.value ? ' open' : ''}`} id="liveNote" hidden={!note}>
      <button type="button" class="lnbtn" aria-label={t('liveInfo')} aria-expanded={open.value} onClick={toggle}><Icon name="info" /></button>
      <span class="lntext" id="liveNoteText" onClick={toggle}>{note}</span>
    </div>
  );
}
