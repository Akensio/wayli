// The shell around the screens: the top bar's height for the map and the sheet, install (Chrome's prompt or
// Safari's steps), online and offline, the drawer's actions, and what closing each panel must stop.
import { effect } from '@preact/signals';
import { t } from '../lib/i18n';
import { call } from '../worker/client';
import * as app from '../state/app';
import * as nav from '../state/nav';
import * as sheet from '../state/sheet';
import * as search from '../state/search';
import * as chooser from '../state/chooser';
import * as results from '../state/results';
import * as detail from '../state/detail';
import * as follow from '../state/follow';
import * as line from '../state/line';
import { getPosition, hooks as positionHooks } from '../state/position';
import * as map from '../map/index';
import { toast } from '../widgets/toast';
import type { Place } from '../state/search';
import { clearPlan, planTo, planFrom, revealCard } from './planner';
import { closeDetail } from './detail';
import { openStop, closeStop } from './stop';
import { openLine, closeLine, openTrip, chooseAnchor } from './line';
import { closeTrains } from './station';
import { isFollowing, closeFollow } from './follow';
import { ensureAudio, requestAlertPermission, alertUser } from './alerts';
import { type Journey, isRide } from '../model/journey';

// ---- install: Chrome's own prompt when it offers one; otherwise (iPhones and iPads never fire it, and Chrome holds
// it back at times, e.g. after a dismissal) the row still shows outside the installed app and explains the browser's way
let installPrompt: any = null;
const isIOS =
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
/** The install hint for the browser in hand: Safari's share button sits at the bottom, Chrome's by the address bar; elsewhere the browser's menu. */
function installHint(): string {
  if (!isIOS) return t('menuInstall');
  const ua = navigator.userAgent,
    chrome = /CriOS/.test(ua),
    firefox = /FxiOS/.test(ua),
    edge = /EdgiOS/.test(ua);
  let browser = 'Safari',
    where = t('shareBottom');
  if (chrome) {
    browser = 'Chrome';
    where = t('shareAddr');
  } else if (firefox) {
    browser = 'Firefox';
    where = t('shareMenu');
  } else if (edge) {
    browser = 'Edge';
    where = t('shareMenu');
  }
  return t('iosInstall', { browser, where });
}
export const updateOnline = (): void => {
  app.online.value = navigator.onLine !== false;
};

/**
 * A new build reloads the page once (the service worker took over), never in the middle of a followed trip: one that
 * arrived during a trip waits, and goes in when the trip is over (checked every 30 s) or the app comes back to the
 * front. Coming back to the front also asks for a new build: a phone keeps the app open in the background for days.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false,
      waiting = false;
    const apply = () => {
      if (waiting && !reloading && !isFollowing()) {
        reloading = true;
        location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        waiting = true;
        apply();
      }
    });
    const reg = await navigator.serviceWorker.register('sw.js');
    reg.update().catch(() => {});
    window.setInterval(apply, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        apply();
        reg.update().catch(() => {});
      }
    });
  } catch {
    /* offline shell unavailable; fine */
  }
}

// ---- the drawer and the settings' actions
/** Install: Chrome's prompt when the browser gave one, else the hint for the browser's own steps (shown, or hidden again). */
export async function installApp(): Promise<void> {
  if (!installPrompt) {
    app.installHint.value = app.installHint.value ? '' : installHint();
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
}
/** The drawer's screens. */
export function go(name: string): void {
  nav.closeAll();
  nav.showScreen(name);
  if (name === 'plan') sheet.set('half');
}
/** The drawer's line search: the bar's rows, even over a plan's summary. */
export function lineSearch(): void {
  nav.closeAll();
  nav.showScreen('plan');
  search.lineMode();
}
export function stopSearch(): void {
  nav.closeAll();
  nav.showScreen('plan');
  search.stopMode();
}
/** The map's look or the menus' theme changed in the settings. */
export function appearanceChanged(): void {
  map.applyMapStyle();
  map.applyTheme();
}
export async function testAlert(): Promise<void> {
  ensureAudio();
  await requestAlertPermission();
  alertUser(t('alertSoon'), t('testAlertMsg'));
}
/** The map picker's cancel. */
export const cancelPick = (): void => map.closePicker(null);

/** My location as a named place (reverse geocoded), for the chooser's chip; null, with a toast, when it cannot be had. */
export async function locate(): Promise<Place | null> {
  try {
    const pos = await getPosition();
    const r = await call('reverse', pos);
    return { name: r.name, lat: pos.lat, lon: pos.lon };
  } catch {
    toast(t('noLocation'));
    return null;
  }
}
// Back and the top bar, on Android: one step that undoes the bar a piece at a time (the keyboard, then the list, then
// the line or stop search, back to the trip search folded; the trip search open, folded to its pill or summary) and is
// made again while anything is left. One re-made step
// rather than one each: Chrome groups close watchers made from the same tap, so a step per piece could close two at once.
let barStep: nav.Entry | null = null;
const barBusy = () =>
  !!(search.typing.value || search.listing.value || search.kind.value !== 'trip' || search.barOpen.value);
function barBack(): void {
  barStep = null;
  const typing = search.typing.peek(),
    listing = search.listing.peek();
  if (typing) search.boxes.get(typing)?.blur();
  else if (listing) search.boxes.get(listing)?.closeList();
  else if (search.kind.peek() !== 'trip') {
    search.leaveLineMode();
    search.foldBar();
  } else if (search.barOpen.peek()) search.foldBar(); // what was planned stays, as after a map tap
  setTimeout(syncBarStep, 30); // a blur lands a moment later
}
function syncBarStep(): void {
  const busy = barBusy();
  // taken off the stack: by back (barBack runs next and makes it again after its piece) or with everything else
  if (barStep && !nav.stack.value.includes(barStep)) {
    barStep = null;
    return;
  }
  if (busy && !barStep) barStep = nav.pushUi(barBack);
  else if (!busy && barStep) {
    nav.dropUi(barStep);
    barStep = null;
  }
}

// ---- panels: what closing each one stops (state/nav.ts keeps the stack and the history)
const ON_CLOSE: Record<string, () => void> = {
  detail: closeDetail,
  stopDetail: closeStop,
  lineDetail: closeLine,
  trainTimes: closeTrains,
  picker: () => map.closePicker(null, false),
  chooser: () => chooser.finish(null, false),
  follow: () => closeFollow(false),
};

/** Start: install and online state, the chooser's, the map's, the position's, the navigation's and the sheet's hooks, and Back's step for the bar on Android. */
export function install(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    app.installable.value = true;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    app.installable.value = false;
    app.installHint.value = '';
  });
  if (!standalone) app.installable.value = true;
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  // ---- choosing a place (home, work, saved): search, my location named by reverse geocoding, or the map
  Object.assign(chooser.hooks, {
    show: () => nav.showOverlay('chooser'),
    close: () => nav.close('chooser'),
  });
  // what the map's bubbles ask of the app
  Object.assign(map.hooks, {
    openTrip: (trip: number, stop: number) => openTrip(trip, stop),
    openLine: (route: number) => openLine(route),
    openStop: (stop: number, station?: number) => openStop(stop, station != null ? { station } : {}),
    planTo: (p: Place) => planTo(p),
    planFrom: (p: Place) => planFrom(p),
    timeAt: (stop: number): number | null => {
      const key = nav.key.value;
      let j: Journey | null | undefined = null;
      if (key === 'detail') j = detail.journey.value;
      else if (key === 'follow') j = follow.active.value?.journey;
      else if (key === 'screen-plan') j = results.highlighted.value?.j;
      if (j) {
        for (const l of j.legs) {
          if (!isRide(l)) continue;
          const s = l.stopsAlong?.find((x) => x.stop === stop);
          if (s) return s.arr;
        }
        return null;
      }
      if (key === 'lineDetail') {
        const i = line.info.value?.stops.findIndex((s) => s.stop === stop) ?? -1;
        return i >= 0 ? (line.selTimes.value[i] ?? null) : null;
      }
      return null;
    },
    lineAt: (stop: number): boolean => {
      const i = line.info.value?.stops.findIndex((s) => s.stop === stop) ?? -1;
      if (i < 0) return false;
      chooseAnchor(i);
      return true;
    },
  });
  positionHooks.moved = () => map.updateNearRoutes();
  if (nav.closeWatchers) effect(syncBarStep);
  // elsewhere (history), a line or stop search is a history entry of its own: back returns to the trip search (folded)
  search.hooks.kindChanged = (k) => {
    if (nav.closeWatchers) return;
    const on = nav.stack.value.some((e) => e.kind === 'search');
    if (k !== 'trip' && !on) nav.push({ kind: 'search' });
    else if (k === 'trip' && on) nav.close('search', false); // back to trips by the switch (or the pill's x): the bar stays as it is
  };
  Object.assign(nav.hooks, {
    closed: (id: string) => {
      map.closePopup();
      ON_CLOSE[id]?.();
    },
    clearPlan: () => clearPlan(),
    leaveSearch: () => {
      search.leaveLineMode();
      search.foldBar();
    },
    changed: (again = false) => map.redrawMap(again),
  });
  sheet.hooks.changed = (prev, st) => {
    if (prev === 'full' && st !== 'full') map.refreshLiveMap();
    if (st !== prev && map.hasMap() && (st === 'peek' || prev === 'peek')) sheet.scrollToTop();
    // the results opened from collapsed (a tap or a drag): the highlighted way's card in view, which need not be the first
    const c = results.highlighted.value;
    if (prev === 'peek' && st !== 'peek' && c && nav.key.value === 'screen-plan') revealCard(c.idx, false);
  };
}
