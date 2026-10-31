// The screen's layout as the sheet and the map size themselves by (state/sheet layout): the window's height, where the
// top bar ends (it changes shape: the pill, the two rows, a summary), and the phone's bottom inset. Measured here, in
// the view layer that owns the elements, whenever any of them changes.
import * as sheet from '../../state/sheet';

/** Keep `sheet.layout` measured from the bar; returns the cleanup. */
export function watchLayout(bar: HTMLElement): () => void {
  const measure = () => {
    const sab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0;
    const next = { h: innerHeight, barBottom: bar.getBoundingClientRect().bottom, sab };
    const cur = sheet.layout.value;
    if (next.h !== cur.h || next.barBottom !== cur.barBottom || next.sab !== cur.sab) sheet.layout.value = next;
  };
  const ro = new ResizeObserver(measure);
  ro.observe(bar);
  addEventListener('resize', measure);
  measure();
  return () => {
    ro.disconnect();
    removeEventListener('resize', measure);
  };
}
