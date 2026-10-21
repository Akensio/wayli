// The top bar is the planner. Three looks: the prompt pill at rest (the menu at its start, the app's logo at
// its end), the two rows while editing (origin above destination, a back arrow, the swap between them, the
// option chips and Go under them), and the summary box once a plan is shown (a tap reopens the rows). Entering
// search mode plays a sequence (the styles), leaving plays it back; the keyboard is held until the pill has
// shortened so the two never fight.
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
import { t, lang } from '../../i18n';
import * as search from '../../state/search';
import * as nav from '../../state/nav';
import { SearchField } from './SearchField';
import { WhenPopover, BikePopover, TimeChipInner, BikeChipInner } from './Popovers';

/** The menu's three lines, drawn inline (not from the sprite) so each can move on its own when pressed. */
const MenuGlyph = () => (
  <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path class="l1" d="M4 7h16" /><path class="l2" d="M4 12h16" /><path class="l3" d="M4 17h16" /></svg>
);

export function TopBar() {
  void lang.value;
  const mode = search.mode.value;
  const edit = mode === 'edit', sum = mode === 'summary';
  const opt = search.optOpen.value;
  const barRef = useRef<HTMLDivElement>(null);

  // leaving search mode closes the option popovers and the line search (the rows' play-out is in the state)
  useEffect(() => {
    if (!search.barOpen.value) { search.optOpen.value = ''; search.leaveLineMode(); }
  }, [search.barOpen.value]);
  // the bar's height drives the map controls and the sheet: measured after every change of shape
  useEffect(() => {
    const el = barRef.current; if (!el) return;
    const ro = new ResizeObserver(() => search.hooks.layoutTop());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a tap anywhere else closes an option popover; closing after a change re-plans the trip on show
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (search.optOpen.value && !(e.target as HTMLElement).closest?.('#formBody, #optTime, #optBike')) setOpt(''); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);
  const setOpt = (which: search.OptPanel) => {
    const closing = search.optOpen.value && !which;
    search.optOpen.value = which;
    if (closing && search.optDirty.value) {
      search.optDirty.value = false;
      if (search.hooks.hasResults() && search.from.value && search.to.value && !search.busy.value) search.hooks.plan();
    }
  };
  // a tap on the pill at rest opens search mode first and brings the keyboard once the pill has shortened
  const onToPointerDown = (e: PointerEvent) => {
    if (search.barOpen.value || e.pointerType === 'mouse') return;
    e.preventDefault(); search.openBar();
    setTimeout(() => (document.getElementById('toQ') as HTMLInputElement | null)?.focus(), 330);
  };

  return (
    <div ref={barRef} class={`topbar${edit ? ' two' : ''}${search.leaving.value ? ' leaving' : ''}${opt ? ' open' : ''}`} id="topbar" hidden={nav.picking.value}>
      <div class="pair" id="pair" hidden={sum}>
        <button type="button" class="iconbtn small" id="barBack" hidden={!edit} aria-label={t('back')} onClick={search.back}><Icon name="back" class="chev" /></button>
        <div class="trow origin" id="fromRow" hidden={!edit}>
          <SearchField id="fromQ" dropId="fromDrop" text={search.fromText} place={search.from} onFocus={search.openBar} placeholder={t('fromQ')} onPick={(p) => { (document.getElementById('fromQ') as HTMLInputElement | null)?.blur(); search.chooseFrom(p); }}>
            <span class="tag">{t('tagFrom')}</span>
          </SearchField>
        </div>
        <div class="trow" id="toRow" hidden={sum} onPointerDownCapture={(e) => { if ((e.target as HTMLElement).id === 'toQ') onToPointerDown(e); }} onFocusOut={search.leaveLineMode}>
          <SearchField id="toQ" dropId="toDrop" text={search.toText} place={search.to} onFocus={search.openBar} withUser placeholder={t(search.toPlaceholder.value)} inputMode={search.toInputMode.value} lines
            onPick={(p) => { (document.getElementById('toQ') as HTMLInputElement | null)?.blur(); search.chooseTo(p); }}
            onLine={(r) => { search.toText.value = ''; (document.getElementById('toQ') as HTMLInputElement | null)?.blur(); search.hooks.openLine(r); }}>
            <button type="button" class="userbtn" id="menuBtn" title={t('menu')} aria-label={t('menu')} onClick={() => { (document.getElementById('toQ') as HTMLInputElement | null)?.blur(); search.hooks.openMenu(); }}><MenuGlyph /></button>
            <span class="tag">{t('tagTo')}</span>
            <button type="button" class="applogo" id="appLogo" aria-label="Wayli" onClick={() => (document.getElementById('toQ') as HTMLInputElement | null)?.focus()}><Logo /></button>
          </SearchField>
        </div>
        <button type="button" class="iconbtn small" id="swap" hidden={!edit} title={t('swap')} aria-label={t('swap')} onClick={search.swapPlaces}><Icon name="swap" /></button>
      </div>
      <div class="trow" id="sumRow" hidden={!sum}>
        <div class="sumbox">
          <button type="button" class="sumtxt" id="sumEdit" onClick={() => { search.barOpen.value = true; }}>
            <span class="l1" id="sumTo"><span class="tag">{t('tagTo')}</span>{search.to.value ? search.to.value.name : search.toText.value}</span>
            <span class="l2" id="sumMeta"><span class="tag">{t('tagFrom')}</span>{search.from.value ? search.from.value.name : (search.fromText.value || t('myLoc'))}<span class="sep">·</span><TimeChipInner /><span class="sep">·</span><BikeChipInner /></span>
          </button>
          <button type="button" class="clearbtn" id="sumClear" aria-label={t('clearText')} onClick={search.hooks.clearPlan}><Icon name="close" /></button>
        </div>
      </div>
      <div class="trow opts" id="optRow" hidden={!edit}>
        <button type="button" class={`chipbtn${opt === 'time' ? ' open' : ''}`} id="optTime" onClick={() => setOpt(opt === 'time' ? '' : 'time')}><TimeChipInner /></button>
        <button type="button" class={`chipbtn${opt === 'bike' ? ' open' : ''}`} id="optBike" onClick={() => setOpt(opt === 'bike' ? '' : 'bike')}><BikeChipInner /></button>
        <button type="button" class="primary slim go" id="goBtn" onClick={search.go}>{t('go')}</button>
      </div>
      <div class="optpanel" id="formBody" hidden={!opt}>
        {opt === 'time' && <WhenPopover />}
        {opt === 'bike' && <BikePopover />}
        <button type="button" class="primary slim" id="planBtn" hidden disabled={search.busy.value}>{t('plan')}</button>
      </div>
    </div>
  );
}
