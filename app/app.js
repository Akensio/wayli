// Wayli app shell. The worker (worker.js) holds the data; this file is the UI.

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- i18n
const STR = {
  he: {
    swap: 'החלף', now: 'עכשיו', bike: 'אופניים', bikeNone: 'בלי', bikePark: 'עד התחנה', bikeAlong: 'לוקח/ת איתי', folding: 'מתקפלים',
    plan: 'תכנון מסלול', nearbyTitle: 'תחנות בקרבתי', refresh: 'רענון', nearbyEmpty: 'לחצו על רענון כדי למצוא תחנות ליד המיקום שלכם.',
    favTrips: 'מסלולים שמורים', favStops: 'תחנות שמורות', tabPlan: 'מסלול', tabNearby: 'בקרבתי', tabFav: 'מועדפים', tabAbout: 'אודות',
    back: 'חזרה', fromHere: 'מכאן', toHere: 'לכאן', nextDeps: 'היציאות הבאות', fromQ: 'מאיפה?', toQ: 'לאן?', myLoc: 'המיקום שלי',
    loadingTT: 'טוען לוח זמנים', loadingST: 'טוען רשת רחובות (לאופניים ולהליכה מדויקת)', unpacking: 'פורס…', ready: 'מוכן. {trips} נסיעות ליום {date}.',
    readyStreets: 'רשת הרחובות נטענה.', loadFail: 'הטעינה נכשלה: {msg}', planning: 'מחשב…', noJourney: 'לא נמצא מסלול עד 3 החלפות.',
    noOriginStops: 'אין תחנה במרחק סביר מנקודת המוצא.', noDestStops: 'אין תחנה במרחק סביר מהיעד.', pickBoth: 'בחרו מאיפה ולאן.',
    direct: 'ישיר', transfer1: 'החלפה אחת', transfers: '{n} החלפות', min: 'דק\'', hour: 'שע\'', walk: 'הליכה', bike2: 'רכיבה',
    walkTo: 'הליכה {min} דק\' אל {name}', bikeTo: 'רכיבה {min} דק\' אל {name}', walkFrom: 'הליכה {min} דק\' מ{name} ליעד', bikeFrom: 'רכיבה {min} דק\' מ{name} ליעד',
    ride: '{line} · {agency} · {stops} תחנות', toward: 'לכיוון {headsign}', bikeOnly: 'רכיבה כל הדרך: {min} דק\', {km} ק"מ',
    noBikeOnly: 'רכיבה כל הדרך: אין מסלול עד 3 שעות.', found: '{n} מסלולים ב-{ms} מילישניות', withBikeOnBoard: ' · אופניים ברכב: רכבות מחוץ לשעות העומס ואוטובוסים בינעירוניים',
    foldingNote: ' · אופניים מתקפלים', parkNote: ' · האופניים נשארים בתחנה הראשונה', noLocation: 'אין גישה למיקום. אפשרו מיקום לאתר, או חפשו תחנה.',
    locating: 'מאתר…', m: 'מ\'', inMin: 'בעוד {n} דק\'', nowDep: 'עכשיו', noDeps: 'אין יציאות נוספות היום.', favEmptyTrips: 'עדיין אין מסלולים שמורים. בפרטי מסלול, לחצו על הכוכב.',
    favEmptyStops: 'עדיין אין תחנות שמורות. בפרטי תחנה, לחצו על הכוכב.', saved: 'נשמר', removed: 'הוסר', train: 'רכבת', lrt: 'רכבת קלה', platforms: '{n} רציפים',
    dayFmt: ['יום א\'', 'יום ב\'', 'יום ג\'', 'יום ד\'', 'יום ה\'', 'יום ו\'', 'שבת'], today: 'היום', tomorrow: 'מחר',
    about: '<p><b>Wayli</b> מתכנן נסיעות בתחבורה הציבורית בישראל על הטלפון שלכם: לוח הזמנים הארצי ורשת הרחובות יורדים פעם אחת, והחיפוש רץ מקומית. שום דבר לא נשלח לשרת.</p><p>הנתונים: משרד התחבורה (GTFS) ו-OpenStreetMap. התוכנה חופשית ברישיון AGPL-3.0: <a href="https://github.com/Akensio/wayli">github.com/Akensio/wayli</a>.</p><p>גרסה ראשונה: בלי זמני אמת, בלי דיווחים, בלי גבהים (זמני רכיבה בחיפה ובירושלים אופטימיים). לוח זמנים: {feed}.</p>',
  },
  en: {
    swap: 'Swap', now: 'Now', bike: 'Bicycle', bikeNone: 'None', bikePark: 'To the stop', bikeAlong: 'Take it along', folding: 'Folding',
    plan: 'Plan trip', nearbyTitle: 'Stops near me', refresh: 'Refresh', nearbyEmpty: 'Tap Refresh to find stops near your location.',
    favTrips: 'Saved trips', favStops: 'Saved stops', tabPlan: 'Plan', tabNearby: 'Nearby', tabFav: 'Favorites', tabAbout: 'About',
    back: 'Back', fromHere: 'From here', toHere: 'To here', nextDeps: 'Next departures', fromQ: 'From?', toQ: 'To?', myLoc: 'My location',
    loadingTT: 'Loading the timetable', loadingST: 'Loading the street network (bikes and exact walking)', unpacking: 'unpacking…', ready: 'Ready. {trips} trips on {date}.',
    readyStreets: 'Street network loaded.', loadFail: 'Loading failed: {msg}', planning: 'Planning…', noJourney: 'No journey found with up to 3 transfers.',
    noOriginStops: 'No stop within reach of the origin.', noDestStops: 'No stop within reach of the destination.', pickBoth: 'Pick both the origin and the destination.',
    direct: 'direct', transfer1: '1 transfer', transfers: '{n} transfers', min: 'min', hour: 'h', walk: 'walk', bike2: 'bike',
    walkTo: 'walk {min} min to {name}', bikeTo: 'bike {min} min to {name}', walkFrom: 'walk {min} min from {name}', bikeFrom: 'bike {min} min from {name}',
    ride: '{line} · {agency} · {stops} stops', toward: 'towards {headsign}', bikeOnly: 'Bike all the way: {min} min, {km} km',
    noBikeOnly: 'Bike all the way: no route within 3 hours.', found: '{n} journeys in {ms} ms', withBikeOnBoard: ' · bike on board: trains off-peak and intercity buses',
    foldingNote: ' · folding bike', parkNote: ' · bike stays at the first stop', noLocation: 'Location unavailable. Allow location access, or search for a stop.',
    locating: 'Locating…', m: 'm', inMin: 'in {n} min', nowDep: 'now', noDeps: 'No more departures today.', favEmptyTrips: 'No saved trips yet. Tap the star in a journey.',
    favEmptyStops: 'No saved stops yet. Tap the star in a stop.', saved: 'Saved', removed: 'Removed', train: 'Train', lrt: 'Light rail', platforms: '{n} platforms',
    dayFmt: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], today: 'Today', tomorrow: 'Tomorrow',
    about: '<p><b>Wayli</b> plans public-transport trips in Israel on your phone: the national timetable and the street network download once, and every search runs locally. Nothing is sent to a server.</p><p>Data: Ministry of Transport (GTFS) and OpenStreetMap. Free software, AGPL-3.0: <a href="https://github.com/Akensio/wayli">github.com/Akensio/wayli</a>.</p><p>First version: no real-time, no reports, no elevation (bike times in Haifa and Jerusalem are optimistic). Timetable: {feed}.</p>',
  },
};
let lang = 'he';
try { lang = localStorage.getItem('wayli-lang') || 'he'; } catch (e) {}
const t = (k, vars) => {
  let s = (STR[lang] && STR[lang][k]) ?? STR.he[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  $('fromQ').placeholder = t('fromQ'); $('toQ').placeholder = t('toQ');
  $('fromLoc').textContent = t('myLoc'); $('toLoc').textContent = t('myLoc');
  $('langBtn').textContent = lang === 'he' ? 'EN' : 'עב';
  renderDays();
  renderAbout();
}
$('langBtn').addEventListener('click', () => { lang = lang === 'he' ? 'en' : 'he'; try { localStorage.setItem('wayli-lang', lang); } catch (e) {} applyLang(); renderFavorites(); });

// ---------------------------------------------------------------- worker
const worker = new Worker('worker.js', { type: 'module' });
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

// ---------------------------------------------------------------- status
function setStatus(text, error = false, frac = null) {
  $('statusText').textContent = text;
  $('status').classList.toggle('error', error);
  $('statusBar').hidden = frac == null;
  if (frac != null) $('statusBar').firstElementChild.style.width = `${Math.round(frac * 100)}%`;
}
function showProgress(m) {
  const label = m.label === 'timetable' ? t('loadingTT') : t('loadingST');
  const mb = (m.got / 1e6).toFixed(1) + (m.total ? ' / ' + (m.total / 1e6).toFixed(1) : '') + ' MB';
  setStatus(`${label}: ${m.unpacking ? t('unpacking') : mb}`, false, m.total ? m.got / m.total : null);
}

// ---------------------------------------------------------------- data manifest and days
let manifest = null, dayInfo = null, ttReady = false, stReady = false;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const dateOf = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
function dayLabel(s) {
  const d = dateOf(s), today = todayStr();
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  const tmrStr = `${tmr.getFullYear()}${String(tmr.getMonth() + 1).padStart(2, '0')}${String(tmr.getDate()).padStart(2, '0')}`;
  const base = `${t('dayFmt')[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  if (s === today) return `${t('today')} · ${base}`;
  if (s === tmrStr) return `${t('tomorrow')} · ${base}`;
  return base;
}
function renderDays() {
  if (!manifest) return;
  const sel = $('day');
  const cur = sel.value;
  sel.innerHTML = '';
  for (const d of manifest.days) {
    const o = document.createElement('option');
    o.value = d.date; o.textContent = dayLabel(d.date);
    sel.appendChild(o);
  }
  sel.value = cur && manifest.days.some((d) => d.date === cur) ? cur : (dayInfo ? dayInfo.date : manifest.days[0].date);
}
function renderAbout() {
  $('aboutBox').innerHTML = t('about', { feed: manifest && manifest.feed ? `${manifest.feed.start || ''}–${manifest.feed.end || ''}, ${manifest.built || ''}` : '' });
}

async function loadDay(date) {
  const d = manifest.days.find((x) => x.date === date) || manifest.days[0];
  ttReady = false;
  $('planBtn').disabled = true;
  const info = await call('loadTimetable', { url: `data/${d.file}?v=${encodeURIComponent(manifest.built || '')}` });
  dayInfo = info; ttReady = true;
  $('planBtn').disabled = false;
  setStatus(t('ready', { trips: info.counts.trips.toLocaleString(), date: dayLabel(info.date) }));
  renderDays();
}
async function loadStreets() {
  if (stReady || !manifest.streets) return;
  try {
    await call('loadStreets', { url: `data/${manifest.streets.file}?v=${encodeURIComponent(manifest.streets.built || manifest.built || '')}` });
    stReady = true;
    setStatus(t('readyStreets'));
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); }
}

async function init() {
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* offline shell unavailable; fine */ } }
  applyLang();
  try {
    manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  renderAbout();
  const today = todayStr();
  const start = manifest.days.some((d) => d.date === today) ? today : manifest.days[0].date;
  renderDays();
  $('day').value = start;
  setDefaultTime();
  try { await loadDay(start); } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  renderFavorites();
  loadStreets();
}
$('day').addEventListener('change', () => { loadDay($('day').value).catch((e) => setStatus(t('loadFail', { msg: e.message }), true)); setDefaultTime(); });
function setDefaultTime() {
  const now = new Date();
  const isToday = $('day').value === todayStr();
  $('at').value = isToday ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : '08:00';
}
$('nowBtn').addEventListener('click', () => { $('day').value = manifest && manifest.days.some((d) => d.date === todayStr()) ? todayStr() : $('day').value; setDefaultTime(); if (dayInfo && dayInfo.date !== $('day').value) $('day').dispatchEvent(new Event('change')); });

// ---------------------------------------------------------------- places and search
const place = { from: null, to: null };   // {name, stops:[...], lat, lon} or {name, lat, lon}
function describePlace(p) { return p ? p.name + (p.platforms > 1 ? ` (${t('platforms', { n: p.platforms })})` : '') : ''; }

function wireSearch(side) {
  const input = $(side + 'Q'), drop = $(side + 'Drop');
  let timer = 0, seq = 0;
  input.addEventListener('input', () => {
    place[side] = null;
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2 || !ttReady) { drop.hidden = true; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      const hits = await call('search', { q, limit: 10 });
      if (my !== seq) return;
      drop.innerHTML = '';
      for (const g of hits) {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `${esc(g.name)}<small>${esc(g.city)}${g.platforms > 1 ? ' · ' + t('platforms', { n: g.platforms }) : ''}</small>`;
        b.addEventListener('click', () => { place[side] = g; input.value = g.name; drop.hidden = true; });
        drop.appendChild(b);
      }
      drop.hidden = hits.length === 0;
    }, 150);
  });
  input.addEventListener('focus', () => { if (drop.children.length && !place[side]) drop.hidden = false; });
  document.addEventListener('click', (e) => { if (!drop.contains(e.target) && e.target !== input) drop.hidden = true; });
  $(side + 'Loc').addEventListener('click', async () => {
    input.value = t('locating');
    try {
      const pos = await getPosition();
      place[side] = { name: t('myLoc'), lat: pos.lat, lon: pos.lon };
      input.value = t('myLoc');
    } catch (e) { input.value = ''; showPlanError(t('noLocation')); }
  });
}
wireSearch('from'); wireSearch('to');
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
$('swap').addEventListener('click', () => {
  const a = place.from, b = place.to, va = $('fromQ').value, vb = $('toQ').value;
  place.from = b; place.to = a; $('fromQ').value = vb; $('toQ').value = va;
});
for (const b of $('bikeMode').querySelectorAll('button')) b.addEventListener('click', () => {
  for (const o of $('bikeMode').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
});
const bikeChoice = () => $('bikeMode').querySelector('[aria-pressed="true"]').dataset.mode;
function showPlanError(msg) { $('planError').textContent = msg; $('planError').hidden = !msg; }

// ---------------------------------------------------------------- planning
let lastResult = null, lastQuery = null;
$('planBtn').addEventListener('click', () => plan());
async function plan() {
  showPlanError('');
  if (!place.from || !place.to) { showPlanError(t('pickBoth')); return; }
  const [h, m] = $('at').value.split(':').map(Number);
  const fromTime = (Number.isNaN(h) ? 8 : h) * 3600 + (m || 0) * 60;
  const day = $('day').value;
  const weekday = dateOf(day).getDay() <= 4;
  const bike = bikeChoice(), folding = $('folding').checked;
  $('planBtn').disabled = true;
  $('results').innerHTML = `<div class="empty">${t('planning')}</div>`;
  try {
    const r = await call('plan', { from: place.from, to: place.to, fromTime, toTime: fromTime + 3600, bike, folding, weekday });
    lastResult = r; lastQuery = { from: place.from, to: place.to, day, at: $('at').value, bike, folding };
    renderResults(r, lastQuery);
  } catch (e) { showPlanError(e.message); $('results').innerHTML = ''; }
  $('planBtn').disabled = false;
}
const fmt = (sec) => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
const dur = (sec) => { const mn = Math.round(sec / 60); return mn >= 60 ? `${Math.floor(mn / 60)} ${t('hour')} ${mn % 60} ${t('min')}` : `${mn} ${t('min')}`; };
const transfersText = (n) => n === 0 ? t('direct') : n === 1 ? t('transfer1') : t('transfers', { n });
const chipClass = (l) => l.type === 'ride' ? `chip t${l.routeType}` : l.mode === 'bike' ? 'chip bike' : 'chip walk';
const lineText = (line) => line === 'train' ? t('train') : line;
const chipText = (l) => l.type === 'ride' ? esc(lineText(l.line)) : `${l.mode === 'bike' ? '🚲' : '🚶'} ${Math.round(l.seconds / 60)}`;
function renderResults(r, q) {
  const box = $('results');
  box.innerHTML = '';
  const note = q.bike === 'along' ? (q.folding ? t('foldingNote') : t('withBikeOnBoard')) : q.bike === 'park' ? t('parkNote') : '';
  const head = document.createElement('div');
  head.className = 'muted';
  head.textContent = t('found', { n: r.journeys.length, ms: Math.round(r.ms) }) + note;
  box.appendChild(head);
  if (r.bikeOnly) {
    const b = document.createElement('div');
    b.className = 'journey';
    b.innerHTML = `<div class="top"><span class="times"><span class="chip bike">🚲</span> ${t('bikeOnly', { min: Math.round(r.bikeOnly.seconds / 60), km: (r.bikeOnly.metres / 1000).toFixed(1) })}</span></div>`;
    b.addEventListener('click', () => openDetail({ depart: 0, arrive: r.bikeOnly.seconds, transfers: 0, legs: [{ type: 'access', mode: 'bike', seconds: r.bikeOnly.seconds, path: r.bikeOnly.path, to: { name: describePlace(q.to) } }] }, q, true));
    box.appendChild(b);
  } else if (q.bike !== 'none' && r.streets && !place.from.stops && !place.to.stops) {
    const b = document.createElement('div'); b.className = 'muted'; b.textContent = t('noBikeOnly'); box.appendChild(b);
  }
  if (!r.journeys.length) {
    const e = document.createElement('div'); e.className = 'empty'; e.textContent = t(r.reason || 'noJourney'); box.appendChild(e); return;
  }
  for (const j of r.journeys) {
    const d = document.createElement('div');
    d.className = 'journey';
    d.innerHTML = `<div class="top"><span class="times">${fmt(j.depart)} → ${fmt(j.arrive)}</span><span class="dur">${dur(j.arrive - j.depart)} · ${transfersText(j.transfers)}</span></div>` +
      `<div class="chips">${j.legs.map((l) => `<span class="${chipClass(l)}">${chipText(l)}</span>`).join('<span class="muted">›</span>')}</div>` +
      `<div class="sub">${j.legs.filter((l) => l.type === 'ride').map((l) => `${esc(lineText(l.line))} ${t('toward', { headsign: esc(l.headsign) })}`).join(' · ')}</div>`;
    d.addEventListener('click', () => openDetail(j, q));
    box.appendChild(d);
  }
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------- journey detail + map
let map = null, mapLayer = null;
function ensureMap() {
  if (map || typeof L === 'undefined') return map;
  map = L.map('map', { zoomControl: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  L.control.zoom({ position: lang === 'he' ? 'topleft' : 'topright' }).addTo(map);
  return map;
}
function openDetail(j, q, bikeOnly = false) {
  $('detail').hidden = false;
  $('detailTitle').textContent = bikeOnly ? t('bikeOnly', { min: Math.round(j.arrive / 60), km: '' }).replace(', ', '').replace(' ק"מ', '').replace(' km', '') : `${fmt(j.depart)} → ${fmt(j.arrive)} · ${dur(j.arrive - j.depart)}`;
  const legs = $('detailLegs');
  legs.innerHTML = '';
  for (const l of j.legs) {
    const el = document.createElement('div');
    el.className = `leg ${l.type}${l.type === 'ride' ? ' t' + l.routeType : ''}`;
    let what = '';
    const mins = Math.round(l.seconds / 60);
    if (l.type === 'ride') what = `<span class="chip t${l.routeType}">${esc(lineText(l.line))}</span> ${esc(l.headsign)}<small>${esc(l.from.name)} → ${esc(l.to.name)} · ${t('ride', { line: '', agency: esc(l.agency), stops: l.stops }).replace(/^ · /, '')}</small>`;
    else if (l.type === 'access') what = (l.mode === 'bike' ? t('bikeTo', { min: mins, name: esc(l.to.name) }) : t('walkTo', { min: mins, name: esc(l.to.name) }));
    else if (l.type === 'egress') what = (l.mode === 'bike' ? t('bikeFrom', { min: mins, name: esc(l.from.name) }) : t('walkFrom', { min: mins, name: esc(l.from.name) }));
    else what = t('walkTo', { min: mins, name: esc(l.to.name) });
    el.innerHTML = `<span class="t">${bikeOnly ? '' : fmt(l.depart)}${l.type === 'ride' ? '<br>' + fmt(l.arrive) : ''}</span><span class="dot"></span><span class="what">${what}</span>`;
    legs.appendChild(el);
  }
  updateStar('detailStar', q && !bikeOnly ? tripKey(q) : null, 'trips');
  $('detailStar').onclick = () => { if (q && !bikeOnly) toggleFav('trips', tripKey(q), { from: q.from, to: q.to, bike: q.bike, folding: q.folding }); updateStar('detailStar', tripKey(q), 'trips'); };
  requestAnimationFrame(() => {
    const m = ensureMap();
    if (!m) return;
    m.invalidateSize();
    if (mapLayer) mapLayer.remove();
    mapLayer = L.featureGroup();
    for (const l of j.legs) {
      if (!l.path || l.path.length < 2) continue;
      const color = l.type === 'ride' ? (l.routeType === 2 ? '#1f5fa8' : l.routeType === 0 ? '#8a3fb0' : '#2a7d4f') : (l.mode === 'bike' ? '#1f5fa8' : '#5b6470');
      L.polyline(l.path, { color, weight: l.type === 'ride' ? 5 : 4, dashArray: l.type === 'ride' ? null : '6 6', opacity: .9 }).addTo(mapLayer);
      if (l.type === 'ride') { L.circleMarker(l.path[0], { radius: 5, color, fillColor: '#fff', fillOpacity: 1 }).addTo(mapLayer); L.circleMarker(l.path[l.path.length - 1], { radius: 5, color, fillColor: '#fff', fillOpacity: 1 }).addTo(mapLayer); }
    }
    mapLayer.addTo(m);
    try { m.fitBounds(mapLayer.getBounds(), { padding: [20, 20] }); } catch (e) { m.setView([32.08, 34.78], 11); }
  });
}
$('detailBack').addEventListener('click', () => { $('detail').hidden = true; });

// ---------------------------------------------------------------- nearby and stop detail
let lastPos = null;
$('nearbyRefresh').addEventListener('click', loadNearby);
async function loadNearby() {
  const list = $('nearbyList');
  list.innerHTML = `<div class="empty">${t('locating')}</div>`;
  try { lastPos = await getPosition(); } catch (e) { list.innerHTML = `<div class="empty">${t('noLocation')}</div>`; return; }
  const stops = await call('nearby', { lat: lastPos.lat, lon: lastPos.lon, limit: 20 });
  renderStops(list, stops, true);
}
function renderStops(container, stops, withDistance) {
  container.innerHTML = '';
  if (!stops.length) { container.innerHTML = `<div class="empty">${t('favEmptyStops')}</div>`; return; }
  for (const s of stops) {
    const d = document.createElement('div');
    d.className = 'stop';
    d.innerHTML = `<div class="name">${esc(s.name)}</div><div class="meta">${esc(s.city || '')}${withDistance && s.distance != null ? ` · ${s.distance} ${t('m')}` : ''}${s.code ? ` · ${esc(s.code)}` : ''}</div>` +
      `<div class="chips">${(s.lines || []).map((l) => `<span class="chip t${l.type}">${esc(lineText(l.label))}</span>`).join('')}</div>`;
    d.addEventListener('click', () => openStop(s.stop));
    container.appendChild(d);
  }
}
let currentStop = null;
async function openStop(stop) {
  const info = await call('stopInfo', { stop });
  currentStop = info;
  $('stopDetail').hidden = false;
  $('stopTitle').textContent = info.name;
  $('stopMeta').textContent = `${info.city || ''}${info.code ? ' · ' + info.code : ''}`;
  updateStar('stopStar', 'stop:' + info.stop, 'stops');
  $('stopStar').onclick = () => { toggleFav('stops', 'stop:' + info.stop, { stop: info.stop, name: info.name, city: info.city, code: info.code, lines: info.lines.slice(0, 8) }); updateStar('stopStar', 'stop:' + info.stop, 'stops'); };
  const now = new Date();
  const [ah, am] = $('at').value.split(':').map(Number);
  const isToday = $('day').value === todayStr();
  const fromTime = isToday ? now.getHours() * 3600 + now.getMinutes() * 60 : (Number.isNaN(ah) ? 0 : ah * 3600 + (am || 0) * 60);
  const deps = await call('departures', { stop, fromTime, limit: 40 });
  const box = $('stopDeps');
  box.innerHTML = deps.length ? '' : `<div class="empty">${t('noDeps')}</div>`;
  for (const d of deps) {
    const el = document.createElement('div');
    el.className = 'dep';
    const inMin = Math.round((d.time - fromTime) / 60);
    el.innerHTML = `<span class="time">${fmt(d.time)}</span><span class="chip t${d.routeType}">${esc(lineText(d.line))}</span><span class="head">${esc(d.headsign)}</span><span class="in">${isToday ? (inMin <= 0 ? t('nowDep') : t('inMin', { n: inMin })) : ''}</span>`;
    box.appendChild(el);
  }
}
$('stopBack').addEventListener('click', () => { $('stopDetail').hidden = true; });
$('stopFrom').addEventListener('click', () => { if (!currentStop) return; place.from = { name: currentStop.name, stops: [currentStop.stop], lat: currentStop.lat, lon: currentStop.lon }; $('fromQ').value = currentStop.name; $('stopDetail').hidden = true; showScreen('plan'); });
$('stopTo').addEventListener('click', () => { if (!currentStop) return; place.to = { name: currentStop.name, stops: [currentStop.stop], lat: currentStop.lat, lon: currentStop.lon }; $('toQ').value = currentStop.name; $('stopDetail').hidden = true; showScreen('plan'); });

// ---------------------------------------------------------------- favorites (this device only)
function favs(kind) { try { return JSON.parse(localStorage.getItem('wayli-fav-' + kind) || '{}'); } catch (e) { return {}; } }
function saveFavs(kind, obj) { try { localStorage.setItem('wayli-fav-' + kind, JSON.stringify(obj)); } catch (e) {} }
function tripKey(q) { return `trip:${q.from.name}|${q.to.name}|${q.bike}|${q.folding ? 'f' : ''}`; }
function toggleFav(kind, key, value) { const f = favs(kind); if (f[key]) delete f[key]; else f[key] = value; saveFavs(kind, f); renderFavorites(); }
function updateStar(id, key, kind) { const on = key && !!favs(kind)[key]; $(id).textContent = on ? '★' : '☆'; $(id).classList.toggle('on', on); }
function renderFavorites() {
  const trips = favs('trips'), stops = favs('stops');
  const tb = $('favTrips');
  tb.innerHTML = '';
  const tk = Object.keys(trips);
  if (!tk.length) tb.innerHTML = `<div class="empty">${t('favEmptyTrips')}</div>`;
  for (const k of tk) {
    const v = trips[k];
    const d = document.createElement('div');
    d.className = 'journey';
    d.innerHTML = `<div class="top"><span class="times">${esc(v.from.name)} → ${esc(v.to.name)}</span></div><div class="sub">${v.bike !== 'none' ? '🚲 ' : ''}${esc(t(v.bike === 'along' ? 'bikeAlong' : v.bike === 'park' ? 'bikePark' : 'bikeNone'))}</div>`;
    d.addEventListener('click', () => {
      place.from = v.from; place.to = v.to; $('fromQ').value = v.from.name; $('toQ').value = v.to.name;
      for (const o of $('bikeMode').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.mode === v.bike));
      $('folding').checked = !!v.folding;
      showScreen('plan'); plan();
    });
    tb.appendChild(d);
  }
  renderStops($('favStops'), Object.values(stops), false);
}

// ---------------------------------------------------------------- screens
function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-' + name;
  for (const b of document.querySelectorAll('nav.tabs button')) b.setAttribute('aria-selected', String(b.dataset.screen === name));
  if (name === 'nearby' && !lastPos && ttReady) loadNearby();
}
for (const b of document.querySelectorAll('nav.tabs button')) b.addEventListener('click', () => showScreen(b.dataset.screen));

init().catch((e) => setStatus(t('loadFail', { msg: e.message }), true));
