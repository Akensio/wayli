// Wayli on-device store: settings, recent and saved places, recent searches, favorites, the trip in
// progress. localStorage only: nothing here ever leaves the phone.

const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const DEFAULTS = { map: 'system', theme: 'system', live: true, traffic: true, notify: true, sound: true, maxWalk: 15, lang: null, resultSort: 'depart', fDirect: false, fTrain: false, mapTint: 'teal' };   // mapTint: 'teal' | 'neutral'   // map and theme: 'light' | 'dark' | 'system' (the old map value 'auto' reads as 'system')
export const settings = {
  get() { return { ...DEFAULTS, ...get('wayli-settings', {}) }; },
  set(patch) { const s = { ...this.get(), ...patch }; set('wayli-settings', s); return s; },
};

/** A place as the planner takes it: {name, lat, lon, stops?}. Two places are the same within ~30 m or by name. */
const samePlace = (a, b) => a.name === b.name || (a.lat != null && b.lat != null && Math.abs(a.lat - b.lat) < 3e-4 && Math.abs(a.lon - b.lon) < 3e-4);
const slim = (p) => ({ name: p.name, lat: p.lat, lon: p.lon, stops: p.stops || undefined, platforms: p.platforms || undefined });

export const recentPlaces = {
  list() { return get('wayli-recent-places', []); },
  add(p) {
    if (!p || p.transient) return;
    const l = this.list().filter((x) => !samePlace(x, p));
    l.unshift({ ...slim(p), at: Date.now() });
    set('wayli-recent-places', l.slice(0, 10));
  },
  remove(p) { set('wayli-recent-places', this.list().filter((x) => !samePlace(x, p))); },
  clear() { set('wayli-recent-places', null); },
};

export const recentTrips = {
  list() { return get('wayli-recent-trips', []); },
  add(q) {
    const key = (x) => `${x.from.name}|${x.to.name}|${x.bike}|${x.folding ? 'f' : ''}`;
    const l = this.list().filter((x) => key(x) !== key(q));
    l.unshift({ from: slim(q.from), to: slim(q.to), bike: q.bike, folding: !!q.folding, at: Date.now(), day: q.day, time: q.at, arriveBy: !!q.arriveBy });
    set('wayli-recent-trips', l.slice(0, 8));
  },
  clear() { set('wayli-recent-trips', null); },
};

/**
 * What was opened, newest first: a line, a stop, a train station, the trains between two stations, a trip. Kept by
 * what names it in the feed (route id, the number on a stop's sign, positions), since the timetable's own numbers
 * change from day to day; a trip keeps the journey itself and the build it came from.
 */
const viewKey = (v) => v.type === 'line' ? `line:${v.ref}` : v.type === 'stop' ? `stop:${v.code || `${v.lat},${v.lon}`}` : v.type === 'station' ? `station:${v.name}`
  : v.type === 'trains' ? `trains:${v.from.name}|${v.to.name}` : `trip:${v.q.from.name}|${v.q.to.name}|${v.q.day}|${v.j.depart}`;
export const recentViews = {
  list() { return get('wayli-recent-views', []); },
  add(v) {
    const k = viewKey(v);
    let l = this.list().filter((x) => viewKey(x) !== k);
    l.unshift({ ...v, at: Date.now() });
    // trips carry their journey: a few of them, among up to 30 entries
    let trips = 0;
    l = l.filter((x) => x.type !== 'trip' || ++trips <= 6);
    set('wayli-recent-views', l.slice(0, 30));
  },
  clear() { set('wayli-recent-views', null); },
};

export const savedPlaces = {
  get() { return { home: null, work: null, more: [], ...get('wayli-saved-places', {}) }; },
  set(slot, p) { const s = this.get(); s[slot] = p ? slim(p) : null; set('wayli-saved-places', s); },
  add(p) { const s = this.get(); if (!s.more.some((x) => samePlace(x, p))) s.more.push(slim(p)); set('wayli-saved-places', s); },
  remove(p) { const s = this.get(); s.more = s.more.filter((x) => !samePlace(x, p)); set('wayli-saved-places', s); },
  has(p) { const s = this.get(); return (s.home && samePlace(s.home, p)) || (s.work && samePlace(s.work, p)) || s.more.some((x) => samePlace(x, p)); },
  all() { const s = this.get(); const out = []; if (s.home) out.push({ slot: 'home', ...s.home }); if (s.work) out.push({ slot: 'work', ...s.work }); for (const m of s.more) out.push({ slot: 'more', ...m }); return out; },
};

export const favs = {
  get(kind) { return get('wayli-fav-' + kind, {}); },
  toggle(kind, key, value) { const f = this.get(kind); if (f[key]) delete f[key]; else f[key] = value; set('wayli-fav-' + kind, f); return !!f[key]; },
  has(kind, key) { return !!this.get(kind)[key]; },
};

/** The last search and its answer, so reopening the app shows it again and can re-plan it. */
export const lastSearch = {
  get() { return get('wayli-last', null); },
  set(v) { set('wayli-last', v); },
  clear() { set('wayli-last', null); },
};

/** The trip being followed: the journey, its query, the day and the follower's state. */
export const activeTrip = {
  get() { return get('wayli-active', null); },
  set(v) { set('wayli-active', v); },
  clear() { set('wayli-active', null); },
};
