// A search box: the pill with its tag, the typed text, a small x to clear it, and the list under it. The box owns the
// typing (focus and blur, the keys, the pause before a search), the list's frame (where it hangs, how high it may be,
// its fold and its fade on a change of kind) and its place among the bar's boxes (`search.boxes`). What the list holds
// for what is typed is controllers/suggest's; how its rows look is SuggestionList's.
//
// One box serves every search: the trip's From and To (places; the To box matches line numbers too), the line search,
// the stop search, a side of the train timetable (a stop box with `stationSide`), and the place chooser's box (a trip
// box with its own `quickActions`). The list ends above the keyboard and scrolls inside itself.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { named } from '../../state/names';
import { useSignal, useSignalEffect } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { t, lang } from '../../lib/i18n';
import { Icon } from '../../widgets/Icon';
import * as search from '../../state/search';
import type { Place, StopGroup } from '../../state/search';
import type { View } from '../../state/store.ts';
import * as data from '../../state/data';
import { getPosition } from '../../state/position';
import { toast } from '../../widgets/toast';
import { pickOnMap } from '../../map/index';
import { openRecent, planFromBar } from '../../controllers/planner';
import { suggest, searchesText } from '../../controllers/suggest';
import type { Rows, SuggestCtx } from '../../controllers/suggest';
import { SuggestionList } from './SuggestionList';
import type { Shown, ListActions } from './SuggestionList';

type Props = {
  id: string;
  dropId: string;
  text: Signal<string>; // what the box shows
  place: Signal<Place | null>; // the place chosen, cleared by typing
  placeholder: string;
  inputMode?: '' | 'numeric';
  kind?: search.Kind; // what the box searches for: a trip (places, stops, lines), a line, a stop
  // a stop box that is a side of the train timetable: stations only; the To side lists those reachable from the From
  // one. A refinement of `kind` 'stop' rather than a kind of its own: the bar switches both together from one flag,
  // and a change of either lists again (read only while `kind` is 'stop').
  stationSide?: search.Side;
  lines?: boolean; // line numbers match too (the To box)
  onPick: (p: Place) => void; // a place chosen: a quick entry, a saved or recent place, a result
  onStop?: (g: StopGroup) => void; // a stop chosen (boxes of `kind` 'stop')
  onLine?: (r: { route: number }) => void; // a line's direction chosen (the line search, and the To box's `lines`)
  // "my location" and "pick on the map" done by the caller (the place chooser, which finishes with the place itself),
  // both or neither; without them the box does its own: it fills with the place and passes it to `onPick`
  quickActions?: { locate: () => void; map: () => void };
  // a box of the top bar: focusing it opens search mode, back takes its keyboard and then its list, and the list hangs
  // from the bar itself, not from this box's row (the bar's rows glide when the search kind changes, widgets/flip, and
  // a moving row would carry its fixed list along)
  inBar?: boolean;
  withUser?: boolean; // the user button sits at the end (the To pill)
  children?: ComponentChildren; // what else sits in the pill (the tag, the logo, the user button)
};

/** How long the typing pauses before a box searches for it, by kind (a line number is short and quick to match). */
const PAUSE: Record<search.Kind, number> = { trip: 150, line: 120, stop: 150 };

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

export function SearchField({
  id,
  dropId,
  text,
  place,
  placeholder,
  inputMode = '',
  kind = 'trip',
  stationSide,
  lines = false,
  onPick,
  onStop,
  onLine,
  quickActions,
  inBar = false,
  withUser = false,
  children,
}: Props) {
  const open = useSignal(false);
  const closing = useSignal(false); // the list folds away before it hides
  const focused = useSignal(false);
  const [rows, setRowsNow] = useState<Shown | null>(null);
  // a switch of search kind: the old rows stay, dimmed, until the new ones come, which then fade in (one change, not two)
  const [swap, setSwap] = useState(0),
    stale = useSignal(false);
  const setRows = (r: Shown) => {
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

  // ---- asking for the list
  /** What this box asks with, read when it asks (the chips may have changed while the typing paused). */
  const ctxFor = (): SuggestCtx => {
    if (kind === 'line') return { box: id, lineFilter: search.lineFilter.value };
    if (kind === 'stop')
      return {
        box: id,
        side: stationSide,
        stopMode: stationSide ? search.pairMode.value : search.stopFilter.value,
        fromStops: stationSide === 'to' ? search.stFrom.value?.stops : undefined,
      };
    return { box: id, lines };
  };
  /** An answer in: shown and the list opened, or the list closed for "none"; a superseded answer (null) is dropped. */
  const apply = (r: Rows | null) => {
    if (!r) return;
    if (r.kind === 'none') {
      open.value = false;
      return;
    }
    setRows(r);
    show();
  };
  /** List for `q` now: what the box shows when empty, or the answer for a text once its typing paused. */
  const list = (q: string) => {
    void suggest(kind, q, ctxFor()).then(apply);
  };
  /** The text changed: the place goes, and the list follows, at once for an empty box or a text too short to search,
   *  after a pause in the typing for a search. The pause is the box's (it is about the keys), not the controller's. */
  const typed = (q: string) => {
    place.value = null;
    clearTimeout(timer.current);
    if (searchesText(kind, q, ctxFor())) timer.current = window.setTimeout(() => list(q), PAUSE[kind]);
    else list(q);
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
    else list('');
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
    search.boxes.set(id, {
      focus: () => inputRef.current?.focus(),
      focused: () => document.activeElement === inputRef.current,
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
  // the address book came in while a box had text typed in it: that box searches again, now with addresses
  const placesWere = useRef(data.plReady.peek());
  useSignalEffect(() => {
    const ready = data.plReady.value;
    if (ready && !placesWere.current && !place.peek() && text.peek().trim().length >= 2) typed(text.peek().trim());
    placesWere.current = ready;
  });
  // the line or stop search's kind of line or stop changed (the chips under the box): list again for it
  useSignalEffect(() => {
    void search.lineFilter.value;
    void search.stopFilter.value;
    if ((kind === 'line' || kind === 'stop') && (open.peek() || focused.peek())) list(text.peek().trim());
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

  // ---- focus, blur and keys
  // "My location" is a value, not text: the box shows it as a tag while idle, and empties to its placeholder when
  // focused (someone tapping it means to change it); left without typing, it comes back.
  const magic = !!place.value?.transient;
  const onFocus = () => {
    focusedAt.current = Date.now();
    focused.value = true;
    if (inBar) search.openBar();
    if (place.value?.transient) text.value = '';
    else {
      // the caret at the end of what is there (after the tap has placed it), the text not selected (maintainer)
      const el = inputRef.current;
      if (el)
        setTimeout(() => {
          if (document.activeElement === el) {
            const n = el.value.length;
            el.setSelectionRange(n, n);
          }
        }, 0);
    }
    list('');
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

  // ---- what a row of the list does
  const locate = async () => {
    open.value = false;
    if (quickActions) {
      quickActions.locate();
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
    if (quickActions) {
      quickActions.map();
      return;
    }
    const p = await pickOnMap(search.from.value || search.to.value);
    if (p) onPick(p);
  };
  const actions: ListActions = {
    onPlace: pick,
    onLine: (r) => {
      open.value = false;
      onLine?.(r);
    },
    onStop: (g) => {
      open.value = false;
      onStop?.(g);
    },
    onRecent: (v: View) => {
      open.value = false;
      inputRef.current?.blur();
      openRecent(v);
    },
    onLocate: locate,
    onMap: pickMap,
    onStarred: () => list(''),
  };

  const xShown = focused.value && !!text.value;
  const drop = (
    <div
      ref={dropRef}
      class={`dropdown${closing.value ? ' closing' : ''}${stale.value ? ' stale' : ''}`}
      id={dropId}
      hidden={!open.value && !closing.value}
    >
      <div class="dropbody" key={swap} data-swapped={swap > 0 ? '' : undefined}>
        {rows && <SuggestionList rows={rows} a={actions} />}
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
          list('');
        }}
      >
        <Icon name="close" />
      </button>
      {dropHost ? createPortal(drop, dropHost) : drop}
    </div>
  );
}
