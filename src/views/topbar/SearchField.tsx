// A search box of the bar: the pill with its tag, the typed text, a small x to clear it, and the list under it:
// the quick entries (my location, pick on the map, home, work, recents) while empty, matching stops, places
// and lines while typing. In the line search (`kind` line) the list holds lines only, in the stop search stops only:
// while empty the ones opened lately (of the kind the chips choose) and those near the rider, those matching as it is typed. The list ends above the keyboard and scrolls inside itself.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { placeName, named } from '../../state/names';
import { useSignal, useSignalEffect } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { t, lang } from '../../lib/i18n';
import { modeIcon } from '../../widgets/icons';
import { Icon } from '../../widgets/Icon';
import type { IconName } from '../../widgets/icons';
import { savedPlaces, recentPlaces, recentViews } from '../../state/store.ts';
import * as search from '../../state/search';
import type { Place, LineGroup, StopGroup } from '../../state/search';
import { LineChip } from '../../widgets/LineChip';
import { agencyName } from '../../journey/agencies';
import { distText } from '../../journey/format';
import { FromTo } from '../../widgets/FromTo';
import type { View } from '../../state/results';
import * as data from '../../state/data';
import { getPosition } from '../../state/position';
import { toast } from '../../widgets/toast';
import { pickOnMap } from '../../map/index';
import { openRecent, findPlaces, findLineGroups, findStopGroups, planFromBar } from '../../controllers/planner';

type Suggestion = {
  kind: string;
  name: string;
  city?: string;
  platforms?: number;
  label?: string | null;
  approx?: number | null;
  lat?: number;
  lon?: number;
  stops?: number[];
  code?: string;
};
type Props = {
  id: string;
  dropId: string;
  text: Signal<string>; // what the box shows
  place: Signal<Place | null>; // the place chosen, cleared by typing
  placeholder: string;
  onFocus?: () => void; // the bar opens search mode
  inputMode?: '' | 'numeric';
  lines?: boolean; // line numbers match too (the To box)
  kind?: search.Kind; // what the bar searches for: a trip (places, stops, lines), a line, a stop
  onPick: (p: Place) => void;
  onStop?: (g: StopGroup) => void;
  stationSide?: 'from' | 'to'; // a box of the train timetable: stations only; the To box lists those reachable from the From one
  onLine?: (r: any) => void;
  onLocate?: () => void; // custom "my location" and "pick on the map" (the place chooser), else the planner's own
  onMap?: () => void;
  withUser?: boolean; // the user button sits at the end (the To pill)
  inBar?: boolean; // the list hangs from the top bar itself, not from this box's row: the bar's rows glide when
  // the search kind changes (widgets/flip), and a moving row would carry its fixed list along
  children?: any; // what else sits in the pill (the tag, the logo, the user button)
};

/** A chosen suggestion as the planner takes it: a stop as is, a place with its city in the name. */
const fromResult = (g: Suggestion): Place =>
  g.kind === 'stop'
    ? (g as Place)
    : { name: g.city && g.kind !== 'city' ? `${g.name}, ${g.city}` : g.name, lat: g.lat, lon: g.lon };

/** The list ends above the keyboard (the visual viewport), so it scrolls inside itself instead of panning the page. */
function fitDrop(el: HTMLElement) {
  const vv = window.visualViewport;
  const bottom = vv ? vv.offsetTop + vv.height : innerHeight;
  // the bar's list may be gliding to the bar's new height: where it ends up, not where it is
  const barTop = el.parentElement?.classList.contains('topbar')
    ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h'))
    : NaN;
  const top = Number.isFinite(barTop) ? barTop : el.getBoundingClientRect().top;
  el.style.maxHeight = `${Math.max(120, Math.min(360, bottom - top - 8))}px`;
}

type Rows = {
  quick: boolean;
  lines: LineGroup[];
  results: Suggestion[];
  placesLoaded: boolean;
  near?: boolean;
  stops?: StopGroup[];
  recent?: View[];
};
const STOP_ICON = { bus: 'bus', rail: 'train', lrt: 'tram' } as const;

/** A stop in the list: what stops there, its name, where, the number on its sign, how far; a bus stop's lines. */
function StopRow({ g, onStop }: { g: StopGroup; onStop: (g: StopGroup) => void }) {
  return (
    <button type="button" class={`stoprow m-${g.mode}`} onClick={() => onStop(g)}>
      <span class="sic">
        <Icon name={STOP_ICON[g.mode]} />
      </span>
      <span class="txt">
        <bdi>{g.name}</bdi>
        <small>{[g.city, g.code, g.dist != null ? distText(g.dist) : ''].filter(Boolean).join(' · ')}</small>
        {g.lines.length > 0 && (
          <span class="slines">
            {g.lines.slice(0, 6).map((l) => (
              <LineChip line={l.label} routeType={l.type} agency={l.agency} />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

/** A saved place's icon by its slot: home, work, or a star for the rest. */
function slotIcon(slot: string): IconName {
  if (slot === 'home') return 'home';
  if (slot === 'work') return 'work';
  return 'star';
}
/** The heading over the stops found: the stations (all, or the light rail's) or the stops near when nothing was typed,
 *  "stops" for a search. */
function stopsGroupTitle(near: boolean): string {
  if (!near) return t('grpStops');
  if (search.stopFilter.value === 'rail') return t('stationsAll');
  if (search.stopFilter.value === 'lrt') return t('stationsLrt');
  return t('stopsNear');
}
/** What kind of place a result is, as its small print: a stop (with its platforms), a named place, or the kind's name. */
function resultKind(g: { kind: string; platforms?: number | null; label?: string | null }): string {
  if (g.kind === 'stop') return g.platforms && g.platforms > 1 ? t('platforms', { n: g.platforms }) : t('kindStop');
  if (g.kind === 'poi') return g.label || t('kindPoi');
  return t('kind' + g.kind[0].toUpperCase() + g.kind.slice(1));
}
/** The line under an empty list: a hint before typing, "no match" after, or that the address book is still loading. */
function emptyHint(rows: { near?: boolean; placesLoaded?: boolean }, lineKind: boolean, stopKind: boolean): string {
  if (lineKind) return rows.near ? t('linesHint') : t('lineNoMatch');
  if (stopKind) return rows.near ? t('stopsHint') : t('noMatch');
  return rows.placesLoaded ? t('noMatch') : t('placesPending');
}
/** What a recent row says beside its icon: where a line goes, the two stations, a stop with its city and code, a station. */
function recentText(v: View) {
  if (v.type === 'line')
    return (
      <>
        <bdi>{t('toward', { headsign: v.headsign })}</bdi>
        <small>{agencyName(v.agency)}</small>
      </>
    );
  if (v.type === 'trains') return <FromTo from={v.from.name} to={v.to.name} />;
  if (v.type === 'stop')
    return (
      <>
        <bdi>{v.name}</bdi>
        <small>{[v.city, v.code].filter(Boolean).join(' · ')}</small>
      </>
    );
  if (v.type === 'station') return <bdi>{v.name}</bdi>;
  return null;
}
/** Something opened lately: a line (its chip, where it goes), a stop, a station, or the trains between two stations. */
function RecentRow({ v, onOpen }: { v: View; onOpen: (v: View) => void }) {
  const icon: IconName = v.type === 'station' || v.type === 'trains' ? modeIcon(v.mode || 'rail') : 'pin';
  return (
    <button type="button" class="quick recentrow" onClick={() => onOpen(v)}>
      {v.type === 'line' ? (
        <LineChip
          line={v.line}
          routeType={v.routeType}
          agency={v.agency}
          mode={v.mode as LineGroup['mode'] | undefined}
        />
      ) : (
        <span class="ic">
          <Icon name={icon} />
        </span>
      )}
      <span class="txt">{recentText(v)}</span>
    </button>
  );
}

/** A line in the list: its chip, where it runs and who runs it, then a row per direction (a tap opens that direction). */
function LineRow({ g, onLine }: { g: LineGroup; onLine: (r: { route: number }) => void }) {
  const rail = g.mode === 'rail';
  return (
    <div class={`lgroup m-${g.mode}`}>
      <button type="button" class="lhead" onClick={() => onLine(g.dirs[0])}>
        <LineChip line={g.line} routeType={g.routeType} agency={g.agency} mode={g.mode} />
        <span class="txt">
          <bdi>{rail ? g.area.join(' – ') : g.area.join(' – ') || agencyName(g.agency)}</bdi>
          <small>
            {rail ? t('tripsToday', { n: g.trips }) : agencyName(g.agency)}
            {g.estimated ? ' · ' + t('estShort') : ''}
            {g.dist != null ? ' · ' + t('lineAway', { d: distText(g.dist) }) : ''}
          </small>
        </span>
      </button>
      {g.dirs.map((d) => (
        <button type="button" class="ldir" onClick={() => onLine(d)}>
          <span class="arrow">
            <Icon name="chevronEnd" class="chev" />
          </span>
          <span class="txt">
            <bdi>{t('toward', { headsign: d.headsign })}</bdi>
            <small>{t('tripsToday', { n: d.trips })}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  id,
  dropId,
  text,
  place,
  placeholder,
  onFocus: onFocusProp,
  inputMode = '',
  lines = false,
  kind = 'trip',
  stationSide,
  onPick,
  onStop,
  onLine,
  onLocate,
  onMap,
  withUser = false,
  inBar = false,
  children,
}: Props) {
  const lineKind = kind === 'line',
    stopKind = kind === 'stop';
  const open = useSignal(false);
  const closing = useSignal(false); // the list folds away before it hides
  const focused = useSignal(false);
  const [rows, setRowsNow] = useState<Rows | null>(null);
  // a switch of search kind: the old rows stay, dimmed, until the new ones come, which then fade in (one change, not two)
  const [swap, setSwap] = useState(0),
    stale = useSignal(false);
  const setRows = (r: Rows) => {
    if (stale.peek()) {
      stale.value = false;
      setSwap((n) => n + 1);
    }
    setRowsNow(r);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropHost, setDropHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (inBar) setDropHost(inputRef.current?.closest<HTMLElement>('.topbar') || null);
  }, [inBar]);
  const dropRef = useRef<HTMLDivElement>(null);
  const focusedAt = useRef(0);
  const seq = useRef(0);
  const timer = useRef(0);
  void lang.value; // re-render on a language change: the quick entries and labels

  const pick = (p: Place) => {
    open.value = false;
    onPick(named(p));
  };
  const show = () => {
    open.value = true;
    requestAnimationFrame(() => {
      if (dropRef.current) fitDrop(dropRef.current);
    });
  };
  // what was opened lately, of the kind the chips choose (the To box of the train timetable lists only where trains go)
  const recentFor = (): View[] => {
    const vs = recentViews.list();
    if (lineKind) {
      const f = search.lineFilter.value;
      return vs.filter((v) => v.type === 'line' && (f === 'all' || (v.mode || 'bus') === f)).slice(0, 4);
    }
    if (stationSide === 'to') return [];
    const f = stationSide ? search.pairMode.value : search.stopFilter.value;
    return vs
      .filter((v) => {
        if (v.type === 'stop') return f === 'all' || f === 'bus';
        if (v.type === 'station' || v.type === 'trains') return f === 'all' || f === (v.mode || 'rail');
        return false;
      })
      .slice(0, 4);
  };
  const pickRecent = (v: View) => {
    open.value = false;
    inputRef.current?.blur();
    openRecent(v);
  };
  // the line search's list: the lines matching what is typed, or near the rider while empty
  const lineList = async (q: string) => {
    const my = ++seq.current;
    const found = data.ttReady.value ? await findLineGroups(q, search.lineFilter.value).catch(() => []) : [];
    if (my !== seq.current) return;
    setRows({ quick: false, lines: found, results: [], placesLoaded: true, near: !q, recent: q ? [] : recentFor() });
    show();
  };
  // the stop search's list: the stops matching the name or sign number, or near the rider (every station for trains)
  const stopList = async (q: string) => {
    const my = ++seq.current;
    const from = stationSide === 'to' ? search.stFrom.value?.stops : undefined;
    const found = data.ttReady.value
      ? await findStopGroups(q, stationSide ? search.pairMode.value : search.stopFilter.value, from).catch(() => [])
      : [];
    if (my !== seq.current) return;
    setRows({
      quick: false,
      lines: [],
      results: [],
      placesLoaded: true,
      near: !q,
      stops: found,
      recent: q ? [] : recentFor(),
    });
    show();
  };
  const quickMenu = () => {
    if (lineKind) {
      lineList('');
      return;
    }
    if (stopKind) {
      stopList('');
      return;
    }
    setRows({ quick: true, lines: [], results: [], placesLoaded: true });
    show();
  };
  const typed = (q: string) => {
    place.value = null;
    clearTimeout(timer.current);
    if (!q.length) {
      quickMenu();
      return;
    }
    if (lineKind) {
      timer.current = window.setTimeout(() => lineList(q), 120);
      return;
    }
    if (stopKind) {
      timer.current = window.setTimeout(() => stopList(q), 150);
      return;
    }
    if ((q.length < 2 && !(lines && /^\d+$/.test(q))) || !data.ttReady.value) {
      open.value = false;
      return;
    } // one digit is a whole line number
    timer.current = window.setTimeout(async () => {
      const my = ++seq.current;
      const [found, lineRows] = await Promise.all([
        findPlaces(q),
        lines && q.length <= 5 ? findLineGroups(q, 'all', 3).catch(() => []) : Promise.resolve([]),
      ]);
      if (my !== seq.current) return;
      setRows({ quick: false, lines: lineRows, results: found.results, placesLoaded: found.placesLoaded });
      show();
    }, 150);
  };
  // what the bar searches for changed: a list that was open follows at once (the switch keeps the keyboard as it was,
  // up or down); a box whose row the new kind hides closes its list
  useEffect(() => {
    if (!focused.peek() && !open.peek()) return;
    if (!inputRef.current?.getClientRects().length) {
      open.value = false;
      return;
    }
    if (open.peek()) stale.value = true;
    const q = text.peek().trim();
    if (q) typed(q);
    else quickMenu();
  }, [kind, stationSide]);
  // back (controllers/shell.ts) takes the keyboard first, then the list: the bar's boxes say which they have
  useSignalEffect(() => {
    if (!inBar) return;
    const o = open.value,
      f = focused.value;
    if (f) search.typing.value = id;
    else if (search.typing.peek() === id) search.typing.value = '';
    if (o) search.listing.value = id;
    else if (search.listing.peek() === id) search.listing.value = '';
  });
  useEffect(() => {
    if (!inBar) return;
    search.boxes.set(id, {
      blur: () => inputRef.current?.blur(),
      closeList: () => {
        open.value = false;
        inputRef.current?.blur();
      },
    });
    return () => {
      search.boxes.delete(id);
    };
  }, []);
  // the line search's kind of line changed (the chips under the box): list again for it
  useSignalEffect(() => {
    void search.lineFilter.value;
    void search.stopFilter.value;
    if (lineKind && (open.peek() || focused.peek())) lineList(text.peek().trim());
    if (stopKind && (open.peek() || focused.peek())) stopList(text.peek().trim());
  });

  // a tap elsewhere closes the list, unless that tap is what focused the box (the clear or go button hands focus here)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!open.value) return;
      if (
        dropRef.current?.contains(target) ||
        target === inputRef.current ||
        (target as HTMLElement).closest?.(`#${id}-x, .keepdrop`)
      )
        return;
      if (Date.now() - focusedAt.current > 500) open.value = false;
    };
    document.addEventListener('click', onDoc);
    // the keyboard put away by the phone itself (its own back, its hide key): the box lets go of its focus, so the
    // next back is the list's
    let tallest = window.visualViewport?.height || innerHeight,
      keysUp = false;
    const refit = () => {
      if (open.value && dropRef.current) fitDrop(dropRef.current);
      const vv = window.visualViewport;
      if (!vv) return;
      tallest = Math.max(tallest, vv.height);
      const up = vv.height < tallest - 120;
      if (keysUp && !up && document.activeElement === inputRef.current) inputRef.current?.blur();
      keysUp = up;
    };
    window.visualViewport?.addEventListener('resize', refit);
    window.visualViewport?.addEventListener('scroll', refit);
    return () => {
      document.removeEventListener('click', onDoc);
      window.visualViewport?.removeEventListener('resize', refit);
      window.visualViewport?.removeEventListener('scroll', refit);
    };
  }, []);
  // search mode ending folds the list with it
  useSignalEffect(() => {
    if (search.leaving.value) open.value = false;
  });

  // "My location" is a value, not text: the box shows it as a tag while idle, and empties to its placeholder when
  // focused (someone tapping it means to change it); left without typing, it comes back.
  const magic = !!place.value?.transient;
  const onFocus = () => {
    focusedAt.current = Date.now();
    focused.value = true;
    onFocusProp?.();
    if (place.value?.transient) text.value = '';
    else {
      // the caret at the end of what is there (after the tap has placed it), the text not selected (Gadi)
      const el = inputRef.current;
      if (el)
        setTimeout(() => {
          if (document.activeElement === el) {
            const n = el.value.length;
            el.setSelectionRange(n, n);
          }
        }, 0);
    }
    quickMenu();
  };
  const onBlur = () =>
    setTimeout(() => {
      focused.value = false;
      if (!text.value && place.value?.transient) text.value = place.value.name;
    }, 0);
  // a closing list folds away first; set in the same moment it closes (after a render, it vanished for a frame)
  const wasOpen = useRef(false),
    foldTimer = useRef(0);
  useSignalEffect(() => {
    const o = open.value;
    if (wasOpen.current && !o) {
      closing.value = true;
      clearTimeout(foldTimer.current);
      foldTimer.current = window.setTimeout(() => {
        closing.value = false;
      }, 220);
    } else if (o) {
      clearTimeout(foldTimer.current);
      closing.value = false;
    }
    wasOpen.current = o;
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const first = dropRef.current?.querySelector('button:not(:disabled)') as HTMLButtonElement | null;
    if (open.value && first && text.value.trim()) {
      first.click();
      e.preventDefault();
    } else if (search.from.value && search.to.value) {
      planFromBar();
      e.preventDefault();
    }
  };
  const locate = async () => {
    open.value = false;
    if (onLocate) {
      onLocate();
      return;
    }
    text.value = t('locating');
    try {
      onPick(search.myLocation(await getPosition()));
    } catch {
      text.value = '';
      place.value = null;
      toast(t('noLocation'));
    }
  };
  const pickMap = async () => {
    open.value = false;
    inputRef.current?.blur();
    if (onMap) {
      onMap();
      return;
    }
    const p = await pickOnMap(search.from.value || search.to.value);
    if (p) onPick(p);
  };
  const savedList = savedPlaces.all();
  const recent = recentPlaces.list().filter((r) => !savedPlaces.has(r));
  const xShown = focused.value && !!text.value;
  const drop = (
    <div
      ref={dropRef}
      class={`dropdown${closing.value ? ' closing' : ''}${stale.value ? ' stale' : ''}`}
      id={dropId}
      hidden={!open.value && !closing.value}
    >
      <div class="dropbody" key={swap} data-swapped={swap > 0 ? '' : undefined}>
        {rows?.quick && (
          <>
            <button type="button" class="quick" onClick={locate}>
              <span class="ic">
                <Icon name="locate" />
              </span>
              <span class="txt">{t('myLoc')}</span>
            </button>
            <button type="button" class="quick" onClick={pickMap}>
              <span class="ic">
                <Icon name="map" />
              </span>
              <span class="txt">{t('pickTitle')}</span>
            </button>
            {savedList.map((p) => (
              <button type="button" class="quick" onClick={() => pick(p)}>
                <span class="ic">
                  <Icon name={slotIcon(p.slot)} />
                </span>
                <span class="txt">
                  {p.slot === 'more' ? placeName(p) : t(p.slot)}
                  <small>{p.slot === 'more' ? '' : placeName(p)}</small>
                </span>
              </button>
            ))}
            {recent.slice(0, 6).map((p) => (
              <button type="button" class="quick" onClick={() => pick(p)}>
                <span class="ic">
                  <Icon name="history" />
                </span>
                <span class="txt">{placeName(p)}</span>
                <span
                  class="mini"
                  title={t('savePlace')}
                  onClick={(e) => {
                    e.stopPropagation();
                    savedPlaces.add(p);
                    toast(t('saved'));
                    quickMenu();
                  }}
                >
                  <Icon name="star" />
                </span>
              </button>
            ))}
          </>
        )}
        {rows && !rows.quick && (
          <>
            {rows.recent && rows.recent.length > 0 && <div class="grp">{t('recentOnly')}</div>}
            {(rows.recent || []).map((v) => (
              <RecentRow v={v} onOpen={pickRecent} />
            ))}
            {rows.lines.length > 0 && (
              <div class="grp">{rows.near && search.lineFilter.value === 'all' ? t('linesNear') : t('grpLines')}</div>
            )}
            {rows.lines.map((g) => (
              <LineRow
                key={g.key}
                g={g}
                onLine={(r) => {
                  open.value = false;
                  onLine?.(r);
                }}
              />
            ))}
            {rows.stops && rows.stops.length > 0 && <div class="grp">{stopsGroupTitle(!!rows.near)}</div>}
            {(rows.stops || []).map((g) => (
              <StopRow
                key={g.key}
                g={g}
                onStop={(x) => {
                  open.value = false;
                  onStop?.(x);
                }}
              />
            ))}
            {rows.lines.length > 0 && rows.results.length > 0 && <div class="grp">{t('grpPlaces')}</div>}
            {rows.results.map((g) => {
              const kind = resultKind(g);
              return (
                <button type="button" onClick={() => pick(fromResult(g))}>
                  {g.name}
                  <small>
                    {kind}
                    {g.city ? ' · ' + g.city : ''}
                    {g.approx != null ? ' · ' + t('approxNo', { n: g.approx }) : ''}
                  </small>
                </button>
              );
            })}
            {!rows.results.length &&
              !rows.lines.length &&
              !(rows.stops && rows.stops.length) &&
              !(rows.recent && rows.recent.length) && (
                <button type="button" disabled>
                  {emptyHint(rows, lineKind, stopKind)}
                </button>
              )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div class={`field search tagged${withUser ? ' withuser' : ''}`}>
      {children}
      {/* a search box, said every way browsers and password managers listen: as a plain text box Chrome on Android offered
          saved passwords over the keyboard (it ignores autocomplete="off" when it guesses at logins) */}
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open.value}
        aria-controls={dropId}
        name={`wayli-${id}`}
        id={id}
        placeholder={placeholder}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore=""
        data-form-type="other"
        enterkeyhint="search"
        inputMode={inputMode || undefined}
        value={text.value}
        onInput={(e) => {
          text.value = (e.currentTarget as HTMLInputElement).value;
          typed(text.value.trim());
        }}
        class={magic && !focused.value ? 'magic' : ''}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKey}
      />
      <button
        type="button"
        id={`${id}-x`}
        class="fieldx"
        hidden={!xShown}
        aria-label={t('clearText')}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          text.value = '';
          place.value = null;
          focusedAt.current = Date.now();
          inputRef.current?.focus();
          quickMenu();
        }}
      >
        <Icon name="close" />
      </button>
      {dropHost ? createPortal(drop, dropHost) : drop}
    </div>
  );
}
// `ic` stays for callers that build HTML strings
