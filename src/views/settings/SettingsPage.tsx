// The settings page: a layer of its own over everything, the drawer included. It slides in from the side
// the reading goes towards and back out on close, leaving the drawer open under it as it was; a swipe back the way it
// came closes it too (widgets/swipeClose).
import { useRef } from 'preact/hooks';
import { Icon } from '../../widgets/Icon';
import { useSwipeClose } from '../../widgets/swipeClose';
import { t, lang } from '../../lib/i18n';
import { Settings } from './Settings';
import * as nav from '../../state/nav';

export function SettingsPage() {
  void lang.value;
  const open = nav.settingsOpen.value;
  const ref = useRef<HTMLElement>(null);
  // it came in from the right in English (from the left in Hebrew): swiped back that way, it closes
  const swipe = useSwipeClose({
    layer: ref,
    dir: () => (document.documentElement.dir === 'rtl' ? -1 : 1),
    onClose: () => nav.close('settings'),
  });
  return (
    <section
      ref={ref}
      class={`pagelayer${open ? ' open' : ''}`}
      id="settingsPage"
      aria-hidden={!open}
      aria-label={t('settings')}
      {...swipe}
    >
      <div class="pagehead">
        <button
          type="button"
          class="iconbtn flat"
          id="settingsBack"
          aria-label={t('back')}
          onClick={() => nav.close('settings')}
        >
          <Icon name="back" class="chev" />
        </button>
        <h2>{t('settings')}</h2>
      </div>
      <div class="pagebody" id="screen-more">
        <Settings />
      </div>
    </section>
  );
}
