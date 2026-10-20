// The sort order of the results as a chip that opens a small menu: the four orders, the current one checked.
// A choice applies at once and closes it; a tap anywhere else closes it too.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../../ui/Icon';
import { t } from '../../i18n';
import * as results from '../../state/results';
import type { Sort } from '../../state/results';

const label = (s: Sort) => t('sort' + s[0].toUpperCase() + s.slice(1));

export function SortMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const so = results.filters.value.resultSort;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  return (
    <div class="sortwrap" ref={ref}>
      <button type="button" class={`chipbtn${so !== 'depart' ? ' on' : ''}${open ? ' open' : ''}`} id="sortBtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="sliders" /> {label(so)} <Icon name="chevronDown" class="chev" />
      </button>
      {open && (
        <div class="sortmenu" role="menu" id="sortMenu">
          <div class="head">{t('sortBy')}</div>
          {results.SORTS.map((s) => (
            <button type="button" role="menuitemradio" aria-checked={s === so} data-sort={s} onClick={() => { setOpen(false); if (s !== so) results.setFilter({ resultSort: s }); }}>
              <span>{label(s)}</span>{s === so && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
