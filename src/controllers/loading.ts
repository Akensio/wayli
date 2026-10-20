// Loading the data: the manifest (which days, which files), a day's timetable, then the address book, the
// street graph and the courses in the background. The worker downloads and unpacks; the pill shows how far.
import * as live from '../live.js';
import { t, lang } from '../i18n';
import { calToday, dayLabel } from '../time';
import { call, DATA_URL, resetCaches } from '../worker/client';
import * as data from '../state/data';
import * as search from '../state/search';
import * as app from '../state/app';
import * as map from '../map/index';
import type { Manifest } from '../state/data';
import { setStatus, loadFailed } from './status';

const manifest = (): Manifest => data.manifest.value!;
/** A data file's address, with the build in the query so a new build is fetched once and then cached. */
const fileUrl = (f: { file: string; built?: string }): string => `${DATA_URL}${f.file}?v=${encodeURIComponent(f.built || manifest().built || '')}`;

export async function loadManifest(): Promise<void> {
  const m: Manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
  data.manifest.value = m;
  app.feedInfo.value = m.feed ? { start: m.feed.start, end: m.feed.end, built: m.built } : null;
  if (m.built) {
    const b = live.ilParts(new Date(m.built)), two = (n: number) => String(n).padStart(2, '0');
    app.version.value = t('build', { v: `${two(b.m)}-${two(b.d)} ${two(b.h)}:${two(b.mi)}` });
  }
}
/** The service days the data covers, for the day pills; the chosen day stays if it is one of them. */
export function renderDays(): void {
  if (!data.manifest.value) return;
  search.days.value = manifest().days.map((d) => d.date);
  if (!search.days.value.includes(search.day.value)) search.day.value = data.dayInfo.value ? data.dayInfo.value.date : manifest().days[0].date;
}
/** The best service day to plan on right now: tonight's until 03:00, else today. */
export function startDay(): string {
  const svc = live.serviceDay();
  for (const d of [svc.day, calToday()]) if (manifest().days.some((x) => x.date === d)) return d;
  return manifest().days[0].date;
}
export const hasDay = (d: string): boolean => !!data.manifest.value && manifest().days.some((x) => x.date === d);

export async function loadDay(date: string): Promise<void> {
  const d = manifest().days.find((x) => x.date === date) || manifest().days[0];
  data.ttReady.value = false;
  search.busy.value = true;
  call('setLang', { lang: lang.value });   // names come back in the rider's language where the timetable carries them
  const info: { date: string; counts: { trips: number } } = await call('loadTimetable', { url: fileUrl(d) });
  data.dayInfo.value = info; data.ttReady.value = true; resetCaches(); map.resetLive();
  search.busy.value = false;
  map.loadStopsGeo(); map.refreshLiveMap();
  setStatus(t('ready', { trips: info.counts.trips.toLocaleString(), date: dayLabel(info.date) }));
  renderDays();
}
export async function loadPlaces(): Promise<void> {
  const f = manifest().places;
  if (data.plReady.value || !f) return;
  try {
    await call('loadPlaces', { url: fileUrl(f) });
    data.plReady.value = true;
    // a box with text in it searches again, now with addresses
    for (const side of ['from', 'to'] as const) if (!search.sides[side].value && search.texts[side].value.trim().length >= 2) document.getElementById(side + 'Q')?.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (e) { loadFailed(e); }
}
export async function loadShapes(): Promise<void> {
  const f = manifest().shapes;
  if (data.shReady.value || !f) return;
  try { await call('loadShapes', { url: fileUrl(f) }); data.shReady.value = true; } catch { /* straight lines between stops until then */ }
}
export async function loadStreets(): Promise<void> {
  const f = manifest().streets;
  if (data.stReady.value || !f) return;
  try { await call('loadStreets', { url: fileUrl(f) }); data.stReady.value = true; setStatus(t('readyStreets')); } catch (e) { loadFailed(e); }
}
// the bar's day pills ask for the day's timetable
search.hooks.dayChanged = (d) => { loadDay(d).catch(loadFailed); search.setDefaultTime(); };
search.hooks.startDay = () => (data.manifest.value ? startDay() : '');
