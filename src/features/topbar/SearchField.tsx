// A search box of the bar: the pill with its tag, the typed text, a small x to clear it, and the list under it:
// the quick entries (my location, pick on the map, home, work, recents) while empty, matching stops, places
// and lines while typing. In the line search (`lineKind`) the list holds lines only: those near the rider while
// empty, those matching the number as it is typed. The list ends above the keyboard and scrolls inside itself.
import { useEffect, useRef, useState } from 'preact/hooks';
import { placeName, named } from '../../state/names';
import { useSignal, useSignalEffect } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { t, lang } from '../../i18n';
import { ic } from '../../ui/icons';
import { Icon } from '../../ui/Icon';
import { savedPlaces, recentPlaces } from '../../store.js';
import * as search from '../../state/search';
import * as saved from '../../state/saved';
import type { Place, LineGroup } from '../../state/search';
import { LineChip } from '../../ui/LineChip';
import { agencyName } from '../../journey/agencies';

type Suggestion = { kind: string; name: string; city?: string; platforms?: number; label?: string; approx?: number | null; lat?: number; lon?: number; stops?: number[]; code?: string };
type Props = {
  id: string;
  dropId: string;
  text: Signal<string>;           // what the box shows
  place: Signal<Place | null>;    // the place chosen, cleared by typing
  placeholder: string;
  onFocus?: () => void;           // the bar opens search mode
  inputMode?: '' | 'numeric';
  lines?: boolean;          // line numbers match too (the To box)
  lineKind?: boolean;       // the line search: lines only
  onPick: (p: Place) => void;
  onLine?: (r: any) => void;
  onLocate?: () => void;    // custom "my location" and "pick on the map" (the place chooser), else the planner's own
  onMap?: () => void;
  withUser?: boolean;       // the user button sits at the end (the To pill)
  children?: any;           // what else sits in the pill (the tag, the logo, the user button)
};

/** A chosen suggestion as the planner takes it: a stop as is, a place with its city in the name. */
const fromResult = (g: Suggestion): Place => g.kind === 'stop' ? (g as Place) : { name: g.city && g.kind !== 'city' ? `${g.name}, ${g.city}` : g.name, lat: g.lat, lon: g.lon };

/** The list ends above the keyboard (the visual viewport), so it scrolls inside itself instead of panning the page. */
function fitDrop(el: HTMLElement) {
  const vv = window.visualViewport;
  const bottom = vv ? vv.offsetTop + vv.height : innerHeight;
  const top = el.getBoundingClientRect().top;
  el.style.maxHeight = `${Math.max(120, Math.min(360, bottom - top - 8))}px`;
}

type Rows = { quick: boolean; lines: LineGroup[]; results: Suggestion[]; placesLoaded: boolean; near?: boolean };

/** A line in the list: its chip, where it runs and who runs it, then a row per direction (a tap opens that direction). */
function LineRow({ g, onLine }: { g: LineGroup; onLine: (r: { route: number }) => void }) {
  const rail = g.mode === 'rail';
  return (
    <div class={`lgroup m-${g.mode}`}>
      <button type="button" class="lhead" onClick={() => onLine(g.dirs[0])}>
        <LineChip line={g.line} routeType={g.routeType} agency={g.agency} mode={g.mode} />
        <span class="txt"><bdi>{rail ? g.area.join(' – ') : g.area.join(' – ') || agencyName(g.agency)}</bdi>
          <small>{rail ? t('tripsToday', { n: g.trips }) : agencyName(g.agency)}{g.dist != null ? ' · ' + t('lineAway', { m: g.dist < 100 ? g.dist : Math.round(g.dist / 50) * 50 }) : ''}</small></span>
      </button>
      {g.dirs.map((d) => (
        <button type="button" class="ldir" onClick={() => onLine(d)}>
          <span class="arrow"><Icon name="chevronEnd" class="chev" /></span>
          <span class="txt"><bdi>{t('toward', { headsign: d.headsign })}</bdi><small>{t('tripsToday', { n: d.trips })}</small></span>
        </button>
      ))}
    </div>
  );
}

export function SearchField({ id, dropId, text, place, placeholder, onFocus: onFocusProp, inputMode = '', lines = false, lineKind = false, onPick, onLine, onLocate, onMap, withUser = false, children }: Props) {
  const open = useSignal(false);
  const closing = useSignal(false);   // the list folds away before it hides
  const focused = useSignal(false);
  const [rows, setRows] = useState<Rows | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const focusedAt = useRef(0);
  const seq = useRef(0);
  const timer = useRef(0);
  void lang.value;   // re-render on a language change: the quick entries and labels

  const pick = (p: Place) => { open.value = false; onPick(named(p)); };
  const show = () => { open.value = true; requestAnimationFrame(() => { if (dropRef.current) fitDrop(dropRef.current); }); };
  // the line search's list: the lines matching what is typed, or near the rider while empty
  const lineList = async (q: string) => {
    const my = ++seq.current;
    const found = search.hooks.ttReady() ? await search.hooks.lineGroups(q, search.lineFilter.value).catch(() => []) : [];
    if (my !== seq.current) return;
    setRows({ quick: false, lines: found, results: [], placesLoaded: true, near: !q });
    show();
  };
  const quickMenu = () => {
    if (lineKind) { lineList(''); return; }
    setRows({ quick: true, lines: [], results: [], placesLoaded: true }); show();
  };
  const typed = (q: string) => {
    place.value = null;
    clearTimeout(timer.current);
    if (!q.length) { quickMenu(); return; }
    if (lineKind) { timer.current = window.setTimeout(() => lineList(q), 120); return; }
    if ((q.length < 2 && !(lines && /^\d+$/.test(q))) || !search.hooks.ttReady()) { open.value = false; return; }   // one digit is a whole line number
    timer.current = window.setTimeout(async () => {
      const my = ++seq.current;
      const [found, lineRows] = await Promise.all([search.hooks.search(q), lines && q.length <= 5 ? search.hooks.lineGroups(q, 'all', 3).catch(() => []) : Promise.resolve([])]);
      if (my !== seq.current) return;
      setRows({ quick: false, lines: lineRows, results: found.results, placesLoaded: found.placesLoaded });
      show();
    }, 150);
  };
  // the line search's kind of line changed (the chips under the box): list again for it
  useSignalEffect(() => {
    void search.lineFilter.value;
    if (lineKind && (open.peek() || focused.peek())) lineList(text.peek().trim());
  });

  // a tap elsewhere closes the list, unless that tap is what focused the box (the clear or go button hands focus here)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!open.value) return;
      if (dropRef.current?.contains(target) || target === inputRef.current || (target as HTMLElement).closest?.(`#${id}-x, .keepdrop`)) return;
      if (Date.now() - focusedAt.current > 500) open.value = false;
    };
    document.addEventListener('click', onDoc);
    const refit = () => { if (open.value && dropRef.current) fitDrop(dropRef.current); };
    window.visualViewport?.addEventListener('resize', refit); window.visualViewport?.addEventListener('scroll', refit);
    return () => { document.removeEventListener('click', onDoc); window.visualViewport?.removeEventListener('resize', refit); window.visualViewport?.removeEventListener('scroll', refit); };
  }, []);
  // search mode ending folds the list with it
  useSignalEffect(() => { if (search.leaving.value) open.value = false; });

  // "My location" is a value, not text: the box shows it as a tag while idle, and empties to its placeholder when
  // focused (someone tapping it means to change it); left without typing, it comes back.
  const magic = !!place.value?.transient;
  const onFocus = () => {
    focusedAt.current = Date.now(); focused.value = true;
    onFocusProp?.();
    if (place.value?.transient) text.value = '';
    else inputRef.current?.select();   // the quick entries first, whatever is in the box; typing replaces it
    quickMenu();
  };
  const onBlur = () => setTimeout(() => {
    focused.value = false;
    if (!text.value && place.value?.transient) text.value = place.value.name;
  }, 0);
  // a closing list folds away first; set in the same moment it closes (after a render, it vanished for a frame)
  const wasOpen = useRef(false), foldTimer = useRef(0);
  useSignalEffect(() => {
    const o = open.value;
    if (wasOpen.current && !o) { closing.value = true; clearTimeout(foldTimer.current); foldTimer.current = window.setTimeout(() => { closing.value = false; }, 220); }
    else if (o) { clearTimeout(foldTimer.current); closing.value = false; }
    wasOpen.current = o;
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const first = dropRef.current?.querySelector('button:not(:disabled)') as HTMLButtonElement | null;
    if (open.value && first && text.value.trim()) { first.click(); e.preventDefault(); }
    else if (search.from.value && search.to.value) { search.hooks.plan(); e.preventDefault(); }
  };
  const locate = async () => {
    open.value = false;
    if (onLocate) { onLocate(); return; }
    text.value = t('locating');
    try { onPick(search.myLocation(await search.hooks.getPosition())); } catch { text.value = ''; place.value = null; search.hooks.toast(t('noLocation')); }
  };
  const pickMap = async () => {
    open.value = false; inputRef.current?.blur();
    if (onMap) { onMap(); return; }
    const p = await search.hooks.pickOnMap(search.from.value || search.to.value);
    if (p) onPick(p);
  };
  const savedList = savedPlaces.all() as (Place & { slot: string })[];
  const recent = (recentPlaces.list() as Place[]).filter((r) => !savedPlaces.has(r));
  const xShown = focused.value && !!text.value;

  return (
    <div class={`field search tagged${withUser ? ' withuser' : ''}`}>
      {children}
      <input ref={inputRef} type="text" id={id} placeholder={placeholder} autocomplete="off" enterkeyhint="search" inputMode={inputMode || undefined}
        value={text.value}
        onInput={(e) => { text.value = (e.currentTarget as HTMLInputElement).value; typed(text.value.trim()); }}
        class={magic && !focused.value ? 'magic' : ''} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKey} />
      <button type="button" id={`${id}-x`} class="fieldx" hidden={!xShown} aria-label={t('clearText')}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => { text.value = ''; place.value = null; focusedAt.current = Date.now(); inputRef.current?.focus(); quickMenu(); }}>
        <Icon name="close" />
      </button>
      <div ref={dropRef} class={`dropdown${closing.value ? ' closing' : ''}`} id={dropId} hidden={!open.value && !closing.value}>
        {rows?.quick && <>
          <button type="button" class="quick" onClick={locate}><span class="ic"><Icon name="locate" /></span><span class="txt">{t('myLoc')}</span></button>
          <button type="button" class="quick" onClick={pickMap}><span class="ic"><Icon name="map" /></span><span class="txt">{t('pickTitle')}</span></button>
          {savedList.map((p) => (
            <button type="button" class="quick" onClick={() => pick(p)}>
              <span class="ic"><Icon name={p.slot === 'home' ? 'home' : p.slot === 'work' ? 'work' : 'star'} /></span>
              <span class="txt">{p.slot === 'more' ? placeName(p) : t(p.slot)}<small>{p.slot === 'more' ? '' : placeName(p)}</small></span>
            </button>
          ))}
          {recent.slice(0, 6).map((p) => (
            <button type="button" class="quick" onClick={() => pick(p)}>
              <span class="ic"><Icon name="history" /></span><span class="txt">{placeName(p)}</span>
              <span class="mini" title={t('savePlace')} onClick={(e) => { e.stopPropagation(); savedPlaces.add(p); saved.refresh(); search.hooks.toast(t('saved')); quickMenu(); }}><Icon name="star" /></span>
            </button>
          ))}
        </>}
        {rows && !rows.quick && <>
          {rows.lines.length > 0 && <div class="grp">{rows.near && search.lineFilter.value === 'all' ? t('linesNear') : t('grpLines')}</div>}
          {rows.lines.map((g) => <LineRow key={g.key} g={g} onLine={(r) => { open.value = false; onLine?.(r); }} />)}
          {rows.lines.length > 0 && rows.results.length > 0 && <div class="grp">{t('grpPlaces')}</div>}
          {rows.results.map((g) => {
            const kind = g.kind === 'stop' ? (g.platforms && g.platforms > 1 ? t('platforms', { n: g.platforms }) : t('kindStop'))
              : g.kind === 'poi' ? (g.label || t('kindPoi')) : t('kind' + g.kind[0].toUpperCase() + g.kind.slice(1));
            return (
              <button type="button" onClick={() => pick(fromResult(g))}>
                {g.name}<small>{kind}{g.city ? ' · ' + g.city : ''}{g.approx != null ? ' · ' + t('approxNo', { n: g.approx }) : ''}</small>
              </button>
            );
          })}
          {!rows.results.length && !rows.lines.length && <button type="button" disabled>{lineKind ? (rows.near ? t('linesHint') : t('lineNoMatch')) : rows.placesLoaded ? t('noMatch') : t('placesPending')}</button>}
        </>}
      </div>
    </div>
  );
}
// `ic` stays for callers that build HTML strings
export { ic };
