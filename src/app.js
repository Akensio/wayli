// Wayli app shell. The worker (worker.js) holds the data; this file is the UI.
// Pure logic lives next door: live.js (real-time), follow.js (trip following), store.js (on-device memory).
import { settings, recentPlaces, recentTrips, savedPlaces, favs, lastSearch, activeTrip } from './store.js';
import * as live from './live.js';
import { initialState, aboardState, advance, view as followView, replanOrigin, ridesKey, remainingKey, spliceJourney } from './follow.js';
import { styledLiberty, PALETTES } from './mapstyle.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- icons: one stroke set on a 24-unit grid, as an inline SVG sprite (and drawn on canvas for the map)
import { ICONS, FILLED_ICONS, ic } from './ui/icons.ts';
import * as search from './state/search.ts';   // the top bar's state: places, when, bike, which parts are open
import { fmt, dateOf, calToday, dayLabel } from './time.ts';
import * as results from './state/results.ts';
import * as sheet from './state/sheet.ts';
import * as detail from './state/detail.ts';   // the journey shown in detail
import * as follow from './state/follow.ts';   // the trip being followed, as the screen sees it
import { toast } from './ui/toast.ts';
import * as appState from './state/app.ts';   // the build, install, the drawer
import * as saved from './state/saved.ts';
import * as nearby from './state/nearby.ts';
import * as chooser from './state/chooser.ts';
import { agencyName } from './journey/agencies.ts';   // the bottom sheet: peek, half or full
import { topPad, fullPx as fullSheetPx } from './state/sheet.ts';   // the plan's results: the list, the ways on the map, the recent trips
import { routeColor, textOn, chipStyle, legColor } from './journey/colors.ts';
import { dur, lineText, describePlace, minutesUntil, leaveText, inShort, tripKey, liveBadge } from './journey/format.ts';

// ---------------------------------------------------------------- i18n
import { t, lang as langSig, storeLang } from './i18n.ts';
let lang = langSig.value;
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}
function setLang(l) {
  lang = l; storeLang(l);
  applyLang(); saved.refresh(); results.refreshRecent();
  if (mainMap) setBasemapLang(mainMap);
  // stop names, headsigns and map labels come from the worker: ask again in the new language
  call('setLang', { lang }).then(() => {
    lmStops = false; loadStopsGeo();
    const located = (p) => p && !(p.transient && p.lat == null);   // never a location prompt for a language switch
    if (results.result.value && located(search.from.value) && located(search.to.value)) plan();
  }).catch(() => {});
}
/** The basemap's own labels (streets, places, water) in the rider's language: one name per label, not Latin plus Hebrew. */
const NAME_FIELD = {
  he: ['coalesce', ['get', 'name:he'], ['get', 'name:nonlatin'], ['get', 'name']],
  en: ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']],
  ar: ['coalesce', ['get', 'name:ar'], ['get', 'name:nonlatin'], ['get', 'name']],
};
function setBasemapLang(m) {
  let layers;
  try { layers = (m.getStyle() || {}).layers || []; } catch (e) { return; }
  for (const l of layers) {
    if (l.type !== 'symbol' || !l.layout || !l.layout['text-field'] || /^lm-|^wayli/.test(l.id)) continue;
    const tf = JSON.stringify(l.layout['text-field']);
    if (!tf.includes('"name')) continue;   // road shields and refs keep theirs
    try { m.setLayoutProperty(l.id, 'text-field', NAME_FIELD[lang] || NAME_FIELD.he); } catch (e) { /* a layer that is gone */ }
  }
}

// ---------------------------------------------------------------- worker
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const DATA_URL = new URL('data/', location.href).href;   // absolute: the worker lives under assets/ and would resolve a relative path there
const pending = new Map();
let nextId = 1;
function call(op, args) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
}
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'progress') { showProgress(m); return; }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
};
worker.onerror = (e) => setStatus(t('loadFail', { msg: e.message || 'worker' }), true);

// ---------------------------------------------------------------- status, toast
let statusTimer = 0;
function setStatus(text, error = false, frac = null) {
  $('statusText').textContent = text;
  $('status').classList.toggle('error', error);
  $('status').hidden = false;
  $('statusBar').hidden = frac == null;
  if (frac != null) $('statusBar').firstElementChild.style.width = `${Math.round(frac * 100)}%`;
  clearTimeout(statusTimer);
  if (!error && frac == null) statusTimer = setTimeout(() => { $('status').hidden = true; }, 4000);
}
function showProgress(m) {
  if (m.label === 'shapes') return;   // quiet: the courses arrive in the background
  const label = m.label === 'timetable' ? t('loadingTT') : m.label === 'places' ? t('loadingPL') : t('loadingST');
  const mb = (m.got / 1e6).toFixed(1) + (m.total ? ' / ' + (m.total / 1e6).toFixed(1) : '') + ' MB';
  setStatus(`${label}: ${m.unpacking ? t('unpacking') : mb}`, false, m.total ? m.got / m.total : null);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------- time, days (Israel time, service days)
const fmtPlus = (sec) => fmt(sec) + (sec >= 86400 ? '⁺' : '');   // past midnight, still this service day
// the current results on the map: the first few journeys drawn together, one highlighted, the rest muted
let altMarkers = [];   // the minutes badges of the ways drawn on the map
/** An operator's name for display: English where known, else as the feed names it, isolated so a Hebrew name inside an English line keeps its place. */
const agencyText = (a) => `<bdi>${esc(agencyName(a))}</bdi>`;
setInterval(() => {
  for (const el of document.querySelectorAll('[data-dep]')) {
    const txt = leaveText(+el.dataset.dep, el.dataset.day);
    el.textContent = txt; el.classList.toggle('past', txt === t('departed'));
  }
}, 20000);

// ---------------------------------------------------------------- data manifest and days
let manifest = null, dayInfo = null, ttReady = false, stReady = false, plReady = false, shReady = false;
const tsCache = new Map();   // trip -> promise of tripStops, per loaded day
/** The service days the data covers, for the day pills; the chosen day stays if it is one of them. */
function renderDays() {
  if (!manifest) return;
  search.days.value = manifest.days.map((d) => d.date);
  if (!search.days.value.includes(search.day.value)) search.day.value = dayInfo ? dayInfo.date : manifest.days[0].date;
}
async function loadDay(date) {
  const d = manifest.days.find((x) => x.date === date) || manifest.days[0];
  ttReady = false;
  search.busy.value = true;
  call('setLang', { lang });   // names come back in the rider's language where the timetable carries them
  const info = await call('loadTimetable', { url: `${DATA_URL}${d.file}?v=${encodeURIComponent(manifest.built || '')}` });
  dayInfo = info; ttReady = true; tsCache.clear(); lmLabels.clear(); lmStops = false;
  search.busy.value = false;
  nearRoutes = null; updateNearRoutes();
  loadStopsGeo(); refreshLiveMap();
  setStatus(t('ready', { trips: info.counts.trips.toLocaleString(), date: dayLabel(info.date) }));
  renderDays();
}
async function loadPlaces() {
  if (plReady || !manifest.places) return;
  try {
    await call('loadPlaces', { url: `${DATA_URL}${manifest.places.file}?v=${encodeURIComponent(manifest.places.built || manifest.built || '')}` });
    plReady = true;
    for (const side of ['from', 'to']) if (!search.sides[side].value && search.texts[side].value.trim().length >= 2) $(side + 'Q').dispatchEvent(new Event('input', { bubbles: true }));   // the box searches again, now with addresses
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); }
}
async function loadShapes() {
  if (shReady || !manifest.shapes) return;
  try {
    await call('loadShapes', { url: `${DATA_URL}${manifest.shapes.file}?v=${encodeURIComponent(manifest.shapes.built || manifest.built || '')}` });
    shReady = true;
  } catch (e) { /* straight lines between stops until then */ }
}
async function loadStreets() {
  if (stReady || !manifest.streets) return;
  try {
    await call('loadStreets', { url: `${DATA_URL}${manifest.streets.file}?v=${encodeURIComponent(manifest.streets.built || manifest.built || '')}` });
    stReady = true;
    setStatus(t('readyStreets'));
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); }
}
/** The best service day to plan on right now: tonight's until 03:00, else today. */
function startDay() {
  const svc = live.serviceDay();
  for (const d of [svc.day, calToday()]) if (manifest.days.some((x) => x.date === d)) return d;
  return manifest.days[0].date;
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; appState.installable.value = true; });
// iPhones and iPads never fire that event: the row shows there too and explains Safari's own way
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || (matchMedia('(display-mode: standalone)').matches);
if (isIOS && !standalone) appState.installable.value = true;
/** The install hint for the browser in hand: Safari's share button sits at the bottom, Chrome's by the address bar. */
function iosInstallHint() {
  const ua = navigator.userAgent, chrome = /CriOS/.test(ua), firefox = /FxiOS/.test(ua), edge = /EdgiOS/.test(ua);
  return t('iosInstall', { browser: chrome ? 'Chrome' : firefox ? 'Firefox' : edge ? 'Edge' : 'Safari', where: chrome ? t('shareAddr') : firefox || edge ? t('shareMenu') : t('shareBottom') });
}
appState.hooks.install = async () => { if (!installPrompt) { appState.installHint.value = appState.installHint.value ? '' : iosInstallHint(); return; } installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; appState.installable.value = false; };
const updateOnline = () => { $('offline').hidden = navigator.onLine !== false; };
window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);

async function init() {
  if ('serviceWorker' in navigator) {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloading && !fol) { reloading = true; location.reload(); }
      });
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update().catch(() => {});
    } catch (e) { /* offline shell unavailable; fine */ }
  }
  applyLang();
  updateOnline();
  layoutTop();
  initMap();
  saved.refresh(); results.refreshRecent();
  // a trip in progress comes back first, timetable or not
  const active = activeTrip.get();
  if (active && !tripStale(active)) { updateResumeBar(); if (active.view === 'follow') openFollow(active); } else if (active) activeTrip.clear();
  try {
    manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  appState.feedInfo.value = manifest.feed ? { start: manifest.feed.start, end: manifest.feed.end, built: manifest.built } : null;
  if (manifest.built) { const b = live.ilParts(new Date(manifest.built)); appState.version.value = t('build', { v: `${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(b.h).padStart(2, '0')}:${String(b.mi).padStart(2, '0')}` }); }
  const params = new URLSearchParams(location.search);
  const shared = parseShared(params);
  const last = shared ? null : lastSearch.get();
  let start = startDay();
  if (shared && manifest.days.some((d) => d.date === shared.day)) start = shared.day;
  else if (last && last.q && manifest.days.some((d) => d.date === last.q.day) && Date.now() - last.at < 6 * 3600e3) start = last.q.day;
  renderDays();
  search.day.value = start;
  search.setDefaultTime();
  if (shared) applyQuery(shared);
  else if (last && last.q && !last.dismissed && last.q.day === start && Date.now() - last.at < 6 * 3600e3) { applyQuery(last.q); results.setResults(last.result, last.q, last.at); }
  try { await loadDay(start); } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  if (shared) { history.replaceState(null, '', location.pathname); plan(); }
  await loadPlaces();
  await loadStreets();
  loadShapes();
}
// the bar's day pills ask for the day's timetable
search.hooks.dayChanged = (d) => { loadDay(d).catch((e) => setStatus(t('loadFail', { msg: e.message }), true)); search.setDefaultTime(); };
search.hooks.startDay = () => (manifest ? startDay() : '');

// ---------------------------------------------------------------- places and search
/** The top bar's height, for the map controls, the status pill and the menu under it. */
function layoutTop() {
  const r = $('topbar').getBoundingClientRect();
  document.documentElement.style.setProperty('--top-h', `${Math.round(r.bottom + 6)}px`);
  document.documentElement.style.setProperty('--sheet-full', `${fullSheetPx()}px`);   // the sheet is always this tall; its slide uses it
}
window.addEventListener('resize', layoutTop);
const myLocation = search.myLocation;
/** Back to a clean bar: no places, no results, the sheet down to its strip. */
function clearPlan() {
  search.clearPlaces();
  results.clear(); { const l = lastSearch.get(); if (l) lastSearch.set({ ...l, dismissed: true }); }
  showPlanError('');
  search.optOpen.value = ''; search.resetNow();
  results.refreshRecent();
  applyLiveShow(); renderPanels(); redrawMap(true);
}
// the drawer (features/pages/Drawer): the screens, the line search by number (the To box, numeric keyboard)
Object.assign(appState.hooks, {
  go: (name) => { nav.closeAll(); showScreen(name); if (name === 'plan') sheet.set('half'); },
  lineSearch: () => { nav.closeAll(); showScreen('plan'); search.lineMode(); },   // the rows, even over a plan's summary
  closeDrawer: () => nav.close('drawer'),
  setLang: (l) => setLang(l),
  appearanceChanged: () => { applyMapStyle(); applyTheme(); },
  requestAlertPermission: () => requestAlertPermission(),
  testAlert: async () => { ensureAudio(); await requestAlertPermission(); alertUser(t('alertSoon'), t('testAlertMsg')); },
});
function renderDrawer() { appState.drawerOpen.value = isOpen('drawer'); }

// ---- pick a point on the map
// Picking a place on the map: a tap drops a pin with a bubble (the place's name, a Choose button); another
// tap moves it; a tap on a stop picks the stop; Cancel in the bar leaves.
let pickSeq = 0, pickResolve = null, pickMarker = null;
function pickOnMap(startAt) {
  return new Promise((resolve) => {
    pickResolve = resolve;
    showOverlay('picker');
    (async () => {
      const m = await mapReady();
      if (!m || !pickResolve) return;
      const start = startAt && startAt.lat != null ? startAt : lastPos || search.from.value || search.to.value;
      if (start) m.jumpTo({ center: [start.lon, start.lat], zoom: Math.max(m.getZoom(), 15.5) });
    })();
  });
}
/** The pin and its bubble at a tapped point (or on a tapped stop). */
async function pickAt(m, lngLat, stopHit) {
  const my = ++pickSeq;
  if (pickMarker) pickMarker.remove();
  const el = document.createElement('div'); el.className = 'wayli-pick';
  pickMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(m);
  let picked = stopHit ? { name: stopHit.name, stops: [stopHit.stop], lat: lngLat[1], lon: lngLat[0] } : { name: '…', lat: lngLat[1], lon: lngLat[0] };
  const show = () => openPopup(m, lngLat, `<div class="pop"><b>${esc(picked.name)}</b>${stopHit ? `<div class="muted">${t('kindStop')}</div>` : ''}<div class="row"><button type="button" class="primary slim" data-act="choose">${t('choose')}</button></div></div>`,
    (el2) => el2.querySelector('[data-act="choose"]').addEventListener('click', () => { if (popup) popup.remove(); closePicker(picked); }));
  show();
  if (stopHit) return;
  try {
    const r = await call('reverse', { lat: lngLat[1], lon: lngLat[0] });
    if (my !== pickSeq || !isOpen('picker')) return;
    picked = { ...picked, name: r.kind === 'point' ? t('pointName') : r.distance > 40 ? t('nearName', { name: r.name }) : r.name };
  } catch (e) { if (my !== pickSeq) return; picked = { ...picked, name: t('pointName') }; }
  show();
}
const closePicker = (p) => { const r = pickResolve; pickResolve = null; if (pickMarker) { pickMarker.remove(); pickMarker = null; } if (popup) { popup.remove(); popup = null; } nav.close('picker'); if (r) r(p); };
$('pickCancel').addEventListener('click', () => closePicker(null));
let lastPosAt = 0;
const notePos = (lat, lon) => { lastPos = { lat, lon }; lastPosAt = Date.now(); try { localStorage.setItem('wayli-geo', '1'); } catch (e) {} updateNearRoutes(); };
function getPosition() {
  return new Promise((resolve, reject) => {
    if (lastPos && Date.now() - lastPosAt < 20000) { resolve(lastPos); return; }
    const fallback = (err) => { if (lastPos && Date.now() - lastPosAt < 600000) resolve(lastPos); else reject(err); };
    if (!navigator.geolocation) { fallback(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition((p) => { notePos(p.coords.latitude, p.coords.longitude); resolve(lastPos); }, fallback, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
// ---- choose a place for home / work / saved (features/pages/Chooser: search, my location or the map)
const choosePlace = (title) => chooser.open(title);
Object.assign(chooser.hooks, {
  show: () => showOverlay('chooser'),
  close: () => nav.close('chooser'),
  locate: async () => { try { const pos = await getPosition(); const r = await call('reverse', pos); return { name: r.name, lat: pos.lat, lon: pos.lon }; } catch (e) { toast(t('noLocation')); return null; } },
  pickOnMap: () => pickOnMap(null),
});
Object.assign(saved.hooks, { planTo: (p) => planTo(p), choosePlace, openStop: (stop) => openStop(stop), openLine: (route) => openLine(route) });
Object.assign(nearby.hooks, { load: () => loadNearby(), openStop: (stop) => openStop(stop), openLine: (route) => openLine(route) });

function showPlanError(msg) { results.error.value = msg; if (msg && sheet.state.value === 'peek') sheet.set('half'); }

// ---------------------------------------------------------------- planning
const applyQuery = search.applyQuery;   // fill the bar from a query (a recent search, a shared link, a saved trip)
// What the bar needs from the rest of the app (state/search.ts `hooks`): planning, searching, the map, the menu.
Object.assign(search.hooks, {
  plan: () => { nav.closeAll(); showScreen('plan'); plan(); },
  planTo: (p) => planTo(p),
  clearPlan: () => { if (nav.stack.some((e) => e.kind === 'plan')) nav.close('plan'); else clearPlan(); },
  hasResults: () => !!(results.result.value && results.query.value),
  lastQuery: () => results.query.value,
  search: (q) => call('search', { q, limit: 10, lang, near: lastPos }),
  searchLines: (q) => call('searchLines', { q, limit: 6 }),
  lineChipHtml: (r) => `<span class="chip t${r.routeType}"${chipStyle(r.routeType, r.agency)}>${esc(lineText(r.line))}</span>`,
  openLine: (r) => openLine(r.route),
  getPosition: () => getPosition(),
  pickOnMap: (start) => pickOnMap(start),
  openMenu: () => showOverlay('drawer'),
  layoutTop: () => layoutTop(),
  toast: (msg) => toast(msg),
  ttReady: () => ttReady,
  lastPos: () => lastPos,
});
// What the results need (state/results.ts `hooks`): the detail and follow screens, planning again, the sheet and the map.
Object.assign(results.hooks, {
  openDetail: (j, q, bikeOnly) => openDetail(j, q, bikeOnly),
  startTrip: (j, q) => startTrip(j, q),
  plan: (opts) => plan(opts),
  replan: (q) => { applyQuery(q); search.resetNow(); nav.closeAll(); showScreen('plan'); plan(); },
  afterResults: () => { $('sheetBody').scrollTop = 0; if (!topPanel() && screen === 'plan' && sheet.state.value === 'peek') sheet.set('half'); applyLiveShow(); redrawMap(true); },
  redraw: () => redrawMap(true),
  peekChanged: () => { if (sheet.state.value === 'peek') sheet.set('peek'); },
  peekTap: () => sheet.set('half'),
});
function parseShared(params) {
  const pt = (s) => { if (!s) return null; const [lat, lon, ...rest] = s.split(','); const name = decodeURIComponent(rest.join(',')) || `${lat}, ${lon}`; return Number.isNaN(+lat) ? null : { name, lat: +lat, lon: +lon }; };
  const from = pt(params.get('from')), to = pt(params.get('to'));
  if (!from || !to) return null;
  return { from, to, day: params.get('day') || '', at: params.get('at') || '', bike: params.get('bike') || 'none', folding: params.get('folding') === '1', arriveBy: params.get('mode') === 'arrive' };
}
async function plan(opts = {}) {
  showPlanError('');
  if (!search.from.value || !search.to.value) { showPlanError(t('pickBoth')); return; }
  if (!ttReady) return;
  for (const side of ['from', 'to']) {   // "my location" is resolved now, not when it was chosen
    const p = search.sides[side].value;
    if (p.transient && p.lat == null) {
      search.texts[side].value = t('locating');
      try { search.setPlace(side, myLocation(await getPosition())); } catch (e) { search.texts[side].value = t('myLoc'); showPlanError(t('noLocation')); return; }
    }
  }
  if (!search.timeTouched.value) { search.setDefaultTime(); if (manifest && search.day.value !== startDay()) search.day.value = startDay(); }
  if (!nav.stack.some((e) => e.kind === 'plan')) nav.push({ kind: 'plan' });   // the back button clears the plan
  const day = search.day.value;
  const weekday = dateOf(day).getDay() <= 4;
  const bike = search.bike.value, folding = search.folding.value, arriveBy = search.timeMode.value === 'arrive';
  const at = search.atSeconds();
  const isNow = !search.timeTouched.value && !arriveBy;   // a plan from now looks ten minutes back too: a ride just boarded can still be followed
  const fromTime = arriveBy ? Math.max(0, at - 7200) : isNow ? Math.max(0, at - 600) : at, toTime = arriveBy ? at : at + 3600;
  const maxWalk = (opts.maxWalk || settings.get().maxWalk) * 60;
  search.busy.value = true;
  results.status.value = 'planning';
  search.optOpen.value = '';
  const q = { from: search.from.value, to: search.to.value, day, at: search.at.value, bike, folding, arriveBy, isNow, maxWalk: maxWalk / 60 };
  // a plan from now takes the delays of the vehicles on the road into account
  let vehicles = null, liveAsOf = null;
  const svc = live.serviceDay();
  if (liveOn() && !arriveBy && day === svc.day && Math.abs(at - svc.seconds) < 1200 && search.from.value.lat != null) {
    try { vehicles = await live.vehiclesForPlanning(search.from.value.lat, search.from.value.lon, { timeoutMs: 8000 }); liveAsOf = live.newest(vehicles); } catch (e) { vehicles = null; }
  }
  q.liveAsOf = liveAsOf ? liveAsOf.getTime() : null; q.liveTried = !!(liveOn() && !arriveBy && day === svc.day && Math.abs(at - svc.seconds) < 1200);
  try {
    const r = await call('plan', { from: search.from.value, to: search.to.value, fromTime, toTime, bike, folding, weekday, maxWalk, arriveBy, vehicles });
    recentTrips.add(q); recentPlaces.add(search.from.value); recentPlaces.add(search.to.value);
    lastSearch.set({ q, result: r, at: Date.now() });
    results.setResults(r, q);
    results.refreshRecent();
  } catch (e) { showPlanError(e.message); results.result.value = null; results.status.value = 'idle'; }
  search.busy.value = false;
}
// ---------------------------------------------------------------- maps (MapLibre, OpenFreeMap vector tiles)
// light Liberty everywhere; in dark mode, when chosen in settings, the same Liberty recoloured dark
// (darkmap.js), so the dark map keeps every detail. (localStorage 'wayli-map-style' overrides, for trying others)
const mapChoice = () => { const m = settings.get().map; return m === 'auto' ? 'system' : m || 'system'; };
const wantDarkMap = () => mapChoice() === 'dark' || (mapChoice() === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
/** The interface's colours: light, dark, or the device's (the stylesheet reads data-theme; absent means the device decides). */
function applyTheme() {
  const th = settings.get().theme || 'system';
  if (th === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
  // the installed app's status bar continues the map: the map's ground colour, light or dark, not a coloured app bar
  // Android keeps the status bar as a strip of one colour, so it takes the map's exact ground colour (iPhone draws the map under it)
  const land = PALETTES[mapTint()][wantDarkMap() ? 'dark' : 'light'].land;
  document.documentElement.style.setProperty('--map-land', land);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = land;
}
const styles = {}, styleLoading = {};
const mapTint = () => (settings.get().mapTint === 'neutral' ? 'neutral' : 'teal');
const styleKey = () => mapTint() + ':' + (wantDarkMap() ? 'dark' : 'light');
applyTheme();   // after the helpers it reads
/** Resolves once the style to use is at hand (Liberty in Wayli's palette needs a fetch); maps are made after it. */
function styleReady() {
  const key = styleKey();
  if (styles[key]) return Promise.resolve();
  if (!styleLoading[key]) styleLoading[key] = styledLiberty(wantDarkMap() ? 'dark' : 'light', mapTint()).then((st) => { styles[key] = st; }).catch(() => {}).finally(() => { styleLoading[key] = null; });
  return styleLoading[key];
}
function mapStyle() {
  let o = null; try { o = localStorage.getItem('wayli-map-style'); } catch (e) {}
  if (o) return `https://tiles.openfreemap.org/styles/${o}`;
  return styles[styleKey()] || 'https://tiles.openfreemap.org/styles/liberty';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyMapStyle);
let rtlSet = false;
function makeMap(container, center, zoom) {
  if (typeof maplibregl === 'undefined') return null;
  if (!rtlSet) { try { maplibregl.setRTLTextPlugin('https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js', true); } catch (e) {} rtlSet = true; }
  currentStyle = mapStyle();
  const m = new maplibregl.Map({ container, style: currentStyle, center: [center[1], center[0]], zoom, attributionControl: { compact: true }, pitchWithRotate: false, maxPitch: 72 });
  m.on('error', (e) => console.warn('map', e && e.error && e.error.message));
  return m;
}
// ---- the one map under everything. Panels register what they draw on it (mapOf); whichever panel is on top is drawn.
let mainMap = null, mapStyled = false, mapFailed = false, currentStyle = null, geoCtl = null;
const styledWaiters = [];
/** Resolves to the map once its style is loaded (again after a style change); null when there is no map. */
const mapReady = () => new Promise((res) => { if (mapFailed) res(null); else if (mainMap && mapStyled) res(mainMap); else styledWaiters.push(res); });
async function initMap() {
  await styleReady();
  // start where the map was last left (no wide view first, no jump): the saved camera, else the position, else Tel Aviv
  let view = null; try { view = JSON.parse(localStorage.getItem('wayli-view') || 'null'); } catch (e) {}
  const start = view || lastPos || { lat: 32.08, lon: 34.78 };
  mainMap = makeMap('mainMap', [start.lat, start.lon], view ? view.zoom : lastPos ? 14.5 : 11);
  if (!mainMap) { mapFailed = true; for (const r of styledWaiters.splice(0)) r(null); return; }
  const m = mainMap;
  geoCtl = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 15, linear: true, duration: 500 } });
  let viewTimer = 0;   // the camera is remembered for the next start
  m.on('moveend', () => { clearTimeout(viewTimer); viewTimer = setTimeout(() => { try { const c = m.getCenter(); localStorage.setItem('wayli-view', JSON.stringify({ lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), zoom: +m.getZoom().toFixed(2) })); } catch (e) {} }, 500); });
  m.addControl(geoCtl, 'bottom-right');
  // a compass under it: shows the rotation and the tilt, a tap sets north up and flat; hidden while there is nothing to reset
  const compass = new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true });
  m.addControl(compass, 'bottom-right');
  const compassVis = () => { const on = Math.abs(m.getBearing()) > 0.5 || m.getPitch() > 0.5; compass._container.classList.toggle('wayli-hidden', !on); };
  compassVis(); for (const ev of ['rotate', 'pitch', 'moveend', 'load']) m.on(ev, compassVis);
  geoCtl.on('geolocate', (p) => notePos(p.coords.latitude, p.coords.longitude));
  m.once('load', () => { const a = document.querySelector('.maplibregl-ctrl-attrib'); if (a) a.classList.remove('maplibregl-compact-show'); });
  m.on('style.load', () => {
    setupMapLayers(m);
    mapStyled = true;
    for (const r of styledWaiters.splice(0)) r(m);
    lmStops = false; loadStopsGeo();
    liveShow = null; drawnFor = null; redrawMap();
    refreshLiveMap();
  });
  m.on('moveend', () => { applyLiveShow(); clearTimeout(lmMove); lmMove = setTimeout(refreshLiveMap, 400); });
  m.on('click', (e) => {
    if (m.getLayer('alt-hit') && m.queryRenderedFeatures(e.point, { layers: ['alt-hit'] }).length) return;   // an alternative route: highlighted by its own handler
    if (isOpen('picker')) {
      const f = stopNear(m, e.point);
      const s = f ? { stop: +f.properties.stop, name: f.properties.name || '' } : null;
      pickAt(m, s ? f.geometry.coordinates : [e.lngLat.lng, e.lngLat.lat], s);
      return;
    }
    const hit = m.queryRenderedFeatures(e.point, { layers: ['lm-veh', ...STOP_LAYERS].filter((l) => m.getLayer(l)) });
    if (hit.length || popup) return;   // the layer's own handler answers, or the open bubble closes
    const near = stopNear(m, e.point);
    if (near) { stopPopup(m, near.geometry.coordinates, +near.properties.stop, near.properties.station); return; }
    if (sheet.state.value !== 'peek' || search.barOpen.value) { sheet.set('peek'); search.foldBar(); return; }
    placeBubble(m, e);
  });
  lmTimer = setInterval(refreshLiveMap, 20000);
  let known = false; try { known = !!localStorage.getItem('wayli-geo'); } catch (e) {}
  if (known) m.once('load', () => { try { geoCtl.trigger(); } catch (e) {} });
  try { window.wayliDebug = { ...(window.wayliDebug || {}), liveMap: m }; } catch (e) {}
}
const STOP_LAYERS = ['lm-stops', 'lm-stops-icon', 'lm-stations', 'journey-stops', 'context-stops', 'journey-stations', 'context-stations'];
/** The stop drawn nearest to a point, within a finger's width (14 px), or null. */
function stopNear(m, point) {
  const r = 14, fs = m.queryRenderedFeatures([[point.x - r, point.y - r], [point.x + r, point.y + r]], { layers: STOP_LAYERS.filter((l) => m.getLayer(l)) }).filter((f) => f.properties.stop != null && f.properties.stop !== '');
  let best = null, bd = Infinity;
  for (const f of fs) { const p = m.project(f.geometry.coordinates); const d = Math.hypot(p.x - point.x, p.y - point.y); if (d < bd) { bd = d; best = f; } }
  return best;
}
/** A tap on the bare map (sheet collapsed): a pin and a bubble naming the spot, a place of the basemap under the
 *  finger by its name, anything else by reverse geocoding, with "to here" and "from here". */
async function placeBubble(m, e) {
  const my = ++pickSeq;
  const poiLayers = (m.getStyle().layers || []).filter((l) => l.type === 'symbol' && /^poi/.test(l.id) && l.id !== 'poi_transit').map((l) => l.id);
  const r = 12, pois = poiLayers.length ? m.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: poiLayers }) : [];
  const poi = pois.find((f) => f.properties && f.properties.name);
  const lngLat = poi ? poi.geometry.coordinates.slice() : [e.lngLat.lng, e.lngLat.lat];
  let p = { name: poi ? (lang === 'he' ? poi.properties['name:he'] || poi.properties.name : poi.properties['name:en'] || poi.properties['name:latin'] || poi.properties.name) : '…', lat: lngLat[1], lon: lngLat[0] };
  if (pickMarker) pickMarker.remove();
  const el = document.createElement('div'); el.className = 'wayli-pick';
  pickMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(m);
  const show = () => {
    openPopup(m, lngLat, `<div class="pop"><b>${esc(p.name)}</b><div class="row"><button type="button" class="primary slim" data-act="to">${t('toHere')}</button><button type="button" class="ghost" data-act="from">${t('fromHere')}</button></div></div>`, (el2) => {
      el2.querySelector('[data-act="to"]').addEventListener('click', () => { if (popup) popup.remove(); planTo(p); });
      el2.querySelector('[data-act="from"]').addEventListener('click', () => { if (popup) popup.remove(); nav.closeAll(); search.setPlace('from', p); showScreen('plan'); search.barOpen.value = true; search.focusBox('toQ'); });
    });
    if (popup) popup.on('close', () => { if (pickMarker && !isOpen('picker')) { pickMarker.remove(); pickMarker = null; } });
  };
  show();
  if (poi) return;
  try {
    const g = await call('reverse', { lat: lngLat[1], lon: lngLat[0] });
    if (my !== pickSeq || !popup) return;
    p = { ...p, name: g.kind === 'point' ? t('pointName') : g.distance > 40 ? t('nearName', { name: g.name }) : g.name };
  } catch (x) { if (my !== pickSeq || !popup) return; p = { ...p, name: t('pointName') }; }
  show();
}
/** Sources and layers of the main map, bottom to top: every stop, the journey or line, live vehicles. Re-made after a style change. */
function setupMapLayers(m) {
  if (m.getSource('lm-veh')) return;
  // the basemap's own transit squares would double our stops
  if (m.getLayer('poi_transit')) m.setLayoutProperty('poi_transit', 'visibility', 'none');
  setBasemapLang(m);
  const dark = wantDarkMap();
  // depth when the map is tilted: a sky and a haze towards the horizon, a low side light that shades the buildings
  try {
    m.setSky(dark
      ? { 'sky-color': '#0a1322', 'horizon-color': '#243247', 'fog-color': '#15181c', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0] }
      : { 'sky-color': '#8fc1f2', 'horizon-color': '#dbe7f3', 'fog-color': '#f4f5f2', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0] });
    m.setLight({ anchor: 'viewport', color: '#ffffff', intensity: dark ? 0.35 : 0.55, position: [1.2, 215, 35] });
    if (m.getLayer('building-3d')) { m.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.9); m.setPaintProperty('building-3d', 'fill-extrusion-vertical-gradient', true); }
  } catch (e) { /* an older MapLibre without sky: the map stays flat-shaded */ }
  m.addSource('lm-stops', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'lm-stops', type: 'circle', source: 'lm-stops', minzoom: 14, filter: ['in', ['get', 'kind'], ['literal', ['bus', 'platform']]], paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'platform'], 4, 5.5], 'circle-color': '#ffffff', 'circle-stroke-color': '#4a5560', 'circle-stroke-width': 2 } });
  for (const k of BADGE_KINDS) if (!m.hasImage('wayli-st-' + k)) m.addImage('wayli-st-' + k, stationImage(k), { pixelRatio: 2 });
  // close up, every bus stop gets its badge over the dot; stations keep theirs from zoom 11
  m.addLayer({ id: 'lm-stops-icon', type: 'symbol', source: 'lm-stops', minzoom: 15, filter: ['==', ['get', 'kind'], 'bus'], layout: { 'icon-image': 'wayli-st-bus', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.9, 17, 1.15] } });
  // stations: the badge from zoom 11, the name under it from zoom 12.5 (the basemap's station labels are hidden with its squares)
  m.addLayer({ id: 'lm-stations', type: 'symbol', source: 'lm-stops', minzoom: 11, filter: ['in', ['get', 'kind'], ['literal', ['rail', 'lrt', 'station']]],
    layout: { 'icon-image': ['concat', 'wayli-st-', ['get', 'kind']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1], 'icon-allow-overlap': true, 'text-field': ['step', ['zoom'], '', 12.5, ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 10, 16, 12], 'text-anchor': 'top', 'text-offset': [0, 1.05], 'text-max-width': 9, 'text-optional': true },
    paint: { 'text-color': dark ? '#e9eae6' : '#1b1f24', 'text-halo-color': dark ? '#15181c' : '#ffffff', 'text-halo-width': 1.4 } });
  ensureJourneyLayers(m);
  m.addSource('lm-veh', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'lm-veh', type: 'circle', source: 'lm-veh', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 13, 7, 15, 11], 'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['get', 'opacity'] } });
  m.addLayer({ id: 'lm-veh-dir', type: 'symbol', source: 'lm-veh', filter: ['>', ['get', 'bearing'], -1], layout: { 'icon-image': ['concat', 'wayli-arrow-', ['get', 'ckey']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 1], 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-offset': [0, -17], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': ['get', 'opacity'] } });
  m.addLayer({ id: 'lm-veh-label', type: 'symbol', source: 'lm-veh', minzoom: 13.5, layout: { 'text-field': ['get', 'line'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 9, 16, 12], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': ['get', 'tcol'], 'text-opacity': ['get', 'opacity'] } });
  m.on('click', 'lm-veh', (e) => { if (e.features && e.features[0]) selectVehicle(e.features[0].properties, e.features[0].geometry.coordinates); });
  for (const layer of ['lm-stops', 'lm-stops-icon', 'lm-stations']) m.on('click', layer, (e) => { const f = e.features && e.features[0]; if (f && !m.queryRenderedFeatures(e.point, { layers: ['lm-veh'] }).length) stopPopup(m, f.geometry.coordinates, +f.properties.stop, f.properties.station); });
  for (const layer of ['lm-veh', 'lm-stops', 'lm-stops-icon', 'lm-stations']) { m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; }); m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; }); }
}
/** Switch the basemap (settings, or the phone's dark mode): a full reload of the style, so style.load re-adds our layers. */
async function applyMapStyle() {
  await styleReady();
  if (!mainMap) return;
  const st = mapStyle();
  if (st === currentStyle) return;
  currentStyle = st; mapStyled = false; lmStops = false;
  mainMap.setStyle(st, { diff: false });
}
const mapOf = {};   // panel id (or 'screen-<name>') -> async function (token) drawing that panel's content on the map
let drawnFor = null, drawSeq = 0;
const stale = (seq) => seq !== drawSeq;
/** Draw what the panel on top wants on the map; nothing when it wants nothing. */
function redrawMap(force = false) {
  const key = topPanel() || 'screen-' + screen;
  applyLiveShow();
  if (!force && key === drawnFor) return;
  drawnFor = key;
  const seq = ++drawSeq;
  const m = mainMap;
  if (!m || !mapStyled) return;
  clearMap(m);
  const fn = mapOf[key];
  if (fn) fn(seq);
}
// ---- which vehicles the live layer shows: every one in view, only the lines of the current results, or none
// (a journey, line or followed trip draws its own vehicles, with delays, so the layer would only repeat them)
let liveShow = null;
const LIVE_LAYERS = ['lm-veh', 'lm-veh-dir', 'lm-veh-label'];
let nearRoutes = null;   // {lat, lon, ids}: the lines serving stops within 500 m of the last position
function liveShowFor(key) {
  if (key === 'detail' || key === 'lineDetail' || key === 'follow') return 'none';
  if (key === 'screen-plan' && results.result.value && results.result.value.journeys && results.result.value.journeys.length && results.showing.value) {
    const ids = new Set();
    for (const j of results.result.value.journeys) for (const l of j.legs) if (l.type === 'ride' && l.routeId != null) ids.add(String(l.routeId));
    if (ids.size) return Array.from(ids).sort();
  }
  // nothing searched: around you, the lines you can take from here; looking elsewhere, everything there
  if (nearRoutes && nearRoutes.ids.length && mainMap && lastPos) {
    const c = mainMap.getCenter();
    if (live.metres(c.lat, c.lng, lastPos.lat, lastPos.lon) < 2500) return nearRoutes.ids;
  }
  return 'all';
}
/** Refresh the lines around the rider when the position moved; applies the layer filter when it arrives. */
async function updateNearRoutes() {
  if (!lastPos || !ttReady) return;
  if (nearRoutes && live.metres(nearRoutes.lat, nearRoutes.lon, lastPos.lat, lastPos.lon) < 150) return;
  const at = { lat: lastPos.lat, lon: lastPos.lon };
  try {
    const ids = await call('nearbyRoutes', { lat: at.lat, lon: at.lon, radius: 500 });
    nearRoutes = { ...at, ids: ids.sort() };
    applyLiveShow();
  } catch (e) { /* everything stays visible */ }
}
function applyLiveShow() {
  const want = liveShowFor(topPanel() || 'screen-' + screen);
  const same = liveShow != null && String(want) === String(liveShow);
  liveShow = want;
  const m = mainMap;
  if (same || !m || !mapStyled || !m.getLayer('lm-veh')) return;
  for (const id of LIVE_LAYERS) m.setLayoutProperty(id, 'visibility', want === 'none' ? 'none' : 'visible');
  if (want !== 'none') {
    const f = Array.isArray(want) ? ['in', ['get', 'ref'], ['literal', want]] : null;
    m.setFilter('lm-veh', f); m.setFilter('lm-veh-label', f);
    m.setFilter('lm-veh-dir', f ? ['all', ['>', ['get', 'bearing'], -1], f] : ['>', ['get', 'bearing'], -1]);
    refreshLiveMap();
  } else $('liveNote').textContent = '';
}
function clearMap(m) {
  for (const arr of [journeyMarkers, liveMarkers, lineVeh, followVehicle, altMarkers]) for (const mk of arr.splice(0)) mk.remove();
  if (meMarker) { meMarker.remove(); meMarker = null; }
  for (const src of ['journey', 'stops', 'context', 'context-stops', 'alts']) if (m.getSource(src)) m.getSource(src).setData(EMPTY);
}
/** Fit bounds into the part of the map the sheet and the top bar leave visible. */
function fitMap(b, maxZoom) {
  const m = mainMap;
  if (!m || !b || b.isEmpty()) return;
  const top = topPad();
  const bottom = Math.min(sheet.px(sheet.state.value) + 20, innerHeight - top - 120);
  m.fitBounds(b, { padding: { top, bottom, left: 24, right: 24 }, duration: 0, maxZoom });
}
const EMPTY = { type: 'FeatureCollection', features: [] };
/** The map's sources and layers for a journey, created once, bottom to top: the faded whole lines, then the journey. */
function ensureJourneyLayers(m) {
  if (m.getSource('journey')) return;
  m.addSource('context', { type: 'geojson', data: EMPTY });
  m.addSource('context-stops', { type: 'geojson', data: EMPTY });
  m.addSource('journey', { type: 'geojson', data: EMPTY });
  m.addSource('stops', { type: 'geojson', data: EMPTY });
  // the other ways to go, muted under the highlighted one; a wide invisible line takes the taps
  m.addSource('alts', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'alt-casing', type: 'line', source: 'alts', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'alt-ride', type: 'line', source: 'alts', filter: ['==', ['get', 'ride'], 1], paint: { 'line-color': '#8d939c', 'line-width': 4.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'alt-walk', type: 'line', source: 'alts', filter: ['==', ['get', 'ride'], 0], paint: { 'line-color': '#8d939c', 'line-width': 3.5, 'line-dasharray': [1, 1.5] }, layout: { 'line-cap': 'round' } });
  m.addLayer({ id: 'alt-hit', type: 'line', source: 'alts', paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0.001 } });
  m.on('click', 'alt-hit', (e) => { const f = e.features && e.features[0]; if (f) results.selectAlt(+f.properties.idx); });
  m.on('mouseenter', 'alt-hit', () => { m.getCanvas().style.cursor = 'pointer'; }); m.on('mouseleave', 'alt-hit', () => { m.getCanvas().style.cursor = ''; });
  m.addLayer({ id: 'context-line', type: 'line', source: 'context', paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'context-stops', type: 'circle', source: 'context-stops', minzoom: 11, paint: { 'circle-radius': 3, 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-opacity': 0.5, 'circle-stroke-opacity': 0.5 } });
  m.addLayer({ id: 'journey-casing', type: 'line', source: 'journey', paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'ride'], 1], 8, 7], 'line-opacity': .9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'journey-ride', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 1], paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'journey-walk', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 0], paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [1, 1.5] }, layout: { 'line-cap': 'round' } });
  m.addLayer({ id: 'journey-stops', type: 'circle', source: 'stops', minzoom: 12, paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#444', 'circle-stroke-width': 1.5 } });
  // stations along a line or a journey get their badge over the dot
  for (const k of BADGE_KINDS) if (!m.hasImage('wayli-st-' + k)) m.addImage('wayli-st-' + k, stationImage(k), { pixelRatio: 2 });
  for (const [id, src] of [['context-stations', 'context-stops'], ['journey-stations', 'stops']]) m.addLayer({ id, type: 'symbol', source: src, minzoom: 10, filter: ['has', 'kind'], layout: { 'icon-image': ['concat', 'wayli-st-', ['get', 'kind']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1], 'icon-allow-overlap': true } });
  wireStopLayers(m, ['journey-stops', 'context-stops', 'journey-stations', 'context-stations']);
}
/** The whole line of every ride, faded, with all its stops: where the bus comes from and where it goes on. */
async function drawContext(m, j, focus = -1) {
  const rides = j.legs.filter((l, i) => l.type === 'ride' && l.pattern != null && (focus < 0 || i === focus));
  if (!rides.length || !ttReady) return;
  try {
    const courses = await call('patternCourse', { patterns: rides.map((l) => l.pattern) });
    if (!m.getSource('context')) return;
    const lines = [], dots = [];
    courses.forEach((c, i) => {
      const color = legColor(rides[i]);
      if (c.path && c.path.length >= 2) lines.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: c.path.map((q) => [q[1], q[0]]) } });
      for (const st of c.stops) dots.push({ type: 'Feature', properties: { color, name: st[2], stop: st[3], ...stopKindProp(st[3]) }, geometry: { type: 'Point', coordinates: [st[1], st[0]] } });
    });
    m.getSource('context').setData({ type: 'FeatureCollection', features: lines });
    m.getSource('context-stops').setData({ type: 'FeatureCollection', features: dots });
  } catch (e) { /* the ride itself is still drawn */ }
}
/** Draw a journey on a map: casing, rides, dashed walks, pins at boarding and alighting stops, dots at the stops between. */
function drawJourney(m, j, markers, focus = -1, context = true) {
  ensureJourneyLayers(m);
  for (const mk of markers.splice(0)) mk.remove();
  const features = [], dots = [];
  const bounds = new maplibregl.LngLatBounds();
  for (const l of j.legs) {
    if (!l.path || l.path.length < 2) continue;
    const color = legColor(l);
    const coords = l.path.map((p) => [p[1], p[0]]);
    coords.forEach((c) => bounds.extend(c));
    features.push({ type: 'Feature', properties: { color, ride: l.type === 'ride' ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } });
    if (l.type === 'ride') {
      for (const c of [coords[0], coords[coords.length - 1]]) {
        const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = color;
        markers.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(m));
      }
      // the stops between boarding and alighting: from the leg's stop list (the path itself follows the road now)
      const between = l.stopsAlong ? l.stopsAlong.slice(1, -1).map((st) => ({ c: [st.lon, st.lat], stop: st.stop })) : (l.pathKind === 'stops' ? coords.slice(1, -1).map((c) => ({ c, stop: '' })) : []);
      for (const b of between) dots.push({ type: 'Feature', properties: { stop: b.stop, ...stopKindProp(b.stop) }, geometry: { type: 'Point', coordinates: b.c } });
    }
  }
  m.getSource('journey').setData({ type: 'FeatureCollection', features });
  m.getSource('stops').setData({ type: 'FeatureCollection', features: dots });
  m.getSource('context').setData(EMPTY); m.getSource('context-stops').setData(EMPTY);
  if (context) drawContext(m, j, focus);
  return bounds;
}
const boundsOf = (path) => { const b = new maplibregl.LngLatBounds(); for (const p of path || []) b.extend([p[1], p[0]]); return b; };
// ---- bubbles on the map: one at a time, for a vehicle or a stop
let popup = null;
const clock = (d) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
function openPopup(m, lngLat, html, wire) {
  if (popup) { popup.remove(); popup = null; }
  popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px', closeButton: true, className: 'wayli-pop' }).setLngLat(lngLat).setHTML(html).addTo(m);
  const el = popup.getElement();
  if (wire && el) wire(el);
  popup.on('close', () => { popup = null; });
}
/** A vehicle's bubble: line, direction, delay, when it reported, speed; its trip's stops and its line page. */
function vehiclePopup(m, lngLat, v) {
  const d = v.delay != null ? live.delayMinutes(v.delay) : null;
  const delayTxt = d == null ? '' : d === 0 ? t('onTime') : t('liveDelay', { d: (d > 0 ? '+' : '') + d });
  const html = `<div class="pop"><div class="row"><span class="chip t${v.routeType}"${chipStyle(v.routeType, v.agency)}>${esc(lineText(v.line))}</span><b>${v.headsign ? esc(t('toward', { headsign: v.headsign })) : ''}</b></div>` +
    `<div class="muted">${v.agency ? agencyText(v.agency) + ' · ' : ''}${t('seenAgo', { time: clock(v.seen) })}${Date.now() - new Date(v.seen).getTime() >= 180e3 ? ` (${t('agoMin', { n: Math.round((Date.now() - new Date(v.seen).getTime()) / 60000) })})` : ''}${v.velocity != null ? ` · ${Math.round(v.velocity)} ${t('kmh')}` : ''}</div>` +
    (d == null ? '' : `<div><span class="live ${v.stale ? 'unsure' : 'ok'}">${esc(delayTxt)}${v.stale ? ' ?' : ''}</span></div>`) +
    `<div class="row"><button type="button" class="ghost" data-act="trip" ${v.trip >= 0 ? '' : 'disabled'}>${t('popStops')}</button><button type="button" class="ghost" data-act="line" ${v.route != null ? '' : 'disabled'}>${t('popLine')}</button></div></div>`;
  openPopup(m, lngLat, html, (el) => {
    const b1 = el.querySelector('[data-act="trip"]'), b2 = el.querySelector('[data-act="line"]');
    if (b1) b1.addEventListener('click', () => { if (popup) popup.remove(); openTrip(v.trip, -1); });
    if (b2) b2.addEventListener('click', () => { if (popup) popup.remove(); openLine(v.route); });
  });
}
/** A stop's bubble: name, its lines, and departures / from here / to here. */
async function stopPopup(m, lngLat, stop, station) {
  if (isOpen('picker')) return;   // in pick mode the map tap handler picks the stop instead
  let info;
  try { info = await call('stopInfo', { stop, station: station != null && station !== '' ? +station : -1 }); } catch (e) { return; }
  const html = `<div class="pop"><b>${esc(info.name)}</b><div class="muted">${esc(info.city || '')}${info.code ? ' · ' + esc(info.code) : ''}</div>` +
    `<div class="chips">${info.lines.slice(0, 10).map((l) => `<span class="chip t${l.type}" data-route="${l.route ?? ''}"${chipStyle(l.type, l.agency)}>${esc(lineText(l.label))}</span>`).join('')}</div>` +
    `<div class="row"><button type="button" class="ghost" data-act="deps">${t('popDeps')}</button><button type="button" class="ghost" data-act="from">${t('fromHere')}</button><button type="button" class="ghost" data-act="to">${t('toHere')}</button></div></div>`;
  openPopup(m, lngLat, html, (el) => {
    const go = (side) => { if (popup) popup.remove(); if (side === 'to') planTo(stopPlace(info)); else { nav.closeAll(); search.setPlace('from', stopPlace(info)); showScreen('plan'); sheet.set('half'); } };
    el.querySelector('[data-act="deps"]').addEventListener('click', () => { if (popup) popup.remove(); openStop(stop); });
    el.querySelector('[data-act="from"]').addEventListener('click', () => go('from'));
    el.querySelector('[data-act="to"]').addEventListener('click', () => go('to'));
    for (const c of el.querySelectorAll('.chip[data-route]')) if (c.dataset.route !== '') c.addEventListener('click', () => { if (popup) popup.remove(); openLine(+c.dataset.route); });
  });
}
/** Stop dots on a journey or line map answer a tap with the stop's bubble. */
function wireStopLayers(m, layers) {
  for (const layer of layers) {
    m.on('click', layer, (e) => { const f = e.features && e.features[0]; if (f && f.properties.stop != null && f.properties.stop !== '') stopPopup(m, f.geometry.coordinates, +f.properties.stop); });
    m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
  }
}
/** Every reporting vehicle of a line as a marker with its delay; the one running `mine` stands out. */
function lineVehicleMarkers(m, markers, vs, statuses, routeType, mine, fallback = {}) {
  const icon = ic(routeType === 2 ? 'train' : routeType === 0 ? 'tram' : 'bus');
  const newest = live.newest(vs);
  vs.forEach((v, i) => {
    if (!live.isFresh(v, 300, newest)) return;   // last seen long before this line's newest report: its position says nothing now
    const st = statuses[i] || { trip: -1 };
    const el = document.createElement('div');
    el.className = 'wayli-bus lbl' + (st.stale || st.trip < 0 ? ' stale' : '') + (mine != null && st.trip === mine ? ' mine' : '');
    const d = st.delay != null ? live.delayMinutes(st.delay) : null;
    const isMine = mine != null && st.trip === mine;
    el.innerHTML = `${icon}${isMine && d != null ? ` ${d > 0 ? '+' : ''}${d}` : ''}`;   // the number (minutes late) only on the rider's own vehicle; the bubble has it for the rest
    el.style.borderColor = routeColor(st.routeType ?? routeType, st.agency || fallback.agency);
    addHeading(el, heading(v));
    el.title = `${clock(v.recordedAt)}${st.headsign ? ' · ' + st.headsign : ''}`;
    el.addEventListener('click', (e) => { e.stopPropagation(); vehiclePopup(m, [v.lon, v.lat], { line: st.line || fallback.line || '', routeType: st.routeType ?? routeType, headsign: st.headsign || fallback.headsign || '', agency: st.agency || fallback.agency || '', delay: st.delay, stale: !!st.stale, seen: v.recordedAt, velocity: v.velocity, trip: st.trip, route: st.route ?? fallback.route ?? null }); });
    markers.push(new maplibregl.Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(m));
  });
}
const vehiclesForWorker = (vs) => vs.map((v) => ({ lineRef: v.lineRef, scheduledStart: v.scheduledStart.getTime(), lat: v.lat, lon: v.lon, recordedAt: v.recordedAt.getTime() }));
/** A triangle on the rim of a vehicle marker, pointing where it heads. */
function addHeading(el, deg) {
  if (deg < 0) return;
  const a = document.createElement('span'); a.className = 'heading'; a.style.transform = `rotate(${deg}deg)`;
  el.appendChild(a);
}
function vehicleMarker(m, markers, v, label) {
  const el = document.createElement('div'); el.className = 'wayli-bus' + (v.stale ? ' stale' : ''); if (label) el.textContent = label; else el.innerHTML = ic('bus'); el.title = v.vehicle ? fmt(v.seen) : '';
  addHeading(el, v.vehicle ? heading(v.vehicle) : -1);
  const mk = new maplibregl.Marker({ element: el }).setLngLat([v.vehicle.lon, v.vehicle.lat]).addTo(m);
  markers.push(mk);
  return mk;
}

// ---------------------------------------------------------------- journey detail
let journeyMarkers = [], liveMarkers = [], detailSeq = 0;
/** The results on the map: the ways switched on, the highlighted one in colour with its stops, the others grey,
 *  each with a badge of its minutes at the middle of its longest ride (a tap highlights that way). */
mapOf['screen-plan'] = async (seq) => {
  const m = mainMap;
  const shown = results.list.value.cards.filter((c) => results.altShown.value.has(c.idx));
  const altSel = results.altSel.value;
  if (!m || !shown.length) return;
  await Promise.all(shown.map((c) => withCourses(c.j)));
  if (stale(seq) || !mainMap) return;
  ensureJourneyLayers(m);
  for (const mk of altMarkers.splice(0)) mk.remove();
  const features = [], b = new maplibregl.LngLatBounds();
  for (const c of shown) {
    let longest = null;
    for (const l of c.j.legs) {
      if (!l.path || l.path.length < 2) continue;
      const coords = l.path.map((p) => [p[1], p[0]]);
      coords.forEach((x) => b.extend(x));
      if (c.idx !== altSel) features.push({ type: 'Feature', properties: { idx: c.idx, ride: l.type === 'ride' ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } });
      if (l.type === 'ride' && (!longest || coords.length > longest.length)) longest = coords;
    }
    const at = longest ? longest[Math.floor(longest.length / 2)] : null;
    if (!at) continue;
    const el = document.createElement('button'); el.type = 'button'; el.className = 'wayli-alt' + (c.idx === altSel ? ' sel' : '');
    el.textContent = dur(c.j.arrive - c.j.depart);
    el.addEventListener('click', (e) => { e.stopPropagation(); results.selectAlt(c.idx); });
    altMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(m));
  }
  m.getSource('alts').setData({ type: 'FeatureCollection', features });
  const sel = shown.find((c) => c.idx === altSel) || shown[0];
  drawJourney(m, sel.j, journeyMarkers, -1, false);
  fitMap(b, 15);
};
const tripStopsCached = (trip) => { if (!tsCache.has(trip)) tsCache.set(trip, call('tripStops', { trip })); return tsCache.get(trip); };
const liveOn = () => settings.get().live && navigator.onLine !== false;
/** Ride legs planned before the shapes were loaded get their course now (in place). */
async function withCourses(j) {
  if (!shReady || !ttReady) return;
  const rides = j.legs.filter((l) => l.type === 'ride' && l.pathKind !== 'shape' && l.pattern != null);
  if (!rides.length) return;
  try {
    const paths = await call('ridePaths', { legs: rides.map((l) => ({ pattern: l.pattern, boardPos: l.boardPos, alightPos: l.alightPos })) });
    rides.forEach((l, i) => { if (paths[i]) { l.path = paths[i]; l.pathKind = 'shape'; } });
  } catch (e) { /* straight lines then */ }
}
function openDetail(j, q, bikeOnly = false) {
  const my = ++detailSeq;
  try { window.wayliDebug = { ...(window.wayliDebug || {}), journey: j }; } catch (e) {}
  mapOf.detail = async (seq) => {
    const m = await mapReady();
    if (!m || my !== detailSeq || stale(seq)) return;
    if (!bikeOnly) await withCourses(j);
    if (my !== detailSeq || stale(seq)) return;
    const focus = detail.focus.value;
    const b = drawJourney(m, j, journeyMarkers, focus);
    for (const mk of liveMarkers.splice(0)) mk.remove();
    fitMap(focus >= 0 && j.legs[focus] ? boundsOf(j.legs[focus].path) : b, 16);
    if (!bikeOnly) liveForJourney(j, q.day, my, focus);
  };
  detail.open(j, q, bikeOnly);
}
Object.assign(detail.hooks, {
  show: () => showOverlay('detail'),
  close: () => nav.close('detail'),
  redraw: () => redrawMap(true),
  openLine: (route) => openLine(route),
  startTrip: (j, q) => startTrip(j, q),
  favChanged: () => saved.refresh(),
});
/** Live badges on the ride legs of a journey happening around now; every vehicle of those lines on the map. */
async function liveForJourney(j, day, seq, focus = -1) {
  if (!liveOn() || !dayInfo || dayInfo.date !== day) return;   // trip indices belong to the loaded day
  const now = live.nowOn(day);
  if (j.depart - now > 5400 || now - j.arrive > 1800) return;
  const rides = j.legs.filter((l, i) => l.type === 'ride' && l.routeId != null && (focus < 0 || i === focus) && l.depart - now < 5400 && now - l.arrive < 900).slice(0, 4);
  await Promise.all(rides.map(async (l) => {
    try {
      const vs = await live.vehiclesByLine(l.routeId);
      if (seq !== detailSeq) return;
      const statuses = vs.length ? await call('vehiclesStatus', { vehicles: vehiclesForWorker(vs) }) : [];
      if (seq !== detailSeq) return;
      if (mainMap && drawnFor === 'detail') lineVehicleMarkers(mainMap, liveMarkers, vs, statuses, l.routeType, l.trip, { line: l.line, headsign: l.headsign, agency: l.agency, route: l.route });
      const v = live.matchTrip(vs, l.routeId, l.firstDep, day);
      if (!v) { detail.setBadge(l.trip, { text: t('liveNoVehicle'), cls: '' }); return; }
      const ts = await tripStopsCached(l.trip);
      const est = live.estimateDelay(v, ts.stops, day);
      const at = live.liveAt(est, ts.stops, l.boardPos);
      if (seq !== detailSeq) return;
      detail.setBadge(l.trip, liveBadge(at));
    } catch (e) { detail.setBadge(l.trip, { text: t('liveFail'), cls: '' }); }
  }));
}
// ---------------------------------------------------------------- nearby and stop detail
let lastPos = null;
(async () => {
  try {
    let known = false; try { known = !!localStorage.getItem('wayli-geo'); } catch (e) {}
    if (!known && navigator.permissions && navigator.geolocation) { const st = await navigator.permissions.query({ name: 'geolocation' }); known = st.state === 'granted'; }
    if (known) lastPos = await getPosition();
  } catch (e) { /* no location, no problem */ }
})();
async function loadNearby() {
  nearby.status.value = 'locating';
  try { lastPos = await getPosition(); } catch (e) { nearby.status.value = 'noLocation'; return; }
  const stops = await call('nearby', { lat: lastPos.lat, lon: lastPos.lon, limit: 20 });
  nearby.stops.value = stops; nearby.status.value = 'ready';
  redrawMap(true);
}
/** The nearby screen on the map: the rider's position, a ring out to the farthest listed stop, the stops highlighted. */
mapOf['screen-nearby'] = async (seq) => {
  const m = mainMap, nearbyStops = nearby.stops.value;
  if (!m || !lastPos || !nearbyStops.length || stale(seq)) return;
  ensureJourneyLayers(m);
  const r = Math.max(150, nearbyStops[nearbyStops.length - 1].distance + 30), ring = [];
  for (let i = 0; i <= 64; i++) { const a = i / 64 * 2 * Math.PI; ring.push([lastPos.lon + r / 111000 / Math.cos(lastPos.lat * Math.PI / 180) * Math.cos(a), lastPos.lat + r / 111000 * Math.sin(a)]); }
  m.getSource('context').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color: '#12998b' }, geometry: { type: 'LineString', coordinates: ring } }] });
  m.getSource('stops').setData({ type: 'FeatureCollection', features: nearbyStops.map((s) => ({ type: 'Feature', properties: { stop: s.stop, ...stopKindProp(s.stop) }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) });
  if (!meMarker) { const el = document.createElement('div'); el.className = 'wayli-me'; meMarker = new maplibregl.Marker({ element: el }).setLngLat([lastPos.lon, lastPos.lat]).addTo(m); }
  const b = new maplibregl.LngLatBounds(); ring.forEach((c) => b.extend(c));
  fitMap(b, 16);
};
let currentStop = null, stopSeq = 0, stopTimer = 0;
async function openStop(stop) {
  const my = ++stopSeq;
  const info = await call('stopInfo', { stop });
  currentStop = info;
  mapOf.stopDetail = async (seq) => {
    const m = await mapReady();
    if (!m || my !== stopSeq || stale(seq)) return;
    const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = 'var(--accent)';
    journeyMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([info.lon, info.lat]).addTo(m));
    m.easeTo({ center: [info.lon, info.lat], zoom: Math.max(m.getZoom(), 15), offset: [0, -Math.round(sheet.px('half') / 2) + 30], duration: 500 });
  };
  showOverlay('stopDetail');
  $('stopTitle').textContent = info.name;
  $('stopMeta').textContent = `${info.city || ''}${info.code ? ' · ' + info.code : ''}`;
  $('stopLiveNote').textContent = '';
  updateStar('stopStar', 'stop:' + info.stop, 'stops');
  $('stopStar').onclick = () => { favs.toggle('stops', 'stop:' + info.stop, { stop: info.stop, name: info.name, city: info.city, code: info.code, lat: info.lat, lon: info.lon, lines: info.lines.slice(0, 8) }); saved.refresh(); updateStar('stopStar', 'stop:' + info.stop, 'stops'); };
  const day = search.day.value;
  const svc = live.serviceDay();
  const isNow = day === svc.day || day === calToday();
  const fromTime = isNow ? live.nowOn(day) - 120 : search.atSeconds();
  const deps = await call('departures', { stop, fromTime, limit: 40 });
  if (my !== stopSeq) return;
  const box = $('stopDeps');
  box.innerHTML = deps.length ? '' : `<div class="empty">${t('noDeps')}</div>`;
  for (const d of deps) {
    const el = document.createElement('div');
    el.className = 'dep';
    el.dataset.trip = d.trip;
    el.innerHTML = `<span class="time">${fmt(d.time)}</span><span class="chip t${d.routeType}"${chipStyle(d.routeType, d.agency)}>${esc(lineText(d.line))}</span><span class="head">${esc(d.headsign)}</span><span class="in">${isNow ? inText(d.time, day) : ''}</span>`;
    el.addEventListener('click', () => openTrip(d.trip, info.stop));
    box.appendChild(el);
  }
  clearInterval(stopTimer);
  if (isNow) {
    liveForStop(info, deps, day, my);
    stopTimer = setInterval(() => { if (!isOpen('stopDetail')) clearInterval(stopTimer); else liveForStop(info, deps, day, my); }, 45000);
  }
}
function inText(sec, day) { const n = minutesUntil(sec, day); return n <= 0 ? t('nowDep') : n > 120 ? '' : t('inMin', { n }); }
/** Live times for the departures of a stop: one request for the vehicles around it, then by line for what it missed. */
async function liveForStop(info, deps, day, seq) {
  if (!liveOn()) { $('stopLiveNote').textContent = t('liveOff'); return; }
  const now = live.nowOn(day);
  const soon = deps.filter((d) => d.routeId != null && d.time - now < 3600 && d.time - now > -300).slice(0, 16);
  if (!soon.length) return;
  try {
    let vs = await live.vehiclesNear(info.lat, info.lon, 8);
    if (seq !== stopSeq) return;
    const unmatched = new Set(soon.filter((d) => !live.matchTrip(vs, d.routeId, d.firstDep, day) && d.time - now < 1800).map((d) => d.routeId));
    if (unmatched.size) {
      const more = await Promise.all(Array.from(unmatched).slice(0, 6).map((r) => live.vehiclesByLine(r).catch(() => [])));
      vs = vs.concat(more.flat());
    }
    if (seq !== stopSeq) return;
    for (const d of soon) {
      const v = live.matchTrip(vs, d.routeId, d.firstDep, day);
      const el = $('stopDeps').querySelector(`[data-trip="${d.trip}"]`);
      if (!v || !el) continue;
      const ts = await tripStopsCached(d.trip);
      if (seq !== stopSeq) return;
      const idx = ts.stops.findIndex((s) => s.stop === info.stop && s.dep === d.time);
      const est = live.estimateDelay(v, ts.stops, day);
      const at = live.liveAt(est, ts.stops, idx < 0 ? 0 : idx);
      if (!at) continue;
      const tm = el.querySelector('.time'), inEl = el.querySelector('.in');
      if (at.passed) { tm.className = 'time gone'; inEl.textContent = t('livePassed'); continue; }
      const dmin = live.delayMinutes(at.delay);
      tm.textContent = fmt(at.time); tm.className = 'time ' + (at.stale ? 'unsure' : 'live');
      inEl.innerHTML = `${esc(inText(at.time, day))} <span class="live ${at.stale ? 'unsure' : 'ok'}">⦿${dmin ? ` ${dmin > 0 ? '+' : ''}${dmin}` : ''}${at.stale ? '?' : ''}</span>`;
    }
    const nw = live.newest(vs);
    $('stopLiveNote').textContent = nw ? t('liveUpdated', { time: nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) }) : t('liveNoVehicle');
  } catch (e) { $('stopLiveNote').textContent = t('liveFail'); }
}
$('stopLive').addEventListener('click', () => { if (currentStop) openStop(currentStop.stop); });
$('stopBack').addEventListener('click', () => nav.close('stopDetail'));
const stopPlace = (s) => ({ name: s.name, stops: [s.stop], lat: s.lat, lon: s.lon });
$('stopFrom').addEventListener('click', () => { if (!currentStop) return; const p = stopPlace(currentStop); nav.closeAll(); search.setPlace('from', p); showScreen('plan'); sheet.set('half'); });
$('stopTo').addEventListener('click', () => { if (currentStop) planTo(stopPlace(currentStop)); });

// ---- live vehicles on the map: every vehicle reporting in view, stops when zoomed in
let lmTimer = 0, lmMove = 0, lmSeq = 0, lmStops = false;
const lmLabels = new Map();
const typeColor = (type) => routeColor(type, null);
async function loadStopsGeo() {
  if (lmStops || !ttReady || !mainMap || !mapStyled) return;
  try {
    const geo = await call('stopsGeo');
    stopKinds.clear();
    for (const f of geo.features) { const p = f.properties; if (p.kind === 'platform') stopKinds.set(p.stop, p.st); else if (p.kind !== 'bus' && p.station == null) stopKinds.set(p.stop, p.kind); }
    if (mainMap && mainMap.getSource('lm-stops')) { mainMap.getSource('lm-stops').setData(geo); lmStops = true; }
  } catch (e) { /* stops are a bonus */ }
}
async function refreshLiveMap() {
  const m = mainMap;
  if (!m || !mapStyled || document.hidden || sheet.state.value === 'full') return;
  if (isOpen('picker') || liveShow === 'none') { $('liveNote').textContent = ''; return; }
  if (!liveOn()) { $('liveNote').textContent = ''; m.getSource('lm-veh').setData(EMPTY); return; }
  if (m.getZoom() < 10) { $('liveNote').textContent = t('liveMapZoom'); m.getSource('lm-veh').setData(EMPTY); return; }
  const my = ++lmSeq;
  const b = m.getBounds();
  try {
    const vs = await live.vehiclesInBounds({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() });
    if (my !== lmSeq || !mainMap || !mapStyled) return;
    const need = Array.from(new Set(vs.map((v) => String(v.lineRef)).filter((id) => !lmLabels.has(id))));
    if (need.length && ttReady) {
      const labels = await call('routeLabels', { ids: need });
      for (const id of need) lmLabels.set(id, labels[id] || null);
      if (my !== lmSeq || !mainMap || !mapStyled) return;
    }
    const now = Date.now();
    const nwAll = live.newest(vs);
    const feedLag = nwAll ? (now - nwAll.getTime()) / 60000 : 0;   // minutes the whole feed is behind the clock
    const features = vs.filter((v) => live.isFresh(v, 300, nwAll)).map((v) => {   // fresh against this area's own newest report
      const lb = lmLabels.get(String(v.lineRef));
      const age = nwAll ? (nwAll.getTime() - v.recordedAt.getTime()) / 1000 : 0;   // behind the feed, not the clock
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        properties: { line: lb ? lineText(lb.line) : '?', type: lb ? lb.type : 3, color: routeColor(lb ? lb.type : 3, lb && lb.agency), ckey: routeColor(lb ? lb.type : 3, lb && lb.agency).slice(1), tcol: textOn(routeColor(lb ? lb.type : 3, lb && lb.agency)), opacity: feedLag >= 4 ? 0.4 : age > 120 ? 0.55 : 1, bearing: heading(v),
          headsign: lb ? lb.headsign : '', agency: lb ? lb.agency : '', lineRef: v.lineRef, ref: String(v.lineRef), start: v.scheduledStart.getTime(), seen: v.recordedAt.getTime(), velocity: v.velocity || 0 } };
    });
    for (const ck of new Set(features.map((f) => f.properties.ckey))) if (!m.hasImage('wayli-arrow-' + ck)) m.addImage('wayli-arrow-' + ck, arrowImage('#' + ck), { pixelRatio: 2 });
    m.getSource('lm-veh').setData({ type: 'FeatureCollection', features });
    const nw = live.newest(vs);
    const ageMin = nw ? Math.round((now - nw.getTime()) / 60000) : 0;
    const shown = Array.isArray(liveShow) ? features.filter((f) => liveShow.includes(f.properties.ref)).length : features.length;
    const scope = !Array.isArray(liveShow) ? '' : nearRoutes && liveShow === nearRoutes.ids ? t('liveScopeNear') : t('liveScopeSearch');
    const age = ageMin >= 4 ? t('liveAgeBehind', { n: ageMin }) : ageMin >= 3 ? t('liveAge', { n: ageMin }) : '';
    $('liveNote').textContent = shown ? t(shown === 1 ? 'liveMapOne' : 'liveMapCount', { n: shown, scope, time: nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }), age }) : t('liveMapNone', { scope });
    $('liveNote').classList.toggle('lag', !!shown && ageMin >= 4);
    try { window.wayliDebug = { ...(window.wayliDebug || {}), liveMapVehicles: features.length }; } catch (e) {}
  } catch (e) { if (my === lmSeq) $('liveNote').textContent = t('liveFail'); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLiveMap(); });
/** A vehicle's heading in degrees, or -1 when it reports none (0 while standing still means unknown). */
const heading = (v) => (v.bearing != null && (v.bearing !== 0 || (v.velocity || 0) > 0) ? v.bearing : -1);
const stopKinds = new Map();   // stop -> 'rail' | 'lrt' | 'station' for stops that are, or belong to, a station
const stopKindProp = (stop) => (stopKinds.has(stop) ? { kind: stopKinds.get(stop) } : {});
/** A station badge (rail, lrt, bus station) or the smaller bus-stop badge: a white disc with a coloured ring and the
 *  mode's glyph from the icon set, drawn at 2x. */
function stationImage(kind) {
  const station = kind !== 'bus', size = station ? 44 : 30, c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const color = kind === 'rail' ? routeColor(2) : kind === 'lrt' ? routeColor(0) : station ? routeColor(3) : '#5f6b72';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - (station ? 2.5 : 2), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = station ? 3 : 2; ctx.strokeStyle = color; ctx.stroke();
  const k = (station ? 26 : 18) / 24;
  ctx.translate((size - 24 * k) / 2, (size - 24 * k) / 2); ctx.scale(k, k);
  ctx.lineWidth = station ? 2.1 : 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  ctx.stroke(new Path2D(ICONS[kind === 'rail' ? 'train' : kind === 'lrt' ? 'tram' : 'bus']));
  return ctx.getImageData(0, 0, size, size);
}
const BADGE_KINDS = ['rail', 'lrt', 'station', 'bus'];
/** A small upward triangle in a colour, with a white edge, drawn at 2x for crisp rotation. */
function arrowImage(color) {
  const size = 36, c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.beginPath(); ctx.moveTo(size / 2, 4); ctx.lineTo(size - 7, size - 6); ctx.lineTo(size / 2, size - 13); ctx.lineTo(7, size - 6); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'round'; ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}
async function selectVehicle(p, coords) {
  if (isOpen('picker')) return;
  const lb = lmLabels.get(String(p.lineRef));
  // which trip it runs and how late: one worker call
  let st = { trip: -1 };
  try { st = (await call('vehiclesStatus', { vehicles: [{ lineRef: p.lineRef, scheduledStart: +p.start, lat: coords[1], lon: coords[0], recordedAt: +p.seen }] }))[0] || st; } catch (e) { /* schedule only */ }
  vehiclePopup(mainMap, coords, { line: st.line || (lb ? lb.line : '?'), routeType: st.routeType ?? (lb ? lb.type : 3), headsign: st.headsign || (lb ? lb.headsign : ''), agency: st.agency || (lb ? lb.agency : ''), delay: st.delay, stale: !!st.stale, seen: new Date(+p.seen), velocity: +p.velocity, trip: st.trip, route: st.route ?? (lb ? lb.route : null) });
}

// ---- a line's page (course, stops, vehicles now); the search by number is in the top bar
let lineVeh = [], lineTimer = 0, lineSeq = 0, lineCur = null;
async function openLine(route) {
  const my = ++lineSeq;
  let info;
  try { info = await call('lineInfo', { route }); } catch (e) { toast(t('liveFail')); return; }
  if (my !== lineSeq) return;
  lineCur = info;
  mapOf.lineDetail = async (seq) => {
    const m = await mapReady();
    if (!m || my !== lineSeq || stale(seq)) return;
    const b = drawJourney(m, { legs: [{ type: 'ride', routeType: info.routeType, path: info.path, pattern: null }] }, journeyMarkers);
    // every stop of the line as a dot
    m.getSource('stops').setData({ type: 'FeatureCollection', features: info.stops.map((st) => ({ type: 'Feature', properties: { stop: st.stop, ...stopKindProp(st.stop) }, geometry: { type: 'Point', coordinates: [st.lon, st.lat] } })) });
    fitMap(b, 15);
    lineLive();
  };
  showOverlay('lineDetail');
  $('lineTitle').textContent = `${t('lineTitle', { line: lineText(info.line) })} · ${t('toward', { headsign: info.headsign })}`;
  $('lineMeta').textContent = `${info.agency} · ${t('tripsToday', { n: info.trips })} · ${fmtPlus(info.first)}–${fmtPlus(info.last)} · ${t('stopsCount', { n: info.stops.length })}`;
  $('lineLive').hidden = true;
  const dirs = $('lineDirs');
  dirs.innerHTML = '';
  for (const o of info.others) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chipbtn'; b.innerHTML = `${ic('arrowsLR')} ${esc(t('otherDir', { headsign: o.headsign }))}`;
    b.addEventListener('click', () => openLine(o.route));
    dirs.appendChild(b);
  }
  const box = $('lineStops');
  box.innerHTML = info.stops.map((st, i) => `<div class="linerow" data-i="${i}"><span class="idx">${i + 1}</span><span class="name">${esc(st.name)}<small class="muted"> ${esc(st.city || '')}</small></span></div>`).join('');
  for (const row of box.querySelectorAll('.linerow')) row.addEventListener('click', () => openStop(info.stops[+row.dataset.i].stop));
  clearInterval(lineTimer);
  lineTimer = setInterval(lineLive, 20000);
}
/** The line's vehicles on its map, with how late each runs. */
async function lineLive() {
  const info = lineCur;
  if (!info || !isOpen('lineDetail') || !liveOn() || info.routeId == null) return;
  const my = lineSeq;
  try {
    const vs = await live.vehiclesByLine(info.routeId);
    if (my !== lineSeq) return;
    const st = vs.length ? await call('vehiclesStatus', { vehicles: vehiclesForWorker(vs) }) : [];
    if (my !== lineSeq) return;
    for (const mk of lineVeh.splice(0)) mk.remove();
    if (mainMap && drawnFor === 'lineDetail') lineVehicleMarkers(mainMap, lineVeh, vs, st, info.routeType, null, { line: info.line, headsign: info.headsign, agency: info.agency, route: info.route });
    const nw = live.newest(vs);
    $('lineLive').textContent = vs.length ? `${t('vehiclesOnLine', { n: vs.length })} · ${nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}` : t('noLineVehicles');
    $('lineLive').className = 'livebadge ' + (vs.length ? 'ok' : '');
    $('lineLive').hidden = false;
  } catch (e) { /* the schedule stays */ }
}
$('lineBack').addEventListener('click', () => nav.close('lineDetail'));

// ---- one trip: every stop with its time, and where the vehicle is
async function openTrip(trip, hereStop) {
  const ts = await tripStopsCached(trip);
  showOverlay('tripDetail');
  $('tripTitle').textContent = t('tripStopsTitle', { line: lineText(ts.line), headsign: ts.headsign });
  $('tripMeta').textContent = `${ts.agency} · ${t('stopsCount', { n: ts.stops.length })}`;
  const box = $('tripStops');
  const day = search.day.value;
  box.innerHTML = ts.stops.map((s, i) => `<div class="stopsrow${s.stop === hereStop ? ' here' : ''}" data-i="${i}"><span class="time">${fmt(s.arr)}</span><span>${esc(s.name)}</span></div>`).join('');
  for (const row of box.querySelectorAll('.stopsrow')) row.addEventListener('click', () => { nav.close('tripDetail'); openStop(ts.stops[+row.dataset.i].stop); });
  if (!liveOn() || ts.routeId == null) return;
  try {
    const vs = await live.vehiclesByLine(ts.routeId);
    const v = live.matchTrip(vs, ts.routeId, ts.firstDep, day);
    const est = v && live.estimateDelay(v, ts.stops, day);
    if (!est) { $('tripMeta').textContent += ` · ${t('liveNoVehicle')}`; return; }
    const row = box.querySelector(`[data-i="${est.index + (est.frac > 0.5 ? 1 : 0)}"]`);
    if (row) { const tag = document.createElement('span'); tag.className = 'veh'; tag.innerHTML = `${ic('bus')} ${t('vehicleHere')}${est.delay ? ` (${live.delayMinutes(est.delay) > 0 ? '+' : ''}${live.delayMinutes(est.delay)})` : ''}`; row.appendChild(tag); row.scrollIntoView({ block: 'center' }); }
  } catch (e) { /* no live, no problem */ }
}
$('tripBack').addEventListener('click', () => nav.close('tripDetail'));

// ---------------------------------------------------------------- saved: places, trips, stops (this device only)
function updateStar(id, key, kind) { const on = key && favs.has(kind, key); $(id).innerHTML = ic('star'); $(id).classList.toggle('on', on); }
/** The last search, shown as it was (its own place and time), when it is under an hour old and went to this place. */
function restoreLast(p) {
  const last = lastSearch.get();
  if (!last || !last.q || !last.result || !last.result.journeys || !last.result.journeys.length || Date.now() - last.at > 3600e3) return false;
  if (!last.q.to || !p || last.q.to.name !== p.name || last.q.day !== search.day.value && !(manifest && manifest.days.some((d) => d.date === last.q.day))) return false;
  nav.closeAll(); showScreen('plan');
  search.day.value = last.q.day; applyQuery(last.q); results.setResults(last.result, last.q, last.at); sheet.set('half');
  return true;
}
async function planTo(p) {
  if (restoreLast(p)) return;
  nav.closeAll();
  showScreen('plan');
  search.setPlace('to', p);
  results.status.value = 'locating';
  sheet.set('half');
  search.fromText.value = t('locating');
  try { const pos = await getPosition(); search.setPlace('from', myLocation(pos)); } catch (e) { if (!search.from.value || search.from.value.transient) search.setPlace('from', null); else search.fromText.value = search.from.value.name; }
  search.resetNow();
  if (search.from.value) plan(); else { results.status.value = 'idle'; showPlanError(t('noLocation')); search.focusBox('toQ'); }
}
// ---------------------------------------------------------------- settings
// ---- alerts: vibration, a beep and a notification
let audio = null;
function ensureAudio() { try { if (!audio && window.AudioContext) audio = new AudioContext(); if (audio && audio.state === 'suspended') audio.resume(); } catch (e) {} }
function beep() {
  if (!audio) return;
  try {
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      const t0 = audio.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.start(t0); o.stop(t0 + 0.3);
    }
  } catch (e) {}
}
async function requestAlertPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
  if (Notification.permission === 'denied') toast(t('alertPermNo'));
}
function alertUser(title, body) {
  const s = settings.get();
  if (s.sound) { try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 700]); } catch (e) {} beep(); }
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') {
    const opts = { body, tag: 'wayli-trip', renotify: true, vibrate: [400, 150, 400], icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang };
    const direct = () => { try { new Notification(title, opts); } catch (e) {} };
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then((reg) => (reg && reg.showNotification ? reg.showNotification(title, opts) : direct())).catch(direct);
    else direct();
  }
  toast(`${title}${body ? ' · ' + body : ''}`, 7000);
}

// ---------------------------------------------------------------- follow mode: "start a trip"
let fol = null, followVehicle = [], meMarker = null;
const tripStale = (a) => live.nowOn(a.day) > a.journey.arrive + 2700 || Date.now() - (a.startedAt || 0) > 12 * 3600e3;
function startTrip(j, q) {
  const day = q.day;
  if (live.nowOn(day) > j.arrive + 1800) { toast(t('tripOver')); return; }
  ensureAudio();
  const firstRide = j.legs.find((l) => l.type === 'ride');
  const aboard = firstRide && live.nowOn(day) > firstRide.depart + 60;   // started after the ride left: the rider is on it
  const a = { journey: { ...j, to: q.to.lat != null ? { name: q.to.name, lat: q.to.lat, lon: q.to.lon } : null }, q: { from: q.from, to: q.to, bike: q.bike, folding: q.folding }, day, state: aboard ? aboardState(j, live.nowOn(day)) : initialState(), view: 'follow', startedAt: Date.now() };
  activeTrip.set(a);
  requestAlertPermission();
  if (!nav.swap('detail', 'follow')) nav.closeAll();
  openFollow(a);
}
function openFollow(a) {
  if (fol && fol.a !== a) closeFollow(false);
  if (!fol) {
    fol = { a, pos: null, watch: null, timer: 0, liveTimer: 0, replanTimer: 0, wake: null, liveEst: null, liveChecked: false, alt: null, dismissed: {}, replanAt: 0, replanning: false, toldKey: null };
    if (navigator.geolocation) {
      fol.watch = navigator.geolocation.watchPosition((p) => { fol.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; follow.pos.value = fol.pos; notePos(fol.pos.lat, fol.pos.lon); stepFollow(); },
        () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
    fol.timer = setInterval(stepFollow, 5000);
    fol.liveTimer = setInterval(followLive, 30000);
    fol.replanTimer = setInterval(() => replanCheck(), 60000);
    requestWake();
  }
  a.view = 'follow'; activeTrip.set(a);
  mapOf.follow = async (seq) => {
    const m = await mapReady();
    if (!m || !fol || fol.a !== a || stale(seq)) return;
    await withCourses(a.journey);
    if (!fol || fol.a !== a || stale(seq)) return;
    fitMap(drawJourney(m, a.journey, journeyMarkers), 16);
    stepFollow(); followLive();
  };
  showOverlay('follow');
  follow.resumable.value = null;
  stepFollow();
}
async function requestWake() {
  try { if (fol && navigator.wakeLock && document.visibilityState === 'visible') fol.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (fol && document.visibilityState === 'visible') { requestWake(); stepFollow(); } });
function stepFollow() {
  if (!fol) return;
  const a = fol.a;
  const now = live.nowOn(a.day);
  const pos = fol.pos && Date.now() - fol.pos.at < 90000 ? fol.pos : null;
  const { state, events } = advance(a.journey, a.state, pos, now);
  a.state = state;
  activeTrip.set(a);
  for (const e of events) onFollowEvent(e, a);
  renderFollow();
}
function onFollowEvent(e, a) {
  const v = followView(a.journey, a.state, live.nowOn(a.day));
  if (e === 'getOffNext') { const leg = a.journey.legs[a.state.step]; alertUser(t('alertSoon'), t('alertSoonBody', { name: leg.to ? leg.to.name : '' })); }
  else if (e === 'getOff') alertUser(t('alertOff'), '');
  else if (e === 'arrived') alertUser(t('alertArrived'), t('arrived'));
  else if (e === 'boarded') toast(t('boarded', { line: lineText(v.leg ? v.leg.line : '') }));
}
/** The screen draws from the published trip (features/follow); the map gets the rider's dot here. */
function renderFollow() {
  if (!fol) return;
  const a = fol.a;
  follow.publish(a, fol.alt);
  if (mainMap && mapStyled && drawnFor === 'follow' && fol.pos) {
    if (!meMarker) { const el = document.createElement('div'); el.className = 'wayli-me'; meMarker = new maplibregl.Marker({ element: el }).setLngLat([fol.pos.lon, fol.pos.lat]).addTo(mainMap); }
    else meMarker.setLngLat([fol.pos.lon, fol.pos.lat]);
  }
  if (a.state.done) finishFollow();
}
/** The vehicle of the current or next ride, every 30 s. */
async function followLive() {
  if (!fol || !liveOn()) return;
  const a = fol.a, now = live.nowOn(a.day);
  const leg = a.journey.legs.slice(a.state.step).find((l) => l.type === 'ride');
  if (!leg || leg.routeId == null || leg.depart - now > 3600 || !dayInfo || dayInfo.date !== a.day) { fol.liveEst = null; return; }
  fol.liveChecked = true;
  try {
    const vs = await live.vehiclesByLine(leg.routeId);
    if (!fol) return;
    const statuses = vs.length ? await call('vehiclesStatus', { vehicles: vehiclesForWorker(vs) }) : [];
    if (!fol) return;
    for (const mk of followVehicle.splice(0)) mk.remove();
    if (mainMap && drawnFor === 'follow') lineVehicleMarkers(mainMap, followVehicle, vs, statuses, leg.routeType, leg.trip, { line: leg.line, headsign: leg.headsign, agency: leg.agency, route: leg.route });
    const v = live.matchTrip(vs, leg.routeId, leg.firstDep, a.day);
    if (!v) { fol.liveEst = null; follow.liveBadge.value = null; renderFollow(); replanCheck(); return; }
    const ts = await tripStopsCached(leg.trip);
    const est = live.estimateDelay(v, ts.stops, a.day);
    const at = live.liveAt(est, ts.stops, leg.boardPos);
    fol.liveEst = est ? { est, at } : null;
    follow.liveBadge.value = at ? liveBadge(at) : null;
    renderFollow();
    replanCheck();
  } catch (e) { /* live is a bonus */ }
}
// ---- re-planning on the way: when delays make another way faster, say so and offer to switch
let replanGain = 240;   // s: an alternative has to arrive this much earlier (plus 3 min per extra transfer) to be proposed
const replanSkip = (why) => { try { window.wayliDebug = { ...(window.wayliDebug || {}), lastReplan: { skipped: why } }; } catch (e) {} };
async function replanCheck(force = false) {
  if (!fol || fol.replanning) return;
  if (!liveOn() || !dayInfo || dayInfo.date !== fol.a.day || document.hidden) { replanSkip(!liveOn() ? 'live off' : document.hidden ? 'hidden' : 'other day'); return; }
  const a = fol.a, now = live.nowOn(a.day);
  const delay = fol.liveEst && fol.liveEst.est ? fol.liveEst.est.delay : 0;
  const origin = replanOrigin(a.journey, a.state, now, delay);
  if (!origin) { replanSkip('nothing left to change'); if (fol.alt) { fol.alt = null; renderFollow(); } return; }
  // reasons to look: the ride is late, its vehicle is missing close to departure, or five minutes passed
  const nextRide = a.journey.legs.slice(origin.rideStep).find((l) => l.type === 'ride');
  const late = delay >= 180;
  const missing = fol.liveChecked && !fol.liveEst && nextRide && nextRide.depart - now < 600 && nextRide.depart - now > -300;
  const due = Date.now() - fol.replanAt > 300000;
  if (!force && !(late || missing || due)) { replanSkip('no reason yet'); return; }
  if (!force && Date.now() - fol.replanAt < 90000) { replanSkip('too soon'); return; }
  fol.replanning = true; fol.replanAt = Date.now();
  try {
    let vehicles = null;
    try { vehicles = await live.vehiclesForPlanning(origin.from.lat, origin.from.lon, { timeoutMs: 8000, radiusKm: 8 }); } catch (e) { vehicles = null; }
    if (!fol || fol.a !== a) return;
    const q = a.q;
    const r = await call('plan', { from: origin.from, to: q.to, fromTime: origin.fromTime, toTime: origin.fromTime + 3600, bike: q.bike === 'along' ? 'along' : 'none', folding: !!q.folding, weekday: dateOf(a.day).getDay() <= 4, maxWalk: settings.get().maxWalk * 60, vehicles });
    if (!fol || fol.a !== a) return;
    const curKey = remainingKey(a.journey, a.state);
    const remainingRides = a.journey.legs.slice(a.state.step).filter((l) => l.type === 'ride').length;
    let curArrive = a.journey.arrive + Math.max(0, delay);
    const same = r.journeys.find((j) => ridesKey(j.legs) === curKey);
    if (same) curArrive = Math.min(curArrive, same.arrive);   // staying, with the delays the planner knows of
    let best = null;
    for (const j of r.journeys) {
      const key = ridesKey(j.legs) || 'walk';
      if (key === curKey) continue;
      const rides = j.legs.filter((l) => l.type === 'ride').length;
      if (curArrive - j.arrive < replanGain + 180 * Math.max(0, rides - remainingRides)) continue;
      if (fol.dismissed[key] && Date.now() - fol.dismissed[key] < 900000) continue;
      best = { journey: j, origin, key, gain: curArrive - j.arrive };
      break;
    }
    fol.alt = best;
    try { window.wayliDebug = { ...(window.wayliDebug || {}), lastReplan: { origin, found: r.journeys.length, curArrive, same: !!same, best: best && { arrive: best.journey.arrive, gain: best.gain, key: best.key } } }; } catch (e) {}
    renderFollow();
    if (best && best.key !== fol.toldKey) { fol.toldKey = best.key; toast(t('fasterWay'), 5000); try { if (settings.get().sound && navigator.vibrate) navigator.vibrate(200); } catch (e) {} }
  } catch (e) { replanSkip('failed: ' + (e && e.message)); } finally { if (fol) fol.replanning = false; }
}
function switchJourney(alt) {
  if (!fol) return;
  const a = fol.a;
  const { journey, state } = spliceJourney(a.journey, a.state, alt.journey, alt.origin);
  a.journey = journey; a.state = state; a.replanned = (a.replanned || 0) + 1;
  fol.alt = null; fol.liveEst = null; fol.toldKey = null; fol.replanAt = Date.now();
  activeTrip.set(a);
  follow.liveBadge.value = null;
  redrawMap(true);
  stepFollow(); followLive();
  toast(t('routeSwitched'));
}
try { window.wayliDebug = { ...(window.wayliDebug || {}), replan: () => replanCheck(true), setReplanGain: (g) => { replanGain = g; } }; } catch (e) {}
function skipStep() {
  if (!fol) return;
  const a = fol.a, legs = a.journey.legs, s = a.state;
  const leg = legs[s.step];
  if (leg && leg.type === 'ride' && !s.onBoard) { s.onBoard = true; s.rideIdx = 0; }
  else if (s.step >= legs.length - 1) { s.done = true; }
  else { s.step++; s.onBoard = false; s.rideIdx = 0; }
  activeTrip.set(a); renderFollow();
}
function finishFollow() { setTimeout(() => { if (fol && fol.a.state.done) { closeFollow(true); nav.close('follow'); toast(t('arrived'), 4000); } }, 15000); }
function closeFollow(end) {
  if (fol) {
    if (fol.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(fol.watch);
    clearInterval(fol.timer); clearInterval(fol.liveTimer); clearInterval(fol.replanTimer);
    if (fol.wake) { try { fol.wake.release(); } catch (e) {} }
    if (end) activeTrip.clear(); else { fol.a.view = 'hidden'; activeTrip.set(fol.a); }
    fol = null;
    follow.publish(null); follow.liveBadge.value = null;
  }
  for (const mk of followVehicle.splice(0)) mk.remove();
  if (meMarker) { meMarker.remove(); meMarker = null; }
  delete mapOf.follow;
  updateResumeBar();
}
function updateResumeBar() {
  const a = activeTrip.get();
  if (!a || fol || tripStale(a)) { follow.resumable.value = null; if (a && tripStale(a)) activeTrip.clear(); return; }
  follow.resumable.value = a;
}
Object.assign(follow.hooks, {
  skip: () => skipStep(),
  end: () => { closeFollow(true); nav.close('follow'); toast(t('tripEnded')); },
  hide: () => nav.close('follow'),
  resume: () => { const a = activeTrip.get(); if (a) { nav.closeAll(); openFollow(a); } },
  switchTo: (alt) => switchJourney(alt),
  dismiss: (alt) => { if (!fol) return; fol.dismissed[alt.key] = Date.now(); fol.alt = null; renderFollow(); },
});

// ---------------------------------------------------------------- screens and the back button
// Every overlay and every tab change is a history entry, so the phone's back button (or the browser's)
// closes the overlay or returns to the previous tab instead of leaving the app. Closing with an
// in-app button goes through history too, so both paths look the same.
// A close steps history back; the browser performs that later, and a pushState made meanwhile would be
// swallowed by it (the traversal is measured from where the call was made). So while a step back is
// pending, new entries wait in `queued` and are pushed once its popstate arrives.
const nav = {
  stack: [],   // entries: {kind: 'overlay', id}, {kind: 'tab', from} or {kind: 'plan'}
  settling: false, queued: [],
  push(entry) {
    this.stack.push(entry);
    if (this.settling) { this.queued.push(entry); return; }
    try { history.pushState({ wayli: this.stack.length }, ''); } catch (e) {}
  },
  /** History caught up with a close: push what waited, in stack order. */
  settled() {
    this.settling = false;
    for (const e of this.queued.splice(0)) { const i = this.stack.indexOf(e); if (i >= 0) try { history.pushState({ wayli: i + 1 }, ''); } catch (x) {} }
  },
  stepBack(n) {
    this.settling = true;
    try { history.go(-n); } catch (e) { this.settled(); return; }
    setTimeout(() => { if (this.settling) this.settled(); }, 600);
  },
  /** Undo the top entry (called from popstate, or to close programmatically). */
  undo(entry) {
    if (entry.kind === 'overlay') hideOverlay(entry.id);
    else if (entry.kind === 'tab') showScreen(entry.from, false);
    else if (entry.kind === 'plan') clearPlan();
  },
  /** Close the given overlay (or the plan) now; history steps back one entry to match (its popstate then finds nothing left to undo). */
  close(id) {
    const i = this.stack.findIndex((e) => (e.kind === 'overlay' && e.id === id) || (e.kind === 'plan' && id === 'plan'));
    if (i < 0) { if (id === 'plan') clearPlan(); return; }
    const [entry] = this.stack.splice(i, 1);
    if (entry.kind === 'plan') clearPlan(); else hideOverlay(id);
    this.stepBack(1);
  },
  /** Replace one open overlay by another in place (the trip detail becomes the trip being followed). */
  swap(oldId, newId) {
    const i = this.stack.findIndex((e) => e.kind === 'overlay' && e.id === oldId);
    if (i < 0) return false;
    this.stack[i] = { kind: 'overlay', id: newId };
    if (popup) { popup.remove(); popup = null; }
    if (OVERLAY_CLOSE[oldId]) OVERLAY_CLOSE[oldId]();
    renderPanels();
    return true;
  },
  /** Close every panel and return to the base screen (the history catches up on its own). */
  closeAll() {
    const old = this.stack;
    if (!old.length) return;
    this.stack = [];
    const base = old.find((e) => e.kind === 'tab');
    if (base) screen = base.from;
    for (const e of old) if (e.kind === 'overlay') hideOverlay(e.id);
    renderPanels();
    this.stepBack(old.length);
  },
};
const isOpen = (id) => nav.stack.some((e) => e.kind === 'overlay' && e.id === id);
const topPanel = () => { for (let i = nav.stack.length - 1; i >= 0; i--) if (nav.stack[i].kind === 'overlay' && nav.stack[i].id !== 'drawer') return nav.stack[i].id; return null; };
const OVERLAY_CLOSE = { detail: () => { detailSeq++; delete mapOf.detail; }, stopDetail: () => { clearInterval(stopTimer); stopSeq++; delete mapOf.stopDetail; }, lineDetail: () => { clearInterval(lineTimer); lineSeq++; lineCur = null; delete mapOf.lineDetail; },
  picker: () => { const r = pickResolve; pickResolve = null; if (pickMarker) { pickMarker.remove(); pickMarker = null; } if (r) r(null); }, chooser: () => chooser.finish(null, false), follow: () => { if (fol) closeFollow(false); delete mapOf.follow; } };
const PANEL_EL = { picker: 'pickbar' };
function showOverlay(id) {
  if (isOpen(id)) { redrawMap(true); return; }
  nav.push({ kind: 'overlay', id });
  renderPanels();
}
function hideOverlay(id) {
  if (popup) { popup.remove(); popup = null; }
  if (OVERLAY_CLOSE[id]) OVERLAY_CLOSE[id]();
  renderPanels();
}
window.addEventListener('popstate', (e) => {
  if (nav.settling) { nav.settled(); return; }   // our own step back: the stack is already right
  const depth = e.state && e.state.wayli ? e.state.wayli : 0;
  while (nav.stack.length > depth) nav.undo(nav.stack.pop());
});
try { history.replaceState({ wayli: 0 }, ''); } catch (e) {}
let screen = 'plan';
/** How open the sheet is when a panel or screen comes up. */
// screens that need no map are pages over the whole screen (the sheet grows to it; the bar, the map's buttons and the handle go)
const PAGE_TITLE = { 'screen-more': 'settings', 'screen-saved': 'tabSaved', chooser: null };
$('pageBack').addEventListener('click', () => { if (topPanel() === 'chooser') chooser.finish(null); else if (nav.stack.length) history.back(); else showScreen('plan'); });
const SHEET_FOR = { 'screen-plan': () => (results.showing.value || search.from.value || search.to.value ? 'half' : 'peek'), 'screen-nearby': 'half', 'screen-saved': 'full', 'screen-more': 'full', chooser: 'full' };
/** Show the panel on top of the stack, or the current screen; picking a point hides the sheet and shows the crosshair. */
function renderPanels() {
  renderDrawer();
  const top = topPanel();
  const picking = top === 'picker';
  $('pickbar').hidden = !picking;
  document.querySelector('.topbar').hidden = picking;
  $('sheet').hidden = picking;
  const key = top || 'screen-' + screen;
  const show = picking ? null : (PANEL_EL[key] || key);
  for (const el of document.querySelectorAll('#sheetBody > .screen, #sheetBody > .detail')) el.hidden = el.id !== show;
  const page = !picking && key in PAGE_TITLE;
  document.body.classList.toggle('page', page);
  if (page) { $('pageTitle').textContent = PAGE_TITLE[key] ? t(PAGE_TITLE[key]) : chooser.title.value; $('sheetBody').scrollTop = 0; }
  if (!picking) { const st = SHEET_FOR[key]; sheet.set(typeof st === 'function' ? st() : st || 'half'); }
  redrawMap();
}
function showScreen(name, record = true) {
  if (record && name !== screen) nav.push({ kind: 'tab', from: screen });
  screen = name;
  renderPanels();
  if (name === 'nearby' && ttReady && nearby.status.value !== 'ready') loadNearby();
}
sheet.hooks.changed = (prev, st) => {
  if (prev === 'full' && st !== 'full') refreshLiveMap();
  if (st !== prev && mainMap && (st === 'peek' || prev === 'peek')) $('sheetBody').scrollTop = 0;
};
init().catch((e) => setStatus(t('loadFail', { msg: e.message }), true));
