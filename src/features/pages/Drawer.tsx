// The menu drawer under the menu button: the screens, the line search, settings, reload, the build. It follows
// a finger swiping it back towards its edge, and closes past a third of its width or on a flick.
import { useRef } from 'preact/hooks';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
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
  const drag = useRef<{ x: number; y: number; t: number; dx: number; on: boolean; id: number } | null>(null);
  // the closing direction: towards the edge the drawer comes from (left in English, right in Hebrew)
  const sign = () => (document.documentElement.dir === 'rtl' ? 1 : -1);
  const follow = (dx: number) => {
    const nav = navRef.current, drop = dropRef.current; if (!nav || !drop) return;
    nav.style.transition = 'none'; nav.style.transform = `translateX(${dx}px)`;
    drop.style.transition = 'none'; drop.style.opacity = String(1 - Math.abs(dx) / nav.offsetWidth);
  };
  const release = () => {
    for (const el of [navRef.current, dropRef.current]) if (el) { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; }
  };
  const onDown = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, on: false, id: e.pointerId }; };
  const onMove = (e: PointerEvent) => {
    const d = drag.current; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }   // a vertical scroll
      if (dx * sign() < 10) return;
      d.on = true; navRef.current?.setPointerCapture(e.pointerId);
    }
    d.dx = sign() > 0 ? Math.max(0, dx) : Math.min(0, dx);
    follow(d.dx);
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d || !d.on) return;
    const w = navRef.current?.offsetWidth || 300, speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t);
    const shut = Math.abs(d.dx) > w / 3 || speed > 0.6;
    // the button under a finger that dragged is not tapped (the click, if any, comes before the timer)
    const nav = navRef.current, swallow = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
    nav?.addEventListener('click', swallow, { capture: true });
    setTimeout(() => nav?.removeEventListener('click', swallow, { capture: true }), 0);
    release();   // from where the finger left it, the drawer goes on (closing) or back (staying)
    if (shut) app.hooks.closeDrawer();
  };
  return (
    <>
      <div ref={dropRef} class={`backdrop${open ? ' open' : ''}`} id="backdrop" onClick={app.hooks.closeDrawer} />
      <nav ref={navRef} class={`drawer${open ? ' open' : ''}`} id="menu" aria-label={t('menu')}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; release(); }}>
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
