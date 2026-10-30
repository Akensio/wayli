// Starting the app, after the components have painted: the service worker, the map, a trip in progress, then
// the data (the manifest, the day to start on, a shared link or the last search, the timetable, then the
// address book, the street graph and the courses in the background).
import { lastSearch } from './lib/store.ts';
import * as search from './state/search';
import { warmPosition } from './state/position';
import * as map from './map/index';
import { loadFailed } from './controllers/status';
import { applyLang } from './controllers/lang';
import { t } from './lib/i18n';
import {
  loadManifest,
  renderDays,
  startDay,
  hasDay,
  loadDay,
  loadPlaces,
  loadStreets,
  loadShapes,
  loadRailTimes,
  loadBusTimes,
} from './controllers/loading';
import { plan, planFromBar, parseShared } from './controllers/planner';
import { resumeAtStart } from './controllers/follow';
import { layoutTop, updateOnline, registerServiceWorker } from './controllers/shell';

// the last search opens again at start for six hours: its places and options, planned afresh (never its old results:
// live times change in between; 2026-10-22, Gadi)
const LAST_SEARCH_MS = 6 * 3600e3;

async function boot(): Promise<void> {
  map.applyTheme();
  registerServiceWorker();
  applyLang();
  updateOnline();
  layoutTop();
  warmPosition();
  map.initMap();
  resumeAtStart();
  try {
    await loadManifest();
  } catch (e) {
    loadFailed(e);
    return;
  }
  const shared = parseShared(new URLSearchParams(location.search));
  const last = shared ? null : lastSearch.get();
  const recent = last && last.q && Date.now() - last.at < LAST_SEARCH_MS;
  let start = startDay();
  if (shared && shared.day && hasDay(shared.day)) start = shared.day;
  else if (recent && hasDay(last.q.day) && !last.q.isNow) start = last.q.day;
  renderDays();
  search.day.value = start;
  search.setDefaultTime();
  if (shared) search.applyQuery(shared);
  const again = !shared && recent && !last.dismissed && (last.q.isNow || last.q.day === start);
  if (again) {
    search.applyQuery(last.q);
    if (last.q.isNow) search.resetNow();
  } // a search from now starts from now
  try {
    await loadDay(start);
  } catch (e) {
    loadFailed(e);
    return;
  }
  if (shared) {
    history.replaceState(null, '', location.pathname);
    plan();
  } else if (again) {
    const f = search.from.value;
    if (!f || f.transient) search.setPlace('from', { name: t('myLoc'), transient: true, auto: !f || !!f.auto }); // where you are now
    planFromBar();
  }
  // the courses and the address book together (3.5 and 2.8 MB), then the street graph (12 MB): the courses shape
  // what is on screen at once (a ride, a stop's lines), the streets only refine walks that redraw themselves
  await Promise.all([loadShapes(), loadPlaces()]);
  await loadStreets();
  loadRailTimes();
  loadBusTimes();
}
boot().catch(loadFailed);
