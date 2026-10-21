// The menu drawer under the menu button: the screens, the line search, settings, reload, the build. It follows
// a finger swiping it back towards its edge, on it or on the dimmed map beside it (ui/swipeClose).
import { useRef } from 'preact/hooks';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
import { useSwipeClose } from '../../ui/swipeClose';
import { t, lang } from '../../i18n';
import * as app from '../../state/app';
import type { IconName } from '../../ui/icons';

export function Drawer() {
  void lang.value;
  const open = app.drawerOpen.value;
  const Row = ({ icon, label, onClick, screen }: { icon: IconName; label: string; onClick: () => void; screen?: string }) => (
    <button type="button" data-screen={screen} onClick={onClick}><span class="ic"><Icon name={icon} /></span><span>{label}</span></button>
  );
  const navRef = useRef<HTMLElement>(null), dropRef = useRef<HTMLDivElement>(null);
  // swiped back towards its edge (left in English, right in Hebrew), on the drawer or on the dimmed map beside it
  const swipe = useSwipeClose({ layer: navRef, fade: dropRef, dir: () => (document.documentElement.dir === 'rtl' ? 1 : -1), onClose: () => app.hooks.closeDrawer() });
  return (
    <>
      <div ref={dropRef} class={`backdrop${open ? ' open' : ''}`} id="backdrop" onClick={app.hooks.closeDrawer} {...swipe} />
      <nav ref={navRef} class={`drawer${open ? ' open' : ''}`} id="menu" aria-label={t('menu')} {...swipe}>
        <div class="head">
          <div class="who"><span class="avatar"><Logo /></span><div class="txt"><div class="brand">Wayli</div><div class="sub">{t('menuNote')}</div></div></div>
          <button type="button" class="iconbtn flat" id="menuClose" aria-label={t('close')} onClick={app.hooks.closeDrawer}><Icon name="close" /></button>
        </div>
        <Row icon="route" label={t('tabPlan')} screen="plan" onClick={() => app.hooks.go('plan')} />
        <Row icon="locate" label={t('tabNearby')} screen="nearby" onClick={() => app.hooks.go('nearby')} />
        <button type="button" id="menuLines" onClick={app.hooks.lineSearch}><span class="ic"><Icon name="bus" /></span><span>{t('lineSearch')}</span></button>
        <Row icon="star" label={t('tabSaved')} screen="saved" onClick={() => app.hooks.go('saved')} />
        <Row icon="sliders" label={t('tabMore')} screen="more" onClick={app.hooks.openSettings} />
        <button type="button" id="menuReload" onClick={() => location.reload()}><span class="ic"><Icon name="refresh" /></span><span>{t('reload')}</span></button>
        <div class="foot muted" id="drawerVer">{app.version.value}</div>
      </nav>
    </>
  );
}
