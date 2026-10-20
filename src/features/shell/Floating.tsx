// What floats over the map under the bar: the status pill (loading, errors), the offline tag, the resume bar,
// the pick bar while choosing a point, and the live note at the bottom.
import { t, lang } from '../../i18n';
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
export const LiveNote = () => <div class={`livenote${app.liveLag.value ? ' lag' : ''}`} id="liveNote">{app.liveNote.value}</div>;
