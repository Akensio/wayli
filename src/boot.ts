// Starting the app, after the components have painted: the service worker, the map, a trip in progress, then
// the data (the manifest, the day to start on, a shared link or the last search, the timetable, then the
// address book, the street graph and the courses in the background).
import { lastSearch } from './store.js';
import * as search from './state/search';
import * as results from './state/results';
import * as saved from './state/saved';
import { warmPosition } from './state/position';
import * as map from './map/index';
import { loadFailed } from './controllers/status';
import { applyLang } from './controllers/lang';
import { loadManifest, renderDays, startDay, hasDay, loadDay, loadPlaces, loadStreets, loadShapes, loadRailTimes } from './controllers/loading';
import { plan, parseShared } from './controllers/planner';
import { resumeAtStart } from './controllers/follow';
import { layoutTop, updateOnline, registerServiceWorker } from './controllers/shell';
import './controllers/nearby';   // its hooks
import './controllers/trip';

const LAST_SEARCH_MS = 6 * 3600e3;   // the last search is shown again at start for six hours

async function boot(): Promise<void> {
  map.applyTheme();
  registerServiceWorker();
  applyLang();
  updateOnline();
  layoutTop();
  warmPosition();
  map.initMap();
  saved.refresh(); results.refreshRecent();
  resumeAtStart();
  try { await loadManifest(); } catch (e) { loadFailed(e); return; }
  const shared = parseShared(new URLSearchParams(location.search));
  const last = shared ? null : lastSearch.get();
  const recent = last && last.q && Date.now() - last.at < LAST_SEARCH_MS;
  let start = startDay();
  if (shared && shared.day && hasDay(shared.day)) start = shared.day;
  else if (recent && hasDay(last.q.day)) start = last.q.day;
  renderDays();
  search.day.value = start;
  search.setDefaultTime();
  if (shared) search.applyQuery(shared);
  else if (recent && !last.dismissed && last.q.day === start) { search.applyQuery(last.q); results.setResults(last.result, last.q, last.at); }
  try { await loadDay(start); } catch (e) { loadFailed(e); return; }
  if (shared) { history.replaceState(null, '', location.pathname); plan(); }
  await loadPlaces();
  await loadStreets();
  loadShapes();
  loadRailTimes();
}
boot().catch(loadFailed);
