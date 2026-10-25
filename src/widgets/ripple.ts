// Touch feedback: a ripple from the finger on anything tappable (the browser's blue flash is turned off in CSS).
const TAPPABLE = 'button:not(.handle):not(.maplibregl-ctrl-compass):not(.maplibregl-ctrl-geolocate), .chipbtn, .journey, .item.act, .drawer > button, .recent, .saved-row, .stop, .gone .txt, .opt';
export function installRipple(): void {
  document.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const host = (e.target as HTMLElement).closest(TAPPABLE) as HTMLElement | null;
    if (!host || (host as HTMLButtonElement).disabled) return;
    const r = host.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
    host.classList.add('rippling');
    const dot = document.createElement('span'); dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    host.appendChild(dot);
    dot.addEventListener('animationend', () => { dot.remove(); if (!host.querySelector('.ripple')) host.classList.remove('rippling'); }, { once: true });
  }, { passive: true });
}
