// Wayli app shell. The worker (worker.js) holds the data; this file is the UI.
// Pure logic lives next door: live.js (real-time), follow.js (trip following), store.js (on-device memory).
import { settings, recentPlaces, recentTrips, savedPlaces, favs, lastSearch, activeTrip } from './store.js';
import * as live from './live.js';
import { initialState, aboardState, advance, view as followView, replanOrigin, ridesKey, remainingKey, spliceJourney } from './follow.js';
import { darkLiberty } from './darkmap.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- icons: one stroke set on a 24-unit grid, as an inline SVG sprite (and drawn on canvas for the map)
const ICONS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  user: 'M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5zM4.5 21a7.5 7.5 0 0 1 15 0',
  close: 'M6 6l12 12M18 6L6 18',
  swap: 'M8 4v16M5 17l3 3 3-3M16 20V4M13 7l3-3 3 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5L16 16',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  pin: 'M12 21.5c-4.3-4.6-6.5-8.3-6.5-11.5a6.5 6.5 0 1 1 13 0c0 3.2-2.2 6.9-6.5 11.5zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  star: 'M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17.1 6.6 20l1.1-6.1-4.5-4.3 6.1-.8z',
  sliders: 'M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1M14 4v4M9 10v4M17 16v4',
  route: 'M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 19h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  bus: 'M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 10.5h16M7 18v2.5M17 18v2.5M8 14.5h.5M15.5 14.5h.5',
  train: 'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 10h16M8.5 14h.5M15 14h.5M8 21l1.5-3M16 21l-1.5-3',
  tram: 'M7 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM4 12h16M8.5 15.5h.5M15 15.5h.5M9 2l3 2 3-2M12 4v2M8 21l1.5-3M16 21l-1.5-3',
  walk: 'M13.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9.5 10l3-2.5 2.5 1.5 2 3M12.5 7.5l-1.5 6 3 2.5 1.5 6M11.5 13l-2.5 2.5-1.5 6',
  bike: 'M5.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 15h6.5l2.5-7.5h-5.5l-3.5 7.5M12 15l-3-7.5M7.5 7.5h3M14.5 7.5l4 7.5M14.5 7.5l1-2.5h2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4.5h4.5M12 8v4.5l3 2',
  map: 'M9 3.5L3 5.5v15l6-2 6 2 6-2v-15l-6 2zM9 3.5v15M15 5.5v15',
  home: 'M3.5 11l8.5-7 8.5 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5z',
  work: 'M4 8h16a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
  play: 'M7 4.5v15l12-7.5z',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronEnd: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  bolt: 'M13 2.5L4.5 13.5h7l-1 8 9-11h-7z',
  arrowsLR: 'M4 8h16M16.5 4.5L20 8l-3.5 3.5M20 16H4M7.5 12.5L4 16l3.5 3.5',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  refresh: 'M20.5 11a8.5 8.5 0 0 0-15-4.5L3 9M3 3.5V9h5.5M3.5 13a8.5 8.5 0 0 0 15 4.5L21 15M21 20.5V15h-5.5',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 21h4',
  sound: 'M4 10v4h3l5 4V6L7 10zM15.5 9a4.2 4.2 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12',
  live: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  trash: 'M4 7h16M10 11.5v6M14 11.5v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 3.5v12M7 11l5 5 5-5M4 20h16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.5h.01',
  shield: 'M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6zM9 12l2 2 4-4',
};
const FILLED_ICONS = new Set(['play']);
/** An inline icon from the sprite; `cls` adds classes (e.g. `chev` for a chevron that flips in RTL). */
const ic = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
{
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'display:none'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = Object.entries(ICONS).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24"><path d="${d}"${FILLED_ICONS.has(k) ? ' fill="currentColor" stroke="none"' : ''}/></symbol>`).join('');
  document.body.prepend(svg);
}

// ---------------------------------------------------------------- i18n
const STR = {
  he: {
    swap: 'החלף', now: 'עכשיו', bike: 'אופניים', bikeNone: 'בלי', bikePark: 'עד התחנה', bikeAlong: 'לוקח/ת איתי', folding: 'מתקפלים',
    plan: 'תכנון מסלול', nearbyTitle: 'תחנות בקרבתי', refresh: 'רענון', nearbyEmpty: 'לחצו על רענון כדי למצוא תחנות ליד המיקום שלכם.',
    favTrips: 'מסלולים שמורים', favStops: 'תחנות שמורות', savedPlaces: 'מקומות שמורים', tabPlan: 'תכנון מסלול', tabNearby: 'תחנות בקרבתי', tabSaved: 'שמורים', tabMore: 'הגדרות ועוד', goQ: 'לאן רוצים להגיע?', grpLines: 'קווים', grpPlaces: 'מקומות', menu: 'תפריט',
    back: 'חזרה', fromHere: 'מכאן', toHere: 'לכאן', nextDeps: 'היציאות הבאות', fromQ: 'מאיפה? (ריק = המיקום שלי)', toQ: 'לאן?', myLoc: 'המיקום שלי',
    loadingTT: 'טוען לוח זמנים', loadingST: 'טוען רשת רחובות (לאופניים ולהליכה מדויקת)', loadingPL: 'טוען כתובות ומקומות', unpacking: 'פורס…', ready: 'מוכן. {trips} נסיעות ליום {date}.',
    kindStop: 'תחנה', kindAddress: 'כתובת', kindStreet: 'רחוב', kindCity: 'עיר', kindPoi: 'מקום', approxNo: 'הקרוב ביותר: {n}', placesPending: 'כתובות ומקומות עדיין נטענים…', noMatch: 'לא נמצא. נסו שם תחנה, רחוב ומספר, או עיר.',
    tagTo: 'אל', tagFrom: 'מ־', go: 'תכנון', pickTitle: 'בחירה במפה', pickHint: 'הקישו על המפה על המקום הרצוי', choose: 'בחירה', cancel: 'ביטול', nearName: 'ליד {name}', pointName: 'נקודה במפה',
    btnLoc: 'המיקום שלי', btnMap: 'בחירה במפה', build: 'גרסה {v}', updated: 'גרסה חדשה נטענה.',
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
    offline: 'לא מקוון', resume: 'המשך', departAt: 'יציאה', arriveBy: 'הגעה עד', settings: 'הגדרות', setLang: 'שפה', setMap: 'מראה המפה', setTheme: 'מראה התפריטים', mapLight: 'בהיר', mapDark: 'כהה', mapSystem: 'כמו המכשיר', grpGeneral: 'כללי', grpPlan: 'תכנון', grpLive: 'זמן אמת והתראות', grpApp: 'האפליקציה', grpAbout: 'על Wayli', menuNote: 'בלי חשבון. הכול נשאר בטלפון.', setWalkHint: 'דקות, לכל היותר, לתחנה הראשונה ומהאחרונה',
    setWalk: 'הליכה מרבית', setLive: 'זמני אמת', setNotify: 'התראות בנסיעה (מתי לרדת)', setSound: 'צליל ורטט בהתראה', testAlert: 'בדיקת התראה', install: 'הוספה למסך הבית', iosInstall: 'ב-Safari: לחצו על כפתור השיתוף (ריבוע עם חץ למעלה) ואז על "הוסף למסך הבית". האפליקציה תיפתח במסך מלא, בלי סרגל הדפדפן.', reload: 'רענון האפליקציה', clearHistory: 'מחיקת היסטוריה',
    liveNote: 'זמני האמת מגיעים מפרויקט האוטובוס הפתוח של הסדנא לידע ציבורי. כשהם פועלים, הטלפון שולח לשרת שלהם את מספרי הקווים והאזור שאתם מסתכלים עליו. שום דבר אחר.',
    startTrip: 'התחלת נסיעה', share: 'שיתוף', endTrip: 'סיום', nextStep: 'השלב הבא ›', home: 'בית', work: 'עבודה', notSet: 'לא הוגדר. לחצו כדי לבחור.', change: 'שינוי', addPlace: '+ מקום שמור', remove: 'הסרה',
    recentTitle: 'חיפושים אחרונים', planAgain: 'חישוב מחדש מעכשיו', resultsFrom: 'תוצאות מ-{time}', leaveIn: 'יוצאים בעוד {n} דק\'', leaveNow: 'יוצאים עכשיו', departed: 'יצא', goneTitle: 'יצאו לפני רגע · כבר בנסיעה?', goneHint: 'כבר בנסיעה? {n} נסיעות יצאו לפני רגע', goneHint1: 'כבר בנסיעה? נסיעה אחת יצאה לפני רגע', leftAgo: 'יצא לפני {n} דק\'', aboard: 'אני בפנים', earlier: '‹ מוקדם יותר', later: 'מאוחר יותר ›',
    tryLater: 'לנסות שעה מאוחרת יותר', tryMoreWalk: 'לאפשר הליכה של 30 דק\'', arriveByNote: 'הגעה עד {time} · המאוחר ביותר קודם', alsoAt: 'גם ב:', orLines: 'או',
    liveNoVehicle: 'אין רכב בשידור', livePassed: 'עבר', onTime: 'בזמן', liveUpdated: 'זמני אמת מ-{time}', liveOff: 'זמני אמת כבויים בהגדרות', liveFail: 'זמני אמת לא זמינים כרגע', liveMin: 'דק\'',
    showStops: 'הצגת התחנות', hideStops: 'הסתרת התחנות', vehicleHere: 'הרכב כאן', tripStopsTitle: 'קו {line} לכיוון {headsign}',
    waitFor: 'ממתינים לקו {line} ב{stop}', departsAt: 'יוצא ב-{time}', departsIn: 'בעוד {n} דק\'', getOffAt: 'יורדים ב{name}', stopsLeft: 'עוד {n} תחנות', stopLeft1: 'התחנה הבאה', nextStopIs: 'התחנה הבאה: {name}',
    getOffNext: 'לרדת בתחנה הבאה!', getOffNow: 'לרדת כאן: {name}', arrived: 'הגעתם ליעד 🎉', arrivesAt: 'הגעה ב-{time}', boarded: 'עלינו על קו {line}', tripOver: 'הנסיעה הזאת כבר הסתיימה.', tripEnded: 'הנסיעה הסתיימה.',
    alertSoon: 'עוד תחנה אחת', alertSoonBody: 'יורדים ב{name}', alertOff: 'לרדת כאן', alertArrived: 'הגעתם', testAlertMsg: 'כך תיראה התראה. אם לא קיבלתם התראה, אפשרו התראות לאתר.', alertPermNo: 'התראות חסומות לאתר; יישארו רטט וצליל.',
    gpsNo: 'אין מיקום, מתקדם לפי השעון', gpsOk: 'מיקום {acc} מ\'', followTitle: '{line} ← {to}', walkTitle: 'הליכה ← {to}', copied: 'הקישור הועתק', walkToDest: 'הליכה {min} דק\' אל היעד: {name}',
    agoMin: 'לפני {n} דק\'', liveMap: 'מפה חיה', liveMapCount: '{n} רכבים{scope} · נתונים מ-{time}{age}', liveMapOne: 'רכב אחד{scope} · נתונים מ-{time}{age}', liveScopeSearch: ' מקווי החיפוש', liveScopeNear: ' מהקווים שלידי', liveAge: ' (לפני {n} דק\')', liveAgeBehind: ' (לפני {n} דק\', המקור מפגר)', legHint: 'לחיצה על נסיעה מציגה רק את הקו שלה במפה', liveMapNone: 'אין כרגע רכבים משדרים{scope} באזור הזה', liveMapZoom: 'התקרבו כדי לראות רכבים', seenAgo: 'דווח ב-{time}', feedBehind: 'המקור מפגר', kmh: 'קמ"ש', livePlanned: 'זמני אמת מ-{time}', schedOnly: 'לוח זמנים בלבד', liveDelay: '⦿ {d} דק\'',
    stopsCount: '{n} תחנות', popStops: 'התחנות', popLine: 'הקו', popDeps: 'יציאות', lineSearch: 'חיפוש קו לפי מספר', lineTitle: 'קו {line}', tripsToday: '{n} נסיעות היום', lineNoMatch: 'אין קו כזה היום', vehiclesOnLine: '{n} בשידור', otherDir: 'לכיוון {headsign}', noLineVehicles: 'אין רכב בשידור בקו',
    fasterWay: 'יש דרך מהירה יותר', altGetOff: 'לרדת ב{stop}', altInstead: 'במקום קו {line}', altThen: 'קו {line} לכיוון {headsign} ב-{time}', altArrive: 'הגעה ב-{time}, {n} דק\' קודם', switchRoute: 'מעבר למסלול הזה', keepRoute: 'להישאר', routeSwitched: 'המסלול הוחלף',
    chooseHome: 'איפה הבית?', chooseWork: 'איפה העבודה?', choosePlace: 'מקום לשמירה', savePlace: 'שמירה', unsavePlace: 'הסרה מהשמורים', fromMyLoc: 'מהמיקום שלי', historyCleared: 'ההיסטוריה נמחקה', walkOnly: 'הליכה כל הדרך: {min} דק\'',
    about: '<p><b>Wayli</b> מתכנן נסיעות בתחבורה הציבורית בישראל על הטלפון שלכם: לוח הזמנים הארצי ורשת הרחובות יורדים פעם אחת, והחיפוש רץ מקומית. חיפושים, היסטוריה ומקומות שמורים נשארים בטלפון.</p><p>זמני אמת: פרויקט האוטובוס הפתוח של הסדנא לידע ציבורי (אפשר לכבות בהגדרות). הנתונים: משרד התחבורה (GTFS) ו-OpenStreetMap. התוכנה חופשית ברישיון AGPL-3.0: <a href="https://github.com/Akensio/wayli">github.com/Akensio/wayli</a>.</p><p>עדיין אין: דיווחים, גבהים (זמני רכיבה בחיפה ובירושלים אופטימיים). לוח זמנים: {feed}.</p>',
  },
  en: {
    swap: 'Swap', now: 'Now', bike: 'Bicycle', bikeNone: 'None', bikePark: 'To the stop', bikeAlong: 'Take it along', folding: 'Folding',
    plan: 'Plan trip', nearbyTitle: 'Stops near me', refresh: 'Refresh', nearbyEmpty: 'Tap Refresh to find stops near your location.',
    favTrips: 'Saved trips', favStops: 'Saved stops', savedPlaces: 'Saved places', tabPlan: 'Plan a trip', tabNearby: 'Stops near me', tabSaved: 'Saved', tabMore: 'Settings & more', goQ: 'Where do you want to go?', grpLines: 'Lines', grpPlaces: 'Places', menu: 'Menu',
    back: 'Back', fromHere: 'From here', toHere: 'To here', nextDeps: 'Next departures', fromQ: 'From? (empty = my location)', toQ: 'To?', myLoc: 'My location',
    loadingTT: 'Loading the timetable', loadingST: 'Loading the street network (bikes and exact walking)', loadingPL: 'Loading addresses and places', unpacking: 'unpacking…', ready: 'Ready. {trips} trips on {date}.',
    kindStop: 'stop', kindAddress: 'address', kindStreet: 'street', kindCity: 'city', kindPoi: 'place', approxNo: 'nearest: {n}', placesPending: 'Addresses and places are still loading…', noMatch: 'No match. Try a stop name, a street and number, or a city.',
    tagTo: 'To', tagFrom: 'From', go: 'Go', pickTitle: 'Pick on the map', pickHint: 'Tap the place on the map', choose: 'Choose', cancel: 'Cancel', nearName: 'near {name}', pointName: 'Point on the map',
    btnLoc: 'My location', btnMap: 'Pick on the map', build: 'build {v}', updated: 'A new version has loaded.',
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
    offline: 'offline', resume: 'Resume', departAt: 'Depart', arriveBy: 'Arrive by', settings: 'Settings', setLang: 'Language', setMap: 'Map look', setTheme: 'Menus look', mapLight: 'Light', mapDark: 'Dark', mapSystem: 'Device', grpGeneral: 'General', grpPlan: 'Planning', grpLive: 'Live times and alerts', grpApp: 'The app', grpAbout: 'About Wayli', menuNote: 'No account. Everything stays on your phone.', setWalkHint: 'minutes at most, to the first stop and from the last',
    setWalk: 'Longest walk', setLive: 'Live times', setNotify: 'Trip alerts (when to get off)', setSound: 'Sound and vibration', testAlert: 'Test alert', install: 'Add to home screen', iosInstall: 'In Safari: tap the Share button (the square with an arrow) and then "Add to Home Screen". The app then opens full screen, without the browser bar.', reload: 'Reload the app', clearHistory: 'Clear history',
    liveNote: 'Live times come from the Public Knowledge Workshop\'s Open Bus project. While on, the phone sends their server the line numbers and the area you are looking at. Nothing else.',
    startTrip: 'Start trip', share: 'Share', endTrip: 'End', nextStep: 'Next step ›', home: 'Home', work: 'Work', notSet: 'Not set. Tap to choose.', change: 'Change', addPlace: '+ Saved place', remove: 'Remove',
    recentTitle: 'Recent searches', planAgain: 'Plan again from now', resultsFrom: 'Results from {time}', leaveIn: 'Leave in {n} min', leaveNow: 'Leave now', departed: 'departed', goneTitle: 'Just left · already riding?', goneHint: 'Already riding? {n} rides just left', goneHint1: 'Already riding? One ride just left', leftAgo: 'left {n} min ago', aboard: 'I\'m on it', earlier: '‹ Earlier', later: 'Later ›',
    tryLater: 'Try an hour later', tryMoreWalk: 'Allow a 30 min walk', arriveByNote: 'Arrive by {time} · latest first', alsoAt: 'Also at:', orLines: 'or',
    liveNoVehicle: 'no vehicle reporting', livePassed: 'passed', onTime: 'on time', liveUpdated: 'live as of {time}', liveOff: 'Live times are off in settings', liveFail: 'Live times unavailable right now', liveMin: 'min',
    showStops: 'Show stops', hideStops: 'Hide stops', vehicleHere: 'vehicle is here', tripStopsTitle: 'Line {line} towards {headsign}',
    waitFor: 'Wait for line {line} at {stop}', departsAt: 'departs at {time}', departsIn: 'in {n} min', getOffAt: 'Get off at {name}', stopsLeft: '{n} stops to go', stopLeft1: 'next stop', nextStopIs: 'Next stop: {name}',
    getOffNext: 'Get off at the next stop!', getOffNow: 'Get off here: {name}', arrived: 'You have arrived 🎉', arrivesAt: 'arrives at {time}', boarded: 'On line {line}', tripOver: 'This trip is already over.', tripEnded: 'Trip ended.',
    alertSoon: 'One more stop', alertSoonBody: 'Get off at {name}', alertOff: 'Get off here', alertArrived: 'You have arrived', testAlertMsg: 'This is what an alert looks like. If none showed, allow notifications for this site.', alertPermNo: 'Notifications are blocked for this site; vibration and sound remain.',
    gpsNo: 'no position, following the clock', gpsOk: 'position ±{acc} m', followTitle: '{line} → {to}', walkTitle: 'Walk → {to}', copied: 'Link copied', walkToDest: 'walk {min} min to the destination: {name}',
    agoMin: '{n} min ago', liveMap: 'Live map', liveMapCount: '{n} vehicles{scope} · data as of {time}{age}', liveMapOne: 'One vehicle{scope} · data as of {time}{age}', liveScopeSearch: ' of the lines searched', liveScopeNear: ' of the lines near me', liveAge: ' ({n} min ago)', liveAgeBehind: ' ({n} min ago, the source is behind)', legHint: 'Tap a ride to see only its line on the map', liveMapNone: 'No vehicles{scope} reporting in this area right now', liveMapZoom: 'Zoom in to see vehicles', seenAgo: 'reported at {time}', feedBehind: 'the source is behind', kmh: 'km/h', livePlanned: 'live times as of {time}', schedOnly: 'schedule only', liveDelay: '⦿ {d} min',
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
  $('fromQ').placeholder = t('fromQ'); $('toQ').placeholder = t('goQ'); $('chQ').placeholder = t('toQ'); $('menuBtn').title = t('menu'); $('menuBtn2').title = t('menu');
  $('chLoc').innerHTML = ic('locate') + ' ' + t('btnLoc'); $('chMap').innerHTML = ic('map') + ' ' + t('btnMap');
  renderDays();
  renderAbout();
  renderSettings();
  renderOptionChips();
}
function setLang(l) {
  lang = l; try { localStorage.setItem('wayli-lang', lang); } catch (e) {}
  applyLang(); renderSaved(); renderRecent(); renderPeek();
  if (lastResult && lastQuery) renderResults(lastResult, lastQuery);
}

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
function setAt(sec) { $('at').value = fmt(Math.max(0, Math.min(sec, 86400 * 2 - 60))); timeTouched = true; }
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
  nearRoutes = null; updateNearRoutes();
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
// iPhones and iPads never fire that event: the row shows there too and explains Safari's own way
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || (matchMedia('(display-mode: standalone)').matches);
if (isIOS && !standalone) $('installBtn').hidden = false;
$('installBtn').addEventListener('click', async () => { if (!installPrompt) { $('installHint').hidden = !$('installHint').hidden; return; } installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; $('installBtn').hidden = true; });
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
  renderSaved(); renderRecent(); renderPeek();
  // a trip in progress comes back first, timetable or not
  const active = activeTrip.get();
  if (active && !tripStale(active)) { updateResumeBar(); if (active.view === 'follow') openFollow(active); } else if (active) activeTrip.clear();
  try {
    manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
  } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  renderAbout();
  if (manifest.built) { const b = live.ilParts(new Date(manifest.built)); $('ver').textContent = t('build', { v: `${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(b.h).padStart(2, '0')}:${String(b.mi).padStart(2, '0')}` }); $('drawerVer').textContent = $('ver').textContent; }
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
  else if (last && last.q && !last.dismissed && last.q.day === start && Date.now() - last.at < 6 * 3600e3) { applyQuery(last.q); lastResult = last.result; lastQuery = last.q; renderResults(last.result, last.q, last.at); }
  try { await loadDay(start); } catch (e) { setStatus(t('loadFail', { msg: e.message }), true); return; }
  if (shared) { history.replaceState(null, '', location.pathname); plan(); }
  await loadPlaces();
  await loadStreets();
  loadShapes();
}
$('day').addEventListener('change', () => { loadDay($('day').value).catch((e) => setStatus(t('loadFail', { msg: e.message }), true)); setDefaultTime(); });
let timeTouched = false;   // the rider set a day, a time or "arrive by"; until then every plan is from now
$('nowBtn').addEventListener('click', () => {
  if (manifest) $('day').value = startDay();
  setDefaultTime(); setTimeMode('depart');
  timeTouched = false;
  renderOptionChips();
  if (dayInfo && dayInfo.date !== $('day').value) $('day').dispatchEvent(new Event('change'));
});
for (const id of ['at', 'day']) $(id).addEventListener('input', () => { timeTouched = true; });
function setTimeMode(mode) { for (const o of $('timeMode').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.mode === mode)); }
const timeMode = () => $('timeMode').querySelector('[aria-pressed="true"]').dataset.mode;
for (const b of $('timeMode').querySelectorAll('button')) b.addEventListener('click', () => { setTimeMode(b.dataset.mode); timeTouched = true; });

// ---------------------------------------------------------------- places and search
const place = { from: null, to: null };   // {name, stops:[...], lat, lon} or {name, lat, lon}
function describePlace(p) { return p ? p.name + (p.platforms > 1 ? ` (${t('platforms', { n: p.platforms })})` : '') : ''; }
function setPlace(side, p) { place[side] = p; $(side + 'Q').value = p ? p.name : ''; updateFromRow(); }
let barOpen = false;   // the rider is editing: both rows and the options show
/** Three states of the bar: the prompt pill (nothing chosen), the two rows with options (editing), and one
 *  summary box of to, from, time and bike once a plan is made; a tap on the summary reopens the rows. */
function updateFromRow() {
  const has = !!(place.to || (place.from && !place.from.auto)), edit = barOpen, sum = !barOpen && has;
  $('fromRow').hidden = !edit; $('optRow').hidden = !edit; $('toClear').hidden = !edit;
  $('toRow').hidden = sum; $('sumRow').hidden = !sum;
  $('topbar').classList.toggle('two', edit);
  if (!edit) setOptions(false);
  if (sum) renderSummary();
  layoutTop();
}
function renderSummary() {
  const to = place.to ? place.to.name : $('toQ').value, from = place.from ? place.from.name : ($('fromQ').value || t('myLoc'));
  $('sumTo').innerHTML = `<span class="tag">${t('tagTo')}</span>${esc(to)}`;
  $('sumMeta').innerHTML = `<span class="tag">${t('tagFrom')}</span>${esc(from)}<span class="sep">·</span>${$('optTime').innerHTML}<span class="sep">·</span>${$('optBike').innerHTML}`;
}
function openBar() {
  if (barOpen) return;
  barOpen = true;
  // the origin starts as "my location" (resolved when the plan is made); typing or the menu replaces it
  if (!place.from) setPlace('from', { name: t('myLoc'), transient: true, auto: true });
  updateFromRow();
}
function foldBar() { if (barOpen) { barOpen = false; updateFromRow(); } }
$('sumEdit').addEventListener('click', () => { barOpen = true; updateFromRow(); });
/** The top bar's height, for the map controls, the status pill and the menu under it. */
function layoutTop() { const r = $('topbar').getBoundingClientRect(); document.documentElement.style.setProperty('--top-h', `${Math.round(r.bottom + 6)}px`); }
window.addEventListener('resize', layoutTop);
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
    const icons = { home: ic('home'), work: ic('work'), more: ic('star') };
    const saved = savedPlaces.all(), recent = recentPlaces.list().filter((r) => !savedPlaces.has(r));
    if (opts.actions) {
      const a1 = row(`<span class="ic">${ic('locate')}</span><span class="txt">${t('myLoc')}</span>`, 'quick');
      a1.addEventListener('click', async () => { drop.hidden = true; input.value = t('locating'); try { onPick(myLocation(await getPosition())); } catch (e) { input.value = ''; onPick(null, true); toast(t('noLocation')); } });
      const a2 = row(`<span class="ic">${ic('map')}</span><span class="txt">${t('pickTitle')}</span>`, 'quick');
      a2.addEventListener('click', () => { drop.hidden = true; input.blur(); pickOnMap(place.from || place.to).then((p) => { if (p) onPick(p); }); });
      drop.append(a1, a2);
    } else if (!saved.length && !recent.length) { drop.hidden = true; return; }
    for (const p of saved) {
      const b = row(`<span class="ic">${icons[p.slot]}</span><span class="txt">${esc(p.slot === 'more' ? p.name : t(p.slot))}<small>${esc(p.slot === 'more' ? '' : p.name)}</small></span>`, 'quick');
      b.addEventListener('click', () => pick(p));
      drop.appendChild(b);
    }
    for (const p of recent.slice(0, 6)) {
      const b = row(`<span class="ic">${ic('history')}</span><span class="txt">${esc(p.name)}</span>`, 'quick');
      const star = document.createElement('span'); star.className = 'mini'; star.innerHTML = ic('star'); star.title = t('savePlace');
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
          const b = row(`<span class="chip t${r.routeType}"${chipStyle(r.routeType, r.agency)}>${esc(lineText(r.line))}</span><span class="txt">${esc(t('toward', { headsign: r.headsign }))}<small> · ${esc(r.agency)} · ${t('tripsToday', { n: r.trips })}</small></span>`, 'line');
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
  input.addEventListener('focus', () => { if (!input.value.trim() || opts.actions) { if (opts.actions) input.select(); quickMenu(); } else if (drop.children.length) drop.hidden = false; });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = drop.querySelector('button:not(:disabled)');
    if (!drop.hidden && first && input.value.trim()) { first.click(); e.preventDefault(); }
    else if (place.from && place.to) { plan(); e.preventDefault(); }
  });
  document.addEventListener('click', (e) => { if (!drop.contains(e.target) && e.target !== input) drop.hidden = true; });
}
// The top bar is the planner: the destination field (places and line numbers), and once a place is set,
// the origin row under it. A destination plans at once, from the origin set or from where you are.
attachSearch($('toQ'), $('toDrop'), (p, typing) => {
  if (typing) { place.to = null; return; }
  if (!p) return;
  $('toQ').blur();
  if (place.from && !place.from.transient) { setPlace('to', p); nav.closeAll(); showScreen('plan'); $('nowBtn').click(); plan(); }
  else planTo(p);
}, { actions: true, lines: true, onLine: (r) => { $('toQ').value = ''; $('toQ').blur(); openLine(r.route); } });
attachSearch($('fromQ'), $('fromDrop'), (p, typing) => {
  if (typing) { place.from = null; return; }
  if (!p) return;
  $('fromQ').blur();
  setPlace('from', p);
  if (place.to) { nav.closeAll(); showScreen('plan'); plan(); }
}, { actions: true });
const myLocation = (pos) => ({ name: t('myLoc'), lat: pos.lat, lon: pos.lon, transient: true });
for (const id of ['toQ', 'fromQ']) $(id).addEventListener('focus', () => openBar());
$('goBtn').addEventListener('click', () => {
  if (!place.to) { $('toQ').focus(); return; }
  if (place.from && !place.from.transient) { nav.closeAll(); showScreen('plan'); plan(); } else planTo(place.to);
});
for (const id of ['toClear', 'sumClear']) $(id).addEventListener('click', () => { if (nav.stack.some((e) => e.kind === 'plan')) nav.close('plan'); else clearPlan(); });
/** Back to a clean bar: no places, no results, the sheet down to its strip. */
function clearPlan() {
  place.from = null; place.to = null; $('fromQ').value = ''; $('toQ').value = ''; barOpen = false;
  lastResult = null; lastQuery = null; { const l = lastSearch.get(); if (l) lastSearch.set({ ...l, dismissed: true }); }
  $('results').innerHTML = ''; showPlanError('');
  setOptions(false); $('nowBtn').click();
  updateFromRow(); renderOptionChips(); renderRecent();
  applyLiveShow(); renderPanels();
}
// the menu under the user button
// the drawer is a history entry like any panel, so the back button closes it; it sits beside the panels, not in the sheet
$('menuReload').addEventListener('click', () => location.reload());
for (const id of ['menuBtn', 'menuBtn2']) $(id).addEventListener('click', () => { $('toQ').blur(); showOverlay('drawer'); });
$('backdrop').addEventListener('click', () => nav.close('drawer'));
$('menuClose').addEventListener('click', () => nav.close('drawer'));
for (const b of $('menu').querySelectorAll('[data-screen]')) b.addEventListener('click', () => { nav.closeAll(); showScreen(b.dataset.screen); if (b.dataset.screen === 'plan') sheet.set('half'); });
function renderDrawer() { const on = isOpen('drawer'); $('menu').classList.toggle('open', on); $('backdrop').classList.toggle('open', on); }

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
      const start = startAt && startAt.lat != null ? startAt : lastPos || place.from || place.to;
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
  timeTouched = !!(q.at || q.arriveBy);
  renderOptionChips();
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
  for (const side of ['from', 'to']) {   // "my location" is resolved now, not when it was chosen
    if (place[side].transient && place[side].lat == null) {
      $(side + 'Q').value = t('locating');
      try { setPlace(side, myLocation(await getPosition())); } catch (e) { $(side + 'Q').value = t('myLoc'); showPlanError(t('noLocation')); return; }
    }
  }
  if (!timeTouched) { setDefaultTime(); if (manifest && $('day').value !== startDay() && manifest.days.some((d) => d.date === startDay())) { $('day').value = startDay(); } }
  if (!nav.stack.some((e) => e.kind === 'plan')) nav.push({ kind: 'plan' });   // the back button clears the plan
  const day = $('day').value;
  const weekday = dateOf(day).getDay() <= 4;
  const bike = bikeChoice(), folding = $('folding').checked, arriveBy = timeMode() === 'arrive';
  const at = atSeconds();
  const isNow = !timeTouched && !arriveBy;   // a plan from now looks ten minutes back too: a ride just boarded can still be followed
  const fromTime = arriveBy ? Math.max(0, at - 7200) : isNow ? Math.max(0, at - 600) : at, toTime = arriveBy ? at : at + 3600;
  const maxWalk = (opts.maxWalk || settings.get().maxWalk) * 60;
  $('planBtn').disabled = true;
  $('results').innerHTML = `<div class="empty">${t('planning')}</div>`;
  $('recentBox').hidden = true;
  setOptions(false); renderOptionChips();
  const q = { from: place.from, to: place.to, day, at: $('at').value, bike, folding, arriveBy, isNow, maxWalk: maxWalk / 60 };
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
const chipText = (l, alts) => l.type === 'ride' ? esc(alts && alts.length > 1 ? alts.map(lineText).join(' / ') : lineText(l.line)) : `${ic(l.mode === 'bike' ? 'bike' : 'walk')} ${Math.round(l.seconds / 60)}`;
const chipAttr = (l) => (l.type === 'ride' ? chipStyle(l.routeType, l.agency) : '');
/** A ride leg planned with live data: how late its vehicle runs. */
function liveLine(l) {
  if (!l || !l.live) return '';
  const d = live.delayMinutes(l.live.delay);
  const txt = d === 0 ? t('onTime') : t('liveDelay', { d: (d > 0 ? '+' : '') + d });
  return `<div class="muted"><span class="live ${l.live.stale ? 'unsure' : 'ok'}">${esc(txt)}${l.live.stale ? ' ?' : ''}</span></div>`;
}
function journeyCard(j, q, alts, options) {
  const d = document.createElement('div');
  d.className = 'journey';
  const rides = j.legs.map((l, i) => ({ l, i })).filter((x) => x.l.type === 'ride');
  const nowS = live.nowOn(q.day), dep = rides.length && j.depart < nowS && rides[0].l.depart >= nowS - 60 ? Math.min(nowS, rides[0].l.depart) : j.depart;
  d.innerHTML = `<div class="top"><span class="times">${fmt(j.depart)} → ${fmt(j.arrive)}</span><span class="dur">${dur(j.arrive - j.depart)} · ${transfersText(j.transfers)}</span></div>` +
    `<div class="chips">${j.legs.map((l, i) => `<span class="${chipClass(l)}"${chipAttr(l)}>${chipText(l, alts && alts[i])}</span>`).join('<span class="muted">›</span>')}</div>` +
    `<div class="sub">${rides.map(({ l }) => `${esc(lineText(l.line))} ${t('toward', { headsign: esc(l.headsign) })}`).join(' · ')}</div>` +
    (options && options.length > 1 ? `<div class="opts"><span class="muted">${t('alsoAt')}</span>${options.slice(1).map((o, k) => `<button type="button" class="opt" data-k="${k + 1}">${fmt(o.depart)}</button>`).join('')}</div>` : '') +
    `<div class="leave${rides.length && rides[0].l.live ? (rides[0].l.live.stale ? ' unsure' : ' live') : ''}" data-dep="${dep}" data-day="${q.day}">${leaveText(dep, q.day)}</div>` + liveLine(rides.length ? rides[0].l : null);
  if (leaveText(dep, q.day) === t('departed')) d.querySelector('.leave').classList.add('past');
  for (const b of d.querySelectorAll('.opt')) {
    const o = options[+b.dataset.k];
    if (leaveText(o.depart, q.day) === t('departed')) b.classList.add('past');
    b.addEventListener('click', (e) => { e.stopPropagation(); openDetail(o, q); });
  }
  d.addEventListener('click', () => openDetail(j, q));
  return d;
}
/** The options as two chips (when; bicycle); the details open under them on a tap and close after planning. */
function setOptions(open) { $('formBody').hidden = !open; $('topbar').classList.toggle('open', open); layoutTop(); }
function renderOptionChips() {
  const bike = bikeChoice(), day = $('day').value;
  $('optTime').innerHTML = ic('clock') + ' ' + (timeTouched ? `${t(timeMode() === 'arrive' ? 'arriveBy' : 'departAt')} · ${day ? esc(dayLabel(day).split(' · ')[0]) : ''} ${esc($('at').value)}` : t('now'));
  $('optBike').innerHTML = `${ic('bike')} ${t(bike === 'along' ? 'bikeAlong' : bike === 'park' ? 'bikePark' : 'bikeNone')}${bike !== 'none' && $('folding').checked ? ' · ' + t('folding') : ''}`;
  if (!$('sumRow').hidden) renderSummary();
}
for (const id of ['optTime', 'optBike']) $(id).addEventListener('click', () => setOptions($('formBody').hidden));
for (const el of [$('timeMode'), $('bikeMode'), $('folding'), $('day'), $('at')]) { el.addEventListener('click', renderOptionChips); el.addEventListener('change', renderOptionChips); }
function renderResults(r, q, resultsAt = null) {
  const box = $('results');
  box.innerHTML = '';
  $('recentBox').hidden = true;
  lastQuery = q;
  barOpen = false; updateFromRow(); renderOptionChips();
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
    b.innerHTML = `<div class="top"><span class="times"><span class="chip bike">${ic('bike')}</span> ${t('bikeOnly', { min: Math.round(r.bikeOnly.seconds / 60), km: (r.bikeOnly.metres / 1000).toFixed(1) })}</span></div>`;
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
    applyLiveShow();
    return;
  }
  let groups = r.groups || r.journeys.map((_, i) => ({ options: [i], lines: null }));
  if (q.arriveBy) groups = groups.slice().reverse();
  // planned from now: what left in the last ten minutes goes in a strip of its own ("on board?"), the list stays from now
  const nowSec = live.nowOn(q.day), rideDep = (j) => { const fr = j.legs.find((l) => l.type === 'ride'); return fr ? fr.depart : j.depart; };
  const isGone = (j) => q.isNow && rideDep(j) < nowSec - 60;   // the first ride has left
  const onStrip = (j) => rideDep(j) >= nowSec - 600 || (resultsAt && j.arrive > nowSec);   // left lately, or (restored results) still under way
  const gone = [];
  for (const g of groups) {
    let opts = g.options.map((i) => r.journeys[i]);
    if (q.arriveBy) opts = opts.slice().reverse();
    for (const j of opts) if (isGone(j) && onStrip(j) && !gone.some((o) => o.depart === j.depart && o.legs.length === j.legs.length)) gone.push(j);
    opts = opts.filter((j) => !isGone(j));
    if (opts.length) box.appendChild(journeyCard(opts[0], q, g.lines, opts));
  }
  // Rides that just left: on a fresh plan one quiet line that opens on a tap (most riders want the next departures);
  // on a plan restored from earlier they are shown, since the rider is likely on the way already.
  if (gone.length) {
    const strip = document.createElement('div'); strip.className = 'gone-strip';
    const rows = document.createElement('div'); rows.className = 'gone-rows';
    for (const j of gone.sort((a, b) => b.depart - a.depart).slice(0, 4)) {   // the four most recent: the one the rider is on is among them
      const d = document.createElement('div'); d.className = 'gone';
      d.innerHTML = `<div class="txt"><span class="times">${fmt(j.depart)} → ${fmt(j.arrive)}</span><span class="chips">${j.legs.filter((l) => l.type === 'ride').map((l) => `<span class="${chipClass(l)}"${chipAttr(l)}>${chipText(l)}</span>`).join('')}</span><span class="muted">${t('leftAgo', { n: Math.max(1, Math.round((nowSec - rideDep(j)) / 60)) })}</span></div><button type="button" class="ghost">${ic('play')} ${t('aboard')}</button>`;
      d.querySelector('.txt').addEventListener('click', () => openDetail(j, q));
      d.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); startTrip(j, q); });
      rows.appendChild(d);
    }
    if (resultsAt) {
      strip.innerHTML = `<div class="muted">${t('goneTitle')}</div>`;
      strip.appendChild(rows);
    } else {
      const open = document.createElement('button'); open.type = 'button'; open.className = 'gone-hint';
      open.innerHTML = `${esc(gone.length === 1 ? t('goneHint1') : t('goneHint', { n: gone.length }))} ${ic('chevronDown')}`;
      open.addEventListener('click', () => { const on = rows.hidden; rows.hidden = !on; open.classList.toggle('open', on); });
      rows.hidden = true;
      strip.append(open, rows);
    }
    box.insertBefore(strip, head.nextSibling);
  }
  const foot = document.createElement('div'); foot.className = 'results-foot';
  const earlier = document.createElement('button'); earlier.type = 'button'; earlier.className = 'ghost'; earlier.textContent = t('earlier');
  earlier.addEventListener('click', () => { setAt(Math.max(0, atSeconds() - 3600)); plan(); });
  const later = document.createElement('button'); later.type = 'button'; later.className = 'ghost'; later.textContent = t('later');
  later.addEventListener('click', () => { setAt(atSeconds() + 3600); plan(); });
  foot.append(earlier, later);
  box.appendChild(foot);
  if (!topPanel() && screen === 'plan' && sheet.state === 'peek') sheet.set('half');
  applyLiveShow();
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
    d.innerHTML = `<span class="ic">${ic('history')}</span><span class="txt"><span class="name">${esc(r.from.name)} ← ${esc(r.to.name)}</span><small>${esc(dayLabel(r.day || calToday()))} ${esc(r.time || '')}${r.bike && r.bike !== 'none' ? ' · ' + ic('bike') : ''}${r.arriveBy ? ' · ' + t('arriveBy') : ''}</small></span>`;
    if (lang !== 'he') d.querySelector('.name').textContent = `${r.from.name} → ${r.to.name}`;
    d.addEventListener('click', () => { applyQuery(r); $('nowBtn').click(); nav.closeAll(); showScreen('plan'); plan(); });
    box.appendChild(d);
  }
  box.hidden = !!$('results').children.length;
  renderPeek();
}
/** The strip the sheet shows when collapsed: plan, home, work, recent places, nearby stops. */
function renderPeek() {
  const box = $('peekRow');
  box.innerHTML = '';
  const chip = (txt, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chipbtn ' + cls; b.innerHTML = txt; b.addEventListener('click', fn); box.appendChild(b); };
  chip(ic('route') + ' ' + t('tabPlan'), () => { $('toQ').focus(); }, 'accent');
  const sp = savedPlaces.get();
  if (sp.home) chip(ic('home') + ' ' + t('home'), () => planTo(sp.home));
  if (sp.work) chip(ic('work') + ' ' + t('work'), () => planTo(sp.work));
  for (const p of recentPlaces.list().filter((r) => !savedPlaces.has(r)).slice(0, 4)) chip(ic('history') + ' ' + esc(p.name), () => planTo(p));
  chip(ic('locate') + ' ' + t('tabNearby'), () => showScreen('nearby'));
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
  const dark = th === 'dark' || (th === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#1e2227' : '#12998b';
}
applyTheme();
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
  const start = lastPos || { lat: 32.08, lon: 34.78 };
  mainMap = makeMap('mainMap', [start.lat, start.lon], lastPos ? 14.5 : 11);
  if (!mainMap) { mapFailed = true; for (const r of styledWaiters.splice(0)) r(null); return; }
  const m = mainMap;
  geoCtl = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 15 } });
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
    if (sheet.state !== 'peek' || barOpen) { sheet.set('peek'); foldBar(); return; }
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
      el2.querySelector('[data-act="from"]').addEventListener('click', () => { if (popup) popup.remove(); nav.closeAll(); setPlace('from', p); showScreen('plan'); barOpen = true; updateFromRow(); $('toQ').focus(); });
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
  const dark = typeof currentStyle === 'object';
  // depth when the map is tilted: a sky and a haze towards the horizon, a low side light that shades the buildings
  try {
    m.setSky(dark
      ? { 'sky-color': '#0a1322', 'horizon-color': '#243247', 'fog-color': '#15181c', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0] }
      : { 'sky-color': '#8fc1f2', 'horizon-color': '#dbe7f3', 'fog-color': '#f4f5f2', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0] });
    m.setLight({ anchor: 'viewport', color: '#ffffff', intensity: dark ? 0.35 : 0.55, position: [1.2, 215, 35] });
    if (m.getLayer('building-3d')) { m.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.9); m.setPaintProperty('building-3d', 'fill-extrusion-vertical-gradient', true); }
  } catch (e) { /* an older MapLibre without sky: the map stays flat-shaded */ }
  m.addSource('lm-stops', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'lm-stops', type: 'circle', source: 'lm-stops', minzoom: 14, filter: ['in', ['get', 'kind'], ['literal', ['bus', 'platform']]], paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'platform'], 3, 4], 'circle-color': '#ffffff', 'circle-stroke-color': '#555', 'circle-stroke-width': 1.5 } });
  for (const k of BADGE_KINDS) if (!m.hasImage('wayli-st-' + k)) m.addImage('wayli-st-' + k, stationImage(k), { pixelRatio: 2 });
  // close up, every bus stop gets its badge over the dot; stations keep theirs from zoom 11
  m.addLayer({ id: 'lm-stops-icon', type: 'symbol', source: 'lm-stops', minzoom: 15, filter: ['==', ['get', 'kind'], 'bus'], layout: { 'icon-image': 'wayli-st-bus', 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.75, 17, 1] } });
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
  if (key === 'screen-plan' && lastResult && lastResult.journeys && lastResult.journeys.length && $('results').children.length) {
    const ids = new Set();
    for (const j of lastResult.journeys) for (const l of j.legs) if (l.type === 'ride' && l.routeId != null) ids.add(String(l.routeId));
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
// Line colours: trains navy, light rail red (both lines running are "the red line"), buses in their operator's
// colour (approximate brand colours; the table is the one place to correct them), other operators slate green.
const AGENCY_COLORS = [
  ['אגד', '#008761'], ['דרך אגד', '#008761'], ['דן', '#2457d6'], ['מטרופולין', '#f07f1a'], ['קווים', '#7b2d90'], ['סופרבוס', '#d94e1f'],
  ['נתיב אקספרס', '#8db600'], ['אלקטרה אפיקים', '#1d4f91'], ['תנופה', '#2a9fd6'], ['אקסטרה', '#c2185b'], ['גלים', '#3b8ea5'], ['בית שמש אקספרס', '#b06d1e'],
];
const BUS_DEFAULT = '#4f7a6a', TRAIN_COLOR = '#1b3a6b', LRT_COLOR = '#d7263d';
const agencyColor = (agency) => { const a = String(agency || ''); for (const [k, c] of AGENCY_COLORS) if (a.startsWith(k)) return c; return BUS_DEFAULT; };
function routeColor(type, agency) { return type === 2 ? TRAIN_COLOR : type === 0 ? LRT_COLOR : agencyColor(agency); }
/** Dark text on light colours, white on the rest. */
function textOn(hex) { const n = parseInt(hex.slice(1), 16); const lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); return lum > 150 ? '#1b1f24' : '#ffffff'; }
const chipStyle = (type, agency) => { const c = routeColor(type, agency); return ` style="background:${c};color:${textOn(c)}"`; };
const legColor = (l) => l.type === 'ride' ? routeColor(l.routeType, l.agency) : (l.mode === 'bike' ? '#1f5fa8' : '#2b3036');
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
function drawJourney(m, j, markers, focus = -1) {
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
  drawContext(m, j, focus);
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
    `<div class="muted">${v.agency ? esc(v.agency) + ' · ' : ''}${t('seenAgo', { time: clock(v.seen) })}${Date.now() - new Date(v.seen).getTime() >= 180e3 ? ` (${t('agoMin', { n: Math.round((Date.now() - new Date(v.seen).getTime()) / 60000) })})` : ''}${v.velocity != null ? ` · ${Math.round(v.velocity)} ${t('kmh')}` : ''}</div>` +
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
  const icon = ic(routeType === 2 ? 'train' : routeType === 0 ? 'tram' : 'bus');
  vs.forEach((v, i) => {
    if (!live.isFresh(v)) return;   // last seen long before the feed's newest report: its position says nothing now
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
let journeyMarkers = [], liveMarkers = [], detailSeq = 0, detailFocus = -1;
/** Focus one ride of the journey being shown (or release it): its course alone, only its vehicles, the map on it. */
function focusLeg(i) {
  detailFocus = detailFocus === i ? -1 : i;
  const legs = $('detailLegs');
  legs.classList.toggle('focused', detailFocus >= 0);
  legs.querySelectorAll(':scope > .leg').forEach((el, k) => el.classList.toggle('focus', k === detailFocus));
  redrawMap(true);
}
const tripStopsCached = (trip) => { if (!tsCache.has(trip)) tsCache.set(trip, call('tripStops', { trip })); return tsCache.get(trip); };
const liveOn = () => settings.get().live && navigator.onLine !== false;
function liveBadge(at) {
  if (!at) return { text: t('liveNoVehicle'), cls: '' };
  if (at.passed) return { text: t('livePassed'), cls: 'gone' };
  const d = live.delayMinutes(at.delay);
  const text = `⦿ ${fmt(at.time)}${d === 0 ? ' · ' + t('onTime') : ` (${d > 0 ? '+' : ''}${d})`}${at.stale ? ' ?' : ''}`;
  return { text, cls: at.stale ? 'unsure' : 'ok' };
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
    const b = drawJourney(m, j, journeyMarkers, detailFocus);
    for (const mk of liveMarkers.splice(0)) mk.remove();
    fitMap(detailFocus >= 0 && j.legs[detailFocus] ? boundsOf(j.legs[detailFocus].path) : b, 16);
    if (!bikeOnly) liveForJourney(j, q.day, legs, my, detailFocus);
  };
  detailFocus = -1;
  showOverlay('detail');
  $('detailTitle').textContent = bikeOnly ? t('bikeOnly', { min: Math.round(j.arrive / 60), km: '' }).replace(', ', '').replace(' ק"מ', '').replace(' km', '') : `${fmt(j.depart)} → ${fmt(j.arrive)} · ${dur(j.arrive - j.depart)}`;
  $('detailNote').textContent = bikeOnly ? '' : t('legHint');
  legs.innerHTML = '';
  legs.classList.remove('focused');
  j.legs.forEach((l, idx) => {
    const el = document.createElement('div');
    el.className = `leg ${l.type}${l.type === 'ride' ? ' t' + l.routeType : ''}`;
    let what = '';
    const mins = Math.max(1, Math.round(l.seconds / 60));
    if (l.type === 'ride') {
      const planned = l.live ? liveBadge({ time: l.depart, delay: l.live.delay, passed: false, stale: l.live.stale }) : null;
      what = `<span class="chip btn t${l.routeType}" data-route="${l.route ?? ''}"${chipStyle(l.routeType, l.agency)}>${esc(lineText(l.line))}</span> ${esc(l.headsign)}<span class="live${planned ? ' ' + planned.cls : ''}" data-live="${l.trip}">${planned ? esc(planned.text) : ''}</span><small>${esc(l.from.name)} → ${esc(l.to.name)} · ${t('ride', { line: '', agency: esc(l.agency), stops: l.stops }).replace(/^ · /, '')}</small>`;
      if (l.stopsAlong && l.stopsAlong.length > 2) what += `<button type="button" class="toggle">${t('showStops')}</button><div class="stoplist" hidden>${l.stopsAlong.map((s) => `<div><span>${fmt(s.arr)}</span><span>${esc(s.name)}</span></div>`).join('')}</div>`;
    }
    else if (l.type === 'access') what = (l.mode === 'bike' ? t('bikeTo', { min: mins, name: esc(l.to.name) }) : t('walkTo', { min: mins, name: esc(l.to.name) }));
    else if (l.type === 'egress') what = (l.mode === 'bike' ? t('bikeFrom', { min: mins, name: esc(l.from.name) }) : t('walkFrom', { min: mins, name: esc(l.from.name) }));
    else what = t('walkTo', { min: mins, name: esc(l.to.name) });
    const shifted = l.type === 'ride' && l.schedDepart != null && Math.abs(l.schedDepart - l.depart) >= 60;
    const timeCol = bikeOnly ? '' : shifted ? `<s>${fmt(l.schedDepart)}</s><br><b>${fmt(l.depart)}</b><br>${fmt(l.arrive)}` : `${fmt(l.depart)}${l.type === 'ride' ? '<br>' + fmt(l.arrive) : ''}`;
    el.innerHTML = `<span class="t">${timeCol}</span><span class="dot"${l.type === 'ride' ? ` style="background:${routeColor(l.routeType, l.agency)}"` : ''}></span><span class="what">${what}</span>`;
    const tg = el.querySelector('.toggle');
    if (tg) tg.addEventListener('click', () => { const sl = el.querySelector('.stoplist'); sl.hidden = !sl.hidden; tg.textContent = sl.hidden ? t('showStops') : t('hideStops'); });
    const ch = el.querySelector('.chip.btn');
    if (ch && ch.dataset.route !== '') ch.addEventListener('click', (e) => { e.stopPropagation(); openLine(+ch.dataset.route); });
    if (l.type === 'ride') el.addEventListener('click', (e) => { if (e.target.closest('.toggle, .stoplist')) return; focusLeg(idx); });
    legs.appendChild(el);
  });
  updateStar('detailStar', q && !bikeOnly ? tripKey(q) : null, 'trips');
  $('detailStar').onclick = () => { if (q && !bikeOnly) { favs.toggle('trips', tripKey(q), { from: q.from, to: q.to, bike: q.bike, folding: q.folding }); renderSaved(); } updateStar('detailStar', tripKey(q), 'trips'); };
  $('detailStart').hidden = bikeOnly;
  $('detailStart').onclick = () => startTrip(j, q);
  $('detailShare').onclick = () => shareJourney(j, q, bikeOnly);
}
/** Live badges on the ride legs of a journey happening around now; every vehicle of those lines on the map. */
async function liveForJourney(j, day, container, seq, focus = -1) {
  if (!liveOn() || !dayInfo || dayInfo.date !== day) return;   // trip indices belong to the loaded day
  const now = live.nowOn(day);
  if (j.depart - now > 5400 || now - j.arrive > 1800) return;
  const rides = j.legs.filter((l, i) => l.type === 'ride' && l.routeId != null && (focus < 0 || i === focus) && l.depart - now < 5400 && now - l.arrive < 900).slice(0, 4);
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
    const walk = withDistance && s.distance != null ? ` · ${ic('walk')} ${Math.max(1, Math.round(s.distance * 1.25 / 1.2 / 60))} ${t('min')}` : '';
    d.innerHTML = `<div class="name">${esc(s.name)}</div><div class="meta">${esc(s.city || '')}${withDistance && s.distance != null ? ` · ${s.distance} ${t('m')}${walk}` : ''}${s.code ? ` · ${esc(s.code)}` : ''}</div>` +
      `<div class="chips">${(s.lines || []).map((l) => `<span class="chip t${l.type}" data-route="${l.route ?? ''}"${chipStyle(l.type, l.agency)}>${esc(lineText(l.label))}</span>`).join('')}</div>`;
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
$('stopFrom').addEventListener('click', () => { if (!currentStop) return; const p = stopPlace(currentStop); nav.closeAll(); setPlace('from', p); showScreen('plan'); sheet.set('half'); });
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
  if (!m || !mapStyled || document.hidden || sheet.state === 'full') return;
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
    const features = vs.filter((v) => live.isFresh(v)).map((v) => {
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
  const color = kind === 'rail' ? TRAIN_COLOR : kind === 'lrt' ? LRT_COLOR : station ? BUS_DEFAULT : '#5f6b72';
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
    if (row) { const tag = document.createElement('span'); tag.className = 'veh'; tag.innerHTML = `${ic('bus')} ${t('vehicleHere')}${est.delay ? ` (${live.delayMinutes(est.delay) > 0 ? '+' : ''}${live.delayMinutes(est.delay)})` : ''}`; row.appendChild(tag); row.scrollIntoView({ block: 'center' }); }
  } catch (e) { /* no live, no problem */ }
}
$('tripBack').addEventListener('click', () => nav.close('tripDetail'));

// ---------------------------------------------------------------- saved: places, trips, stops (this device only)
function tripKey(q) { return `trip:${q.from.name}|${q.to.name}|${q.bike}|${q.folding ? 'f' : ''}`; }
function updateStar(id, key, kind) { const on = key && favs.has(kind, key); $(id).innerHTML = ic('star'); $(id).classList.toggle('on', on); }
/** The last search, shown as it was (its own place and time), when it is under an hour old and went to this place. */
function restoreLast(p) {
  const last = lastSearch.get();
  if (!last || !last.q || !last.result || !last.result.journeys || !last.result.journeys.length || Date.now() - last.at > 3600e3) return false;
  if (!last.q.to || !p || last.q.to.name !== p.name || last.q.day !== $('day').value && !(manifest && manifest.days.some((d) => d.date === last.q.day))) return false;
  nav.closeAll(); showScreen('plan');
  $('day').value = last.q.day; applyQuery(last.q); lastResult = last.result; lastQuery = last.q;
  renderResults(last.result, last.q, last.at); sheet.set('half');
  return true;
}
async function planTo(p) {
  if (restoreLast(p)) return;
  nav.closeAll();
  showScreen('plan');
  setPlace('to', p);
  $('results').innerHTML = `<div class="empty">${t('locating')}</div>`; $('recentBox').hidden = true;
  sheet.set('half');
  $('fromQ').value = t('locating'); updateFromRow();
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
    d.innerHTML = `<span class="ic">${ic(slot === 'home' ? 'home' : 'work')}</span><span class="txt"><span class="name${p ? '' : ' unset'}">${esc(p ? p.name : t('notSet'))}</span><small>${t(slot)}</small></span><button type="button" class="ghost">${p ? t('change') : '+'}</button>`;
    d.querySelector('.txt').addEventListener('click', async () => { if (p) planTo(p); else { const c = await choosePlace(t(slot === 'home' ? 'chooseHome' : 'chooseWork')); if (c) { savedPlaces.set(slot, c); renderSaved(); } } });
    d.querySelector('button').addEventListener('click', async () => { const c = await choosePlace(t(slot === 'home' ? 'chooseHome' : 'chooseWork')); if (c) { savedPlaces.set(slot, c); renderSaved(); } });
    box.appendChild(d);
  }
  for (const p of sp.more) {
    const d = document.createElement('div');
    d.className = 'saved-row';
    d.innerHTML = `<span class="ic">${ic('star')}</span><span class="txt"><span class="name">${esc(p.name)}</span></span><button type="button" class="ghost">${ic('close')}</button>`;
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
    d.innerHTML = `<div class="top"><span class="times">${esc(v.from.name)} → ${esc(v.to.name)}</span></div><div class="sub">${v.bike !== 'none' ? ic('bike') + ' ' : ''}${esc(t(v.bike === 'along' ? 'bikeAlong' : v.bike === 'park' ? 'bikePark' : 'bikeNone'))}</div>`;
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
  seg('setLang', lang); seg('setMap', mapChoice()); seg('setTheme', s.theme || 'system');
  $('setWalk').value = s.maxWalk;
  $('setLive').checked = !!s.live; $('setNotify').checked = !!s.notify; $('setSound').checked = !!s.sound;
}
for (const b of $('setLang').querySelectorAll('button')) b.addEventListener('click', () => setLang(b.dataset.v));
for (const b of $('setMap').querySelectorAll('button')) b.addEventListener('click', () => { settings.set({ map: b.dataset.v }); applyMapStyle(); renderSettings(); });
for (const b of $('setTheme').querySelectorAll('button')) b.addEventListener('click', () => { settings.set({ theme: b.dataset.v }); applyTheme(); renderSettings(); });
const setWalk = (v) => { settings.set({ maxWalk: Math.max(3, Math.min(45, Math.round(+v) || 15)) }); renderSettings(); };
$('setWalk').addEventListener('change', () => setWalk($('setWalk').value));
$('walkMinus').addEventListener('click', () => setWalk(settings.get().maxWalk - 1));
$('walkPlus').addEventListener('click', () => setWalk(settings.get().maxWalk + 1));
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
    if (l.type === 'ride') what = `<span class="chip t${l.routeType}"${chipStyle(l.routeType, l.agency)}>${esc(lineText(l.line))}</span> ${esc(l.from.name)} → ${esc(l.to.name)} · ${l.stops} ${t('kindStop')}`;
    else if (l.type === 'egress') what = l.mode === 'bike' ? t('bikeFrom', { min: mins, name: esc(l.from.name) }) : t('walkFrom', { min: mins, name: esc(l.from.name) });
    else what = l.mode === 'bike' ? t('bikeTo', { min: mins, name: esc(l.to.name) }) : t('walkTo', { min: mins, name: esc(l.to.name) });
    el.innerHTML = `<span class="t">${fmt(l.depart)}</span><span class="dot"${l.type === 'ride' ? ` style="background:${routeColor(l.routeType, l.agency)}"` : ''}></span><span class="what">${what}</span>`;
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
  ac.innerHTML = `<div class="title">${ic('bolt')} ${t('fasterWay')}</div><div>${esc(first)}${first && then ? ' · ' : ''}${esc(then)}</div><div class="chips">${chips}</div>` +
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
  picker: () => { const r = pickResolve; pickResolve = null; if (pickMarker) { pickMarker.remove(); pickMarker = null; } if (r) r(null); }, chooser: () => { const r = chooserResolve; chooserResolve = null; if (r) r(null); }, follow: () => { if (fol) closeFollow(false); delete mapOf.follow; } };
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
$('pageBack').addEventListener('click', () => { if (topPanel() === 'chooser') $('chCancel').click(); else if (nav.stack.length) history.back(); else showScreen('plan'); });
const SHEET_FOR = { 'screen-plan': () => ($('results').children.length || place.from || place.to ? 'half' : 'peek'), 'screen-nearby': 'full', 'screen-saved': 'full', 'screen-more': 'full', chooser: 'full' };
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
  if (page) { $('pageTitle').textContent = PAGE_TITLE[key] ? t(PAGE_TITLE[key]) : $('chTitle').textContent; $('sheetBody').scrollTop = 0; }
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
    document.body.classList.toggle('sheet-full', st === 'full');
    document.documentElement.style.setProperty('--sheet-h', this.px(st) + 'px');
    if (prev === 'full' && st !== 'full') refreshLiveMap();
    if (st !== prev && mainMap && (st === 'peek' || prev === 'peek')) $('sheetBody').scrollTop = 0;
  },
  toggle() { this.set(this.state === 'peek' ? 'half' : this.state === 'half' ? 'full' : 'peek'); },
};
{
  // Dragging: from anywhere on the sheet while it is collapsed or half open (the body does not scroll then;
  // the chip strip scrolls sideways, so a sideways start is left to it), from the handle and the top 96 px
  // always. A short pull (40 px) steps one size in its direction; a long one lands where it is let go.
  // A tap on the handle steps through the sizes. A tap elsewhere stays a tap.
  const h = $('sheetHandle'), el = $('sheet');
  const ORDER = ['peek', 'half', 'full'];
  let startX = 0, startY = 0, startH = 0, startState = 'peek', moved = false, dragging = false, onHandle = false, onStrip = false, swallow = false;
  let trail = [];   // the last few (time, y) of the finger, for its speed at release
  const speed = () => { const n = trail.length; if (n < 2) return 0; let i = n - 2; while (i > 0 && trail[n - 1].t - trail[i].t < 60) i--; const dt = trail[n - 1].t - trail[i].t; return dt > 0 ? (trail[n - 1].y - trail[i].y) / dt : 0; };
  el.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    onHandle = h.contains(e.target); onStrip = !!e.target.closest('.peekrow');
    const nearTop = e.clientY - el.getBoundingClientRect().top < 96;
    if (document.body.classList.contains('page')) return;
    if (e.pointerType === 'touch' && sheet.state === 'peek') return;   // a finger on the collapsed sheet: the touch handler below
    // the body scrolls when half or fully open (a finger there is the touch handler's, at the scroll edges); the handle and the top always drag
    if (!onHandle && (e.target.closest('input, select, textarea') || ((sheet.state === 'full' || (sheet.state === 'half' && e.pointerType === 'touch')) && !nearTop))) return;
    dragging = true; startX = e.clientX; startY = e.clientY; startH = el.getBoundingClientRect().height; startState = sheet.state; moved = false; trail = [{ t: performance.now(), y: e.clientY }];
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY, dx = e.clientX - startX;
    if (!moved) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      if (onStrip && Math.abs(dx) > Math.abs(dy)) { dragging = false; return; }   // a sideways scroll of the chips
      moved = true; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch (x) {}
    }
    trail.push({ t: performance.now(), y: e.clientY }); if (trail.length > 8) trail.shift();
    el.style.height = Math.max(sheet.px('peek'), Math.min(sheet.px('full'), startH + dy)) + 'px';
  });
  /** Where a drag lands: a flick (over 0.6 px/ms at release) goes all the way in its direction; otherwise the
   *  nearest size, or one step in its direction after a short pull. `v` is the finger's speed, down positive. */
  const settle = (hh, fromH, fromState, v = 0) => {
    const dy = hh - fromH;
    if (Math.abs(v) >= 0.6 && Math.abs(dy) >= 30) { sheet.set(v < 0 ? 'full' : 'peek'); return; }   // a flick, after real travel
    let best = 'peek';
    for (const st of ['half', 'full']) if (Math.abs(sheet.px(st) - hh) < Math.abs(sheet.px(best) - hh)) best = st;
    if (best === fromState && Math.abs(dy) > 40) best = ORDER[Math.max(0, Math.min(2, ORDER.indexOf(fromState) + (dy > 0 ? 1 : -1)))];
    sheet.set(best);
  };
  const end = (e) => {
    if (!dragging) return;
    dragging = false; el.classList.remove('dragging');
    const hh = el.getBoundingClientRect().height;
    el.style.height = '';
    if (!moved) return;   // a tap: the handle's click handler cycles the sizes
    swallow = true; setTimeout(() => { swallow = false; }, 60);
    settle(hh, startH, startState, speed());
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  h.addEventListener('click', () => { if (!swallow) sheet.toggle(); });
  // Collapsed, the browser may take a pull down as pull-to-refresh and cancel pointer events; touch events keep
  // coming, so a pull up (or a sideways-free start on the strip) opens the sheet through them.
  {
    let pOn = false, pMoved = false, pX = 0, pY = 0, pH = 0, pStrip = false;
    el.addEventListener('touchstart', (e) => {
      pOn = false;
      if (sheet.state !== 'peek' || e.touches.length !== 1 || document.body.classList.contains('page') || e.target.closest('input, select, textarea')) return;
      pOn = true; pMoved = false; pX = e.touches[0].clientX; pY = e.touches[0].clientY; pH = el.getBoundingClientRect().height; pStrip = !!e.target.closest('.peekrow');
      trail = [{ t: performance.now(), y: pY }];
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!pOn) return;
      const up = pY - e.touches[0].clientY, dx = e.touches[0].clientX - pX;
      if (!pMoved) {
        if (Math.abs(up) < 8 && Math.abs(dx) < 8) return;
        if (up <= 0 || (pStrip && Math.abs(dx) > Math.abs(up))) { pOn = false; return; }   // down: the browser's; sideways on the strip: its scroll
        pMoved = true; el.classList.add('dragging');
      }
      trail.push({ t: performance.now(), y: e.touches[0].clientY }); if (trail.length > 8) trail.shift();
      el.style.height = Math.max(sheet.px('peek'), Math.min(sheet.px('full'), pH + up)) + 'px';
    }, { passive: true });
    const pEnd = () => {
      if (!pOn) return;
      pOn = false;
      if (!pMoved) return;
      el.classList.remove('dragging');
      const hh = el.getBoundingClientRect().height;
      el.style.height = '';
      swallow = true; setTimeout(() => { swallow = false; }, 60);
      settle(hh, pH, 'peek', speed());
    };
    el.addEventListener('touchend', pEnd); el.addEventListener('touchcancel', pEnd);
  }
  // Half or fully open, the list scrolls natively and the browser cancels pointer events; but a finger pulling past
  // an edge of the list only overscrolls, and touch events keep coming: past the top edge, pulling down folds the
  // sheet; past the bottom edge (or with nothing to scroll), pulling up opens it.
  {
    const body = $('sheetBody');
    let tY = 0, tH = 0, tOn = false, tMoved = false, tTop = false, tBottom = false, tState = 'half';
    body.addEventListener('touchstart', (e) => {
      tOn = false;
      if (sheet.state === 'peek' || dragging || e.touches.length !== 1 || document.body.classList.contains('page')) return;
      tOn = true; tMoved = false; tY = e.touches[0].clientY; tH = el.getBoundingClientRect().height; tState = sheet.state;
      tTop = body.scrollTop <= 0; tBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
      trail = [{ t: performance.now(), y: tY }];
    }, { passive: true });
    body.addEventListener('touchmove', (e) => {
      if (!tOn) return;
      const down = e.touches[0].clientY - tY;
      if (!tMoved) {
        if (Math.abs(down) < 8) return;
        if (!(down > 0 ? tTop : tBottom)) { tOn = false; return; }   // not at the edge in that direction: the list scrolls
        tMoved = true; el.classList.add('dragging');
      }
      trail.push({ t: performance.now(), y: e.touches[0].clientY }); if (trail.length > 8) trail.shift();
      el.style.height = Math.max(sheet.px('peek'), Math.min(sheet.px('full'), tH - down)) + 'px';
    }, { passive: true });
    const tEnd = () => {
      if (!tOn) return;
      tOn = false;
      if (!tMoved) return;
      el.classList.remove('dragging');
      const hh = el.getBoundingClientRect().height;
      el.style.height = '';
      settle(hh, tH, tState, speed());
    };
    body.addEventListener('touchend', tEnd); body.addEventListener('touchcancel', tEnd);
    // a mouse wheel scrolling up past the top folds it too
    let wheelAt = 0;
    body.addEventListener('wheel', (e) => { if (document.body.classList.contains('page') || Date.now() - wheelAt < 700) return; if (sheet.state !== 'peek' && body.scrollTop === 0 && e.deltaY < -20) { wheelAt = Date.now(); sheet.set(sheet.state === 'full' ? 'half' : 'peek'); } else if (sheet.state === 'half' && e.deltaY > 20 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) { wheelAt = Date.now(); sheet.set('full'); } }, { passive: true });
  }
  window.addEventListener('resize', () => sheet.set(sheet.state));
}
sheet.set('peek');

init().catch((e) => setStatus(t('loadFail', { msg: e.message }), true));
