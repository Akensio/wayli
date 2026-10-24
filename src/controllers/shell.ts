// The shell around the screens: the top bar's height for the map and the sheet, install (Chrome's prompt or
// Safari's steps), online and offline, the drawer's actions, and what closing each panel must stop.
import { effect } from '@preact/signals';
import { t } from '../i18n';
import { call } from '../worker/client';
import * as app from '../state/app';
import * as nav from '../state/nav';
import * as sheet from '../state/sheet';
import * as search from '../state/search';
import * as data from '../state/data';
import * as nearby from '../state/nearby';
import * as chooser from '../state/chooser';
import * as saved from '../state/saved';
import * as results from '../state/results';
import { getPosition, hooks as positionHooks } from '../state/position';
import * as map from '../map/index';
import { toast } from '../ui/toast';
import type { Place } from '../state/search';
import { clearPlan, planTo, planFrom, revealCard } from './planner';
import { closeDetail } from './detail';
import { openStop, closeStop } from './stop';
import { openLine, closeLine } from './line';
import { closeTrains } from './station';
import { openTrip } from './trip';
import { loadNearby } from './nearby';
import { isFollowing, closeFollow } from './follow';
import { setLang } from './lang';
import { ensureAudio, requestAlertPermission, alertUser } from './alerts';

/** The top bar's height, for the map controls, the status pill and the menu under it; the sheet's full size. */
export function layoutTop(): void {
  const bar = document.getElementById('topbar'); if (!bar) return;
  document.documentElement.style.setProperty('--top-h', `${Math.round(bar.getBoundingClientRect().bottom + 6)}px`);
  document.documentElement.style.setProperty('--sheet-box', `${sheet.boxPx()}px`);   // the sheet's box: the whole screen
  // fully open, the sheet reaches up to the bar: it follows the bar's height (an eased slide, never a jump)
  if (sheet.state.value === 'full') document.documentElement.style.setProperty('--sheet-h', `${sheet.fullPx()}px`);
}
window.addEventListener('resize', layoutTop);

// ---- install: Chrome's own prompt when it offers one; otherwise (iPhones and iPads never fire it, and Chrome holds
// it back at times, e.g. after a dismissal) the row still shows outside the installed app and explains the browser's way
let installPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; app.installable.value = true; });
window.addEventListener('appinstalled', () => { installPrompt = null; app.installable.value = false; app.installHint.value = ''; });
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
if (!standalone) app.installable.value = true;
/** The install hint for the browser in hand: Safari's share button sits at the bottom, Chrome's by the address bar; elsewhere the browser's menu. */
function installHint(): string {
  if (!isIOS) return t('menuInstall');
  const ua = navigator.userAgent, chrome = /CriOS/.test(ua), firefox = /FxiOS/.test(ua), edge = /EdgiOS/.test(ua);
  return t('iosInstall', { browser: chrome ? 'Chrome' : firefox ? 'Firefox' : edge ? 'Edge' : 'Safari', where: chrome ? t('shareAddr') : firefox || edge ? t('shareMenu') : t('shareBottom') });
}
export const updateOnline = (): void => { app.online.value = navigator.onLine !== false; };
window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);

/**
 * A new build reloads the page once (the service worker took over), never in the middle of a followed trip: one that
 * arrived during a trip waits, and goes in when the trip is over (checked every 30 s) or the app comes back to the
 * front. Coming back to the front also asks for a new build: a phone keeps the app open in the background for days.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false, waiting = false;
    const apply = () => { if (waiting && !reloading && !isFollowing()) { reloading = true; location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) { waiting = true; apply(); } });
    const reg = await navigator.serviceWorker.register('sw.js');
    reg.update().catch(() => {});
    window.setInterval(apply, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { apply(); reg.update().catch(() => {}); } });
  } catch { /* offline shell unavailable; fine */ }
}

// ---- the drawer and the settings' actions
Object.assign(app.hooks, {
  install: async () => {
    if (!installPrompt) { app.installHint.value = app.installHint.value ? '' : installHint(); return; }
    installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null;
  },
  go: (name: string) => { nav.closeAll(); nav.showScreen(name); if (name === 'plan') sheet.set('half'); },
  lineSearch: () => { nav.closeAll(); nav.showScreen('plan'); search.lineMode(); },   // the rows, even over a plan's summary
  stopSearch: () => { nav.closeAll(); nav.showScreen('plan'); search.stopMode(); },
  closeDrawer: () => nav.close('drawer'),
  openSettings: () => nav.showOverlay('settings'),   // over the drawer, which stays open under it
  closeSettings: () => nav.close('settings'),
  setLang: (l: 'he' | 'en') => setLang(l),
  appearanceChanged: () => { map.applyMapStyle(); map.applyTheme(); },
  requestAlertPermission: () => requestAlertPermission(),
  testAlert: async () => { ensureAudio(); await requestAlertPermission(); alertUser(t('alertSoon'), t('testAlertMsg')); },
  pickCancel: () => map.closePicker(null),
} satisfies typeof app.hooks);

// ---- choosing a place (home, work, saved): search, my location named by reverse geocoding, or the map
Object.assign(chooser.hooks, {
  show: () => nav.showOverlay('chooser'),
  close: () => nav.close('chooser'),
  locate: async (): Promise<Place | null> => {
    try { const pos = await getPosition(); const r = await call<{ name: string }>('reverse', pos); return { name: r.name, lat: pos.lat, lon: pos.lon }; }
    catch { toast(t('noLocation')); return null; }
  },
  pickOnMap: () => map.pickOnMap(null),
});
Object.assign(saved.hooks, { planTo: (p: Place) => planTo(p), choosePlace: (title: string) => chooser.open(title), openStop: (stop: number) => openStop(stop), openLine: (route: number) => openLine(route) });
// what the map's bubbles ask of the app
Object.assign(map.hooks, { openTrip: (trip: number, stop: number) => openTrip(trip, stop), openLine: (route: number) => openLine(route), openStop: (stop: number, station?: number) => openStop(stop, station != null ? { station } : {}), planTo: (p: Place) => planTo(p), planFrom: (p: Place) => planFrom(p) });
positionHooks.moved = () => map.updateNearRoutes();
// Back and the top bar, on Android: one step that undoes the bar a piece at a time (the keyboard, then the list, then
// the line or stop search, back to the trip search folded) and is made again while anything is left. One re-made step
// rather than one each: Chrome groups close watchers made from the same tap, so a step per piece could close two at once.
let barStep: nav.Entry | null = null;
const barBusy = () => !!(search.typing.value || search.listing.value || search.kind.value !== 'trip');
function barBack(): void {
  barStep = null;
  const typing = search.typing.peek(), listing = search.listing.peek();
  if (typing) search.boxes.get(typing)?.blur();
  else if (listing) search.boxes.get(listing)?.closeList();
  else if (search.kind.peek() !== 'trip') { search.leaveLineMode(); search.foldBar(); }
  setTimeout(syncBarStep, 30);   // a blur lands a moment later
}
function syncBarStep(): void {
  const busy = barBusy();
  // taken off the stack: by back (barBack runs next and makes it again after its piece) or with everything else
  if (barStep && !nav.stack.value.includes(barStep)) { barStep = null; return; }
  if (busy && !barStep) barStep = nav.pushUi(barBack);
  else if (!busy && barStep) { nav.dropUi(barStep); barStep = null; }
}
if (nav.closeWatchers) effect(syncBarStep);
// elsewhere (history), a line or stop search is a history entry of its own: back returns to the trip search (folded)
search.hooks.kindChanged = (k) => {
  if (nav.closeWatchers) return;
  const on = nav.stack.value.some((e) => e.kind === 'search');
  if (k !== 'trip' && !on) nav.push({ kind: 'search' });
  else if (k === 'trip' && on) nav.close('search', false);   // back to trips by the switch (or the pill's x): the bar stays as it is
};

// ---- panels: what closing each one stops (state/nav.ts keeps the stack and the history)
const ON_CLOSE: Record<string, () => void> = {
  detail: closeDetail, stopDetail: closeStop, lineDetail: closeLine, trainTimes: closeTrains,
  picker: () => map.closePicker(null, false), chooser: () => chooser.finish(null, false),
  follow: () => closeFollow(false),
};
Object.assign(nav.hooks, {
  closed: (id: string) => { map.closePopup(); ON_CLOSE[id]?.(); },
  clearPlan: () => clearPlan(),
  leaveSearch: () => { search.leaveLineMode(); search.foldBar(); },
  changed: () => map.redrawMap(),
  screenShown: (name: string) => { if (name === 'nearby' && data.ttReady.value && nearby.status.value !== 'ready') loadNearby(); },
});
sheet.hooks.changed = (prev, st) => {
  if (prev === 'full' && st !== 'full') map.refreshLiveMap();
  const body = document.getElementById('sheetBody');
  if (body && st !== prev && map.mapState.main && (st === 'peek' || prev === 'peek')) body.scrollTop = 0;
  // the results opened from collapsed (a tap or a drag): the highlighted way's card in view, which need not be the first
  const c = results.highlighted.value;
  if (prev === 'peek' && st !== 'peek' && c && nav.key.value === 'screen-plan') revealCard(c.idx, false);
};
