// Wayli app shell. The worker (worker.js) holds the data; this file is the UI.
// Pure logic lives next door: live.js (real-time), follow.js (trip following), store.js (on-device memory).
import { settings, recentPlaces, recentTrips, savedPlaces, favs, lastSearch, activeTrip } from './store.js';
import * as live from './live.js';
import { initialState, advance, view as followView } from './follow.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- i18n
const STR = {
  he: {
    swap: 'החלף', now: 'עכשיו', bike: 'אופניים', bikeNone: 'בלי', bikePark: 'עד התחנה', bikeAlong: 'לוקח/ת איתי', folding: 'מתקפלים',
    plan: 'תכנון מסלול', nearbyTitle: 'תחנות בקרבתי', refresh: 'רענון', nearbyEmpty: 'לחצו על רענון כדי למצוא תחנות ליד המיקום שלכם.',
    favTrips: 'מסלולים שמורים', favStops: 'תחנות שמורות', savedPlaces: 'מקומות שמורים', tabPlan: 'מסלול', tabNearby: 'בקרבתי', tabSaved: 'שמורים', tabMore: 'עוד',
    back: 'חזרה', fromHere: 'מכאן', toHere: 'לכאן', nextDeps: 'היציאות הבאות', fromQ: 'מאיפה?', toQ: 'לאן?', myLoc: 'המיקום שלי',
    loadingTT: 'טוען לוח זמנים', loadingST: 'טוען רשת רחובות (לאופניים ולהליכה מדויקת)', loadingPL: 'טוען כתובות ומקומות', unpacking: 'פורס…', ready: 'מוכן. {trips} נסיעות ליום {date}.',
    kindStop: 'תחנה', kindAddress: 'כתובת', kindStreet: 'רחוב', kindCity: 'עיר', kindPoi: 'מקום', approxNo: 'הקרוב ביותר: {n}', placesPending: 'כתובות ומקומות עדיין נטענים…', noMatch: 'לא נמצא. נסו שם תחנה, רחוב ומספר, או עיר.',
    pickTitle: 'בחירה במפה', pickHint: 'הזיזו את המפה כך שהסמן יהיה על המקום', choose: 'בחירה', cancel: 'ביטול', nearName: 'ליד {name}', pointName: 'נקודה במפה',
    btnLoc: '📍 המיקום שלי', btnMap: '🗺️ בחירה במפה', build: 'גרסה {v}', updated: 'גרסה חדשה נטענה.',
    readyStreets: 'רשת הרחובות נטענה.', loadFail: 'הטעינה נכשלה: {msg}', planning: 'מחשב…', noJourney: 'לא נמצא מסלול עד 3 החלפות בחלון הזמן הזה.',
    noOriginStops: 'אין תחנה במרחק הליכה מנקודת המוצא.', noDestStops: 'אין תחנה במרחק הליכה מהיעד.', pickBoth: 'בחרו מאיפה ולאן.',
    direct: 'ישיר', transfer1: 'החלפה אחת', transfers: '{n} החלפות', min: 'דק\'', hour: 'שע\'', walk: 'הליכה', bike2: 'רכיבה',
    walkTo: 'הליכה {min} דק\' אל {name}', bikeTo: 'רכיבה {min} דק\' אל {name}', walkFrom: 'הליכה {min} דק\' מ{name} ליעד', bikeFrom: 'רכיבה {min} דק\' מ{name} ליעד',
    ride: '{line} · {agency} · {stops} תחנות', toward: 'לכיוון {headsign}', bikeOnly: 'רכיבה כל הדרך: {min} דק\', {km} ק"מ',
    noBikeOnly: 'רכיבה כל הדרך: אין מסלול עד 3 שעות.', found: '{n} דרכים להגיע', withBikeOnBoard: ' · אופניים ברכב: רכבות מחוץ לשעות העומס ואוטובוסים בינעירוניים',
    foldingNote: ' · אופניים מתקפלים', parkNote: ' · האופניים נשארים בתחנה הראשונה', noLocation: 'אין גישה למיקום. אפשרו מיקום לאתר, או חפשו תחנה.',
    locating: 'מאתר…', m: 'מ\'', inMin: 'בעוד {n} דק\'', nowDep: 'עכשיו', noDeps: 'אין יציאות נוספות היום.', favEmptyTrips: 'עדיין אין מסלולים שמורים. בפרטי מסלול, לחצו על הכוכב.',
    favEmptyStops: 'עדיין אין תחנות שמורות. בפרטי תחנה, לחצו על הכוכב.', saved: 'נשמר', removed: 'הוסר', train: 'רכבת', lrt: 'רכבת קלה', platforms: '{n} רציפים',
    dayFmt: ['יום א\'', 'יום ב\'', 'יום ג\'', 'יום ד\'', 'יום ה\'', 'יום ו\'', 'שבת'], today: 'היום', tomorrow: 'מחר', tonight: 'הלילה',
    offline: 'לא מקוון', resume: 'המשך', departAt: 'יציאה', arriveBy: 'הגעה עד', settings: 'הגדרות', setLang: 'שפה', setMap: 'מפה במצב כהה', mapLight: 'בהירה', mapDark: 'כהה',
    setWalk: 'הליכה מרבית לתחנה (דק\')', setLive: 'זמני אמת', setNotify: 'התראות בנסיעה (מתי לרדת)', setSound: 'צליל ורטט בהתראה', testAlert: 'בדיקת התראה', install: 'הוספה למסך הבית', clearHistory: 'מחיקת היסטוריה',
    liveNote: 'זמני האמת מגיעים מפרויקט האוטובוס הפתוח של הסדנא לידע ציבורי. כשהם פועלים, הטלפון שולח לשרת שלהם את מספרי הקווים והאזור שאתם מסתכלים עליו. שום דבר אחר.',
    startTrip: '▶ התחלת נסיעה', share: 'שיתוף', endTrip: 'סיום', nextStep: 'השלב הבא ›', home: 'בית', work: 'עבודה', notSet: 'לא הוגדר. לחצו כדי לבחור.', change: 'שינוי', addPlace: '+ מקום שמור', remove: 'הסרה',
    recentTitle: 'חיפושים אחרונים', planAgain: 'חישוב מחדש מעכשיו', resultsFrom: 'תוצאות מ-{time}', leaveIn: 'יוצאים בעוד {n} דק\'', leaveNow: 'יוצאים עכשיו', departed: 'יצא', earlier: '‹ מוקדם יותר', later: 'מאוחר יותר ›',
    tryLater: 'לנסות שעה מאוחרת יותר', tryMoreWalk: 'לאפשר הליכה של 30 דק\'', arriveByNote: 'הגעה עד {time} · המאוחר ביותר קודם', alsoAt: 'גם ב:', orLines: 'או',
    liveNoVehicle: 'אין רכב בשידור', livePassed: 'עבר', onTime: 'בזמן', liveUpdated: 'זמני אמת מ-{time}', liveOff: 'זמני אמת כבויים בהגדרות', liveFail: 'זמני אמת לא זמינים כרגע', liveMin: 'דק\'',
    showStops: 'הצגת התחנות', hideStops: 'הסתרת התחנות', vehicleHere: 'הרכב כאן', tripStopsTitle: 'קו {line} לכיוון {headsign}',
    waitFor: 'ממתינים לקו {line} ב{stop}', departsAt: 'יוצא ב-{time}', departsIn: 'בעוד {n} דק\'', getOffAt: 'יורדים ב{name}', stopsLeft: 'עוד {n} תחנות', stopLeft1: 'התחנה הבאה', nextStopIs: 'התחנה הבאה: {name}',
    getOffNext: 'לרדת בתחנה הבאה!', getOffNow: 'לרדת כאן: {name}', arrived: 'הגעתם ליעד 🎉', arrivesAt: 'הגעה ב-{time}', boarded: 'עלינו על קו {line}', tripOver: 'הנסיעה הזאת כבר הסתיימה.', tripEnded: 'הנסיעה הסתיימה.',
    alertSoon: 'עוד תחנה אחת', alertSoonBody: 'יורדים ב{name}', alertOff: 'לרדת כאן', alertArrived: 'הגעתם', testAlertMsg: 'כך תיראה התראה. אם לא קיבלתם התראה, אפשרו התראות לאתר.', alertPermNo: 'התראות חסומות לאתר; יישארו רטט וצליל.',
    gpsNo: 'אין מיקום, מתקדם לפי השעון', gpsOk: 'מיקום {acc} מ\'', followTitle: '{line} ← {to}', walkTitle: 'הליכה ← {to}', copied: 'הקישור הועתק', walkToDest: 'הליכה {min} דק\' אל היעד: {name}',
    agoMin: 'לפני {n} דק\'', liveMap: 'מפה חיה', liveMapCount: '{n} רכבים · נתונים מ-{time}', liveMapNone: 'אין רכבים בשידור באזור הזה', liveMapZoom: 'התקרבו כדי לראות רכבים', seenAgo: 'דווח ב-{time}', kmh: 'קמ"ש', livePlanned: 'זמני אמת מ-{time}', schedOnly: 'לוח זמנים בלבד', liveDelay: '⦿ {d} דק\'',
    chooseHome: 'איפה הבית?', chooseWork: 'איפה העבודה?', choosePlace: 'מקום לשמירה', savePlace: 'שמירה', unsavePlace: 'הסרה מהשמורים', fromMyLoc: 'מהמיקום שלי', historyCleared: 'ההיסטוריה נמחקה', walkOnly: 'הליכה כל הדרך: {min} דק\'',
    about: '<p><b>Wayli</b> מתכנן נסיעות בתחבורה הציבורית בישראל על הטלפון שלכם: לוח הזמנים הארצי ורשת הרחובות יורדים פעם אחת, והחיפוש רץ מקומית. חיפושים, היסטוריה ומקומות שמורים נשארים בטלפון.</p><p>זמני אמת: פרויקט האוטובוס הפתוח של הסדנא לידע ציבורי (אפשר לכבות בהגדרות). הנתונים: משרד התחבורה (GTFS) ו-OpenStreetMap. התוכנה חופשית ברישיון AGPL-3.0: <a href="https://github.com/Akensio/wayli">github.com/Akensio/wayli</a>.</p><p>עדיין אין: דיווחים, גבהים (זמני רכיבה בחיפה ובירושלים אופטימיים). לוח זמנים: {feed}.</p>',
  },
  en: {
    swap: 'Swap', now: 'Now', bike: 'Bicycle', bikeNone: 'None', bikePark: 'To the stop', bikeAlong: 'Take it along', folding: 'Folding',
    plan: 'Plan trip', nearbyTitle: 'Stops near me', refresh: 'Refresh', nearbyEmpty: 'Tap Refresh to find stops near your location.',
    favTrips: 'Saved trips', favStops: 'Saved stops', savedPlaces: 'Saved places', tabPlan: 'Plan', tabNearby: 'Nearby', tabSaved: 'Saved', tabMore: 'More',
    back: 'Back', fromHere: 'From here', toHere: 'To here', nextDeps: 'Next departures', fromQ: 'From?', toQ: 'To?', myLoc: 'My location',
    loadingTT: 'Loading the timetable', loadingST: 'Loading the street network (bikes and exact walking)', loadingPL: 'Loading addresses and places', unpacking: 'unpacking…', ready: 'Ready. {trips} trips on {date}.',
    kindStop: 'stop', kindAddress: 'address', kindStreet: 'street', kindCity: 'city', kindPoi: 'place', approxNo: 'nearest: {n}', placesPending: 'Addresses and places are still loading…', noMatch: 'No match. Try a stop name, a street and number, or a city.',
    pickTitle: 'Pick on the map', pickHint: 'Move the map so the marker is on the place', choose: 'Choose', cancel: 'Cancel', nearName: 'near {name}', pointName: 'Point on the map',
    btnLoc: '📍 My location', btnMap: '🗺️ Pick on the map', build: 'build {v}', updated: 'A new version has loaded.',
    readyStreets: 'Street network loaded.', loadFail: 'Loading failed: {msg}', planning: 'Planning…', noJourney: 'No journey with up to 3 transfers in this time window.',
    noOriginStops: 'No stop within walking distance of the origin.', noDestStops: 'No stop within walking distance of the destination.', pickBoth: 'Pick both the origin and the destination.',
    direct: 'direct', transfer1: '1 transfer', transfers: '{n} transfers', min: 'min', hour: 'h', walk: 'walk', bike2: 'bike',
    walkTo: 'walk {min} min to {name}', bikeTo: 'bike {min} min to {name}', walkFrom: 'walk {min} min from {name}', bikeFrom: 'bike {min} min from {name}',
    ride: '{line} · {agency} · {stops} stops', toward: 'towards {headsign}', bikeOnly: 'Bike all the way: {min} min, {km} km',
    noBikeOnly: 'Bike all the way: no route within 3 hours.', found: '{n} ways to get there', withBikeOnBoard: ' · bike on board: trains off-peak and intercity buses',
    foldingNote: ' · folding bike', parkNote: ' · bike stays at the first stop', noLocation: 'Location unavailable. Allow location access, or search for a stop.',
    locating: 'Locating…', m: 'm', inMin: 'in {n} min', nowDep: 'now', noDeps: 'No more departures today.', favEmptyTrips: 'No saved trips yet. Tap the star in a journey.',
    favEmptyStops: 'No saved stops yet. Tap the star in a stop.', saved: 'Saved', removed: 'Removed', train: 'Train', lrt: 'Light rail', platforms: '{n} platforms',
    dayFmt: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], today: 'Today', tomorrow: 'Tomorrow', tonight: 'Tonight',
    offline: 'offline', resume: 'Resume', departAt: 'Depart', arriveBy: 'Arrive by', settings: 'Settings', setLang: 'Language', setMap: 'Map in dark mode', mapLight: 'Light', mapDark: 'Dark',
    setWalk: 'Longest walk to a stop (min)', setLive: 'Live times', setNotify: 'Trip alerts (when to get off)', setSound: 'Sound and vibration', testAlert: 'Test alert', install: 'Add to home screen', clearHistory: 'Clear history',
    liveNote: 'Live times come from the Public Knowledge Workshop\'s Open Bus project. While on, the phone sends their server the line numbers and the area you are looking at. Nothing else.',
    startTrip: '▶ Start trip', share: 'Share', endTrip: 'End', nextStep: 'Next step ›', home: 'Home', work: 'Work', notSet: 'Not set. Tap to choose.', change: 'Change', addPlace: '+ Saved place', remove: 'Remove',
    recentTitle: 'Recent searches', planAgain: 'Plan again from now', resultsFrom: 'Results from {time}', leaveIn: 'Leave in {n} min', leaveNow: 'Leave now', departed: 'departed', earlier: '‹ Earlier', later: 'Later ›',
    tryLater: 'Try an hour later', tryMoreWalk: 'Allow a 30 min walk', arriveByNote: 'Arrive by {time} · latest first', alsoAt: 'Also at:', orLines: 'or',
    liveNoVehicle: 'no vehicle reporting', livePassed: 'passed', onTime: 'on time', liveUpdated: 'live as of {time}', liveOff: 'Live times are off in settings', liveFail: 'Live times unavailable right now', liveMin: 'min',
    showStops: 'Show stops', hideStops: 'Hide stops', vehicleHere: 'vehicle is here', tripStopsTitle: 'Line {line} towards {headsign}',
    waitFor: 'Wait for line {line} at {stop}', departsAt: 'departs at {time}', departsIn: 'in {n} min', getOffAt: 'Get off at {name}', stopsLeft: '{n} stops to go', stopLeft1: 'next stop', nextStopIs: 'Next stop: {name}',
    getOffNext: 'Get off at the next stop!', getOffNow: 'Get off here: {name}', arrived: 'You have arrived 🎉', arrivesAt: 'arrives at {time}', boarded: 'On line {line}', tripOver: 'This trip is already over.', tripEnded: 'Trip ended.',
    alertSoon: 'One more stop', alertSoonBody: 'Get off at {name}', alertOff: 'Get off here', alertArrived: 'You have arrived', testAlertMsg: 'This is what an alert looks like. If none showed, allow notifications for this site.', alertPermNo: 'Notifications are blocked for this site; vibration and sound remain.',
    gpsNo: 'no position, following the clock', gpsOk: 'position ±{acc} m', followTitle: '{line} → {to}', walkTitle: 'Walk → {to}', copied: 'Link copied', walkToDest: 'walk {min} min to the destination: {name}',
    agoMin: '{n} min ago', liveMap: 'Live map', liveMapCount: '{n} vehicles · data as of {time}', liveMapNone: 'No vehicles reporting in this area', liveMapZoom: 'Zoom in to see vehicles', seenAgo: 'reported at {time}', kmh: 'km/h', livePlanned: 'live times as of {time}', schedOnly: 'schedule only', liveDelay: '⦿ {d} min',
    chooseHome: 'Where is home?', chooseWork: 'Where is work?', choosePlace: 'Place to save', savePlace: 'Save', unsavePlace: 'Remove from saved', fromMyLoc: 'from my location', historyCleared: 'History cleared', walkOnly: 'Walk all the way: {min} min',
    about: '<p><b>Wayli</b> plans public-transport trips in Israel on your phone: the national timetable and the street network download once, and every search runs locally. Searches, history and saved places stay on the phone.</p><p>Live times: the Public Knowledge Workshop\'s Open Bus project (can be turned off in settings). Data: Ministry of Transport (GTFS) and OpenStreetMap. Free software, AGPL-3.0: <a href="https://github.com/Akensio/wayli">github.com/Akensio/wayli</a>.</p><p>Not yet: reports, elevation (bike times in Haifa and Jerusalem are optimistic). Timetable: {feed}.</p>',
  },
};
let lang = 'he';
try { lang = localStorage.getItem('wayli-lang') || 'he'; } catch (e) {}
const t = (k, vars) => {
  let s = (STR[lang] && STR[lang][k]) ?? STR.he[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(b);
  return s;
};
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  $('fromQ').placeholder = t('fromQ'); $('toQ').placeholder = t('toQ'); $('chQ').placeholder = t('toQ');
  for (const id of ['fromLoc', 'toLoc', 'chLoc']) $(id).textContent = t('btnLoc');
  for (const id of ['fromMap', 'toMap', 'chMap']) $(id).textContent = t('btnMap');
  $('langBtn').textContent = lang === 'he' ? 'EN' : 'עב';
  renderDays();
  renderAbout();
  renderSettings();
}
function setLang(l) {
  lang = l; try { localStorage.setItem('wayli-lang', lang); } catch (e) {}
  applyLang(); renderSaved(); renderRecent();
  if (lastResult && lastQuery) renderResults(lastResult, lastQuery);
}
$('langBtn').addEventListener('click', () => setLang(lang === 'he' ? 'en' : 'he'));

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

// ---------------------------------------------------------------- status, toast
function setStatus(text, error = false, frac = null) {
  $('statusText').textContent = text;
  $('status').classList.toggle('error', error);
  $('statusBar').hidden = frac == null;
  if (frac != null) $('statusBar').firstElementChild.style.width = `${Math.round(frac * 100)}%`;
}
function showProgress(m) {
  const label = m.label === 'timetable' ? t('loadingTT') : m.label === 'places' ? t('loadingPL') : t('loadingST');
  const mb = (m.got / 1e6).toFixed(1) + (m.total ? ' / ' + (m.total / 1e6).toFixed(1) : '') + ' MB';
  setStatus(`${label}: ${m.unpacking ? t('unpacking') : mb}`, false, m.total ? m.got / m.total : null);
}
let toastTimer = 0;
function toast(msg, ms = 2500) {
  $('toast').textContent = msg; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, ms);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------- time, days (Israel time, service days)
const fmt = (sec) => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
const dur = (sec) => { const mn = Math.round(sec / 60); return mn >= 60 ? `${Math.floor(mn / 60)} ${t('hour')} ${mn % 60} ${t('min')}` : `${mn} ${t('min')}`; };
const dateOf = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
const calToday = () => { const p = live.ilParts(); return live.dayStr(p.y, p.m, p.d); };
function dayLabel(s) {
  const d = dateOf(s), svc = live.serviceDay(), today = calToday();
  const base = `${t('dayFmt')[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  if (s === svc.day && svc.lateNight) return `${t('tonight')} · ${base}`;
  if (s === today) return `${t('today')} · ${base}`;
  if (s === live.shiftDay(today, 1)) return `${t('tomorrow')} · ${base}`;
  return base;
}
/** The time field as seconds on the selected service day (a late-night time on "tonight" is past 24:00). */
function atSeconds() {
  const [h, m] = $('at').value.split(':').map(Number);
  let sec = (Number.isNaN(h) ? 8 : h) * 3600 + (m || 0) * 60;
  const svc = live.serviceDay();
  if ($('day').value === svc.day && svc.lateNight && h < 3) sec += 86400;
  return sec;
}
function setAt(sec) { $('at').value = fmt(Math.max(0, Math.min(sec, 86400 * 2 - 60))); }
function setDefaultTime() {
  const svc = live.serviceDay();
  $('at').value = $('day').value === svc.day ? fmt(svc.seconds) : '08:00';
}
/** Minutes until a departure on a service day, from the real clock. */
const minutesUntil = (sec, day) => Math.round((sec - live.nowOn(day)) / 60);
function leaveText(sec, day) {
  const n = minutesUntil(sec, day);
  if (n > 180 || n < -180) return '';
  if (n < -1) return t('departed');
  if (n <= 0) return t('leaveNow');
  return t('leaveIn', { n });
}
setInterval(() => {
  for (const el of document.querySelectorAll('[data-dep]')) {
    const txt = leaveText(+el.dataset.dep, el.dataset.day);
    el.textContent = txt; el.classList.toggle('past', txt === t('departed'));
  }
}, 20000);

// ---------------------------------------------------------------- data manifest and days
let manifest = null, dayInfo = null, ttReady = false, stReady = false, plReady = false;
const tsCache = new Map();   // trip -> promise of tripStops, per loaded day
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
  dayInfo = info; ttReady = true; tsCache.clear(); lmLabels.clear(); lmStops = false;
  $('planBtn').disabled = false;
  setStatus(t('ready', { trips: info.counts.trips.toLocaleString(), date: dayLabel(info.date) }));
  renderDays();
}
async function loadPlaces() {
  if (plReady || !manifest.places) return;
  try {
    await call('loadPlaces', { url: `data/${manifest.places.file}?v=${encodeURIComponent(manifest.places.built || manifest.built || '')}` });
    plReady = true;
    for (const side of ['from', 'to']) if (!place[side] && $(side + 'Q').value.trim().length >= 2) $(side + 'Q').dispatchEvent(new Event('input'));
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); }
}
async function loadStreets() {
  if (stReady || !manifest.streets) return;
  try {
    await call('loadStreets', { url: `data/${manifest.streets.file}?v=${encodeURIComponent(manifest.streets.built || manifest.built || '')}` });
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
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; $('installBtn').hidden = false; });
$('installBtn').addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; $('installBtn').hidden = true; });
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
  renderSaved(); renderRecent();
  // a trip in progress comes back first, timetable or not
  const active = activeTrip.get();
  if (active && !tripStale(active)) { updateResumeBar(); if (active.view === 'follow') openFollow(active); } else if (active) activeTrip.clear();
  try {
    manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  renderAbout();
  if (manifest.built) $('ver').textContent = t('build', { v: manifest.built.replace('T', ' ').slice(5, 16) });
  const params = new URLSearchParams(location.search);
  const shared = parseShared(params);
  const last = shared ? null : lastSearch.get();
  let start = startDay();
  if (shared && manifest.days.some((d) => d.date === shared.day)) start = shared.day;
  else if (last && last.q && manifest.days.some((d) => d.date === last.q.day) && Date.now() - last.at < 6 * 3600e3) start = last.q.day;
  renderDays();
  $('day').value = start;
  setDefaultTime();
  if (shared) applyQuery(shared);
  else if (last && last.q && last.q.day === start && Date.now() - last.at < 6 * 3600e3) { applyQuery(last.q); lastResult = last.result; lastQuery = last.q; renderResults(last.result, last.q, last.at); }
  try { await loadDay(start); } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  if (shared) { history.replaceState(null, '', location.pathname); plan(); }
  await loadPlaces();
  loadStreets();
}
$('day').addEventListener('change', () => { loadDay($('day').value).catch((e) => setStatus(t('loadFail', { msg: e.message }), true)); setDefaultTime(); });
$('nowBtn').addEventListener('click', () => {
  if (manifest) $('day').value = startDay();
  setDefaultTime(); setTimeMode('depart');
  if (dayInfo && dayInfo.date !== $('day').value) $('day').dispatchEvent(new Event('change'));
});
function setTimeMode(mode) { for (const o of $('timeMode').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.mode === mode)); }
const timeMode = () => $('timeMode').querySelector('[aria-pressed="true"]').dataset.mode;
for (const b of $('timeMode').querySelectorAll('button')) b.addEventListener('click', () => setTimeMode(b.dataset.mode));

// ---------------------------------------------------------------- places and search
const place = { from: null, to: null };   // {name, stops:[...], lat, lon} or {name, lat, lon}
function describePlace(p) { return p ? p.name + (p.platforms > 1 ? ` (${t('platforms', { n: p.platforms })})` : '') : ''; }
function setPlace(side, p) { place[side] = p; $(side + 'Q').value = p ? p.name : ''; }
const fromResult = (g) => g.kind === 'stop' ? g : { name: g.city && g.kind !== 'city' ? `${g.name}, ${g.city}` : g.name, lat: g.lat, lon: g.lon };

/**
 * A search box: free text over stops, addresses, streets, places and cities; when empty, the saved and
 * recent places. onPick gets the chosen place.
 */
function attachSearch(input, drop, onPick) {
  let timer = 0, seq = 0;
  const pick = (p) => { onPick(p); drop.hidden = true; };
  const row = (html, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.innerHTML = html; return b; };
  function quickMenu() {
    drop.innerHTML = '';
    const icons = { home: '🏠', work: '💼', more: '★' };
    const saved = savedPlaces.all(), recent = recentPlaces.list().filter((r) => !savedPlaces.has(r));
    if (!saved.length && !recent.length) { drop.hidden = true; return; }
    for (const p of saved) {
      const b = row(`<span class="ic">${icons[p.slot]}</span><span class="txt">${esc(p.slot === 'more' ? p.name : t(p.slot))}<small>${esc(p.slot === 'more' ? '' : p.name)}</small></span>`, 'quick');
      b.addEventListener('click', () => pick(p));
      drop.appendChild(b);
    }
    for (const p of recent.slice(0, 6)) {
      const b = row(`<span class="ic">🕓</span><span class="txt">${esc(p.name)}</span>`, 'quick');
      const star = document.createElement('span'); star.className = 'mini'; star.textContent = '☆'; star.title = t('savePlace');
      star.addEventListener('click', (e) => { e.stopPropagation(); savedPlaces.add(p); renderSaved(); toast(t('saved')); quickMenu(); });
      b.appendChild(star);
      b.addEventListener('click', () => pick(p));
      drop.appendChild(b);
    }
    drop.hidden = false;
  }
  input.addEventListener('input', () => {
    onPick(null, true);
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q.length) { quickMenu(); return; }
    if (q.length < 2 || !ttReady) { drop.hidden = true; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      const { results, placesLoaded } = await call('search', { q, limit: 10, lang, near: lastPos });
      if (my !== seq) return;
      drop.innerHTML = '';
      for (const g of results) {
        const kind = g.kind === 'stop' ? (g.platforms > 1 ? t('platforms', { n: g.platforms }) : t('kindStop'))
          : g.kind === 'poi' ? (g.label || t('kindPoi')) : t('kind' + g.kind[0].toUpperCase() + g.kind.slice(1));
        const extra = g.approx != null ? ' · ' + t('approxNo', { n: g.approx }) : '';
        const b = row(`${esc(g.name)}<small>${esc(kind)}${g.city ? ' · ' + esc(g.city) : ''}${extra}</small>`);
        b.addEventListener('click', () => pick(fromResult(g)));
        drop.appendChild(b);
      }
      if (!results.length) { const n = row(placesLoaded ? t('noMatch') : t('placesPending')); n.disabled = true; drop.appendChild(n); }
      drop.hidden = false;
    }, 150);
  });
  input.addEventListener('focus', () => { if (!input.value.trim()) quickMenu(); else if (drop.children.length) drop.hidden = false; });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = drop.querySelector('button:not(:disabled)');
    if (!drop.hidden && first && input.value.trim()) { first.click(); e.preventDefault(); }
    else if (place.from && place.to) { plan(); e.preventDefault(); }
  });
  document.addEventListener('click', (e) => { if (!drop.contains(e.target) && e.target !== input) drop.hidden = true; });
}
function wireSide(side) {
  attachSearch($(side + 'Q'), $(side + 'Drop'), (p, typing) => { if (typing) place[side] = null; else setPlace(side, p); });
  $(side + 'Loc').addEventListener('click', async () => {
    $(side + 'Q').value = t('locating');
    try { const pos = await getPosition(); setPlace(side, myLocation(pos)); }
    catch (e) { $(side + 'Q').value = ''; showPlanError(t('noLocation')); }
  });
  $(side + 'Map').addEventListener('click', () => pickOnMap(place[side]).then((p) => { if (p) setPlace(side, p); }));
}
const myLocation = (pos) => ({ name: t('myLoc'), lat: pos.lat, lon: pos.lon, transient: true });
wireSide('from'); wireSide('to');

// ---- pick a point on the map
let pickMap = null, pickPoint = null, pickSeq = 0, pickResolve = null;
function pickOnMap(startAt) {
  return new Promise((resolve) => {
    pickResolve = resolve;
    $('picker').hidden = false;
    $('pickName').textContent = '…';
    requestAnimationFrame(() => {
      const start = startAt && startAt.lat != null ? startAt : lastPos || place.from || place.to;
      if (!pickMap) {
        pickMap = makeMap('pickMap', start ? [start.lat, start.lon] : [32.08, 34.78], start ? 16 : 11);
        if (!pickMap) return;
        pickMap.on('moveend', () => nameCenter());
        pickMap.on('click', (e) => pickMap.easeTo({ center: e.lngLat, duration: 250 }));
        pickMap.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: true }), lang === 'he' ? 'top-left' : 'top-right');
      } else {
        pickMap.resize();
        pickMap.jumpTo({ center: start ? [start.lon, start.lat] : [34.78, 32.08], zoom: start ? 16 : 11 });
      }
      nameCenter();
    });
  });
}
async function nameCenter() {
  if (!pickMap) return;
  const c = pickMap.getCenter();
  pickPoint = { lat: c.lat, lon: c.lng };
  const my = ++pickSeq;
  $('pickName').textContent = '…';
  try {
    const r = await call('reverse', { lat: c.lat, lon: c.lng });
    if (my !== pickSeq) return;
    $('pickName').textContent = r.kind === 'point' ? t('pointName') : r.distance > 40 ? t('nearName', { name: r.name }) : r.name;
    pickPoint.name = $('pickName').textContent;
  } catch (e) { if (my === pickSeq) { $('pickName').textContent = t('pointName'); pickPoint.name = t('pointName'); } }
}
const closePicker = (p) => { $('picker').hidden = true; const r = pickResolve; pickResolve = null; if (r) r(p); };
$('pickCancel').addEventListener('click', () => closePicker(null));
$('pickChoose').addEventListener('click', () => { if (!pickPoint) return; closePicker({ name: pickPoint.name || t('pointName'), lat: pickPoint.lat, lon: pickPoint.lon }); });
$('pickLocate').addEventListener('click', async () => {
  try { const p = await getPosition(); lastPos = p; if (pickMap) pickMap.easeTo({ center: [p.lon, p.lat], zoom: 16 }); } catch (e) { $('pickName').textContent = t('noLocation'); }
});
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
// ---- choose a place for home / work / saved (search, my location or the map)
let chooserResolve = null;
function choosePlace(title) {
  return new Promise((resolve) => {
    chooserResolve = resolve;
    $('chTitle').textContent = title; $('chQ').value = ''; $('chDrop').hidden = true;
    $('chooser').hidden = false;
    setTimeout(() => $('chQ').focus(), 50);
  });
}
const closeChooser = (p) => { $('chooser').hidden = true; const r = chooserResolve; chooserResolve = null; if (r) r(p); };
attachSearch($('chQ'), $('chDrop'), (p, typing) => { if (!typing && p) closeChooser(p); });
$('chCancel').addEventListener('click', () => closeChooser(null));
$('chLoc').addEventListener('click', async () => { try { const pos = await getPosition(); const r = await call('reverse', pos); closeChooser({ name: r.name, lat: pos.lat, lon: pos.lon }); } catch (e) { toast(t('noLocation')); } });
$('chMap').addEventListener('click', async () => { const p = await pickOnMap(null); if (p) closeChooser(p); });

$('swap').addEventListener('click', () => {
  const a = place.from, b = place.to, va = $('fromQ').value, vb = $('toQ').value;
  place.from = b; place.to = a; $('fromQ').value = vb; $('toQ').value = va;
});
for (const b of $('bikeMode').querySelectorAll('button')) b.addEventListener('click', () => setBike(b.dataset.mode));
function setBike(mode) { for (const o of $('bikeMode').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.mode === mode)); }
const bikeChoice = () => $('bikeMode').querySelector('[aria-pressed="true"]').dataset.mode;
function showPlanError(msg) { $('planError').textContent = msg; $('planError').hidden = !msg; }

// ---------------------------------------------------------------- planning
let lastResult = null, lastQuery = null;
$('planBtn').addEventListener('click', () => plan());
/** Fill the form from a query (a recent search, a shared link, a saved trip). */
function applyQuery(q) {
  setPlace('from', q.from); setPlace('to', q.to);
  setBike(q.bike || 'none'); $('folding').checked = !!q.folding;
  if (q.day && manifest && manifest.days.some((d) => d.date === q.day)) $('day').value = q.day;
  if (q.at) $('at').value = q.at;
  setTimeMode(q.arriveBy ? 'arrive' : 'depart');
}
function parseShared(params) {
  const pt = (s) => { if (!s) return null; const [lat, lon, ...rest] = s.split(','); const name = decodeURIComponent(rest.join(',')) || `${lat}, ${lon}`; return Number.isNaN(+lat) ? null : { name, lat: +lat, lon: +lon }; };
  const from = pt(params.get('from')), to = pt(params.get('to'));
  if (!from || !to) return null;
  return { from, to, day: params.get('day') || '', at: params.get('at') || '', bike: params.get('bike') || 'none', folding: params.get('folding') === '1', arriveBy: params.get('mode') === 'arrive' };
}
async function plan(opts = {}) {
  showPlanError('');
  if (!place.from || !place.to) { showPlanError(t('pickBoth')); return; }
  if (!ttReady) return;
  const day = $('day').value;
  const weekday = dateOf(day).getDay() <= 4;
  const bike = bikeChoice(), folding = $('folding').checked, arriveBy = timeMode() === 'arrive';
  const at = atSeconds();
  const fromTime = arriveBy ? Math.max(0, at - 7200) : at, toTime = arriveBy ? at : at + 3600;
  const maxWalk = (opts.maxWalk || settings.get().maxWalk) * 60;
  $('planBtn').disabled = true;
  $('results').innerHTML = `<div class="empty">${t('planning')}</div>`;
  $('recentBox').hidden = true;
  const q = { from: place.from, to: place.to, day, at: $('at').value, bike, folding, arriveBy, maxWalk: maxWalk / 60 };
  // a plan from now takes the delays of the vehicles on the road into account
  let vehicles = null, liveAsOf = null;
  const svc = live.serviceDay();
  if (liveOn() && !arriveBy && day === svc.day && Math.abs(at - svc.seconds) < 1200 && place.from.lat != null) {
    try { vehicles = await live.vehiclesForPlanning(place.from.lat, place.from.lon, { timeoutMs: 8000 }); liveAsOf = live.newest(vehicles); } catch (e) { vehicles = null; }
  }
  q.liveAsOf = liveAsOf ? liveAsOf.getTime() : null; q.liveTried = !!(liveOn() && !arriveBy && day === svc.day && Math.abs(at - svc.seconds) < 1200);
  try {
    const r = await call('plan', { from: place.from, to: place.to, fromTime, toTime, bike, folding, weekday, maxWalk, arriveBy, vehicles });
    lastResult = r; lastQuery = q;
    recentTrips.add(q); recentPlaces.add(place.from); recentPlaces.add(place.to);
    lastSearch.set({ q, result: r, at: Date.now() });
    renderResults(r, q);
    renderRecent();
  } catch (e) { showPlanError(e.message); $('results').innerHTML = ''; }
  $('planBtn').disabled = false;
}
/** "in n min" for the near future only; beyond two hours the clock time says enough. */
const inShort = (n) => (n > 120 || n < 0 ? '' : ` (${t('departsIn', { n })})`);
const transfersText = (n) => n === 0 ? t('direct') : n === 1 ? t('transfer1') : t('transfers', { n });
const chipClass = (l) => l.type === 'ride' ? `chip t${l.routeType}` : l.mode === 'bike' ? 'chip bike' : 'chip walk';
const lineText = (line) => line === 'train' ? t('train') : line;
const chipText = (l, alts) => l.type === 'ride' ? esc(alts && alts.length > 1 ? alts.map(lineText).join(' / ') : lineText(l.line)) : `${l.mode === 'bike' ? '🚲' : '🚶'} ${Math.round(l.seconds / 60)}`;
/** A ride leg planned with live data: how late its vehicle runs. */
function liveLine(l) {
  if (!l || !l.live) return '';
  const d = live.delayMinutes(l.live.delay);
  const txt = d === 0 ? t('onTime') : t('liveDelay', { d: (d > 0 ? '+' : '') + d });
  return `<div class="muted"><span class="live ${d >= 3 ? 'late' : 'ok'}">${esc(txt)}${l.live.stale ? ' ?' : ''}</span></div>`;
}
function journeyCard(j, q, alts, options) {
  const d = document.createElement('div');
  d.className = 'journey';
  const rides = j.legs.map((l, i) => ({ l, i })).filter((x) => x.l.type === 'ride');
  d.innerHTML = `<div class="top"><span class="times">${fmt(j.depart)} → ${fmt(j.arrive)}</span><span class="dur">${dur(j.arrive - j.depart)} · ${transfersText(j.transfers)}</span></div>` +
    `<div class="chips">${j.legs.map((l, i) => `<span class="${chipClass(l)}">${chipText(l, alts && alts[i])}</span>`).join('<span class="muted">›</span>')}</div>` +
    `<div class="sub">${rides.map(({ l }) => `${esc(lineText(l.line))} ${t('toward', { headsign: esc(l.headsign) })}`).join(' · ')}</div>` +
    (options && options.length > 1 ? `<div class="opts"><span class="muted">${t('alsoAt')}</span>${options.slice(1).map((o, k) => `<button type="button" class="opt" data-k="${k + 1}">${fmt(o.depart)}</button>`).join('')}</div>` : '') +
    `<div class="leave" data-dep="${j.depart}" data-day="${q.day}">${leaveText(j.depart, q.day)}</div>` + liveLine(rides.length ? rides[0].l : null);
  if (leaveText(j.depart, q.day) === t('departed')) d.querySelector('.leave').classList.add('past');
  for (const b of d.querySelectorAll('.opt')) {
    const o = options[+b.dataset.k];
    if (leaveText(o.depart, q.day) === t('departed')) b.classList.add('past');
    b.addEventListener('click', (e) => { e.stopPropagation(); openDetail(o, q); });
  }
  d.addEventListener('click', () => openDetail(j, q));
  return d;
}
function renderResults(r, q, resultsAt = null) {
  const box = $('results');
  box.innerHTML = '';
  $('recentBox').hidden = true;
  const note = q.bike === 'along' ? (q.folding ? t('foldingNote') : t('withBikeOnBoard')) : q.bike === 'park' ? t('parkNote') : '';
  const head = document.createElement('div');
  head.className = 'results-head muted';
  const n = (r.groups || r.journeys).length;
  const clock = (ms) => new Date(ms).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
  const liveNote = q.liveTried ? (q.liveAsOf ? ` · <span class="live ok">${t('livePlanned', { time: clock(q.liveAsOf) })}</span>` : ` · <span class="live">${t('schedOnly')}</span>`) : '';
  head.innerHTML = `<span>${resultsAt ? t('resultsFrom', { time: clock(resultsAt) }) + ' · ' : ''}${t('found', { n })}${note}${q.arriveBy ? ' · ' + t('arriveByNote', { time: q.at }) : ''}${liveNote}</span><span class="spacer"></span>`;
  if (resultsAt) { const b = document.createElement('button'); b.type = 'button'; b.className = 'linkbtn'; b.textContent = t('planAgain'); b.addEventListener('click', () => { $('nowBtn').click(); plan(); }); head.appendChild(b); }
  box.appendChild(head);
  if (r.bikeOnly) {
    const b = document.createElement('div');
    b.className = 'journey';
    b.innerHTML = `<div class="top"><span class="times"><span class="chip bike">🚲</span> ${t('bikeOnly', { min: Math.round(r.bikeOnly.seconds / 60), km: (r.bikeOnly.metres / 1000).toFixed(1) })}</span></div>`;
    b.addEventListener('click', () => openDetail({ depart: 0, arrive: r.bikeOnly.seconds, transfers: 0, legs: [{ type: 'access', mode: 'bike', seconds: r.bikeOnly.seconds, path: r.bikeOnly.path, to: { name: describePlace(q.to) } }] }, q, true));
    box.appendChild(b);
  } else if (q.bike !== 'none' && r.streets && !q.from.stops && !q.to.stops) {
    const b = document.createElement('div'); b.className = 'muted'; b.textContent = t('noBikeOnly'); box.appendChild(b);
  }
  if (!r.journeys.length) {
    const e = document.createElement('div'); e.className = 'empty'; e.textContent = t(r.reason || 'noJourney'); box.appendChild(e);
    const foot = document.createElement('div'); foot.className = 'results-foot';
    const later = document.createElement('button'); later.type = 'button'; later.className = 'ghost'; later.textContent = t('tryLater');
    later.addEventListener('click', () => { setAt(atSeconds() + 3600); plan(); });
    foot.appendChild(later);
    if (r.reason && q.maxWalk < 30) { const w = document.createElement('button'); w.type = 'button'; w.className = 'ghost'; w.textContent = t('tryMoreWalk'); w.addEventListener('click', () => plan({ maxWalk: 30 })); foot.appendChild(w); }
    box.appendChild(foot);
    return;
  }
  let groups = r.groups || r.journeys.map((_, i) => ({ options: [i], lines: null }));
  if (q.arriveBy) groups = groups.slice().reverse();
  for (const g of groups) {
    let opts = g.options.map((i) => r.journeys[i]);
    if (q.arriveBy) opts = opts.slice().reverse();
    box.appendChild(journeyCard(opts[0], q, g.lines, opts));
  }
  const foot = document.createElement('div'); foot.className = 'results-foot';
  const earlier = document.createElement('button'); earlier.type = 'button'; earlier.className = 'ghost'; earlier.textContent = t('earlier');
  earlier.addEventListener('click', () => { setAt(Math.max(0, atSeconds() - 3600)); plan(); });
  const later = document.createElement('button'); later.type = 'button'; later.className = 'ghost'; later.textContent = t('later');
  later.addEventListener('click', () => { setAt(atSeconds() + 3600); plan(); });
  foot.append(earlier, later);
  box.appendChild(foot);
}
/** Recent searches, under the form while there are no results. */
function renderRecent() {
  const box = $('recentBox');
  box.innerHTML = '';
  const l = recentTrips.list();
  if (!l.length) return;
  const h = document.createElement('h2'); h.className = 'sec'; h.textContent = t('recentTitle'); box.appendChild(h);
  for (const r of l) {
    const d = document.createElement('div');
    d.className = 'recent';
    const when = new Date(r.at);
    d.innerHTML = `<span class="ic">🕓</span><span class="txt"><span class="name">${esc(r.from.name)} ← ${esc(r.to.name)}</span><small>${esc(dayLabel(r.day || calToday()))} ${esc(r.time || '')}${r.bike && r.bike !== 'none' ? ' · 🚲' : ''}${r.arriveBy ? ' · ' + t('arriveBy') : ''}</small></span>`;
    if (lang !== 'he') d.querySelector('.name').textContent = `${r.from.name} → ${r.to.name}`;
    d.addEventListener('click', () => { applyQuery(r); $('nowBtn').click(); showScreen('plan'); plan(); });
    box.appendChild(d);
  }
  box.hidden = !!$('results').children.length;
  void when;
}

// ---------------------------------------------------------------- maps (MapLibre, OpenFreeMap vector tiles)
// light Liberty everywhere; in dark mode the "Fiord" basemap when chosen in settings. (localStorage 'wayli-map-style' overrides, for trying others)
function mapStyle() {
  let o = null; try { o = localStorage.getItem('wayli-map-style'); } catch (e) {}
  const dark = settings.get().map === 'dark' && matchMedia('(prefers-color-scheme: dark)').matches;
  return `https://tiles.openfreemap.org/styles/${o || (dark ? 'fiord' : 'liberty')}`;
}
let rtlSet = false;
function makeMap(container, center, zoom) {
  if (typeof maplibregl === 'undefined') return null;
  if (!rtlSet) { try { maplibregl.setRTLTextPlugin('https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js', true); } catch (e) {} rtlSet = true; }
  const m = new maplibregl.Map({ container, style: mapStyle(), center: [center[1], center[0]], zoom, attributionControl: { compact: true }, pitchWithRotate: false });
  m.addControl(new maplibregl.NavigationControl({ showCompass: false }), lang === 'he' ? 'top-left' : 'top-right');
  m.on('error', (e) => console.warn('map', e && e.error && e.error.message));
  return m;
}
const whenStyled = (m, fn) => (m.isStyleLoaded() ? fn() : m.once('load', fn));
function dropMaps() { for (const m of [map, pickMap, followMap, lmap]) if (m) m.remove(); map = pickMap = followMap = lmap = null; lmStops = false; }
const legColor = (l) => l.type === 'ride' ? (l.routeType === 2 ? '#1f5fa8' : l.routeType === 0 ? '#8a3fb0' : '#2a7d4f') : (l.mode === 'bike' ? '#1f5fa8' : '#2b3036');
/** Draw a journey on a map: casing, rides, dashed walks, pins at boarding and alighting stops, dots at the stops between. */
function drawJourney(m, j, markers) {
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
      for (const c of coords.slice(1, -1)) dots.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } });
    }
  }
  const data = { type: 'FeatureCollection', features };
  if (m.getSource('journey')) { m.getSource('journey').setData(data); m.getSource('stops').setData({ type: 'FeatureCollection', features: dots }); }
  else {
    m.addSource('journey', { type: 'geojson', data });
    m.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: dots } });
    m.addLayer({ id: 'journey-casing', type: 'line', source: 'journey', paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'ride'], 1], 8, 7], 'line-opacity': .9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    m.addLayer({ id: 'journey-ride', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 1], paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    m.addLayer({ id: 'journey-walk', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 0], paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [1, 1.5] }, layout: { 'line-cap': 'round' } });
    m.addLayer({ id: 'journey-stops', type: 'circle', source: 'stops', minzoom: 12, paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#444', 'circle-stroke-width': 1.5 } });
  }
  return bounds;
}
function vehicleMarker(m, markers, v, label) {
  const el = document.createElement('div'); el.className = 'wayli-bus' + (v.stale ? ' stale' : ''); el.textContent = label || '🚌'; el.title = v.vehicle ? fmt(v.seen) : '';
  const mk = new maplibregl.Marker({ element: el }).setLngLat([v.vehicle.lon, v.vehicle.lat]).addTo(m);
  markers.push(mk);
  return mk;
}

// ---------------------------------------------------------------- journey detail
let map = null, journeyMarkers = [], liveMarkers = [], detailSeq = 0;
function ensureMap() { if (!map) map = makeMap('map', [32.08, 34.78], 10); return map; }
const tripStopsCached = (trip) => { if (!tsCache.has(trip)) tsCache.set(trip, call('tripStops', { trip })); return tsCache.get(trip); };
const liveOn = () => settings.get().live && navigator.onLine !== false;
function liveBadge(at) {
  if (!at) return { text: t('liveNoVehicle'), cls: '' };
  if (at.passed) return { text: t('livePassed'), cls: 'gone' };
  const d = live.delayMinutes(at.delay);
  const text = `⦿ ${fmt(at.time)}${d === 0 ? ' · ' + t('onTime') : ` (${d > 0 ? '+' : ''}${d})`}${at.stale ? ' ?' : ''}`;
  return { text, cls: d >= 3 ? 'late' : 'ok' };
}
function openDetail(j, q, bikeOnly = false) {
  const my = ++detailSeq;
  $('detail').hidden = false;
  $('detailTitle').textContent = bikeOnly ? t('bikeOnly', { min: Math.round(j.arrive / 60), km: '' }).replace(', ', '').replace(' ק"מ', '').replace(' km', '') : `${fmt(j.depart)} → ${fmt(j.arrive)} · ${dur(j.arrive - j.depart)}`;
  $('detailNote').textContent = '';
  const legs = $('detailLegs');
  legs.innerHTML = '';
  for (const l of j.legs) {
    const el = document.createElement('div');
    el.className = `leg ${l.type}${l.type === 'ride' ? ' t' + l.routeType : ''}`;
    let what = '';
    const mins = Math.round(l.seconds / 60);
    if (l.type === 'ride') {
      const planned = l.live ? liveBadge({ time: l.depart, delay: l.live.delay, passed: false, stale: l.live.stale }) : null;
      what = `<span class="chip t${l.routeType}">${esc(lineText(l.line))}</span> ${esc(l.headsign)}<span class="live${planned ? ' ' + planned.cls : ''}" data-live="${l.trip}">${planned ? esc(planned.text) : ''}</span><small>${esc(l.from.name)} → ${esc(l.to.name)} · ${t('ride', { line: '', agency: esc(l.agency), stops: l.stops }).replace(/^ · /, '')}</small>`;
      if (l.stopsAlong && l.stopsAlong.length > 2) what += `<button type="button" class="toggle">${t('showStops')}</button><div class="stoplist" hidden>${l.stopsAlong.map((s) => `<div><span>${fmt(s.arr)}</span><span>${esc(s.name)}</span></div>`).join('')}</div>`;
    }
    else if (l.type === 'access') what = (l.mode === 'bike' ? t('bikeTo', { min: mins, name: esc(l.to.name) }) : t('walkTo', { min: mins, name: esc(l.to.name) }));
    else if (l.type === 'egress') what = (l.mode === 'bike' ? t('bikeFrom', { min: mins, name: esc(l.from.name) }) : t('walkFrom', { min: mins, name: esc(l.from.name) }));
    else what = t('walkTo', { min: mins, name: esc(l.to.name) });
    el.innerHTML = `<span class="t">${bikeOnly ? '' : fmt(l.depart)}${l.type === 'ride' ? '<br>' + fmt(l.arrive) : ''}</span><span class="dot"></span><span class="what">${what}</span>`;
    const tg = el.querySelector('.toggle');
    if (tg) tg.addEventListener('click', () => { const sl = el.querySelector('.stoplist'); sl.hidden = !sl.hidden; tg.textContent = sl.hidden ? t('showStops') : t('hideStops'); });
    legs.appendChild(el);
  }
  updateStar('detailStar', q && !bikeOnly ? tripKey(q) : null, 'trips');
  $('detailStar').onclick = () => { if (q && !bikeOnly) { favs.toggle('trips', tripKey(q), { from: q.from, to: q.to, bike: q.bike, folding: q.folding }); renderSaved(); } updateStar('detailStar', tripKey(q), 'trips'); };
  $('detailStart').hidden = bikeOnly;
  $('detailStart').onclick = () => startTrip(j, q);
  $('detailShare').onclick = () => shareJourney(j, q, bikeOnly);
  requestAnimationFrame(() => {
    const m = ensureMap();
    if (!m) return;
    m.resize();
    whenStyled(m, () => {
      const b = drawJourney(m, j, journeyMarkers);
      for (const mk of liveMarkers.splice(0)) mk.remove();
      if (!b.isEmpty()) m.fitBounds(b, { padding: 36, duration: 0, maxZoom: 16 });
      if (!bikeOnly) liveForJourney(j, q.day, legs, my);
    });
  });
}
/** Live badges on the ride legs of a journey happening around now, and the vehicles on the map. */
async function liveForJourney(j, day, container, seq) {
  if (!liveOn() || !dayInfo || dayInfo.date !== day) return;   // trip indices belong to the loaded day
  const now = live.nowOn(day);
  if (j.depart - now > 5400 || now - j.arrive > 1800) return;
  const rides = j.legs.filter((l) => l.type === 'ride' && l.routeId != null && l.depart - now < 5400 && now - l.arrive < 900).slice(0, 4);
  await Promise.all(rides.map(async (l) => {
    const badge = container.querySelector(`[data-live="${l.trip}"]`);
    try {
      const vs = await live.vehiclesByLine(l.routeId);
      if (seq !== detailSeq) return;
      const v = live.matchTrip(vs, l.routeId, l.firstDep, day);
      if (!v) { if (badge) badge.textContent = t('liveNoVehicle'); return; }
      const ts = await tripStopsCached(l.trip);
      const est = live.estimateDelay(v, ts.stops, day);
      const at = live.liveAt(est, ts.stops, l.boardPos);
      if (seq !== detailSeq) return;
      const b = liveBadge(at);
      if (badge) { badge.textContent = b.text; badge.className = 'live ' + b.cls; }
      if (est && map) vehicleMarker(map, liveMarkers, est, l.routeType === 2 ? '🚆' : l.routeType === 0 ? '🚊' : '🚌');
    } catch (e) { if (badge) badge.textContent = t('liveFail'); }
  }));
}
function shareJourney(j, q, bikeOnly) {
  const lines = [`${q.from.name} → ${q.to.name}`, `${fmt(j.depart)} → ${fmt(j.arrive)} (${dur(j.arrive - j.depart)})`];
  for (const l of j.legs) {
    const mins = Math.round(l.seconds / 60);
    if (l.type === 'ride') lines.push(`${fmt(l.depart)} ${lineText(l.line)} ${l.from.name} → ${l.to.name} ${fmt(l.arrive)}`);
    else lines.push(`${l.mode === 'bike' ? '🚲' : '🚶'} ${mins} ${t('min')}`);
  }
  const u = new URL(location.href); u.search = ''; u.hash = '';
  const pt = (p) => `${(+p.lat).toFixed(5)},${(+p.lon).toFixed(5)},${encodeURIComponent(p.name)}`;
  if (q.from.lat != null && q.to.lat != null && !bikeOnly) {
    u.searchParams.set('from', pt(q.from)); u.searchParams.set('to', pt(q.to)); u.searchParams.set('day', q.day); u.searchParams.set('at', fmt(j.depart));
    if (q.bike !== 'none') u.searchParams.set('bike', q.bike);
    if (q.folding) u.searchParams.set('folding', '1');
  }
  const text = lines.join('\n');
  if (navigator.share) navigator.share({ title: 'Wayli', text, url: u.toString() }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(`${text}\n${u}`).then(() => toast(t('copied'))).catch(() => {});
}
$('detailBack').addEventListener('click', () => { $('detail').hidden = true; detailSeq++; });

// ---------------------------------------------------------------- nearby and stop detail
let lastPos = null;
(async () => {
  try {
    if (!navigator.permissions || !navigator.geolocation) return;
    const st = await navigator.permissions.query({ name: 'geolocation' });
    if (st.state === 'granted') lastPos = await getPosition();
  } catch (e) { /* no location, no problem */ }
})();
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
    const walk = withDistance && s.distance != null ? ` · 🚶 ${Math.max(1, Math.round(s.distance * 1.25 / 1.2 / 60))} ${t('min')}` : '';
    d.innerHTML = `<div class="name">${esc(s.name)}</div><div class="meta">${esc(s.city || '')}${withDistance && s.distance != null ? ` · ${s.distance} ${t('m')}${walk}` : ''}${s.code ? ` · ${esc(s.code)}` : ''}</div>` +
      `<div class="chips">${(s.lines || []).map((l) => `<span class="chip t${l.type}">${esc(lineText(l.label))}</span>`).join('')}</div>`;
    d.addEventListener('click', () => openStop(s.stop));
    container.appendChild(d);
  }
}
let currentStop = null, stopSeq = 0, stopTimer = 0;
async function openStop(stop) {
  const my = ++stopSeq;
  const info = await call('stopInfo', { stop });
  currentStop = info;
  $('stopDetail').hidden = false;
  $('stopTitle').textContent = info.name;
  $('stopMeta').textContent = `${info.city || ''}${info.code ? ' · ' + info.code : ''}`;
  $('stopLiveNote').textContent = '';
  updateStar('stopStar', 'stop:' + info.stop, 'stops');
  $('stopStar').onclick = () => { favs.toggle('stops', 'stop:' + info.stop, { stop: info.stop, name: info.name, city: info.city, code: info.code, lat: info.lat, lon: info.lon, lines: info.lines.slice(0, 8) }); renderSaved(); updateStar('stopStar', 'stop:' + info.stop, 'stops'); };
  const day = $('day').value;
  const svc = live.serviceDay();
  const isNow = day === svc.day || day === calToday();
  const fromTime = isNow ? live.nowOn(day) - 120 : atSeconds();
  const deps = await call('departures', { stop, fromTime, limit: 40 });
  if (my !== stopSeq) return;
  const box = $('stopDeps');
  box.innerHTML = deps.length ? '' : `<div class="empty">${t('noDeps')}</div>`;
  for (const d of deps) {
    const el = document.createElement('div');
    el.className = 'dep';
    el.dataset.trip = d.trip;
    el.innerHTML = `<span class="time">${fmt(d.time)}</span><span class="chip t${d.routeType}">${esc(lineText(d.line))}</span><span class="head">${esc(d.headsign)}</span><span class="in">${isNow ? inText(d.time, day) : ''}</span>`;
    el.addEventListener('click', () => openTrip(d.trip, info.stop));
    box.appendChild(el);
  }
  clearInterval(stopTimer);
  if (isNow) {
    liveForStop(info, deps, day, my);
    stopTimer = setInterval(() => { if ($('stopDetail').hidden) clearInterval(stopTimer); else liveForStop(info, deps, day, my); }, 45000);
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
      tm.textContent = fmt(at.time); tm.className = 'time ' + (dmin >= 3 ? 'late' : 'live');
      inEl.innerHTML = `${esc(inText(at.time, day))} <span class="live ${dmin >= 3 ? 'late' : 'ok'}">⦿${dmin ? ` ${dmin > 0 ? '+' : ''}${dmin}` : ''}${at.stale ? '?' : ''}</span>`;
    }
    const nw = live.newest(vs);
    $('stopLiveNote').textContent = nw ? t('liveUpdated', { time: nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) }) : t('liveNoVehicle');
  } catch (e) { $('stopLiveNote').textContent = t('liveFail'); }
}
$('stopLive').addEventListener('click', () => { if (currentStop) openStop(currentStop.stop); });
$('stopBack').addEventListener('click', () => { $('stopDetail').hidden = true; clearInterval(stopTimer); stopSeq++; });
const stopPlace = (s) => ({ name: s.name, stops: [s.stop], lat: s.lat, lon: s.lon });
$('stopFrom').addEventListener('click', () => { if (!currentStop) return; setPlace('from', stopPlace(currentStop)); $('stopDetail').hidden = true; showScreen('plan'); });
$('stopTo').addEventListener('click', () => { if (!currentStop) return; setPlace('to', stopPlace(currentStop)); $('stopDetail').hidden = true; showScreen('plan'); });

// ---- the live map: every vehicle reporting in view, stops when zoomed in
let lmap = null, lmTimer = 0, lmMove = 0, lmSeq = 0, lmStops = false;
const lmLabels = new Map();
const typeColor = (type) => (type === 2 ? '#1f5fa8' : type === 0 ? '#8a3fb0' : '#2a7d4f');
function openLiveMap() {
  $('liveMap').hidden = false;
  $('liveInfo').hidden = true;
  $('liveMapNote').textContent = '';
  requestAnimationFrame(() => {
    const start = lastPos || place.from || place.to || { lat: 32.08, lon: 34.78 };
    if (!lmap) {
      lmap = makeMap('liveMapEl', [start.lat, start.lon], lastPos ? 14.5 : 12);
      if (!lmap) return;
      lmap.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true }), lang === 'he' ? 'top-left' : 'top-right');
      whenStyled(lmap, () => {
        const empty = { type: 'FeatureCollection', features: [] };
        lmap.addSource('lm-stops', { type: 'geojson', data: empty });
        lmap.addLayer({ id: 'lm-stops', type: 'circle', source: 'lm-stops', minzoom: 14, paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#555', 'circle-stroke-width': 1.5 } });
        lmap.addSource('lm-veh', { type: 'geojson', data: empty });
        lmap.addLayer({ id: 'lm-veh', type: 'circle', source: 'lm-veh', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 13, 7, 15, 11], 'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['get', 'opacity'] } });
        lmap.addLayer({ id: 'lm-veh-label', type: 'symbol', source: 'lm-veh', minzoom: 13.5, layout: { 'text-field': ['get', 'line'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 9, 16, 12], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#ffffff', 'text-opacity': ['get', 'opacity'] } });
        lmap.on('click', 'lm-veh', (e) => { if (e.features && e.features[0]) selectVehicle(e.features[0].properties); });
        lmap.on('click', 'lm-stops', (e) => { if (e.features && e.features[0] && !lmap.queryRenderedFeatures(e.point, { layers: ['lm-veh'] }).length) openStop(+e.features[0].properties.stop); });
        for (const layer of ['lm-veh', 'lm-stops']) { lmap.on('mouseenter', layer, () => { lmap.getCanvas().style.cursor = 'pointer'; }); lmap.on('mouseleave', layer, () => { lmap.getCanvas().style.cursor = ''; }); }
        loadStopsGeo();
        refreshLiveMap();
      });
      lmap.on('moveend', () => { clearTimeout(lmMove); lmMove = setTimeout(refreshLiveMap, 400); });
    } else { lmap.resize(); refreshLiveMap(); }
    clearInterval(lmTimer);
    lmTimer = setInterval(refreshLiveMap, 20000);
  });
}
async function loadStopsGeo() {
  if (lmStops || !ttReady || !lmap) return;
  try { const geo = await call('stopsGeo'); if (lmap && lmap.getSource('lm-stops')) { lmap.getSource('lm-stops').setData(geo); lmStops = true; } } catch (e) { /* stops are a bonus */ }
}
async function refreshLiveMap() {
  if (!lmap || $('liveMap').hidden) return;
  if (!liveOn()) { $('liveMapNote').textContent = t('liveOff'); return; }
  if (lmap.getZoom() < 10) { $('liveMapNote').textContent = t('liveMapZoom'); return; }
  const my = ++lmSeq;
  const b = lmap.getBounds();
  try {
    const vs = await live.vehiclesInBounds({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() });
    if (my !== lmSeq || !lmap) return;
    const need = Array.from(new Set(vs.map((v) => String(v.lineRef)).filter((id) => !lmLabels.has(id))));
    if (need.length && ttReady) {
      const labels = await call('routeLabels', { ids: need });
      for (const id of need) lmLabels.set(id, labels[id] || null);
      if (my !== lmSeq || !lmap) return;
    }
    const now = Date.now();
    const features = vs.map((v) => {
      const lb = lmLabels.get(String(v.lineRef));
      const age = (now - v.recordedAt.getTime()) / 1000;
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        properties: { line: lb ? lineText(lb.line) : '?', type: lb ? lb.type : 3, color: typeColor(lb ? lb.type : 3), opacity: age > 300 ? 0.55 : 1,
          headsign: lb ? lb.headsign : '', agency: lb ? lb.agency : '', lineRef: v.lineRef, start: v.scheduledStart.getTime(), seen: v.recordedAt.getTime(), velocity: v.velocity || 0 } };
    });
    lmap.getSource('lm-veh').setData({ type: 'FeatureCollection', features });
    const nw = live.newest(vs);
    const ageMin = nw ? Math.round((now - nw.getTime()) / 60000) : 0;
    $('liveMapNote').textContent = features.length ? t('liveMapCount', { n: features.length, time: nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) + (ageMin >= 3 ? ` (${t('agoMin', { n: ageMin })})` : '') }) : t('liveMapNone');
    try { window.wayliDebug = { ...(window.wayliDebug || {}), liveMapVehicles: features.length }; } catch (e) {}
  } catch (e) { if (my === lmSeq) $('liveMapNote').textContent = t('liveFail'); }
}
function selectVehicle(p) {
  $('liveInfo').hidden = false;
  $('liveInfoLine').textContent = p.line; $('liveInfoLine').className = `chip t${p.type}`;
  $('liveInfoHead').textContent = p.headsign ? t('toward', { headsign: p.headsign }) : '';
  const seen = new Date(+p.seen).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
  $('liveInfoMeta').textContent = `${p.agency ? p.agency + ' · ' : ''}${t('seenAgo', { time: seen })} · ${Math.round(+p.velocity)} ${t('kmh')}`;
  $('liveInfoStops').onclick = async () => {
    try { const trip = await call('tripFor', { routeId: p.lineRef, scheduledStart: +p.start }); if (trip >= 0) openTrip(trip, -1); else toast(t('liveNoVehicle')); } catch (e) { toast(t('liveFail')); }
  };
}
$('nearbyMap').addEventListener('click', openLiveMap);
$('liveMapBack').addEventListener('click', () => { $('liveMap').hidden = true; clearInterval(lmTimer); lmSeq++; });
$('liveInfoClose').addEventListener('click', () => { $('liveInfo').hidden = true; });

// ---- one trip: every stop with its time, and where the vehicle is
async function openTrip(trip, hereStop) {
  const ts = await tripStopsCached(trip);
  $('tripDetail').hidden = false;
  $('tripTitle').textContent = t('tripStopsTitle', { line: lineText(ts.line), headsign: ts.headsign });
  $('tripMeta').textContent = `${ts.agency} · ${ts.stops.length} ${t('kindStop')}`;
  const box = $('tripStops');
  const day = $('day').value;
  box.innerHTML = ts.stops.map((s, i) => `<div class="stopsrow${s.stop === hereStop ? ' here' : ''}" data-i="${i}"><span class="time">${fmt(s.arr)}</span><span>${esc(s.name)}</span></div>`).join('');
  for (const row of box.querySelectorAll('.stopsrow')) row.addEventListener('click', () => { $('tripDetail').hidden = true; openStop(ts.stops[+row.dataset.i].stop); });
  if (!liveOn() || ts.routeId == null) return;
  try {
    const vs = await live.vehiclesByLine(ts.routeId);
    const v = live.matchTrip(vs, ts.routeId, ts.firstDep, day);
    const est = v && live.estimateDelay(v, ts.stops, day);
    if (!est) { $('tripMeta').textContent += ` · ${t('liveNoVehicle')}`; return; }
    const row = box.querySelector(`[data-i="${est.index + (est.frac > 0.5 ? 1 : 0)}"]`);
    if (row) { const tag = document.createElement('span'); tag.className = 'veh'; tag.textContent = `🚌 ${t('vehicleHere')}${est.delay ? ` (${live.delayMinutes(est.delay) > 0 ? '+' : ''}${live.delayMinutes(est.delay)})` : ''}`; row.appendChild(tag); row.scrollIntoView({ block: 'center' }); }
  } catch (e) { /* no live, no problem */ }
}
$('tripBack').addEventListener('click', () => { $('tripDetail').hidden = true; });

// ---------------------------------------------------------------- saved: places, trips, stops (this device only)
function tripKey(q) { return `trip:${q.from.name}|${q.to.name}|${q.bike}|${q.folding ? 'f' : ''}`; }
function updateStar(id, key, kind) { const on = key && favs.has(kind, key); $(id).textContent = on ? '★' : '☆'; $(id).classList.toggle('on', on); }
async function planTo(p) {
  showScreen('plan');
  $('toQ').value = t('locating');
  try { const pos = await getPosition(); setPlace('from', myLocation(pos)); } catch (e) { $('fromQ').value = ''; place.from = null; }
  setPlace('to', p); $('nowBtn').click();
  if (place.from) plan(); else showPlanError(t('noLocation'));
}
function renderSaved() {
  const sp = savedPlaces.get();
  const box = $('savedPlaces');
  box.innerHTML = '';
  for (const slot of ['home', 'work']) {
    const p = sp[slot];
    const d = document.createElement('div');
    d.className = 'saved-row';
    d.innerHTML = `<span class="ic">${slot === 'home' ? '🏠' : '💼'}</span><span class="txt"><span class="name${p ? '' : ' unset'}">${esc(p ? p.name : t('notSet'))}</span><small>${t(slot)}</small></span><button type="button" class="ghost">${p ? t('change') : '+'}</button>`;
    d.querySelector('.txt').addEventListener('click', async () => { if (p) planTo(p); else { const c = await choosePlace(t(slot === 'home' ? 'chooseHome' : 'chooseWork')); if (c) { savedPlaces.set(slot, c); renderSaved(); } } });
    d.querySelector('button').addEventListener('click', async () => { const c = await choosePlace(t(slot === 'home' ? 'chooseHome' : 'chooseWork')); if (c) { savedPlaces.set(slot, c); renderSaved(); } });
    box.appendChild(d);
  }
  for (const p of sp.more) {
    const d = document.createElement('div');
    d.className = 'saved-row';
    d.innerHTML = `<span class="ic">★</span><span class="txt"><span class="name">${esc(p.name)}</span></span><button type="button" class="ghost">✕</button>`;
    d.querySelector('.txt').addEventListener('click', () => planTo(p));
    d.querySelector('button').addEventListener('click', () => { savedPlaces.remove(p); renderSaved(); toast(t('removed')); });
    box.appendChild(d);
  }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'ghost'; add.textContent = t('addPlace'); add.style.marginBottom = '8px';
  add.addEventListener('click', async () => { const c = await choosePlace(t('choosePlace')); if (c) { savedPlaces.add(c); renderSaved(); toast(t('saved')); } });
  box.appendChild(add);

  const trips = favs.get('trips'), stops = favs.get('stops');
  const tb = $('favTrips');
  tb.innerHTML = '';
  const tk = Object.keys(trips);
  if (!tk.length) tb.innerHTML = `<div class="empty">${t('favEmptyTrips')}</div>`;
  for (const k of tk) {
    const v = trips[k];
    const d = document.createElement('div');
    d.className = 'journey';
    d.innerHTML = `<div class="top"><span class="times">${esc(v.from.name)} → ${esc(v.to.name)}</span></div><div class="sub">${v.bike !== 'none' ? '🚲 ' : ''}${esc(t(v.bike === 'along' ? 'bikeAlong' : v.bike === 'park' ? 'bikePark' : 'bikeNone'))}</div>`;
    d.addEventListener('click', () => { applyQuery({ from: v.from, to: v.to, bike: v.bike, folding: v.folding }); $('nowBtn').click(); showScreen('plan'); plan(); });
    tb.appendChild(d);
  }
  renderStops($('favStops'), Object.values(stops), false);
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  const s = settings.get();
  const seg = (id, v) => { for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(v))); };
  seg('setLang', lang); seg('setMap', s.map); seg('setWalk', s.maxWalk);
  $('setLive').checked = !!s.live; $('setNotify').checked = !!s.notify; $('setSound').checked = !!s.sound;
}
for (const b of $('setLang').querySelectorAll('button')) b.addEventListener('click', () => setLang(b.dataset.v));
for (const b of $('setMap').querySelectorAll('button')) b.addEventListener('click', () => { settings.set({ map: b.dataset.v }); dropMaps(); renderSettings(); });
for (const b of $('setWalk').querySelectorAll('button')) b.addEventListener('click', () => { settings.set({ maxWalk: +b.dataset.v }); renderSettings(); });
$('setLive').addEventListener('change', () => settings.set({ live: $('setLive').checked }));
$('setNotify').addEventListener('change', async () => { settings.set({ notify: $('setNotify').checked }); if ($('setNotify').checked) await requestAlertPermission(); });
$('setSound').addEventListener('change', () => settings.set({ sound: $('setSound').checked }));
$('testAlert').addEventListener('click', async () => { ensureAudio(); await requestAlertPermission(); alertUser(t('alertSoon'), t('testAlertMsg')); });
$('clearHistory').addEventListener('click', () => { recentPlaces.clear(); recentTrips.clear(); lastSearch.clear(); renderRecent(); toast(t('historyCleared')); });

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
let fol = null, followMap = null, followMarkers = [], followVehicle = [], meMarker = null;
const tripStale = (a) => live.nowOn(a.day) > a.journey.arrive + 2700 || Date.now() - (a.startedAt || 0) > 12 * 3600e3;
function startTrip(j, q) {
  const day = q.day;
  if (live.nowOn(day) > j.arrive + 1800) { toast(t('tripOver')); return; }
  ensureAudio();
  const a = { journey: { ...j, to: q.to.lat != null ? { name: q.to.name, lat: q.to.lat, lon: q.to.lon } : null }, q: { from: q.from, to: q.to, bike: q.bike, folding: q.folding }, day, state: initialState(), view: 'follow', startedAt: Date.now() };
  activeTrip.set(a);
  requestAlertPermission();
  $('detail').hidden = true;
  openFollow(a);
}
function openFollow(a) {
  if (fol && fol.a !== a) closeFollow(false);
  if (!fol) {
    fol = { a, pos: null, watch: null, timer: 0, liveTimer: 0, wake: null, fitted: false, liveEst: null };
    if (navigator.geolocation) {
      fol.watch = navigator.geolocation.watchPosition((p) => { fol.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; lastPos = { lat: fol.pos.lat, lon: fol.pos.lon }; stepFollow(); },
        () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
    fol.timer = setInterval(stepFollow, 5000);
    fol.liveTimer = setInterval(followLive, 30000);
    requestWake();
  }
  a.view = 'follow'; activeTrip.set(a);
  $('follow').hidden = false;
  $('resumeBar').hidden = true;
  requestAnimationFrame(() => {
    if (!followMap) followMap = makeMap('followMap', [32.08, 34.78], 12);
    if (followMap) { followMap.resize(); whenStyled(followMap, () => { const b = drawJourney(followMap, a.journey, followMarkers); if (!fol.fitted && !b.isEmpty()) { followMap.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 }); fol.fitted = true; } }); }
    stepFollow(); followLive();
  });
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
function renderFollow() {
  if (!fol) return;
  const a = fol.a, j = a.journey, now = live.nowOn(a.day);
  const v = followView(j, a.state, now);
  const card = $('followCard'), big = $('followBig'), small = $('followSmall');
  card.classList.remove('alert');
  const dest = a.q.to.name;
  const liveLine = fol.liveEst && fol.liveEst.at ? ` · ${liveBadge(fol.liveEst.at).text}` : '';
  if (v.kind === 'done') {
    $('followTitle').textContent = dest; big.textContent = t('arrived'); small.textContent = '';
    $('followSkip').hidden = true;
  } else if (v.kind === 'walk' || v.kind === 'final') {
    const l = v.leg;
    $('followTitle').textContent = v.toRide ? t('followTitle', { line: lineText(v.toRide.line), to: dest }) : t('walkTitle', { to: dest });
    big.textContent = v.kind === 'final' ? t('walkToDest', { min: v.minutes, name: dest }) : (l.mode === 'bike' ? t('bikeTo', { min: v.minutes, name: l.to.name }) : t('walkTo', { min: v.minutes, name: l.to.name }));
    small.textContent = v.toRide ? `${lineText(v.toRide.line)} ${t('departsAt', { time: fmt(v.toRide.depart) })}${inShort(v.departsIn)}${liveLine}` : t('arrivesAt', { time: fmt(l.arrive) });
    $('followSkip').hidden = false;
  } else if (v.kind === 'wait') {
    const l = v.leg;
    $('followTitle').textContent = t('followTitle', { line: lineText(l.line), to: dest });
    big.textContent = t('waitFor', { line: lineText(l.line), stop: l.from.name });
    small.textContent = `${t('departsAt', { time: fmt(l.depart) })}${inShort(v.departsIn)} · ${t('toward', { headsign: l.headsign })}${liveLine}`;
    $('followSkip').hidden = false;
  } else if (v.kind === 'ride') {
    const l = v.leg;
    $('followTitle').textContent = t('followTitle', { line: lineText(l.line), to: dest });
    if (v.stopsLeft <= 1) { card.classList.add('alert'); big.textContent = t('getOffNext'); small.textContent = v.alight.name; }
    else { big.textContent = t('getOffAt', { name: v.alight.name }); small.textContent = `${t('stopsLeft', { n: v.stopsLeft })} · ${t('nextStopIs', { name: v.nextStop.name })} · ${t('arrivesAt', { time: fmt(l.arrive) })}`; }
    $('followSkip').hidden = false;
  }
  $('followGps').textContent = fol.pos && Date.now() - fol.pos.at < 90000 ? t('gpsOk', { acc: Math.round(fol.pos.acc || 0) }) : t('gpsNo');
  // the legs still ahead
  const nx = $('followNext');
  nx.innerHTML = '';
  j.legs.forEach((l, i) => {
    const el = document.createElement('div');
    el.className = `leg ${l.type}${l.type === 'ride' ? ' t' + l.routeType : ''}${i < a.state.step ? ' done' : i === a.state.step ? ' current' : ''}`;
    const mins = Math.round(l.seconds / 60);
    let what;
    if (l.type === 'ride') what = `<span class="chip t${l.routeType}">${esc(lineText(l.line))}</span> ${esc(l.from.name)} → ${esc(l.to.name)} · ${l.stops} ${t('kindStop')}`;
    else if (l.type === 'egress') what = l.mode === 'bike' ? t('bikeFrom', { min: mins, name: esc(l.from.name) }) : t('walkFrom', { min: mins, name: esc(l.from.name) });
    else what = l.mode === 'bike' ? t('bikeTo', { min: mins, name: esc(l.to.name) }) : t('walkTo', { min: mins, name: esc(l.to.name) });
    el.innerHTML = `<span class="t">${fmt(l.depart)}</span><span class="dot"></span><span class="what">${what}</span>`;
    nx.appendChild(el);
  });
  // me on the map
  if (followMap && fol.pos) {
    if (!meMarker) { const el = document.createElement('div'); el.className = 'wayli-me'; meMarker = new maplibregl.Marker({ element: el }).setLngLat([fol.pos.lon, fol.pos.lat]).addTo(followMap); }
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
  try {
    const vs = await live.vehiclesByLine(leg.routeId);
    const v = live.matchTrip(vs, leg.routeId, leg.firstDep, a.day);
    if (!fol) return;
    for (const mk of followVehicle.splice(0)) mk.remove();
    if (!v) { fol.liveEst = null; $('followLive').hidden = true; renderFollow(); return; }
    const ts = await tripStopsCached(leg.trip);
    const est = live.estimateDelay(v, ts.stops, a.day);
    const at = live.liveAt(est, ts.stops, leg.boardPos);
    fol.liveEst = est ? { est, at } : null;
    const b = liveBadge(at);
    $('followLive').textContent = b.text; $('followLive').className = 'livebadge ' + b.cls; $('followLive').hidden = !at;
    if (est && followMap) vehicleMarker(followMap, followVehicle, est, leg.routeType === 2 ? '🚆' : leg.routeType === 0 ? '🚊' : '🚌');
    renderFollow();
  } catch (e) { /* live is a bonus */ }
}
$('followSkip').addEventListener('click', () => {
  if (!fol) return;
  const a = fol.a, legs = a.journey.legs, s = a.state;
  const leg = legs[s.step];
  if (leg && leg.type === 'ride' && !s.onBoard) { s.onBoard = true; s.rideIdx = 0; }
  else if (s.step >= legs.length - 1) { s.done = true; }
  else { s.step++; s.onBoard = false; s.rideIdx = 0; }
  activeTrip.set(a); renderFollow();
});
function finishFollow() { setTimeout(() => { if (fol && fol.a.state.done) { closeFollow(true); toast(t('arrived'), 4000); } }, 15000); }
function closeFollow(end) {
  if (fol) {
    if (fol.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(fol.watch);
    clearInterval(fol.timer); clearInterval(fol.liveTimer);
    if (fol.wake) { try { fol.wake.release(); } catch (e) {} }
    if (end) activeTrip.clear(); else { fol.a.view = 'hidden'; activeTrip.set(fol.a); }
    fol = null;
  }
  for (const mk of followVehicle.splice(0)) mk.remove();
  if (meMarker) { meMarker.remove(); meMarker = null; }
  $('follow').hidden = true;
  updateResumeBar();
}
$('followEnd').addEventListener('click', () => { closeFollow(true); toast(t('tripEnded')); });
$('followHide').addEventListener('click', () => closeFollow(false));
function updateResumeBar() {
  const a = activeTrip.get();
  const bar = $('resumeBar');
  if (!a || fol || tripStale(a)) { bar.hidden = true; if (a && tripStale(a)) activeTrip.clear(); return; }
  const ride = a.journey.legs.find((l) => l.type === 'ride');
  $('resumeText').textContent = `${ride ? lineText(ride.line) + ' · ' : ''}${a.q.to.name}`;
  bar.hidden = false;
}
$('resumeBar').addEventListener('click', () => { const a = activeTrip.get(); if (a) openFollow(a); });

// ---------------------------------------------------------------- screens
function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-' + name;
  for (const b of document.querySelectorAll('nav.tabs button')) b.setAttribute('aria-selected', String(b.dataset.screen === name));
  if (name === 'nearby' && ttReady && !$('nearbyList').querySelector('.stop')) loadNearby();
  if (name === 'plan') $('recentBox').hidden = !!$('results').children.length;
}
for (const b of document.querySelectorAll('nav.tabs button')) b.addEventListener('click', () => showScreen(b.dataset.screen));

init().catch((e) => setStatus(t('loadFail', { msg: e.message }), true));
