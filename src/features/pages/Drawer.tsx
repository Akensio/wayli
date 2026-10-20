// The menu drawer under the user button: the screens, the line search, reload, the build.
import { Icon } from '../../ui/Icon';
import { t, lang } from '../../i18n';
import * as app from '../../state/app';
import type { IconName } from '../../ui/icons';

export function Drawer() {
  void lang.value;
  const open = app.drawerOpen.value;
  const Row = ({ icon, label, onClick, screen }: { icon: IconName; label: string; onClick: () => void; screen?: string }) => (
    <button type="button" data-screen={screen} onClick={onClick}><span class="ic"><Icon name={icon} /></span><span>{label}</span></button>
  );
  return (
    <>
      <div class={`backdrop${open ? ' open' : ''}`} id="backdrop" onClick={app.hooks.closeDrawer} />
      <nav class={`drawer${open ? ' open' : ''}`} id="menu" aria-label={t('menu')}>
        <div class="head">
          <div class="who"><span class="avatar"><Icon name="user" /></span><div class="txt"><div class="brand">Wayli</div><div class="sub">{t('menuNote')}</div></div></div>
          <button type="button" class="iconbtn flat" id="menuClose" aria-label={t('close')} onClick={app.hooks.closeDrawer}><Icon name="close" /></button>
        </div>
        <Row icon="route" label={t('tabPlan')} screen="plan" onClick={() => app.hooks.go('plan')} />
        <Row icon="locate" label={t('tabNearby')} screen="nearby" onClick={() => app.hooks.go('nearby')} />
        <button type="button" id="menuLines" onClick={app.hooks.lineSearch}><span class="ic"><Icon name="bus" /></span><span>{t('lineSearch')}</span></button>
        <Row icon="star" label={t('tabSaved')} screen="saved" onClick={() => app.hooks.go('saved')} />
        <Row icon="sliders" label={t('tabMore')} screen="more" onClick={() => app.hooks.go('more')} />
        <button type="button" id="menuReload" onClick={() => location.reload()}><span class="ic"><Icon name="refresh" /></span><span>{t('reload')}</span></button>
        <div class="foot muted" id="drawerVer">{app.version.value}</div>
      </nav>
    </>
  );
}
