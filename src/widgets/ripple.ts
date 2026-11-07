// Touch feedback: a ripple from the finger on anything tappable (the browser's blue flash is turned off in CSS).
const TAPPABLE =
  'button:not(.handle):not(.maplibregl-ctrl-compass):not(.maplibregl-ctrl-geolocate), [role="button"], .chipbtn, .item.act, .saved-row, .strip-row .txt, .opt';
/** Inside a list that scrolls, the ripple waits: a finger that moves is scrolling, not tapping (a ripple drawn into a
 *  row at the first touch changed the row under the finger, and the scroll had to be started again; customers,
 *  2026-11-07). */
const SCROLLERS = '.dropdown, .sheet-body, .pagebody, .drawer';
const HOLD_MS = 90;
export function installRipple(): void {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button) return;
      const host = (e.target as HTMLElement).closest(TAPPABLE) as HTMLElement | null;
      if (!host || (host as HTMLButtonElement).disabled) return;
      if (host.closest(SCROLLERS)) {
        const x0 = e.clientX,
          y0 = e.clientY;
        let gone = false;
        const off = () => {
          gone = true;
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', off);
          document.removeEventListener('pointercancel', off);
        };
        const onMove = (m: PointerEvent) => {
          if (Math.hypot(m.clientX - x0, m.clientY - y0) > 6) off();
        };
        document.addEventListener('pointermove', onMove, { passive: true });
        document.addEventListener('pointerup', off);
        document.addEventListener('pointercancel', off);
        setTimeout(() => {
          if (!gone) {
            off();
            ripple(host, x0, y0);
          }
        }, HOLD_MS);
        return;
      }
      ripple(host, e.clientX, e.clientY);
    },
    { passive: true },
  );
}
function ripple(host: HTMLElement, clientX: number, clientY: number): void {
  const r = host.getBoundingClientRect(),
    size = Math.max(r.width, r.height) * 2;
  host.classList.add('rippling');
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.cssText = `width:${size}px;height:${size}px;left:${clientX - r.left - size / 2}px;top:${clientY - r.top - size / 2}px`;
  host.appendChild(dot);
  dot.addEventListener(
    'animationend',
    () => {
      dot.remove();
      if (!host.querySelector('.ripple')) host.classList.remove('rippling');
    },
    { once: true },
  );
}
