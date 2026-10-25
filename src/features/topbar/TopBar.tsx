// The top bar is the planner. Three looks: the prompt pill at rest (the menu at its start, the app's logo at
// its end), the two rows while editing (origin above destination, a back arrow, the swap between them, the
// option chips and Go under them), and the summary box once a plan is shown (a tap reopens the rows). While
// editing, a switch above the rows chooses what to search for: a trip, a line (one box for its number) or a stop
// (its name or the number on its sign), the last two with chips for the kind of line or stop under the box. Entering
// search mode plays a sequence (the styles), leaving plays it back; the keyboard is held until the pill has
// shortened so the two never fight.
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { placeName } from '../../state/names';
import { Icon } from '../../ui/Icon';
import { Logo } from '../../ui/Logo';
import { t, lang } from '../../i18n';
import * as search from '../../state/search';
import * as nav from '../../state/nav';
import { SearchField } from './SearchField';
import { WhenPopover, BikePopover, TimeChipInner, BikeChipInner } from './Popovers';
import type { IconName } from '../../ui/icons';
import { useFlip } from '../../ui/flip';

const LINE_FILTERS: { f: search.LineFilter; label: string; icon?: IconName }[] = [
  { f: 'all', label: 'fAll' }, { f: 'bus', label: 'fBus', icon: 'bus' }, { f: 'rail', label: 'fRail', icon: 'train' },
  { f: 'lrt', label: 'fLrt', icon: 'tram' }, { f: 'cable', label: 'fCable', icon: 'cable' },
];
const STOP_FILTERS: { f: search.StopFilter; label: string; icon?: IconName }[] = [
  { f: 'all', label: 'fAll' }, { f: 'bus', label: 'fBus', icon: 'bus' }, { f: 'rail', label: 'fRail', icon: 'train' }, { f: 'lrt', label: 'fLrt', icon: 'tram' },
];

/** The menu's three lines, drawn inline (not from the sprite) so each can move on its own when pressed. */
const MenuGlyph = () => (
  <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path class="l1" d="M4 7h16" /><path class="l2" d="M4 12h16" /><path class="l3" d="M4 17h16" /></svg>
);

export function TopBar() {
  void lang.value;
  const mode = search.mode.value;
  const edit = mode === 'edit', sum = mode === 'summary';
  const kind = search.kind.value, pair = search.railPair.value;
  const line = kind !== 'trip';                // the line and stop searches: kind chips under the box
  const one = line && !pair;                   // one box (the train timetable has two: from and to station)
  // switching keeps the keyboard and the list as they were: a box that had the keyboard keeps it (the To box, if the
  // new kind hides the one that had it); with the keyboard down nothing takes the focus, and an open list follows
  const toKind = (k: search.Kind) => {
    const had = document.activeElement as HTMLElement | null, typing = had?.id === 'toQ' || had?.id === 'fromQ';
    search.setKind(k);
    // a station timetable (the stop search opening on trains or the light rail) starts at its From box
    const box = search.railPair.value && !search.stFrom.value ? 'fromQ' : 'toQ';
    if (typing) setTimeout(() => { if (box === 'fromQ' || !had!.getClientRects().length || document.activeElement !== had) (document.getElementById(box) as HTMLInputElement | null)?.focus(); }, 60);
  };
  const filters = kind === 'stop' ? STOP_FILTERS : LINE_FILTERS, filter = kind === 'stop' ? search.stopFilter : search.lineFilter;
  // a filter chip; trains and the light rail are a timetable of two stations each, From first: their stations are not
  // carried from one to the other, and the keyboard moves up to the From box
  const pickFilter = (f: string) => {
    const was = search.railPair.value ? search.pairMode.value : null;
    (filter as { value: string }).value = f;
    const now = search.railPair.value ? search.pairMode.value : null;
    if (was !== now) search.clearStations();
    if (now && !search.stFrom.value && document.activeElement?.id === 'toQ') setTimeout(() => (document.getElementById('fromQ') as HTMLInputElement | null)?.focus(), 60);
  };
  const opt = search.optOpen.value;
  const barRef = useRef<HTMLDivElement>(null), segRef = useRef<HTMLDivElement>(null);
  // switching what the bar searches for animates the rows that move, come and go (ui/flip), whichever the switch
  useFlip(barRef, edit && !search.leaving.value ? `${kind}|${pair}` : null);
  // the switch's highlight slides to the chosen option
  useLayoutEffect(() => {
    const seg = segRef.current, on = seg?.querySelector<HTMLElement>('button.on'), thumb = seg?.querySelector<HTMLElement>('.thumb');
    if (!seg || !on || !thumb) return;
    Object.assign(thumb.style, { width: `${on.offsetWidth}px`, transform: `translateX(${on.offsetLeft}px)` });
  });

  // leaving search mode closes the option popovers (the rows' play-out is in the state); a line or stop search stays one,
  // folded to its own pill
  useEffect(() => {
    if (!search.barOpen.value) search.optOpen.value = '';
  }, [search.barOpen.value]);
  // the bar's height drives the map controls and the sheet: measured after every change of shape
  useEffect(() => {
    const el = barRef.current; if (!el) return;
    const ro = new ResizeObserver(() => search.hooks.layoutTop());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a tap anywhere else closes an option popover, keeping what was set (state/search, setOpt)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (search.optOpen.value && !(e.target as HTMLElement).closest?.('#formBody, #optTime, #optBike')) setOpt(''); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);
  const setOpt = search.setOpt;
  // a tap on the pill at rest opens search mode first and brings the keyboard once the pill has shortened
  const onToPointerDown = (e: PointerEvent) => {
    if (search.barOpen.value || e.pointerType === 'mouse') return;
    e.preventDefault(); search.openBar();
    setTimeout(() => (document.getElementById('toQ') as HTMLInputElement | null)?.focus(), 480);
  };

  return (
    <div ref={barRef} class={`topbar${edit ? ' two' : ''}${one ? ' linekind' : ''}${search.leaving.value ? ' leaving' : ''}${search.settling.value ? ' settle' : ''}${opt ? ' open' : ''}`} id="topbar" hidden={nav.picking.value}>
      {/* the switch and the chips keep the box's focus (pointerdown does not take it): the keyboard stays up */}
      <div class="trow kinds keepdrop" id="kindRow" hidden={!edit} onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
        <div class="kindseg" ref={segRef} role="tablist" aria-label={t('searchKind')}>
          <span class="thumb" aria-hidden="true" />
          <button type="button" role="tab" id="kindTrip" aria-selected={kind === 'trip'} class={kind === 'trip' ? 'on' : ''} onClick={() => toKind('trip')}><Icon name="route" />{t('kindTrip')}</button>
          <button type="button" role="tab" id="kindLine" aria-selected={kind === 'line'} class={kind === 'line' ? 'on' : ''} onClick={() => toKind('line')}><Icon name="bus" />{t('kindLine')}</button>
          <button type="button" role="tab" id="kindStop" aria-selected={kind === 'stop'} class={kind === 'stop' ? 'on' : ''} onClick={() => toKind('stop')}><Icon name="pin" />{t('kindStopSearch')}</button>
        </div>
      </div>
      <div class="pair" id="pair" hidden={sum}>
        <button type="button" class="iconbtn small" id="barBack" hidden={!edit} aria-label={t('back')} onClick={search.back}><Icon name="back" class="chev" /></button>
        <div class="trow origin" id="fromRow" data-flip="from" hidden={!edit || one}>
          <SearchField id="fromQ" dropId="fromDrop" inBar text={pair ? search.stFromText : search.fromText} place={pair ? search.stFrom : search.from} onFocus={search.openBar} placeholder={t(pair ? 'fromStationQ' : 'fromQ')}
            kind={pair ? 'stop' : 'trip'} stationSide={pair ? 'from' : undefined}
            onStop={(g) => { (document.getElementById('fromQ') as HTMLInputElement | null)?.blur(); search.hooks.chooseStation('from', g); }}
            onPick={(p) => { (document.getElementById('fromQ') as HTMLInputElement | null)?.blur(); search.chooseFrom(p); }}>
            <span class="tag">{t('tagFrom')}</span>
          </SearchField>
        </div>
        <div class="trow" id="toRow" data-flip="to" hidden={sum} onPointerDownCapture={(e) => { if ((e.target as HTMLElement).id === 'toQ') onToPointerDown(e); }}>
          <SearchField id="toQ" dropId="toDrop" inBar text={pair ? search.stToText : search.toText} place={pair ? search.stTo : search.to} onFocus={search.openBar} withUser
            placeholder={t(pair ? 'toStationQ' : search.toPlaceholder.value)} inputMode={search.toInputMode.value} lines kind={kind} stationSide={pair ? 'to' : undefined}
            onStop={(g) => { (document.getElementById('toQ') as HTMLInputElement | null)?.blur(); if (pair) search.hooks.chooseStation('to', g); else { search.hooks.openStopGroup(g); search.foldBar(); } }}
            onPick={(p) => { (document.getElementById('toQ') as HTMLInputElement | null)?.blur(); search.chooseTo(p); }}
            onLine={(r) => { if (!line) search.toText.value = ''; (document.getElementById('toQ') as HTMLInputElement | null)?.blur(); search.hooks.openLine(r); search.foldBar(); }}>
            <button type="button" class="userbtn" id="menuBtn" title={t('menu')} aria-label={t('menu')} onClick={() => { (document.getElementById('toQ') as HTMLInputElement | null)?.blur(); search.hooks.openMenu(); }}><MenuGlyph /></button>
            <span class="tag" key={`${kind}${pair}`}>{kind === 'line' ? t('tagLine') : kind === 'stop' && !pair ? t('tagStop') : t('tagTo')}</span>
            {line && !edit
              // folded, the line and stop searches say which they are where the logo sits; its x is the trip search again
              ? <button type="button" class="kindpill" id="kindPill" aria-label={t('backToTrip')} onClick={() => search.setKind('trip')}>
                  <Icon name={kind === 'line' ? 'bus' : pair ? 'train' : 'pin'} />{kind === 'line' ? t('kindLine') : t('kindStopSearch')}<Icon name="close" class="x" /></button>
              : <button type="button" class="applogo" id="appLogo" aria-label="Wayli" onClick={() => (document.getElementById('toQ') as HTMLInputElement | null)?.focus()}><Logo /></button>}
          </SearchField>
        </div>
        <button type="button" class="iconbtn small" id="swap" data-flip="swap" hidden={!edit || one} title={t('swap')} aria-label={t('swap')} onClick={pair ? search.hooks.swapStations : search.swapPlaces}><Icon name="swap" /></button>
      </div>
      <div class="trow" id="sumRow" hidden={!sum}>
        <div class="sumbox">
          <button type="button" class="sumtxt" id="sumEdit" onClick={() => { search.barOpen.value = true; }}>
            <span class="l1" id="sumTo"><span class="tag">{t('tagTo')}</span>{search.to.value ? placeName(search.to.value) : search.toText.value}</span>
            <span class="l2" id="sumMeta"><span class="tag">{t('tagFrom')}</span>{search.from.value ? placeName(search.from.value) : (search.fromText.value || t('myLoc'))}<span class="sep">·</span><TimeChipInner /><span class="sep">·</span><BikeChipInner /></span>
          </button>
          <button type="button" class="clearbtn" id="sumClear" aria-label={t('clearText')} onClick={search.hooks.clearPlan}><Icon name="close" /></button>
        </div>
      </div>
      <div class="trow opts lfilters keepdrop" onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }} id="lineRow" data-flip={`chips-${kind}`} key={kind} hidden={!edit || !line} role="tablist" aria-label={t('lineModes')}>
        {filters.map(({ f, label, icon }, i) => (
          <button type="button" role="tab" aria-selected={filter.value === f} class={`chipbtn${filter.value === f ? ' on' : ''}`} data-f={f} style={{ '--n': i }}
            onClick={() => pickFilter(f)}>{icon && <Icon name={icon} />}{t(label)}</button>
        ))}
      </div>
      <div class="trow opts" id="optRow" data-flip="opts" hidden={!edit || line}>
        <button type="button" class={`chipbtn${opt === 'time' ? ' open' : ''}`} id="optTime" onClick={() => setOpt(opt === 'time' ? '' : 'time')}><TimeChipInner /></button>
        <button type="button" class={`chipbtn${opt === 'bike' ? ' open' : ''}`} id="optBike" onClick={() => setOpt(opt === 'bike' ? '' : 'bike')}><BikeChipInner /></button>
        <button type="button" class="primary slim go" id="goBtn" onClick={search.go}>{t('go')}</button>
      </div>
      <div class="optpanel" id="formBody" hidden={!opt}>
        {opt === 'time' && <WhenPopover />}
        {opt === 'bike' && <BikePopover />}
        <button type="button" class="primary slim" id="optDone" onClick={() => setOpt('')}>{t('done')}</button>
      </div>
    </div>
  );
}
