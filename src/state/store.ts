// Wayli on-device store: settings, recent and saved places, recent searches, favorites, the trip in
// progress. localStorage only: nothing here ever leaves the phone. Every write bumps `stored`: a view that shows
// what is kept here reads it, and draws again whatever wrote (no page has to be told).
// The records are typed here, where they are written; the imports of the app's shapes are type-only, so at run
// time the store depends on nothing of the app.
import { signal } from '@preact/signals';
import { savedTripKey, type PlanResult, type Query, type SavedTrip, type SavedStop, type View } from '../journey/types';
import type { ActiveTrip } from '../journey/follow.ts';

/** Bumped on every write to the store. */
export const stored = signal(0);

// ---- reading back: what the phone holds was written by this app, but maybe by an older version of it, or cut short;
// every record is checked for the shape the app reads before it is handed out, and one that fails reads as nothing
// kept (a list keeps the items that pass). The checks look at what the readers rely on, not at every field.
type Check<T> = (v: unknown) => v is T;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v != null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown): boolean => v == null || isNum(v);
const isPlace = (v: unknown): v is StoredPlace =>
  isObj(v) &&
  isStr(v.name) &&
  optNum(v.lat) &&
  optNum(v.lon) &&
  (v.stops == null || (Array.isArray(v.stops) && v.stops.every(isNum)));
const isAt = (v: unknown): boolean => isObj(v) && isStr(v.name) && isNum(v.lat) && isNum(v.lon);
const isJourney = (v: unknown): boolean =>
  isObj(v) &&
  isNum(v.depart) &&
  isNum(v.arrive) &&
  Array.isArray(v.legs) &&
  v.legs.every((l) => isObj(l) && isStr(l.type));
const isQuery = (v: unknown): boolean => isObj(v) && isPlace(v.from) && isPlace(v.to) && isStr(v.day);
const isView = (v: unknown): v is View => {
  if (!isObj(v)) return false;
  if (v.type === 'line') return isStr(v.ref) || isNum(v.ref);
  if (v.type === 'stop') return isStr(v.name) && isNum(v.lat) && isNum(v.lon);
  if (v.type === 'station') return isAt(v);
  if (v.type === 'trains') return isAt(v.from) && isAt(v.to);
  if (v.type === 'trip') return isQuery(v.q) && isJourney(v.j);
  return false;
};
/** The items of a list that pass: one damaged entry does not cost the rider the rest. */
const keepItems = <T>(l: T[], item: (v: unknown) => boolean): T[] => l.filter((x) => item(x));

function get<T>(k: string, d: T, ok: Check<T>): T {
  try {
    const raw = localStorage.getItem(k);
    if (raw == null) return d;
    const v: unknown = JSON.parse(raw);
    return ok(v) ? v : d;
  } catch {
    return d;
  }
}
/** A list kept under `k`, with only the items that pass. */
const getList = <T>(k: string, item: (v: unknown) => boolean): T[] =>
  keepItems(
    get<T[]>(k, [], (v): v is T[] => Array.isArray(v)),
    item,
  );
/** Write a record; `notify` false for one no page shows from the store (the trip in progress: its screen has signals
 *  of its own), so a write every few seconds does not redraw the saved and recent lists. */
function set(k: string, v: unknown, notify = true): void {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked or full: the app goes on without remembering */
  }
  if (notify) stored.value++;
}

/** The settings. `map` and `theme`: 'light' | 'dark' | 'system' (the old map value 'auto' reads as 'system');
 *  `mapTint`: 'teal' | 'neutral'; `lang` null follows the phone; `lookSplit` once the look was split into its parts. */
export type Settings = {
  map: string;
  theme: string;
  live: boolean;
  traffic: boolean;
  notify: boolean;
  sound: boolean;
  maxWalk: number;
  recentN: number;
  lang: 'he' | 'en' | null;
  fDirect: boolean;
  fTrain: boolean;
  mapTint: string;
  terrain: boolean;
  stopFilter: string;
  lookSplit?: boolean;
};
const DEFAULTS: Settings = {
  map: 'system',
  theme: 'system',
  live: true,
  traffic: true,
  notify: true,
  sound: true,
  maxWalk: 15,
  recentN: 10,
  lang: null,
  fDirect: false,
  fTrain: false,
  mapTint: 'teal',
  terrain: false,
  stopFilter: 'all',
};
export const settings = {
  get(): Settings {
    const kept = get<Record<string, unknown>>('wayli-settings', {}, isObj);
    // each setting as kept only when it has the default's type (lang: a language or null)
    const out: Record<string, unknown> = { ...DEFAULTS };
    for (const [k, v] of Object.entries(kept)) {
      const d = (DEFAULTS as Record<string, unknown>)[k];
      if (k === 'lang' ? v === null || v === 'he' || v === 'en' : d === undefined || typeof v === typeof d) out[k] = v;
    }
    return out as Settings;
  },
  set(patch: Partial<Settings>): Settings {
    const s = { ...this.get(), ...patch };
    set('wayli-settings', s);
    return s;
  },
};

/** A place as the store keeps it: the name and the point, a station's stops and platforms; nothing transient. */
export type StoredPlace = {
  name: string;
  lat?: number | null;
  lon?: number | null;
  stops?: number[];
  platforms?: number;
};
/** What may go in: the planner's Place qualifies; a transient one ("my location") is not kept. */
type PlaceIn = StoredPlace & { transient?: boolean };
/** Two places are the same within ~30 m or by name. */
const samePlace = (a: StoredPlace, b: StoredPlace): boolean =>
  a.name === b.name ||
  (a.lat != null &&
    b.lat != null &&
    Math.abs(a.lat - b.lat) < 3e-4 &&
    Math.abs((a.lon ?? NaN) - (b.lon ?? NaN)) < 3e-4);
/** How many of each kind of recent thing are kept (a setting): places, searches, ways opened, lines, stops. */
export const RECENT_CHOICES = [5, 10, 20, 40];
export const recentKeep = (): number => {
  const n = +settings.get().recentN;
  return RECENT_CHOICES.includes(n) ? n : 10;
};
const slim = (p: StoredPlace): StoredPlace => ({
  name: p.name,
  lat: p.lat,
  lon: p.lon,
  stops: p.stops || undefined,
  platforms: p.platforms || undefined,
});

export type RecentPlace = StoredPlace & { at: number };
const isRecentPlace = (v: unknown): boolean => isPlace(v) && isNum((v as { at?: unknown }).at);
export const recentPlaces = {
  list(): RecentPlace[] {
    return getList<RecentPlace>('wayli-recent-places', isRecentPlace);
  },
  add(p: PlaceIn | null | undefined): void {
    if (!p || p.transient) return;
    const l = this.list().filter((x) => !samePlace(x, p));
    l.unshift({ ...slim(p), at: Date.now() });
    set('wayli-recent-places', l.slice(0, recentKeep()));
  },
  remove(p: StoredPlace): void {
    set(
      'wayli-recent-places',
      this.list().filter((x) => !samePlace(x, p)),
    );
  },
  clear(): void {
    set('wayli-recent-places', null);
  },
};

/** A trip as the rider would ask it again: the two places, the bicycle choice, and when and for when it was asked
 *  (`at` the moment it was asked, `day` and `time` the day and time it was for). */
export type RecentTrip = {
  from: StoredPlace;
  to: StoredPlace;
  bike: string;
  folding: boolean;
  at: number;
  day: string;
  time: string;
  arriveBy: boolean;
};
const isRecentTrip = (v: unknown): boolean =>
  isObj(v) && isPlace(v.from) && isPlace(v.to) && isStr(v.day) && isStr(v.time) && isNum(v.at);
/** What names a trip in the recent and saved lists (journey/types.ts). */
export const tripKey = savedTripKey;
// a trip from a place to the same place (my location to my location) is no trip to keep
const sameEnds = (x: { from?: { name: string } | null; to?: { name: string } | null }): boolean =>
  !!(x.from && x.to && x.from.name === x.to.name);
export const recentTrips = {
  list(): RecentTrip[] {
    return getList<RecentTrip>('wayli-recent-trips', isRecentTrip).filter((x) => !sameEnds(x));
  },
  add(q: Query): void {
    if (sameEnds(q)) return;
    const l = this.list().filter((x) => tripKey(x) !== tripKey(q));
    l.unshift({
      from: slim(q.from),
      to: slim(q.to),
      bike: q.bike,
      folding: !!q.folding,
      at: Date.now(),
      day: q.day,
      time: q.at,
      arriveBy: !!q.arriveBy,
    });
    set('wayli-recent-trips', l.slice(0, recentKeep()));
  },
  clear(): void {
    set('wayli-recent-trips', null);
  },
};

/**
 * What was opened, newest first: a line, a stop, a train station, the trains between two stations, a trip. Kept by
 * what names it in the feed (route id, the number on a stop's sign, positions), since the timetable's own numbers
 * change from day to day; a trip keeps the journey itself and the build it came from.
 */
function viewKey(v: View): string {
  if (v.type === 'line') return `line:${v.ref}`;
  if (v.type === 'stop') return `stop:${v.code || `${v.lat},${v.lon}`}`;
  if (v.type === 'station') return `station:${v.name}`;
  if (v.type === 'trains') return `trains:${v.from.name}|${v.to.name}`;
  return `trip:${v.q.from.name}|${v.q.to.name}|${v.q.day}|${v.j.depart}`;
}
// the kept number of each kind (a way opened carries its whole journey: at most 20 of those)
function capViews(l: View[]): View[] {
  const n = recentKeep(),
    seen = { trip: 0, line: 0, stop: 0 };
  const kind = (x: View): 'trip' | 'line' | 'stop' => (x.type === 'trip' || x.type === 'line' ? x.type : 'stop');
  return l.filter((x) => {
    const k = kind(x);
    return ++seen[k] <= (k === 'trip' ? Math.min(n, 20) : n);
  });
}
/** The setting lowered: every list cut to it now. */
export function trimRecents(): void {
  const n = recentKeep();
  set('wayli-recent-places', recentPlaces.list().slice(0, n));
  set('wayli-recent-trips', getList<RecentTrip>('wayli-recent-trips', isRecentTrip).slice(0, n));
  set('wayli-recent-views', capViews(recentViews.list()));
}
export const recentViews = {
  list(): View[] {
    return getList<View>('wayli-recent-views', isView);
  },
  add(v: View): void {
    const k = viewKey(v);
    let l = this.list().filter((x) => viewKey(x) !== k);
    l.unshift({ ...v, at: Date.now() });
    set('wayli-recent-views', capViews(l));
  },
  clear(): void {
    set('wayli-recent-views', null);
  },
};

/** Home, work, and the rest of the saved places. */
export type SavedPlaces = { home: StoredPlace | null; work: StoredPlace | null; more: StoredPlace[] };
export type SavedSlot = keyof SavedPlaces;
export const savedPlaces = {
  get(): SavedPlaces {
    const s = get<Record<string, unknown>>('wayli-saved-places', {}, isObj);
    return {
      home: isPlace(s.home) ? s.home : null,
      work: isPlace(s.work) ? s.work : null,
      more: Array.isArray(s.more) ? keepItems(s.more, isPlace) : [],
    };
  },
  set(slot: 'home' | 'work', p: StoredPlace | null): void {
    const s = this.get();
    s[slot] = p ? slim(p) : null;
    set('wayli-saved-places', s);
  },
  add(p: StoredPlace): void {
    const s = this.get();
    if (!s.more.some((x) => samePlace(x, p))) s.more.push(slim(p));
    set('wayli-saved-places', s);
  },
  remove(p: StoredPlace): void {
    const s = this.get();
    s.more = s.more.filter((x) => !samePlace(x, p));
    set('wayli-saved-places', s);
  },
  has(p: StoredPlace): boolean {
    const s = this.get();
    return !!(
      (s.home && samePlace(s.home, p)) ||
      (s.work && samePlace(s.work, p)) ||
      s.more.some((x) => samePlace(x, p))
    );
  },
  all(): (StoredPlace & { slot: SavedSlot })[] {
    const s = this.get();
    const out: (StoredPlace & { slot: SavedSlot })[] = [];
    if (s.home) out.push({ slot: 'home', ...s.home });
    if (s.work) out.push({ slot: 'work', ...s.work });
    for (const m of s.more) out.push({ slot: 'more', ...m });
    return out;
  },
};

/** What a star keeps, by kind: a trip, a line (as the view that reopens it), a stop (with its first lines). */
export type FavValue = { trips: SavedTrip; lines: View; stops: SavedStop };
export type FavKind = keyof FavValue;
const FAV_CHECK: Record<FavKind, (v: unknown) => boolean> = {
  trips: (v) => isObj(v) && isPlace(v.from) && isPlace(v.to),
  lines: isView,
  stops: (v) => isObj(v) && isNum(v.stop) && isStr(v.name) && isNum(v.lat) && isNum(v.lon),
};
export const favs = {
  get<K extends FavKind>(kind: K): Record<string, FavValue[K]> {
    const all = get<Record<string, unknown>>('wayli-fav-' + kind, {}, isObj);
    const ok = FAV_CHECK[kind];
    return Object.fromEntries(Object.entries(all).filter(([, v]) => ok(v))) as Record<string, FavValue[K]>;
  },
  toggle<K extends FavKind>(kind: K, key: string, value: FavValue[K]): boolean {
    const f = this.get(kind);
    if (f[key]) delete f[key];
    else f[key] = value;
    set('wayli-fav-' + kind, f);
    return !!f[key];
  },
  has(kind: FavKind, key: string): boolean {
    return !!this.get(kind)[key];
  },
};

/** The last search and its answer, so reopening the app shows it again and can re-plan it; `dismissed` once the
 *  rider cleared it. */
export type LastSearch = { q: Query; result?: PlanResult; at: number; dismissed?: boolean };
const isLast = (v: unknown): v is LastSearch =>
  isObj(v) &&
  isQuery(v.q) &&
  isNum(v.at) &&
  (v.result == null || (isObj(v.result) && Array.isArray(v.result.journeys) && v.result.journeys.every(isJourney)));
export const lastSearch = {
  get(): LastSearch | null {
    return get<LastSearch | null>('wayli-last', null, isLast);
  },
  set(v: LastSearch): void {
    set('wayli-last', v);
  },
  clear(): void {
    set('wayli-last', null);
  },
};

const isActive = (v: unknown): v is ActiveTrip =>
  isObj(v) &&
  isJourney(v.journey) &&
  isObj(v.q) &&
  isPlace(v.q.from) &&
  isPlace(v.q.to) &&
  isStr(v.day) &&
  isObj(v.state) &&
  isNum(v.state.step) &&
  isNum(v.state.rideIdx);
/** The trip being followed: the journey, its query, the day and the follower's state. */
export const activeTrip = {
  get(): ActiveTrip | null {
    return get<ActiveTrip | null>('wayli-active', null, isActive);
  },
  set(v: ActiveTrip): void {
    set('wayli-active', v, false);
  },
  clear(): void {
    set('wayli-active', null, false);
  },
};
