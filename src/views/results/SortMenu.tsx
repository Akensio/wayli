// The sort order of the results: a chip in the filters that opens a small menu of the four orders, the
// current one checked. The menu is drawn outside the sheet (SortPopover, at the shell's root) so the sheet's
// scrolling never cuts it off; it sits under the chip, or over it when there is no room below. A choice applies
// at once and closes it; a tap anywhere else, a scroll of the list or a resize closes it too.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Icon } from '../../widgets/Icon';
import { t, lang } from '../../lib/i18n';
import * as results from '../../state/results';
import type { Sort } from '../../state/results';

const anchor = signal<DOMRect | null>(null);   // the chip's box while the menu is open
const label = (s: Sort) => t('sort' + s[0].toUpperCase() + s.slice(1));
const close = () => { anchor.value = null; };

export function SortChip() {
  const so = results.filters.value.resultSort, open = !!anchor.value;
  return (
    <button type="button" class={`chipbtn${open ? ' open' : ''}`} id="sortBtn" aria-haspopup="menu" aria-expanded={open}
      onClick={(e) => { anchor.value = open ? null : (e.currentTarget as HTMLElement).getBoundingClientRect(); }}>
      <Icon name="sliders" /> {label(so)} <Icon name="chevronDown" class="chev" />
    </button>
  );
}

const MARGIN = 12, GAP = 6;
export function SortPopover() {
  void lang.value;
  const a = anchor.value;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    if (!a || !ref.current) return;
    const h = ref.current.offsetHeight, w = ref.current.offsetWidth, rtl = document.documentElement.dir === 'rtl';
    const below = innerHeight - a.bottom - GAP >= h + MARGIN;
    const start = rtl ? Math.min(innerWidth - MARGIN, a.right) - w : Math.max(MARGIN, a.left);
    setPos({ left: `${Math.max(MARGIN, Math.min(innerWidth - w - MARGIN, start))}px`, top: `${below ? a.bottom + GAP : Math.max(MARGIN, a.top - GAP - h)}px`, transformOrigin: below ? 'top' : 'bottom' });
  }, [a]);
  useEffect(() => {
    if (!a) return;
    const away = (e: PointerEvent) => { const el = e.target as HTMLElement; if (!ref.current?.contains(el) && !el.closest?.('#sortBtn')) close(); };
    const body = document.getElementById('sheetBody');
    document.addEventListener('pointerdown', away, true); body?.addEventListener('scroll', close); window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', away, true); body?.removeEventListener('scroll', close); window.removeEventListener('resize', close); };
  }, [a]);
  if (!a) return null;
  const so = results.filters.value.resultSort;
  return (
    <div class="sortmenu" role="menu" id="sortMenu" ref={ref} style={{ ...pos, visibility: pos.top ? 'visible' : 'hidden' }}>
      <div class="head">{t('sortBy')}</div>
      {results.SORTS.map((s) => (
        <button type="button" role="menuitemradio" aria-checked={s === so} data-sort={s} onClick={() => { close(); if (s !== so) results.setFilter({ resultSort: s }); }}>
          <span>{label(s)}</span>{s === so && <Icon name="check" />}
        </button>
      ))}
    </div>
  );
}
