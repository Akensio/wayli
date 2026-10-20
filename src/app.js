// Wayli app shell. The worker (worker.js) holds the data; this file is the UI.
// Pure logic lives next door: live.js (real-time), follow.js (trip following), store.js (on-device memory).
import { settings, recentPlaces, recentTrips, savedPlaces, favs, lastSearch, activeTrip } from './store.js';
import * as live from './live.js';
import { initialState, aboardState, advance, view as followView, replanOrigin, ridesKey, remainingKey, spliceJourney } from './follow.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- icons: one stroke set on a 24-unit grid, as an inline SVG sprite (and drawn on canvas for the map)
import { ic } from './ui/icons.ts';
import * as map from './map/index.ts';   // the one map: what each panel draws on it, the live layer, the picker
import { call, DATA_URL, tripStopsCached, resetCaches, hooks as workerHooks } from './worker/client.ts';
import * as data from './state/data.ts';
import { lastPos, notePos, getPosition, warmPosition, hooks as positionHooks } from './state/position.ts';
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
import * as nav from './state/nav.ts';   // screens, panels and the back button
import * as stopPage from './state/stop.ts';
import * as linePage from './state/line.ts';
import * as tripPage from './state/trip.ts';
import { agencyName } from './journey/agencies.ts';   // the bottom sheet: peek, half or full
import { topPad, fullPx as fullSheetPx } from './state/sheet.ts';   // the plan's results: the list, the ways on the map, the recent trips
import { routeColor, textOn, chipStyle, legColor } from './journey/colors.ts';
import { dur, lineText, describePlace, leaveText, inShort, tripKey, liveBadge, fmtPlus } from './journey/format.ts';

// ---------------------------------------------------------------- i18n
import { t, lang as langSig, storeLang } from './i18n.ts';
let lang = langSig.value;
map.applyTheme();
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}
function setLang(l) {
  lang = l; storeLang(l);
  applyLang(); saved.refresh(); results.refreshRecent();
  if (map.mapState.main) map.setBasemapLang(map.mapState.main);
  // stop names, headsigns and map labels come from the worker: ask again in the new language
  call('setLang', { lang }).then(() => {
    map.resetLive(); map.loadStopsGeo();
    const located = (p) => p && !(p.transient && p.lat == null);   // never a location prompt for a language switch
    if (results.result.value && located(search.from.value) && located(search.to.value)) plan();
  }).catch(() => {});
}
// ---------------------------------------------------------------- status
workerHooks.progress = (m) => showProgress(m);
workerHooks.failed = (msg) => setStatus(t('loadFail', { msg }), true);
let statusTimer = 0;
function setStatus(text, error = false, frac = null) {
  appState.status.value = { text, error, frac };
  clearTimeout(statusTimer);
  if (!error && frac == null) statusTimer = setTimeout(() => { appState.status.value = { text, error, frac, hidden: true }; }, 4000);
}
function showProgress(m) {
  if (m.label === 'shapes') return;   // quiet: the courses arrive in the background
  const label = m.label === 'timetable' ? t('loadingTT') : m.label === 'places' ? t('loadingPL') : t('loadingST');
  const mb = (m.got / 1e6).toFixed(1) + (m.total ? ' / ' + (m.total / 1e6).toFixed(1) : '') + ' MB';
  setStatus(`${label}: ${m.unpacking ? t('unpacking') : mb}`, false, m.total ? m.got / m.total : null);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------- time, days (Israel time, service days)
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

// ---------------------------------------------------------------- data data.manifest.value and days
/** The service days the data covers, for the day pills; the chosen day stays if it is one of them. */
function renderDays() {
  if (!data.manifest.value) return;
  search.days.value = data.manifest.value.days.map((d) => d.date);
  if (!search.days.value.includes(search.day.value)) search.day.value = data.dayInfo.value ? data.dayInfo.value.date : data.manifest.value.days[0].date;
}
async function loadDay(date) {
  const d = data.manifest.value.days.find((x) => x.date === date) || data.manifest.value.days[0];
  data.ttReady.value = false;
  search.busy.value = true;
  call('setLang', { lang });   // names come back in the rider's language where the timetable carries them
  const info = await call('loadTimetable', { url: `${DATA_URL}${d.file}?v=${encodeURIComponent(data.manifest.value.built || '')}` });
  data.dayInfo.value = info; data.ttReady.value = true; resetCaches(); map.resetLive();
  search.busy.value = false;
  map.loadStopsGeo(); map.refreshLiveMap();
  setStatus(t('ready', { trips: info.counts.trips.toLocaleString(), date: dayLabel(info.date) }));
  renderDays();
}
async function loadPlaces() {
  if (data.plReady.value || !data.manifest.value.places) return;
  try {
    await call('loadPlaces', { url: `${DATA_URL}${data.manifest.value.places.file}?v=${encodeURIComponent(data.manifest.value.places.built || data.manifest.value.built || '')}` });
    data.plReady.value = true;
    for (const side of ['from', 'to']) if (!search.sides[side].value && search.texts[side].value.trim().length >= 2) $(side + 'Q').dispatchEvent(new Event('input', { bubbles: true }));   // the box searches again, now with addresses
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); }
}
async function loadShapes() {
  if (data.shReady.value || !data.manifest.value.shapes) return;
  try {
    await call('loadShapes', { url: `${DATA_URL}${data.manifest.value.shapes.file}?v=${encodeURIComponent(data.manifest.value.shapes.built || data.manifest.value.built || '')}` });
    data.shReady.value = true;
  } catch (e) { /* straight lines between stops until then */ }
}
async function loadStreets() {
  if (data.stReady.value || !data.manifest.value.streets) return;
  try {
    await call('loadStreets', { url: `${DATA_URL}${data.manifest.value.streets.file}?v=${encodeURIComponent(data.manifest.value.streets.built || data.manifest.value.built || '')}` });
    data.stReady.value = true;
    setStatus(t('readyStreets'));
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); }
}
/** The best service day to plan on right now: tonight's until 03:00, else today. */
function startDay() {
  const svc = live.serviceDay();
  for (const d of [svc.day, calToday()]) if (data.manifest.value.days.some((x) => x.date === d)) return d;
  return data.manifest.value.days[0].date;
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
const updateOnline = () => { appState.online.value = navigator.onLine !== false; };
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
  map.initMap();
  saved.refresh(); results.refreshRecent();
  // a trip in progress comes back first, timetable or not
  const active = activeTrip.get();
  if (active && !tripStale(active)) { updateResumeBar(); if (active.view === 'follow') openFollow(active); } else if (active) activeTrip.clear();
  try {
    data.manifest.value = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  appState.feedInfo.value = data.manifest.value.feed ? { start: data.manifest.value.feed.start, end: data.manifest.value.feed.end, built: data.manifest.value.built } : null;
  if (data.manifest.value.built) { const b = live.ilParts(new Date(data.manifest.value.built)); appState.version.value = t('build', { v: `${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(b.h).padStart(2, '0')}:${String(b.mi).padStart(2, '0')}` }); }
  const params = new URLSearchParams(location.search);
  const shared = parseShared(params);
  const last = shared ? null : lastSearch.get();
  let start = startDay();
  if (shared && data.manifest.value.days.some((d) => d.date === shared.day)) start = shared.day;
  else if (last && last.q && data.manifest.value.days.some((d) => d.date === last.q.day) && Date.now() - last.at < 6 * 3600e3) start = last.q.day;
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
search.hooks.startDay = () => (data.manifest.value ? startDay() : '');

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
  map.applyLiveShow(); nav.renderPanels(); map.redrawMap(true);
}
// the drawer (features/pages/Drawer): the screens, the line search by number (the To box, numeric keyboard)
Object.assign(appState.hooks, {
  go: (name) => { nav.closeAll(); nav.showScreen(name); if (name === 'plan') sheet.set('half'); },
  lineSearch: () => { nav.closeAll(); nav.showScreen('plan'); search.lineMode(); },   // the rows, even over a plan's summary
  closeDrawer: () => nav.close('drawer'),
  setLang: (l) => setLang(l),
  appearanceChanged: () => { map.applyMapStyle(); map.applyTheme(); },
  requestAlertPermission: () => requestAlertPermission(),
  testAlert: async () => { ensureAudio(); await requestAlertPermission(); alertUser(t('alertSoon'), t('testAlertMsg')); },
});

appState.hooks.pickCancel = () => map.closePicker(null);
positionHooks.moved = () => map.updateNearRoutes();
warmPosition();
// what the map's bubbles ask of the app
Object.assign(map.hooks, {
  openTrip: (trip, stop) => openTrip(trip, stop),
  openLine: (route) => openLine(route),
  openStop: (stop) => openStop(stop),
  planTo: (p) => planTo(p),
  planFrom: (p) => { nav.closeAll(); search.setPlace('from', p); nav.showScreen('plan'); search.barOpen.value = true; search.focusBox('toQ'); },
});
// ---- choose a place for home / work / saved (features/pages/Chooser: search, my location or the map)
const choosePlace = (title) => chooser.open(title);
Object.assign(chooser.hooks, {
  show: () => nav.showOverlay('chooser'),
  close: () => nav.close('chooser'),
  locate: async () => { try { const pos = await getPosition(); const r = await call('reverse', pos); return { name: r.name, lat: pos.lat, lon: pos.lon }; } catch (e) { toast(t('noLocation')); return null; } },
  pickOnMap: () => map.pickOnMap(null),
});
Object.assign(saved.hooks, { planTo: (p) => planTo(p), choosePlace, openStop: (stop) => openStop(stop), openLine: (route) => openLine(route) });
Object.assign(nearby.hooks, { load: () => loadNearby(), openStop: (stop) => openStop(stop), openLine: (route) => openLine(route) });

function showPlanError(msg) { results.error.value = msg; if (msg && sheet.state.value === 'peek') sheet.set('half'); }

// ---------------------------------------------------------------- planning
const applyQuery = search.applyQuery;   // fill the bar from a query (a recent search, a shared link, a saved trip)
// What the bar needs from the rest of the app (state/search.ts `hooks`): planning, searching, the map, the menu.
Object.assign(search.hooks, {
  plan: () => { nav.closeAll(); nav.showScreen('plan'); plan(); },
  planTo: (p) => planTo(p),
  clearPlan: () => { if (nav.stack.value.some((e) => e.kind === 'plan')) nav.close('plan'); else clearPlan(); },
  hasResults: () => !!(results.result.value && results.query.value),
  lastQuery: () => results.query.value,
  search: (q) => call('search', { q, limit: 10, lang, near: lastPos }),
  searchLines: (q) => call('searchLines', { q, limit: 6 }),
  lineChipHtml: (r) => `<span class="chip t${r.routeType}"${chipStyle(r.routeType, r.agency)}>${esc(lineText(r.line))}</span>`,
  openLine: (r) => openLine(r.route),
  getPosition: () => getPosition(),
  pickOnMap: (start) => map.pickOnMap(start),
  openMenu: () => nav.showOverlay('drawer'),
  layoutTop: () => layoutTop(),
  toast: (msg) => toast(msg),
  ttReady: () => data.ttReady.value,
  lastPos: () => lastPos,
});
// What the results need (state/results.ts `hooks`): the detail and follow screens, planning again, the sheet and the map.
Object.assign(results.hooks, {
  openDetail: (j, q, bikeOnly) => openDetail(j, q, bikeOnly),
  startTrip: (j, q) => startTrip(j, q),
  plan: (opts) => plan(opts),
  replan: (q) => { applyQuery(q); search.resetNow(); nav.closeAll(); nav.showScreen('plan'); plan(); },
  afterResults: () => { $('sheetBody').scrollTop = 0; if (!nav.topPanel() && nav.screen.value === 'plan' && sheet.state.value === 'peek') sheet.set('half'); map.applyLiveShow(); map.redrawMap(true); },
  redraw: () => map.redrawMap(true),
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
  if (!data.ttReady.value) return;
  for (const side of ['from', 'to']) {   // "my location" is resolved now, not when it was chosen
    const p = search.sides[side].value;
    if (p.transient && p.lat == null) {
      search.texts[side].value = t('locating');
      try { search.setPlace(side, myLocation(await getPosition())); } catch (e) { search.texts[side].value = t('myLoc'); showPlanError(t('noLocation')); return; }
    }
  }
  if (!search.timeTouched.value) { search.setDefaultTime(); if (data.manifest.value && search.day.value !== startDay()) search.day.value = startDay(); }
  if (!nav.stack.value.some((e) => e.kind === 'plan')) nav.push({ kind: 'plan' });   // the back button clears the plan
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
  if (map.liveOn() && !arriveBy && day === svc.day && Math.abs(at - svc.seconds) < 1200 && search.from.value.lat != null) {
    try { vehicles = await live.vehiclesForPlanning(search.from.value.lat, search.from.value.lon, { timeoutMs: 8000 }); liveAsOf = live.newest(vehicles); } catch (e) { vehicles = null; }
  }
  q.liveAsOf = liveAsOf ? liveAsOf.getTime() : null; q.liveTried = !!(map.liveOn() && !arriveBy && day === svc.day && Math.abs(at - svc.seconds) < 1200);
  try {
    const r = await call('plan', { from: search.from.value, to: search.to.value, fromTime, toTime, bike, folding, weekday, maxWalk, arriveBy, vehicles });
    recentTrips.add(q); recentPlaces.add(search.from.value); recentPlaces.add(search.to.value);
    lastSearch.set({ q, result: r, at: Date.now() });
    results.setResults(r, q);
    results.refreshRecent();
  } catch (e) { showPlanError(e.message); results.result.value = null; results.status.value = 'idle'; }
  search.busy.value = false;
}
// ---------------------------------------------------------------- journey detail
let detailSeq = 0;
/** The results on the map: the ways switched on, the highlighted one in colour with its stops, the others grey,
 *  each with a badge of its minutes at the middle of its longest ride (a tap highlights that way). */
map.mapOf['screen-plan'] = async (seq) => {
  const m = map.mapState.main;
  const shown = results.list.value.cards.filter((c) => results.altShown.value.has(c.idx));
  const altSel = results.altSel.value;
  if (!m || !shown.length) return;
  await Promise.all(shown.map((c) => map.withCourses(c.j)));
  if (map.stale(seq) || !map.mapState.main) return;
  map.ensureJourneyLayers(m);
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
  map.drawJourney(m, sel.j, map.markers.journey, -1, false);
  map.fitMap(b, 15);
};
function openDetail(j, q, bikeOnly = false) {
  const my = ++detailSeq;
  try { window.wayliDebug = { ...(window.wayliDebug || {}), journey: j }; } catch (e) {}
  map.mapOf.detail = async (seq) => {
    const m = await map.mapReady();
    if (!m || my !== detailSeq || map.stale(seq)) return;
    if (!bikeOnly) await map.withCourses(j);
    if (my !== detailSeq || map.stale(seq)) return;
    const focus = detail.focus.value;
    const b = map.drawJourney(m, j, map.markers.journey, focus);
    for (const mk of map.markers.live.splice(0)) mk.remove();
    map.fitMap(focus >= 0 && j.legs[focus] ? map.boundsOf(j.legs[focus].path) : b, 16);
    if (!bikeOnly) liveForJourney(j, q.day, my, focus);
  };
  detail.open(j, q, bikeOnly);
}
Object.assign(detail.hooks, {
  show: () => nav.showOverlay('detail'),
  close: () => nav.close('detail'),
  redraw: () => map.redrawMap(true),
  openLine: (route) => openLine(route),
  startTrip: (j, q) => startTrip(j, q),
  favChanged: () => saved.refresh(),
});
/** Live badges on the ride legs of a journey happening around now; every vehicle of those lines on the map. */
async function liveForJourney(j, day, seq, focus = -1) {
  if (!map.liveOn() || !data.dayInfo.value || data.dayInfo.value.date !== day) return;   // trip indices belong to the loaded day
  const now = live.nowOn(day);
  if (j.depart - now > 5400 || now - j.arrive > 1800) return;
  const rides = j.legs.filter((l, i) => l.type === 'ride' && l.routeId != null && (focus < 0 || i === focus) && l.depart - now < 5400 && now - l.arrive < 900).slice(0, 4);
  await Promise.all(rides.map(async (l) => {
    try {
      const vs = await live.vehiclesByLine(l.routeId);
      if (seq !== detailSeq) return;
      const statuses = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
      if (seq !== detailSeq) return;
      if (map.mapState.main && map.mapState.drawnFor === 'detail') map.lineVehicleMarkers(map.mapState.main, map.markers.live, vs, statuses, l.routeType, l.trip, { line: l.line, headsign: l.headsign, agency: l.agency, route: l.route });
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
async function loadNearby() {
  nearby.status.value = 'locating';
  let pos;
  try { pos = await getPosition(); } catch (e) { nearby.status.value = 'noLocation'; return; }
  const stops = await call('nearby', { lat: pos.lat, lon: pos.lon, limit: 20 });
  nearby.stops.value = stops; nearby.status.value = 'ready';
  map.redrawMap(true);
}
let currentStop = null, stopSeq = 0, stopTimer = 0;
async function openStop(stop) {
  const my = ++stopSeq;
  const info = await call('stopInfo', { stop });
  currentStop = info;
  map.mapOf.stopDetail = async (seq) => {
    const m = await map.mapReady();
    if (!m || my !== stopSeq || map.stale(seq)) return;
    const el = document.createElement('div'); el.className = 'wayli-pin'; el.style.background = 'var(--accent)';
    map.markers.journey.push(new maplibregl.Marker({ element: el }).setLngLat([info.lon, info.lat]).addTo(m));
    m.easeTo({ center: [info.lon, info.lat], zoom: Math.max(m.getZoom(), 15), offset: [0, -Math.round(sheet.px('half') / 2) + 30], duration: 500 });
  };
  const day = search.day.value;
  const svc = live.serviceDay();
  const isNow = day === svc.day || day === calToday();
  stopPage.open(info, day, isNow);
  const fromTime = isNow ? live.nowOn(day) - 120 : search.atSeconds();
  const deps = await call('departures', { stop, fromTime, limit: 40 });
  if (my !== stopSeq) return;
  stopPage.deps.value = deps;
  clearInterval(stopTimer);
  if (isNow) {
    liveForStop(info, deps, day, my);
    stopTimer = setInterval(() => { if (!nav.isOpen('stopDetail')) clearInterval(stopTimer); else liveForStop(info, deps, day, my); }, 45000);
  }
}
Object.assign(stopPage.hooks, {
  show: () => nav.showOverlay('stopDetail'),
  close: () => nav.close('stopDetail'),
  refresh: () => { if (currentStop) openStop(currentStop.stop); },
  openTrip: (trip, stop) => openTrip(trip, stop),
  fromHere: () => { if (!currentStop) return; const p = stopPlace(currentStop); nav.closeAll(); search.setPlace('from', p); nav.showScreen('plan'); sheet.set('half'); },
  toHere: () => { if (currentStop) planTo(stopPlace(currentStop)); },
});
/** Live times for the departures of a stop: one request for the vehicles around it, then by line for what it missed. */
async function liveForStop(info, deps, day, seq) {
  if (!map.liveOn()) { stopPage.liveNote.value = t('liveOff'); return; }
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
      if (!v) continue;
      const ts = await tripStopsCached(d.trip);
      if (seq !== stopSeq) return;
      const idx = ts.stops.findIndex((s) => s.stop === info.stop && s.dep === d.time);
      const est = live.estimateDelay(v, ts.stops, day);
      const at = live.liveAt(est, ts.stops, idx < 0 ? 0 : idx);
      if (!at) continue;
      stopPage.setLive(d.trip, at.passed ? { passed: true } : { passed: false, time: at.time, stale: !!at.stale, delayMin: live.delayMinutes(at.delay) });
    }
    const nw = live.newest(vs);
    stopPage.liveNote.value = nw ? t('liveUpdated', { time: nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) }) : t('liveNoVehicle');
  } catch (e) { stopPage.liveNote.value = t('liveFail'); }
}
const stopPlace = (s) => ({ name: s.name, stops: [s.stop], lat: s.lat, lon: s.lon });

// ---- a line's page (course, stops, vehicles now); the search by number is in the top bar
let lineTimer = 0, lineSeq = 0, lineCur = null;
async function openLine(route) {
  const my = ++lineSeq;
  let info;
  try { info = await call('lineInfo', { route }); } catch (e) { toast(t('liveFail')); return; }
  if (my !== lineSeq) return;
  lineCur = info;
  map.mapOf.lineDetail = async (seq) => {
    const m = await map.mapReady();
    if (!m || my !== lineSeq || map.stale(seq)) return;
    const b = map.drawJourney(m, { legs: [{ type: 'ride', routeType: info.routeType, path: info.path, pattern: null }] }, map.markers.journey);
    // every stop of the line as a dot
    m.getSource('stops').setData({ type: 'FeatureCollection', features: info.stops.map((st) => ({ type: 'Feature', properties: { stop: st.stop, ...map.stopKindProp(st.stop) }, geometry: { type: 'Point', coordinates: [st.lon, st.lat] } })) });
    map.fitMap(b, 15);
    lineLive();
  };
  linePage.info.value = info; linePage.liveText.value = ''; linePage.liveOk.value = false;
  nav.showOverlay('lineDetail');
  clearInterval(lineTimer);
  lineTimer = setInterval(lineLive, 20000);
}
Object.assign(linePage.hooks, { close: () => nav.close('lineDetail'), openLine: (route) => openLine(route), openStop: (stop) => openStop(stop) });
/** The line's vehicles on its map, with how late each runs. */
async function lineLive() {
  const info = lineCur;
  if (!info || !nav.isOpen('lineDetail') || !map.liveOn() || info.routeId == null) return;
  const my = lineSeq;
  try {
    const vs = await live.vehiclesByLine(info.routeId);
    if (my !== lineSeq) return;
    const st = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
    if (my !== lineSeq) return;
    for (const mk of map.markers.lineVeh.splice(0)) mk.remove();
    if (map.mapState.main && map.mapState.drawnFor === 'lineDetail') map.lineVehicleMarkers(map.mapState.main, map.markers.lineVeh, vs, st, info.routeType, null, { line: info.line, headsign: info.headsign, agency: info.agency, route: info.route });
    const nw = live.newest(vs);
    linePage.liveText.value = vs.length ? `${t('vehiclesOnLine', { n: vs.length })} · ${nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}` : t('noLineVehicles');
    linePage.liveOk.value = vs.length > 0;
  } catch (e) { /* the schedule stays */ }
}

// ---- one trip: every stop with its time, and where the vehicle is
async function openTrip(trip, hereStop) {
  const ts = await tripStopsCached(trip);
  tripPage.ts.value = ts; tripPage.hereStop.value = hereStop; tripPage.vehicle.value = null; tripPage.noVehicle.value = false;
  nav.showOverlay('tripDetail');
  const day = search.day.value;
  if (!map.liveOn() || ts.routeId == null) return;
  try {
    const vs = await live.vehiclesByLine(ts.routeId);
    const v = live.matchTrip(vs, ts.routeId, ts.firstDep, day);
    const est = v && live.estimateDelay(v, ts.stops, day);
    if (tripPage.ts.value !== ts) return;
    if (!est) { tripPage.noVehicle.value = true; return; }
    tripPage.vehicle.value = { index: est.index + (est.frac > 0.5 ? 1 : 0), delayMin: est.delay ? live.delayMinutes(est.delay) : 0 };
  } catch (e) { /* no live, no problem */ }
}
Object.assign(tripPage.hooks, { close: () => nav.close('tripDetail'), openStop: (stop) => { nav.close('tripDetail'); openStop(stop); } });

// ---------------------------------------------------------------- saved: places, trips, stops (this device only)
/** The last search, shown as it was (its own place and time), when it is under an hour old and went to this place. */
function restoreLast(p) {
  const last = lastSearch.get();
  if (!last || !last.q || !last.result || !last.result.journeys || !last.result.journeys.length || Date.now() - last.at > 3600e3) return false;
  if (!last.q.to || !p || last.q.to.name !== p.name || last.q.day !== search.day.value && !(data.manifest.value && data.manifest.value.days.some((d) => d.date === last.q.day))) return false;
  nav.closeAll(); nav.showScreen('plan');
  search.day.value = last.q.day; applyQuery(last.q); results.setResults(last.result, last.q, last.at); sheet.set('half');
  return true;
}
async function planTo(p) {
  if (restoreLast(p)) return;
  nav.closeAll();
  nav.showScreen('plan');
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
let fol = null;
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
  map.mapOf.follow = async (seq) => {
    const m = await map.mapReady();
    if (!m || !fol || fol.a !== a || map.stale(seq)) return;
    await map.withCourses(a.journey);
    if (!fol || fol.a !== a || map.stale(seq)) return;
    map.fitMap(map.drawJourney(m, a.journey, map.markers.journey), 16);
    stepFollow(); followLive();
  };
  nav.showOverlay('follow');
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
  if (map.mapState.drawnFor === 'follow' && fol.pos) map.drawMe(fol.pos);
  if (a.state.done) finishFollow();
}
/** The vehicle of the current or next ride, every 30 s. */
async function followLive() {
  if (!fol || !map.liveOn()) return;
  const a = fol.a, now = live.nowOn(a.day);
  const leg = a.journey.legs.slice(a.state.step).find((l) => l.type === 'ride');
  if (!leg || leg.routeId == null || leg.depart - now > 3600 || !data.dayInfo.value || data.dayInfo.value.date !== a.day) { fol.liveEst = null; return; }
  fol.liveChecked = true;
  try {
    const vs = await live.vehiclesByLine(leg.routeId);
    if (!fol) return;
    const statuses = vs.length ? await call('vehiclesStatus', { vehicles: map.vehiclesForWorker(vs) }) : [];
    if (!fol) return;
    for (const mk of map.markers.followVehicle.splice(0)) mk.remove();
    if (map.mapState.main && map.mapState.drawnFor === 'follow') map.lineVehicleMarkers(map.mapState.main, map.markers.followVehicle, vs, statuses, leg.routeType, leg.trip, { line: leg.line, headsign: leg.headsign, agency: leg.agency, route: leg.route });
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
  if (!map.liveOn() || !data.dayInfo.value || data.dayInfo.value.date !== fol.a.day || document.hidden) { replanSkip(!map.liveOn() ? 'live off' : document.hidden ? 'hidden' : 'other day'); return; }
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
  map.redrawMap(true);
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
  for (const mk of map.markers.followVehicle.splice(0)) mk.remove();
  if (map.markers.me) { map.markers.me.remove(); map.markers.me = null; }
  delete map.mapOf.follow;
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

// ---------------------------------------------------------------- panels: what closing each one stops (state/nav.ts does the rest)
const OVERLAY_CLOSE = { detail: () => { detailSeq++; delete map.mapOf.detail; }, stopDetail: () => { clearInterval(stopTimer); stopSeq++; delete map.mapOf.stopDetail; }, lineDetail: () => { clearInterval(lineTimer); lineSeq++; lineCur = null; delete map.mapOf.lineDetail; },
  picker: () => map.closePicker(null, false), chooser: () => chooser.finish(null, false), follow: () => { if (fol) closeFollow(false); delete map.mapOf.follow; } };
Object.assign(nav.hooks, {
  closed: (id) => { map.closePopup(); if (OVERLAY_CLOSE[id]) OVERLAY_CLOSE[id](); },
  clearPlan: () => clearPlan(),
  changed: () => map.redrawMap(),
  screenShown: (name) => { if (name === 'nearby' && data.ttReady.value && nearby.status.value !== 'ready') loadNearby(); },
});
sheet.hooks.changed = (prev, st) => {
  if (prev === 'full' && st !== 'full') map.refreshLiveMap();
  if (st !== prev && map.mapState.main && (st === 'peek' || prev === 'peek')) $('sheetBody').scrollTop = 0;
};
init().catch((e) => setStatus(t('loadFail', { msg: e.message }), true));
