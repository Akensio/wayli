// Wayli app shell. The worker (worker.js) holds the data; this file is the UI.
// Pure logic lives next door: live.js (real-time), follow.js (trip following), store.js (on-device memory).
import { settings, recentPlaces, recentTrips, savedPlaces, favs, lastSearch, activeTrip } from './store.js';
import * as live from './live.js';
import { initialState, advance, view as followView, replanOrigin, ridesKey, remainingKey, spliceJourney } from './follow.js';
import { darkLiberty } from './darkmap.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- i18n
const STR = {
  he: {
    swap: 'החלף', now: 'עכשיו', bike: 'אופניים', bikeNone: 'בלי', bikePark: 'עד התחנה', bikeAlong: 'לוקח/ת איתי', folding: 'מתקפלים',
    plan: 'תכנון מסלול', nearbyTitle: 'תחנות בקרבתי', refresh: 'רענון', nearbyEmpty: 'לחצו על רענון כדי למצוא תחנות ליד המיקום שלכם.',
    favTrips: 'מסלולים שמורים', favStops: 'תחנות שמורות', savedPlaces: 'מקומות שמורים', tabPlan: 'תכנון מסלול', tabNearby: 'תחנות בקרבתי', tabSaved: 'שמורים', tabMore: 'הגדרות ועוד', goQ: 'לאן? (מקום, כתובת או מספר קו)', grpLines: 'קווים', grpPlaces: 'מקומות', menu: 'תפריט',
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
    stopsCount: '{n} תחנות', popStops: 'התחנות', popLine: 'הקו', popDeps: 'יציאות', lineSearch: 'חיפוש קו לפי מספר', lineTitle: 'קו {line}', tripsToday: '{n} נסיעות היום', lineNoMatch: 'אין קו כזה היום', vehiclesOnLine: '{n} בשידור', otherDir: 'לכיוון {headsign}', noLineVehicles: 'אין רכב בשידור בקו',
    fasterWay: 'יש דרך מהירה יותר', altGetOff: 'לרדת ב{stop}', altInstead: 'במקום קו {line}', altThen: 'קו {line} לכיוון {headsign} ב-{time}', altArrive: 'הגעה ב-{time}, {n} דק\' קודם', switchRoute: 'מעבר למסלול הזה', keepRoute: 'להישאר', routeSwitched: 'המסלול הוחלף',
    chooseHome: 'איפה הבית?', chooseWork: 'איפה העבודה?', choosePlace: 'מקום לשמירה', savePlace: 'שמירה', unsavePlace: 'הסרה מהשמורים', fromMyLoc: 'מהמיקום שלי', historyCleared: 'ההיסטוריה נמחקה', walkOnly: 'הליכה כל הדרך: {min} דק\'',
    about: '<p><b>Wayli</b> מתכנן נסיעות בתחבורה הציבורית בישראל על הטלפון שלכם: לוח הזמנים הארצי ורשת הרחובות יורדים פעם אחת, והחיפוש רץ מקומית. חיפושים, היסטוריה ומקומות שמורים נשארים בטלפון.</p><p>זמני אמת: פרויקט האוטובוס הפתוח של הסדנא לידע ציבורי (אפשר לכבות בהגדרות). הנתונים: משרד התחבורה (GTFS) ו-OpenStreetMap. התוכנה חופשית ברישיון AGPL-3.0: <a href="https://github.com/Akensio/wayli">github.com/Akensio/wayli</a>.</p><p>עדיין אין: דיווחים, גבהים (זמני רכיבה בחיפה ובירושלים אופטימיים). לוח זמנים: {feed}.</p>',
  },
  en: {
    swap: 'Swap', now: 'Now', bike: 'Bicycle', bikeNone: 'None', bikePark: 'To the stop', bikeAlong: 'Take it along', folding: 'Folding',
    plan: 'Plan trip', nearbyTitle: 'Stops near me', refresh: 'Refresh', nearbyEmpty: 'Tap Refresh to find stops near your location.',
    favTrips: 'Saved trips', favStops: 'Saved stops', savedPlaces: 'Saved places', tabPlan: 'Plan a trip', tabNearby: 'Stops near me', tabSaved: 'Saved', tabMore: 'Settings & more', goQ: 'Where to? (place, address or line number)', grpLines: 'Lines', grpPlaces: 'Places', menu: 'Menu',
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
    stopsCount: '{n} stops', popStops: 'Stops', popLine: 'Line', popDeps: 'Departures', lineSearch: 'Search a line by number', lineTitle: 'Line {line}', tripsToday: '{n} trips today', lineNoMatch: 'No such line today', vehiclesOnLine: '{n} reporting', otherDir: 'towards {headsign}', noLineVehicles: 'No vehicle of this line reporting',
    fasterWay: 'There is a faster way', altGetOff: 'Get off at {stop}', altInstead: 'Instead of line {line}', altThen: 'line {line} towards {headsign} at {time}', altArrive: 'arrive at {time}, {n} min earlier', switchRoute: 'Switch to it', keepRoute: 'Keep mine', routeSwitched: 'Route switched',
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
  $('fromQ').placeholder = t('fromQ'); $('toQ').placeholder = t('toQ'); $('chQ').placeholder = t('toQ'); $('goQ').placeholder = t('goQ'); $('menuBtn').title = t('menu');
  for (const id of ['fromLoc', 'toLoc', 'chLoc']) $(id).textContent = t('btnLoc');
  for (const id of ['fromMap', 'toMap', 'chMap']) $(id).textContent = t('btnMap');
  $('langBtn').textContent = lang === 'he' ? 'EN' : 'עב';
  renderDays();
  renderAbout();
  renderSettings();
}
function setLang(l) {
  lang = l; try { localStorage.setItem('wayli-lang', lang); } catch (e) {}
  applyLang(); renderSaved(); renderRecent(); renderPeek();
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
let toastTimer = 0;
function toast(msg, ms = 2500) {
  $('toast').textContent = msg; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, ms);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------- time, days (Israel time, service days)
const fmt = (sec) => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
const fmtPlus = (sec) => fmt(sec) + (sec >= 86400 ? '⁺' : '');   // past midnight, still this service day
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
let manifest = null, dayInfo = null, ttReady = false, stReady = false, plReady = false, shReady = false;
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
  loadStopsGeo(); refreshLiveMap();
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
async function loadShapes() {
  if (shReady || !manifest.shapes) return;
  try {
    await call('loadShapes', { url: `data/${manifest.shapes.file}?v=${encodeURIComponent(manifest.shapes.built || manifest.built || '')}` });
    shReady = true;
  } catch (e) { /* straight lines between stops until then */ }
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
  initMap();
  renderSaved(); renderRecent(); renderPeek();
  // a trip in progress comes back first, timetable or not
  const active = activeTrip.get();
  if (active && !tripStale(active)) { updateResumeBar(); if (active.view === 'follow') openFollow(active); } else if (active) activeTrip.clear();
  try {
    manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  renderAbout();
  if (manifest.built) { const b = live.ilParts(new Date(manifest.built)); $('ver').textContent = t('build', { v: `${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(b.h).padStart(2, '0')}:${String(b.mi).padStart(2, '0')}` }); }
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
  await loadStreets();
  loadShapes();
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
function attachSearch(input, drop, onPick, opts = {}) {
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
      const [{ results, placesLoaded }, lines] = await Promise.all([
        call('search', { q, limit: 10, lang, near: lastPos }),
        opts.lines && q.length <= 5 ? call('searchLines', { q, limit: 6 }).catch(() => []) : [],
      ]);
      if (my !== seq) return;
      drop.innerHTML = '';
      const grp = (k) => { const g = document.createElement('div'); g.className = 'grp'; g.textContent = t(k); drop.appendChild(g); };
      if (lines.length) {
        grp('grpLines');
        for (const r of lines) {
          const b = row(`<span class="chip t${r.routeType}">${esc(lineText(r.line))}</span><span class="txt">${esc(t('toward', { headsign: r.headsign }))}<small> · ${esc(r.agency)} · ${t('tripsToday', { n: r.trips })}</small></span>`, 'line');
          b.addEventListener('click', () => { drop.hidden = true; opts.onLine(r); });
          drop.appendChild(b);
        }
        if (results.length) grp('grpPlaces');
      }
      for (const g of results) {
        const kind = g.kind === 'stop' ? (g.platforms > 1 ? t('platforms', { n: g.platforms }) : t('kindStop'))
          : g.kind === 'poi' ? (g.label || t('kindPoi')) : t('kind' + g.kind[0].toUpperCase() + g.kind.slice(1));
        const extra = g.approx != null ? ' · ' + t('approxNo', { n: g.approx }) : '';
        const b = row(`${esc(g.name)}<small>${esc(kind)}${g.city ? ' · ' + esc(g.city) : ''}${extra}</small>`);
        b.addEventListener('click', () => pick(fromResult(g)));
        drop.appendChild(b);
      }
      if (!results.length && !lines.length) { const n = row(placesLoaded ? t('noMatch') : t('placesPending')); n.disabled = true; drop.appendChild(n); }
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
attachSearch($('goQ'), $('goDrop'), (p, typing) => { if (!typing && p) { $('goQ').value = ''; $('goQ').blur(); planTo(p); } },
  { lines: true, onLine: (r) => { $('goQ').value = ''; $('goQ').blur(); openLine(r.route); } });
$('goQ').addEventListener('focus', () => { $('menu').hidden = true; });
// the menu under the ☰ button
$('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; });
document.addEventListener('click', (e) => { if (!$('menu').contains(e.target) && e.target !== $('menuBtn')) $('menu').hidden = true; });
for (const b of $('menu').querySelectorAll('button')) b.addEventListener('click', () => { $('menu').hidden = true; nav.closeAll(); showScreen(b.dataset.screen); if (b.dataset.screen === 'plan') sheet.set('half'); });

// ---- pick a point on the map
let pickPoint = null, pickSeq = 0, pickResolve = null;
function pickOnMap(startAt) {
  return new Promise((resolve) => {
    pickResolve = resolve;
    showOverlay('picker');
    $('pickName').textContent = '…';
    (async () => {
      const m = await mapReady();
      if (!m || !pickResolve) return;
      const start = startAt && startAt.lat != null ? startAt : lastPos || place.from || place.to;
      if (start) m.jumpTo({ center: [start.lon, start.lat], zoom: Math.max(m.getZoom(), 15.5) });
      nameCenter();
    })();
  });
}
async function nameCenter() {
  if (!mainMap || !isOpen('picker')) return;
  const c = mainMap.getCenter();
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
const closePicker = (p) => { const r = pickResolve; pickResolve = null; nav.close('picker'); if (r) r(p); };
$('pickCancel').addEventListener('click', () => closePicker(null));
$('pickChoose').addEventListener('click', () => { if (!pickPoint) return; closePicker({ name: pickPoint.name || t('pointName'), lat: pickPoint.lat, lon: pickPoint.lon }); });
let lastPosAt = 0;
const notePos = (lat, lon) => { lastPos = { lat, lon }; lastPosAt = Date.now(); try { localStorage.setItem('wayli-geo', '1'); } catch (e) {} };
function getPosition() {
  return new Promise((resolve, reject) => {
    if (lastPos && Date.now() - lastPosAt < 20000) { resolve(lastPos); return; }
    const fallback = (err) => { if (lastPos && Date.now() - lastPosAt < 600000) resolve(lastPos); else reject(err); };
    if (!navigator.geolocation) { fallback(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition((p) => { notePos(p.coords.latitude, p.coords.longitude); resolve(lastPos); }, fallback, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
// ---- choose a place for home / work / saved (search, my location or the map)
let chooserResolve = null;
function choosePlace(title) {
  return new Promise((resolve) => {
    chooserResolve = resolve;
    $('chTitle').textContent = title; $('chQ').value = ''; $('chDrop').hidden = true;
    showOverlay('chooser');
    setTimeout(() => $('chQ').focus(), 50);
  });
}
const closeChooser = (p) => { const r = chooserResolve; chooserResolve = null; nav.close('chooser'); if (r) r(p); };
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
function showPlanError(msg) { $('planError').textContent = msg; $('planError').hidden = !msg; if (msg && sheet.state === 'peek') sheet.set('half'); }

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
  collapseForm(false);
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
  } catch (e) { showPlanError(e.message); $('results').innerHTML = ''; collapseForm(false); }
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
/** Fold the form to one line (what was asked) while results are shown; tapping it opens the form again. */
function collapseForm(on) {
  $('formCard').classList.toggle('collapsed', on);
  $('formSummary').hidden = !on;
  if (on && lastQuery) {
    const q = lastQuery;
    const arrow = lang === 'he' ? '←' : '→';
    $('summaryText').innerHTML = `${esc(q.from.name)} ${arrow} ${esc(q.to.name)}<small>${esc(dayLabel(q.day))} ${esc(q.at || '')}${q.arriveBy ? ' · ' + t('arriveBy') : ''}${q.bike && q.bike !== 'none' ? ' · 🚲' : ''}</small>`;
  }
}
$('formSummary').addEventListener('click', () => { collapseForm(false); $('sheetBody').scrollTop = 0; });
function renderResults(r, q, resultsAt = null) {
  const box = $('results');
  box.innerHTML = '';
  $('recentBox').hidden = true;
  lastQuery = q;
  collapseForm(true);
  $('sheetBody').scrollTop = 0;
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
  if (!topPanel() && screen === 'plan' && sheet.state === 'peek') sheet.set('half');
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
    d.addEventListener('click', () => { applyQuery(r); $('nowBtn').click(); nav.closeAll(); showScreen('plan'); plan(); });
    box.appendChild(d);
  }
  box.hidden = !!$('results').children.length;
  void when;
  renderPeek();
}
/** The strip the sheet shows when collapsed: plan, home, work, recent places, nearby stops. */
function renderPeek() {
  const box = $('peekRow');
  box.innerHTML = '';
  const chip = (txt, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chipbtn ' + cls; b.textContent = txt; b.addEventListener('click', fn); box.appendChild(b); };
  chip('🧭 ' + t('tabPlan'), () => { showScreen('plan'); sheet.set('half'); }, 'accent');
  const sp = savedPlaces.get();
  if (sp.home) chip('🏠 ' + t('home'), () => planTo(sp.home));
  if (sp.work) chip('💼 ' + t('work'), () => planTo(sp.work));
  for (const p of recentPlaces.list().filter((r) => !savedPlaces.has(r)).slice(0, 4)) chip('🕓 ' + p.name, () => planTo(p));
  chip('📍 ' + t('tabNearby'), () => showScreen('nearby'));
}

// ---------------------------------------------------------------- maps (MapLibre, OpenFreeMap vector tiles)
// light Liberty everywhere; in dark mode, when chosen in settings, the same Liberty recoloured dark
// (darkmap.js), so the dark map keeps every detail. (localStorage 'wayli-map-style' overrides, for trying others)
const wantDarkMap = () => settings.get().map === 'dark' && matchMedia('(prefers-color-scheme: dark)').matches;
let darkStyle = null, darkStyleLoading = null;
/** Resolves once the style to use is at hand (the dark one needs a fetch); maps are made after it. */
function styleReady() {
  if (!wantDarkMap() || darkStyle) return Promise.resolve();
  if (!darkStyleLoading) darkStyleLoading = darkLiberty().then((st) => { darkStyle = st; }).catch(() => {}).finally(() => { darkStyleLoading = null; });
  return darkStyleLoading;
}
function mapStyle() {
  let o = null; try { o = localStorage.getItem('wayli-map-style'); } catch (e) {}
  if (o) return `https://tiles.openfreemap.org/styles/${o}`;
  if (wantDarkMap() && darkStyle) return darkStyle;
  return 'https://tiles.openfreemap.org/styles/liberty';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyMapStyle);
let rtlSet = false;
function makeMap(container, center, zoom) {
  if (typeof maplibregl === 'undefined') return null;
  if (!rtlSet) { try { maplibregl.setRTLTextPlugin('https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js', true); } catch (e) {} rtlSet = true; }
  currentStyle = mapStyle();
  const m = new maplibregl.Map({ container, style: currentStyle, center: [center[1], center[0]], zoom, attributionControl: { compact: true }, pitchWithRotate: false });
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
  const start = lastPos || { lat: 32.08, lon: 34.78 };
  mainMap = makeMap('mainMap', [start.lat, start.lon], lastPos ? 14.5 : 11);
  if (!mainMap) { mapFailed = true; for (const r of styledWaiters.splice(0)) r(null); return; }
  const m = mainMap;
  geoCtl = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 15 } });
  m.addControl(geoCtl, lang === 'he' ? 'top-left' : 'top-right');
  geoCtl.on('geolocate', (p) => notePos(p.coords.latitude, p.coords.longitude));
  m.once('load', () => { const a = document.querySelector('.maplibregl-ctrl-attrib'); if (a) a.classList.remove('maplibregl-compact-show'); });
  m.on('style.load', () => {
    setupMapLayers(m);
    mapStyled = true;
    for (const r of styledWaiters.splice(0)) r(m);
    lmStops = false; loadStopsGeo();
    drawnFor = null; redrawMap();
    refreshLiveMap();
  });
  m.on('moveend', () => { if (isOpen('picker')) nameCenter(); clearTimeout(lmMove); lmMove = setTimeout(refreshLiveMap, 400); });
  m.on('click', (e) => {
    if (isOpen('picker')) { m.easeTo({ center: e.lngLat, duration: 250 }); return; }
    $('menu').hidden = true;
    const hit = m.queryRenderedFeatures(e.point, { layers: ['lm-veh', 'lm-stops', 'journey-stops', 'context-stops'].filter((l) => m.getLayer(l)) });
    if (!hit.length && !popup) sheet.set('peek');
  });
  lmTimer = setInterval(refreshLiveMap, 20000);
  let known = false; try { known = !!localStorage.getItem('wayli-geo'); } catch (e) {}
  if (known) m.once('load', () => { try { geoCtl.trigger(); } catch (e) {} });
  try { window.wayliDebug = { ...(window.wayliDebug || {}), liveMap: m }; } catch (e) {}
}
/** Sources and layers of the main map, bottom to top: every stop, the journey or line, live vehicles. Re-made after a style change. */
function setupMapLayers(m) {
  if (m.getSource('lm-veh')) return;
  m.addSource('lm-stops', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'lm-stops', type: 'circle', source: 'lm-stops', minzoom: 14, paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#555', 'circle-stroke-width': 1.5 } });
  ensureJourneyLayers(m);
  m.addSource('lm-veh', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'lm-veh', type: 'circle', source: 'lm-veh', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 13, 7, 15, 11], 'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['get', 'opacity'] } });
  for (const type of [0, 2, 3]) if (!m.hasImage(`wayli-arrow-${type}`)) m.addImage(`wayli-arrow-${type}`, arrowImage(typeColor(type)), { pixelRatio: 2 });
  m.addLayer({ id: 'lm-veh-dir', type: 'symbol', source: 'lm-veh', filter: ['>', ['get', 'bearing'], -1], layout: { 'icon-image': ['concat', 'wayli-arrow-', ['to-string', ['get', 'type']]], 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 1], 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-offset': [0, -17], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': ['get', 'opacity'] } });
  m.addLayer({ id: 'lm-veh-label', type: 'symbol', source: 'lm-veh', minzoom: 13.5, layout: { 'text-field': ['get', 'line'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 9, 16, 12], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#ffffff', 'text-opacity': ['get', 'opacity'] } });
  m.on('click', 'lm-veh', (e) => { if (e.features && e.features[0]) selectVehicle(e.features[0].properties, e.features[0].geometry.coordinates); });
  m.on('click', 'lm-stops', (e) => { if (e.features && e.features[0] && !m.queryRenderedFeatures(e.point, { layers: ['lm-veh'] }).length) stopPopup(m, e.features[0].geometry.coordinates, +e.features[0].properties.stop); });
  for (const layer of ['lm-veh', 'lm-stops']) { m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; }); m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; }); }
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
  if (!force && key === drawnFor) return;
  drawnFor = key;
  const seq = ++drawSeq;
  const m = mainMap;
  if (!m || !mapStyled) return;
  clearMap(m);
  const fn = mapOf[key];
  if (fn) fn(seq);
}
function clearMap(m) {
  for (const arr of [journeyMarkers, liveMarkers, lineVeh, followVehicle]) for (const mk of arr.splice(0)) mk.remove();
  if (meMarker) { meMarker.remove(); meMarker = null; }
  for (const src of ['journey', 'stops', 'context', 'context-stops']) if (m.getSource(src)) m.getSource(src).setData(EMPTY);
}
/** Fit bounds into the part of the map the sheet and the top bar leave visible. */
function fitMap(b, maxZoom) {
  const m = mainMap;
  if (!m || !b || b.isEmpty()) return;
  const top = topPad();
  const bottom = Math.min(sheet.px(sheet.state) + 20, innerHeight - top - 120);
  m.fitBounds(b, { padding: { top, bottom, left: 24, right: 24 }, duration: 0, maxZoom });
}
const topPad = () => { const r = document.querySelector('.topbar').getBoundingClientRect(); return Math.round(r.bottom + 12); };
const legColor = (l) => l.type === 'ride' ? (l.routeType === 2 ? '#1f5fa8' : l.routeType === 0 ? '#8a3fb0' : '#2a7d4f') : (l.mode === 'bike' ? '#1f5fa8' : '#2b3036');
const EMPTY = { type: 'FeatureCollection', features: [] };
/** The map's sources and layers for a journey, created once, bottom to top: the faded whole lines, then the journey. */
function ensureJourneyLayers(m) {
  if (m.getSource('journey')) return;
  m.addSource('context', { type: 'geojson', data: EMPTY });
  m.addSource('context-stops', { type: 'geojson', data: EMPTY });
  m.addSource('journey', { type: 'geojson', data: EMPTY });
  m.addSource('stops', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'context-line', type: 'line', source: 'context', paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'context-stops', type: 'circle', source: 'context-stops', minzoom: 11, paint: { 'circle-radius': 3, 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-opacity': 0.5, 'circle-stroke-opacity': 0.5 } });
  m.addLayer({ id: 'journey-casing', type: 'line', source: 'journey', paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'ride'], 1], 8, 7], 'line-opacity': .9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'journey-ride', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 1], paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  m.addLayer({ id: 'journey-walk', type: 'line', source: 'journey', filter: ['==', ['get', 'ride'], 0], paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [1, 1.5] }, layout: { 'line-cap': 'round' } });
  m.addLayer({ id: 'journey-stops', type: 'circle', source: 'stops', minzoom: 12, paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#444', 'circle-stroke-width': 1.5 } });
  wireStopLayers(m, ['journey-stops', 'context-stops']);
}
/** The whole line of every ride, faded, with all its stops: where the bus comes from and where it goes on. */
async function drawContext(m, j) {
  const rides = j.legs.filter((l) => l.type === 'ride' && l.pattern != null);
  if (!rides.length || !ttReady) return;
  try {
    const courses = await call('patternCourse', { patterns: rides.map((l) => l.pattern) });
    if (!m.getSource('context')) return;
    const lines = [], dots = [];
    courses.forEach((c, i) => {
      const color = legColor(rides[i]);
      if (c.path && c.path.length >= 2) lines.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: c.path.map((q) => [q[1], q[0]]) } });
      for (const st of c.stops) dots.push({ type: 'Feature', properties: { color, name: st[2], stop: st[3] }, geometry: { type: 'Point', coordinates: [st[1], st[0]] } });
    });
    m.getSource('context').setData({ type: 'FeatureCollection', features: lines });
    m.getSource('context-stops').setData({ type: 'FeatureCollection', features: dots });
  } catch (e) { /* the ride itself is still drawn */ }
}
/** Draw a journey on a map: casing, rides, dashed walks, pins at boarding and alighting stops, dots at the stops between. */
function drawJourney(m, j, markers) {
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
      for (const b of between) dots.push({ type: 'Feature', properties: { stop: b.stop }, geometry: { type: 'Point', coordinates: b.c } });
    }
  }
  m.getSource('journey').setData({ type: 'FeatureCollection', features });
  m.getSource('stops').setData({ type: 'FeatureCollection', features: dots });
  m.getSource('context').setData(EMPTY); m.getSource('context-stops').setData(EMPTY);
  drawContext(m, j);
  return bounds;
}
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
  const html = `<div class="pop"><div class="row"><span class="chip t${v.routeType}">${esc(lineText(v.line))}</span><b>${v.headsign ? esc(t('toward', { headsign: v.headsign })) : ''}</b></div>` +
    `<div class="muted">${v.agency ? esc(v.agency) + ' · ' : ''}${t('seenAgo', { time: clock(v.seen) })}${v.velocity != null ? ` · ${Math.round(v.velocity)} ${t('kmh')}` : ''}</div>` +
    (d == null ? '' : `<div><span class="live ${d >= 3 ? 'late' : 'ok'}">${esc(delayTxt)}${v.stale ? ' ?' : ''}</span></div>`) +
    `<div class="row"><button type="button" class="ghost" data-act="trip" ${v.trip >= 0 ? '' : 'disabled'}>${t('popStops')}</button><button type="button" class="ghost" data-act="line" ${v.route != null ? '' : 'disabled'}>${t('popLine')}</button></div></div>`;
  openPopup(m, lngLat, html, (el) => {
    const b1 = el.querySelector('[data-act="trip"]'), b2 = el.querySelector('[data-act="line"]');
    if (b1) b1.addEventListener('click', () => { if (popup) popup.remove(); openTrip(v.trip, -1); });
    if (b2) b2.addEventListener('click', () => { if (popup) popup.remove(); openLine(v.route); });
  });
}
/** A stop's bubble: name, its lines, and departures / from here / to here. */
async function stopPopup(m, lngLat, stop) {
  let info;
  try { info = await call('stopInfo', { stop }); } catch (e) { return; }
  const html = `<div class="pop"><b>${esc(info.name)}</b><div class="muted">${esc(info.city || '')}${info.code ? ' · ' + esc(info.code) : ''}</div>` +
    `<div class="chips">${info.lines.slice(0, 10).map((l) => `<span class="chip t${l.type}" data-route="${l.route ?? ''}">${esc(lineText(l.label))}</span>`).join('')}</div>` +
    `<div class="row"><button type="button" class="ghost" data-act="deps">${t('popDeps')}</button><button type="button" class="ghost" data-act="from">${t('fromHere')}</button><button type="button" class="ghost" data-act="to">${t('toHere')}</button></div></div>`;
  openPopup(m, lngLat, html, (el) => {
    const go = (side) => { if (popup) popup.remove(); if (side === 'to') planTo(stopPlace(info)); else { nav.closeAll(); setPlace('from', stopPlace(info)); showScreen('plan'); sheet.set('half'); } };
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
  const icon = routeType === 2 ? '🚆' : routeType === 0 ? '🚊' : '🚌';
  vs.forEach((v, i) => {
    const st = statuses[i] || { trip: -1 };
    const el = document.createElement('div');
    el.className = 'wayli-bus lbl' + (st.stale || st.trip < 0 ? ' stale' : '') + (mine != null && st.trip === mine ? ' mine' : '');
    const d = st.delay != null ? live.delayMinutes(st.delay) : null;
    el.textContent = `${icon}${d != null ? ` ${d > 0 ? '+' : ''}${d}` : ''}`;
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
  const el = document.createElement('div'); el.className = 'wayli-bus' + (v.stale ? ' stale' : ''); el.textContent = label || '🚌'; el.title = v.vehicle ? fmt(v.seen) : '';
  addHeading(el, v.vehicle ? heading(v.vehicle) : -1);
  const mk = new maplibregl.Marker({ element: el }).setLngLat([v.vehicle.lon, v.vehicle.lat]).addTo(m);
  markers.push(mk);
  return mk;
}

// ---------------------------------------------------------------- journey detail
let journeyMarkers = [], liveMarkers = [], detailSeq = 0;
const tripStopsCached = (trip) => { if (!tsCache.has(trip)) tsCache.set(trip, call('tripStops', { trip })); return tsCache.get(trip); };
const liveOn = () => settings.get().live && navigator.onLine !== false;
function liveBadge(at) {
  if (!at) return { text: t('liveNoVehicle'), cls: '' };
  if (at.passed) return { text: t('livePassed'), cls: 'gone' };
  const d = live.delayMinutes(at.delay);
  const text = `⦿ ${fmt(at.time)}${d === 0 ? ' · ' + t('onTime') : ` (${d > 0 ? '+' : ''}${d})`}${at.stale ? ' ?' : ''}`;
  return { text, cls: d >= 3 ? 'late' : 'ok' };
}
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
  const legs = $('detailLegs');
  mapOf.detail = async (seq) => {
    const m = await mapReady();
    if (!m || my !== detailSeq || stale(seq)) return;
    if (!bikeOnly) await withCourses(j);
    if (my !== detailSeq || stale(seq)) return;
    const b = drawJourney(m, j, journeyMarkers);
    for (const mk of liveMarkers.splice(0)) mk.remove();
    fitMap(b, 16);
    if (!bikeOnly) liveForJourney(j, q.day, legs, my);
  };
  showOverlay('detail');
  $('detailTitle').textContent = bikeOnly ? t('bikeOnly', { min: Math.round(j.arrive / 60), km: '' }).replace(', ', '').replace(' ק"מ', '').replace(' km', '') : `${fmt(j.depart)} → ${fmt(j.arrive)} · ${dur(j.arrive - j.depart)}`;
  $('detailNote').textContent = '';
  legs.innerHTML = '';
  for (const l of j.legs) {
    const el = document.createElement('div');
    el.className = `leg ${l.type}${l.type === 'ride' ? ' t' + l.routeType : ''}`;
    let what = '';
    const mins = Math.max(1, Math.round(l.seconds / 60));
    if (l.type === 'ride') {
      const planned = l.live ? liveBadge({ time: l.depart, delay: l.live.delay, passed: false, stale: l.live.stale }) : null;
      what = `<span class="chip btn t${l.routeType}" data-route="${l.route ?? ''}">${esc(lineText(l.line))}</span> ${esc(l.headsign)}<span class="live${planned ? ' ' + planned.cls : ''}" data-live="${l.trip}">${planned ? esc(planned.text) : ''}</span><small>${esc(l.from.name)} → ${esc(l.to.name)} · ${t('ride', { line: '', agency: esc(l.agency), stops: l.stops }).replace(/^ · /, '')}</small>`;
      if (l.stopsAlong && l.stopsAlong.length > 2) what += `<button type="button" class="toggle">${t('showStops')}</button><div class="stoplist" hidden>${l.stopsAlong.map((s) => `<div><span>${fmt(s.arr)}</span><span>${esc(s.name)}</span></div>`).join('')}</div>`;
    }
    else if (l.type === 'access') what = (l.mode === 'bike' ? t('bikeTo', { min: mins, name: esc(l.to.name) }) : t('walkTo', { min: mins, name: esc(l.to.name) }));
    else if (l.type === 'egress') what = (l.mode === 'bike' ? t('bikeFrom', { min: mins, name: esc(l.from.name) }) : t('walkFrom', { min: mins, name: esc(l.from.name) }));
    else what = t('walkTo', { min: mins, name: esc(l.to.name) });
    const shifted = l.type === 'ride' && l.schedDepart != null && Math.abs(l.schedDepart - l.depart) >= 60;
    const timeCol = bikeOnly ? '' : shifted ? `<s>${fmt(l.schedDepart)}</s><br><b>${fmt(l.depart)}</b><br>${fmt(l.arrive)}` : `${fmt(l.depart)}${l.type === 'ride' ? '<br>' + fmt(l.arrive) : ''}`;
    el.innerHTML = `<span class="t">${timeCol}</span><span class="dot"></span><span class="what">${what}</span>`;
    const tg = el.querySelector('.toggle');
    if (tg) tg.addEventListener('click', () => { const sl = el.querySelector('.stoplist'); sl.hidden = !sl.hidden; tg.textContent = sl.hidden ? t('showStops') : t('hideStops'); });
    const ch = el.querySelector('.chip.btn');
    if (ch && ch.dataset.route !== '') ch.addEventListener('click', () => openLine(+ch.dataset.route));
    legs.appendChild(el);
  }
  updateStar('detailStar', q && !bikeOnly ? tripKey(q) : null, 'trips');
  $('detailStar').onclick = () => { if (q && !bikeOnly) { favs.toggle('trips', tripKey(q), { from: q.from, to: q.to, bike: q.bike, folding: q.folding }); renderSaved(); } updateStar('detailStar', tripKey(q), 'trips'); };
  $('detailStart').hidden = bikeOnly;
  $('detailStart').onclick = () => startTrip(j, q);
  $('detailShare').onclick = () => shareJourney(j, q, bikeOnly);
}
/** Live badges on the ride legs of a journey happening around now; every vehicle of those lines on the map. */
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
      const statuses = vs.length ? await call('vehiclesStatus', { vehicles: vehiclesForWorker(vs) }) : [];
      if (seq !== detailSeq) return;
      if (mainMap && drawnFor === 'detail') lineVehicleMarkers(mainMap, liveMarkers, vs, statuses, l.routeType, l.trip, { line: l.line, headsign: l.headsign, agency: l.agency, route: l.route });
      const v = live.matchTrip(vs, l.routeId, l.firstDep, day);
      if (!v) { if (badge) badge.textContent = t('liveNoVehicle'); return; }
      const ts = await tripStopsCached(l.trip);
      const est = live.estimateDelay(v, ts.stops, day);
      const at = live.liveAt(est, ts.stops, l.boardPos);
      if (seq !== detailSeq) return;
      const b = liveBadge(at);
      if (badge) { badge.textContent = b.text; badge.className = 'live ' + b.cls; }
    } catch (e) { if (badge) badge.textContent = t('liveFail'); }
  }));
}
function shareJourney(j, q, bikeOnly) {
  const lines = [`${q.from.name} → ${q.to.name}`, `${fmt(j.depart)} → ${fmt(j.arrive)} (${dur(j.arrive - j.depart)})`];
  for (const l of j.legs) {
    const mins = Math.max(1, Math.round(l.seconds / 60));
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
$('detailBack').addEventListener('click', () => nav.close('detail'));

// ---------------------------------------------------------------- nearby and stop detail
let lastPos = null;
(async () => {
  try {
    let known = false; try { known = !!localStorage.getItem('wayli-geo'); } catch (e) {}
    if (!known && navigator.permissions && navigator.geolocation) { const st = await navigator.permissions.query({ name: 'geolocation' }); known = st.state === 'granted'; }
    if (known) lastPos = await getPosition();
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
      `<div class="chips">${(s.lines || []).map((l) => `<span class="chip t${l.type}" data-route="${l.route ?? ''}">${esc(lineText(l.label))}</span>`).join('')}</div>`;
    d.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c && c.dataset.route !== '') { e.stopPropagation(); openLine(+c.dataset.route); } else openStop(s.stop); });
    container.appendChild(d);
  }
}
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
      tm.textContent = fmt(at.time); tm.className = 'time ' + (dmin >= 3 ? 'late' : 'live');
      inEl.innerHTML = `${esc(inText(at.time, day))} <span class="live ${dmin >= 3 ? 'late' : 'ok'}">⦿${dmin ? ` ${dmin > 0 ? '+' : ''}${dmin}` : ''}${at.stale ? '?' : ''}</span>`;
    }
    const nw = live.newest(vs);
    $('stopLiveNote').textContent = nw ? t('liveUpdated', { time: nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) }) : t('liveNoVehicle');
  } catch (e) { $('stopLiveNote').textContent = t('liveFail'); }
}
$('stopLive').addEventListener('click', () => { if (currentStop) openStop(currentStop.stop); });
$('stopBack').addEventListener('click', () => nav.close('stopDetail'));
const stopPlace = (s) => ({ name: s.name, stops: [s.stop], lat: s.lat, lon: s.lon });
$('stopFrom').addEventListener('click', () => { if (!currentStop) return; const p = stopPlace(currentStop); nav.closeAll(); setPlace('from', p); showScreen('plan'); sheet.set('half'); });
$('stopTo').addEventListener('click', () => { if (currentStop) planTo(stopPlace(currentStop)); });

// ---- live vehicles on the map: every vehicle reporting in view, stops when zoomed in
let lmTimer = 0, lmMove = 0, lmSeq = 0, lmStops = false;
const lmLabels = new Map();
const typeColor = (type) => (type === 2 ? '#1f5fa8' : type === 0 ? '#8a3fb0' : '#2a7d4f');
async function loadStopsGeo() {
  if (lmStops || !ttReady || !mainMap || !mapStyled) return;
  try { const geo = await call('stopsGeo'); if (mainMap && mainMap.getSource('lm-stops')) { mainMap.getSource('lm-stops').setData(geo); lmStops = true; } } catch (e) { /* stops are a bonus */ }
}
async function refreshLiveMap() {
  const m = mainMap;
  if (!m || !mapStyled || document.hidden || sheet.state === 'full') return;
  if (isOpen('picker')) { $('liveNote').textContent = ''; return; }
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
    const features = vs.map((v) => {
      const lb = lmLabels.get(String(v.lineRef));
      const age = (now - v.recordedAt.getTime()) / 1000;
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        properties: { line: lb ? lineText(lb.line) : '?', type: lb ? lb.type : 3, color: typeColor(lb ? lb.type : 3), opacity: age > 300 ? 0.55 : 1, bearing: heading(v),
          headsign: lb ? lb.headsign : '', agency: lb ? lb.agency : '', lineRef: v.lineRef, start: v.scheduledStart.getTime(), seen: v.recordedAt.getTime(), velocity: v.velocity || 0 } };
    });
    m.getSource('lm-veh').setData({ type: 'FeatureCollection', features });
    const nw = live.newest(vs);
    const ageMin = nw ? Math.round((now - nw.getTime()) / 60000) : 0;
    $('liveNote').textContent = features.length ? t('liveMapCount', { n: features.length, time: nw.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) + (ageMin >= 3 ? ` (${t('agoMin', { n: ageMin })})` : '') }) : t('liveMapNone');
    try { window.wayliDebug = { ...(window.wayliDebug || {}), liveMapVehicles: features.length }; } catch (e) {}
  } catch (e) { if (my === lmSeq) $('liveNote').textContent = t('liveFail'); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLiveMap(); });
/** A vehicle's heading in degrees, or -1 when it reports none (0 while standing still means unknown). */
const heading = (v) => (v.bearing != null && (v.bearing !== 0 || (v.velocity || 0) > 0) ? v.bearing : -1);
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
    m.getSource('stops').setData({ type: 'FeatureCollection', features: info.stops.map((st) => ({ type: 'Feature', properties: { stop: st.stop }, geometry: { type: 'Point', coordinates: [st.lon, st.lat] } })) });
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
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chipbtn'; b.textContent = `↔ ${t('otherDir', { headsign: o.headsign })}`;
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
  const day = $('day').value;
  box.innerHTML = ts.stops.map((s, i) => `<div class="stopsrow${s.stop === hereStop ? ' here' : ''}" data-i="${i}"><span class="time">${fmt(s.arr)}</span><span>${esc(s.name)}</span></div>`).join('');
  for (const row of box.querySelectorAll('.stopsrow')) row.addEventListener('click', () => { nav.close('tripDetail'); openStop(ts.stops[+row.dataset.i].stop); });
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
$('tripBack').addEventListener('click', () => nav.close('tripDetail'));

// ---------------------------------------------------------------- saved: places, trips, stops (this device only)
function tripKey(q) { return `trip:${q.from.name}|${q.to.name}|${q.bike}|${q.folding ? 'f' : ''}`; }
function updateStar(id, key, kind) { const on = key && favs.has(kind, key); $(id).textContent = on ? '★' : '☆'; $(id).classList.toggle('on', on); }
async function planTo(p) {
  nav.closeAll();
  showScreen('plan');
  setPlace('to', p);
  $('results').innerHTML = `<div class="empty">${t('locating')}</div>`; $('recentBox').hidden = true;
  sheet.set('half');
  $('fromQ').value = t('locating');
  try { const pos = await getPosition(); setPlace('from', myLocation(pos)); } catch (e) { if (!place.from || place.from.transient) { $('fromQ').value = ''; place.from = null; } else $('fromQ').value = place.from.name; }
  $('nowBtn').click();
  if (place.from) plan(); else { $('results').innerHTML = ''; showPlanError(t('noLocation')); $('toQ').focus(); }
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
    d.addEventListener('click', () => { applyQuery({ from: v.from, to: v.to, bike: v.bike, folding: v.folding }); $('nowBtn').click(); nav.closeAll(); showScreen('plan'); plan(); });
    tb.appendChild(d);
  }
  renderStops($('favStops'), Object.values(stops), false);
  renderPeek();
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  const s = settings.get();
  const seg = (id, v) => { for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(v))); };
  seg('setLang', lang); seg('setMap', s.map); seg('setWalk', s.maxWalk);
  $('setLive').checked = !!s.live; $('setNotify').checked = !!s.notify; $('setSound').checked = !!s.sound;
}
for (const b of $('setLang').querySelectorAll('button')) b.addEventListener('click', () => setLang(b.dataset.v));
for (const b of $('setMap').querySelectorAll('button')) b.addEventListener('click', () => { settings.set({ map: b.dataset.v }); applyMapStyle(); renderSettings(); });
for (const b of $('setWalk').querySelectorAll('button')) b.addEventListener('click', () => { settings.set({ maxWalk: +b.dataset.v }); renderSettings(); });
$('setLive').addEventListener('change', () => settings.set({ live: $('setLive').checked }));
$('setNotify').addEventListener('change', async () => { settings.set({ notify: $('setNotify').checked }); if ($('setNotify').checked) await requestAlertPermission(); });
$('setSound').addEventListener('change', () => settings.set({ sound: $('setSound').checked }));
$('testAlert').addEventListener('click', async () => { ensureAudio(); await requestAlertPermission(); alertUser(t('alertSoon'), t('testAlertMsg')); });
$('clearHistory').addEventListener('click', () => { recentPlaces.clear(); recentTrips.clear(); lastSearch.clear(); renderRecent(); renderPeek(); toast(t('historyCleared')); });

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
  const a = { journey: { ...j, to: q.to.lat != null ? { name: q.to.name, lat: q.to.lat, lon: q.to.lon } : null }, q: { from: q.from, to: q.to, bike: q.bike, folding: q.folding }, day, state: initialState(), view: 'follow', startedAt: Date.now() };
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
      fol.watch = navigator.geolocation.watchPosition((p) => { fol.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; notePos(fol.pos.lat, fol.pos.lon); stepFollow(); },
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
  $('resumeBar').hidden = true;
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
  renderAlt();
  // the legs still ahead
  const nx = $('followNext');
  nx.innerHTML = '';
  j.legs.forEach((l, i) => {
    const el = document.createElement('div');
    el.className = `leg ${l.type}${l.type === 'ride' ? ' t' + l.routeType : ''}${i < a.state.step ? ' done' : i === a.state.step ? ' current' : ''}`;
    const mins = Math.max(1, Math.round(l.seconds / 60));
    let what;
    if (l.type === 'ride') what = `<span class="chip t${l.routeType}">${esc(lineText(l.line))}</span> ${esc(l.from.name)} → ${esc(l.to.name)} · ${l.stops} ${t('kindStop')}`;
    else if (l.type === 'egress') what = l.mode === 'bike' ? t('bikeFrom', { min: mins, name: esc(l.from.name) }) : t('walkFrom', { min: mins, name: esc(l.from.name) });
    else what = l.mode === 'bike' ? t('bikeTo', { min: mins, name: esc(l.to.name) }) : t('walkTo', { min: mins, name: esc(l.to.name) });
    el.innerHTML = `<span class="t">${fmt(l.depart)}</span><span class="dot"></span><span class="what">${what}</span>`;
    nx.appendChild(el);
  });
  // me on the map
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
    if (!v) { fol.liveEst = null; $('followLive').hidden = true; renderFollow(); replanCheck(); return; }
    const ts = await tripStopsCached(leg.trip);
    const est = live.estimateDelay(v, ts.stops, a.day);
    const at = live.liveAt(est, ts.stops, leg.boardPos);
    fol.liveEst = est ? { est, at } : null;
    const b = liveBadge(at);
    $('followLive').textContent = b.text; $('followLive').className = 'livebadge ' + b.cls; $('followLive').hidden = !at;
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
/** The card proposing the alternative, rebuilt only when it changes. */
function renderAlt() {
  const ac = $('followAlt');
  const alt = fol && fol.alt;
  if (!alt) { ac.hidden = true; ac.dataset.key = ''; return; }
  if (ac.dataset.key === alt.key && !ac.hidden) return;
  const a = fol.a, j = alt.journey, o = alt.origin;
  const rides = j.legs.filter((l) => l.type === 'ride');
  const cur = a.journey.legs[a.state.step];
  const sameVehicle = o.kind === 'ride' && rides[0] && rides[0].trip === cur.trip;
  let first = '';
  if (o.kind === 'ride') first = t('altGetOff', { stop: sameVehicle ? rides[0].to.name : o.offAt.name });
  else if (o.kind === 'wait') first = t('altInstead', { line: lineText(cur.line) });
  const nextRide = sameVehicle ? rides[1] : rides[0];
  const then = nextRide ? t('altThen', { line: lineText(nextRide.line), headsign: nextRide.headsign, time: fmt(nextRide.depart) }) : '';
  const chips = j.legs.map((l) => `<span class="${chipClass(l)}">${chipText(l)}</span>`).join('<span class="muted">›</span>');
  ac.innerHTML = `<div class="title">⚡ ${t('fasterWay')}</div><div>${esc(first)}${first && then ? ' · ' : ''}${esc(then)}</div><div class="chips">${chips}</div>` +
    `<div class="muted">${esc(t('altArrive', { time: fmt(j.arrive), n: Math.round(alt.gain / 60) }))}</div>` +
    `<div class="row"><button type="button" class="primary slim" data-act="go">${t('switchRoute')}</button><button type="button" class="ghost" data-act="no">${t('keepRoute')}</button></div>`;
  ac.querySelector('[data-act="go"]').addEventListener('click', () => switchJourney(alt));
  ac.querySelector('[data-act="no"]').addEventListener('click', () => { if (!fol) return; fol.dismissed[alt.key] = Date.now(); fol.alt = null; renderFollow(); });
  ac.dataset.key = alt.key;
  ac.hidden = false;
}
function switchJourney(alt) {
  if (!fol) return;
  const a = fol.a;
  const { journey, state } = spliceJourney(a.journey, a.state, alt.journey, alt.origin);
  a.journey = journey; a.state = state; a.replanned = (a.replanned || 0) + 1;
  fol.alt = null; fol.liveEst = null; fol.toldKey = null; fol.replanAt = Date.now();
  activeTrip.set(a);
  $('followLive').hidden = true;
  redrawMap(true);
  stepFollow(); followLive();
  toast(t('routeSwitched'));
}
try { window.wayliDebug = { ...(window.wayliDebug || {}), replan: () => replanCheck(true), setReplanGain: (g) => { replanGain = g; } }; } catch (e) {}
$('followSkip').addEventListener('click', () => {
  if (!fol) return;
  const a = fol.a, legs = a.journey.legs, s = a.state;
  const leg = legs[s.step];
  if (leg && leg.type === 'ride' && !s.onBoard) { s.onBoard = true; s.rideIdx = 0; }
  else if (s.step >= legs.length - 1) { s.done = true; }
  else { s.step++; s.onBoard = false; s.rideIdx = 0; }
  activeTrip.set(a); renderFollow();
});
function finishFollow() { setTimeout(() => { if (fol && fol.a.state.done) { closeFollow(true); nav.close('follow'); toast(t('arrived'), 4000); } }, 15000); }
function closeFollow(end) {
  if (fol) {
    if (fol.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(fol.watch);
    clearInterval(fol.timer); clearInterval(fol.liveTimer); clearInterval(fol.replanTimer);
    if (fol.wake) { try { fol.wake.release(); } catch (e) {} }
    if (end) activeTrip.clear(); else { fol.a.view = 'hidden'; activeTrip.set(fol.a); }
    fol = null;
  }
  for (const mk of followVehicle.splice(0)) mk.remove();
  if (meMarker) { meMarker.remove(); meMarker = null; }
  delete mapOf.follow;
  updateResumeBar();
}
$('followEnd').addEventListener('click', () => { closeFollow(true); nav.close('follow'); toast(t('tripEnded')); });
$('followHide').addEventListener('click', () => nav.close('follow'));
function updateResumeBar() {
  const a = activeTrip.get();
  const bar = $('resumeBar');
  if (!a || fol || tripStale(a)) { bar.hidden = true; if (a && tripStale(a)) activeTrip.clear(); return; }
  const ride = a.journey.legs.find((l) => l.type === 'ride');
  $('resumeText').textContent = `${ride ? lineText(ride.line) + ' · ' : ''}${a.q.to.name}`;
  bar.hidden = false;
}
$('resumeBar').addEventListener('click', () => { const a = activeTrip.get(); if (a) { nav.closeAll(); openFollow(a); } });

// ---------------------------------------------------------------- screens and the back button
// Every overlay and every tab change is a history entry, so the phone's back button (or the browser's)
// closes the overlay or returns to the previous tab instead of leaving the app. Closing with an
// in-app button goes through history too, so both paths look the same.
const nav = {
  stack: [],   // entries: {kind: 'overlay', id} or {kind: 'tab', from}
  push(entry) { this.stack.push(entry); try { history.pushState({ wayli: this.stack.length }, ''); } catch (e) {} },
  /** Undo the top entry (called from popstate, or to close programmatically). */
  undo(entry) {
    if (entry.kind === 'overlay') hideOverlay(entry.id);
    else if (entry.kind === 'tab') showScreen(entry.from, false);
  },
  /** Close the given overlay now; history steps back one entry to match (its popstate then finds nothing left to undo). */
  close(id) {
    const i = this.stack.findIndex((e) => e.kind === 'overlay' && e.id === id);
    if (i < 0) return;
    this.stack.splice(i, 1);
    hideOverlay(id);
    try { history.back(); } catch (e) {}
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
    try { history.go(-old.length); } catch (e) {}
  },
};
const isOpen = (id) => nav.stack.some((e) => e.kind === 'overlay' && e.id === id);
const topPanel = () => { for (let i = nav.stack.length - 1; i >= 0; i--) if (nav.stack[i].kind === 'overlay') return nav.stack[i].id; return null; };
const OVERLAY_CLOSE = { detail: () => { detailSeq++; delete mapOf.detail; }, stopDetail: () => { clearInterval(stopTimer); stopSeq++; delete mapOf.stopDetail; }, lineDetail: () => { clearInterval(lineTimer); lineSeq++; lineCur = null; delete mapOf.lineDetail; },
  picker: () => { const r = pickResolve; pickResolve = null; if (r) r(null); }, chooser: () => { const r = chooserResolve; chooserResolve = null; if (r) r(null); }, follow: () => { if (fol) closeFollow(false); delete mapOf.follow; } };
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
  const depth = e.state && e.state.wayli ? e.state.wayli : 0;
  while (nav.stack.length > depth) nav.undo(nav.stack.pop());
});
try { history.replaceState({ wayli: 0 }, ''); } catch (e) {}
let screen = 'plan';
/** How open the sheet is when a panel or screen comes up. */
const SHEET_FOR = { 'screen-plan': () => ($('results').children.length || place.from || place.to || $('fromQ').value || $('toQ').value ? 'half' : 'peek'), 'screen-nearby': 'full', 'screen-saved': 'full', 'screen-more': 'full', chooser: 'full' };
/** Show the panel on top of the stack, or the current screen; picking a point hides the sheet and shows the crosshair. */
function renderPanels() {
  const top = topPanel();
  const picking = top === 'picker';
  $('crosshair').hidden = !picking; $('pickbar').hidden = !picking;
  document.querySelector('.topbar').hidden = picking;
  $('sheet').hidden = picking;
  const key = top || 'screen-' + screen;
  const show = picking ? null : (PANEL_EL[key] || key);
  for (const el of document.querySelectorAll('#sheetBody > .screen, #sheetBody > .detail')) el.hidden = el.id !== show;
  if (!picking) { const st = SHEET_FOR[key]; sheet.set(typeof st === 'function' ? st() : st || 'half'); }
  redrawMap();
}
function showScreen(name, record = true) {
  if (record && name !== screen) nav.push({ kind: 'tab', from: screen });
  screen = name;
  renderPanels();
  if (name === 'nearby' && ttReady && !$('nearbyList').querySelector('.stop')) loadNearby();
  if (name === 'plan') $('recentBox').hidden = !!$('results').children.length;
}
// ---- the bottom sheet: peek (a strip), half, or full; dragged by its handle, tapped to cycle
const sheet = {
  state: 'peek',
  px(st) { return st === 'peek' ? 118 : st === 'half' ? Math.round(innerHeight * 0.46) : Math.max(200, innerHeight - topPad() + 4); },
  set(st) {
    const prev = this.state;
    this.state = st;
    $('sheet').dataset.state = st;
    document.documentElement.style.setProperty('--sheet-h', this.px(st) + 'px');
    if (prev === 'full' && st !== 'full') refreshLiveMap();
    if (st !== prev && mainMap && (st === 'peek' || prev === 'peek')) $('sheetBody').scrollTop = 0;
  },
  toggle() { this.set(this.state === 'peek' ? 'half' : this.state === 'half' ? 'full' : 'peek'); },
};
{
  const h = $('sheetHandle'), el = $('sheet');
  let startY = 0, startH = 0, moved = false, dragging = false;
  h.addEventListener('pointerdown', (e) => { dragging = true; startY = e.clientY; startH = el.getBoundingClientRect().height; moved = false; el.classList.add('dragging'); try { h.setPointerCapture(e.pointerId); } catch (x) {} });
  h.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    el.style.height = Math.max(sheet.px('peek'), Math.min(sheet.px('full'), startH + dy)) + 'px';
  });
  const end = () => {
    if (!dragging) return;
    dragging = false; el.classList.remove('dragging');
    const hh = el.getBoundingClientRect().height;
    el.style.height = '';
    if (!moved) { sheet.toggle(); return; }
    let best = 'peek';
    for (const st of ['half', 'full']) if (Math.abs(sheet.px(st) - hh) < Math.abs(sheet.px(best) - hh)) best = st;
    sheet.set(best);
  };
  h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => sheet.set(sheet.state));
}
sheet.set('peek');

init().catch((e) => setStatus(t('loadFail', { msg: e.message }), true));
