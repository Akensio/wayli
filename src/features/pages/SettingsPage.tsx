// The settings page: a layer of its own over everything, the drawer included. It slides in from the side
// the reading goes towards and back out on close, leaving the drawer open under it as it was.
import { Icon } from '../../ui/Icon';
import { t, lang } from '../../i18n';
import * as app from '../../state/app';
import { Settings } from './Settings';

export function SettingsPage() {
  void lang.value;
  const open = app.settingsOpen.value;
  return (
    <section class={`pagelayer${open ? ' open' : ''}`} id="settingsPage" aria-hidden={!open} aria-label={t('settings')}>
      <div class="pagehead"><button type="button" class="iconbtn flat" id="settingsBack" aria-label={t('back')} onClick={app.hooks.closeSettings}><Icon name="back" class="chev" /></button><h2>{t('settings')}</h2></div>
      <div class="pagebody" id="screen-more"><Settings /></div>
    </section>
  );
}
