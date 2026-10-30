// Pull to refresh, ours: the browser's needs a page that scrolls, and this one never does. A pull down on the
// bar or on the collapsed sheet shows a circle that follows the finger and turns on past 72 px; letting go then
// reloads (the service worker serves the new build). Works the same in Chrome, Safari and the installed app.
import { ic } from '../../widgets/icons';

const el = document.createElement('div');
el.className = 'ptr';
el.innerHTML = ic('refresh');
let pull = 0,
  armed = false,
  busy = false;
export const pullRefresh = {
  move(pxDown: number): void {
    if (busy) return;
    if (!el.isConnected) document.body.appendChild(el);
    pull = Math.max(0, Math.min(130, pxDown));
    armed = pull >= 72;
    el.classList.add('on');
    el.classList.toggle('armed', armed);
    el.style.transform = `translate(-50%, ${Math.round(pull * 0.7)}px) rotate(${Math.round(pull * 2.5)}deg)`;
    el.style.opacity = String(Math.min(1, pull / 36));
  },
  end(): void {
    if (busy) return;
    if (armed) {
      busy = true;
      el.classList.add('busy');
      el.style.transform = 'translate(-50%, 50px)';
      setTimeout(() => location.reload(), 200);
      return;
    }
    el.classList.remove('on', 'armed');
    el.style.transform = '';
    el.style.opacity = '';
    pull = 0;
  },
  get busy() {
    return busy;
  },
};
/** A pull down on the top bar (not on its lists) is a pull to refresh; a sideways start is left alone. */
export function attachBarPull(bar: HTMLElement): void {
  let on = false,
    mode = 0,
    x0 = 0,
    y0 = 0;
  bar.addEventListener(
    'touchstart',
    (e) => {
      on = false;
      if (e.touches.length !== 1 || (e.target as HTMLElement).closest('.dropdown, select, .optpanel')) return;
      on = true;
      mode = 0;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    },
    { passive: true },
  );
  bar.addEventListener(
    'touchmove',
    (e) => {
      if (!on) return;
      const dy = e.touches[0].clientY - y0,
        dx = e.touches[0].clientX - x0;
      if (!mode) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        if (dy > Math.abs(dx)) mode = 1;
        else {
          on = false;
          return;
        }
      }
      pullRefresh.move(dy - 6);
    },
    { passive: true },
  );
  const end = () => {
    if (!on) return;
    on = false;
    if (mode) pullRefresh.end();
  };
  bar.addEventListener('touchend', end);
  bar.addEventListener('touchcancel', end);
}
