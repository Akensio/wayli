// The on-device store (src/state/store.ts) reads back only what has the shape the app reads: a record from an older
// version, or one cut short, reads as nothing kept, and a list keeps the items that pass.
import { test, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const store = await import('../src/state/store.ts');
const put = (k: string, v: unknown) => mem.set(k, typeof v === 'string' ? v : JSON.stringify(v));
beforeEach(() => mem.clear());

test('a list keeps the items that pass and drops the rest', () => {
  put('wayli-recent-places', [
    { name: 'Dizengoff Center', lat: 32.075, lon: 34.775, at: 1 },
    { name: 42, lat: 1, lon: 2, at: 2 }, // a name that is not text
    'not a place',
    { name: 'Azrieli', lat: 32.074, lon: 34.792, at: 3 },
  ]);
  expect(store.recentPlaces.list().map((p) => p.name)).toEqual(['Dizengoff Center', 'Azrieli']);
});

test('text that is not JSON, or a record of the wrong kind, reads as nothing kept', () => {
  put('wayli-recent-views', '{cut sh');
  expect(store.recentViews.list()).toEqual([]);
  put('wayli-last', { q: { from: { name: 'a' } }, at: 1 }); // a query without its To place or day
  expect(store.lastSearch.get()).toBeNull();
  put('wayli-active', { journey: { legs: 'x' } });
  expect(store.activeTrip.get()).toBeNull();
  put('wayli-saved-places', [1, 2]);
  expect(store.savedPlaces.get()).toEqual({ home: null, work: null, more: [] });
});

test('a setting of the wrong type falls back to its default; the others are kept', () => {
  put('wayli-settings', { maxWalk: '15', live: false, lang: 'fr', recentN: 20 });
  const s = store.settings.get();
  expect(s.maxWalk).toBe(15); // the default, not the text
  expect(s.live).toBe(false);
  expect(s.lang).toBeNull();
  expect(s.recentN).toBe(20);
});

test('saved places keep home and the good ones of the rest', () => {
  put('wayli-saved-places', {
    home: { name: 'Home', lat: 32, lon: 34.8 },
    work: { lat: 1 },
    more: [{ name: 'Gym' }, null],
  });
  expect(store.savedPlaces.get()).toEqual({
    home: { name: 'Home', lat: 32, lon: 34.8 },
    work: null,
    more: [{ name: 'Gym' }],
  });
});

test('stars keep the entries of their kind that pass', () => {
  put('wayli-fav-stops', {
    'stop:1': { stop: 1, name: 'Weizmann', lat: 32, lon: 34.8 },
    'stop:2': { stop: 'two' },
  });
  expect(Object.keys(store.favs.get('stops'))).toEqual(['stop:1']);
});

test('what the app writes, it reads back whole', () => {
  store.recentTrips.add({
    from: { name: 'A', lat: 32, lon: 34.8 },
    to: { name: 'B', lat: 32.1, lon: 34.9 },
    day: '20261031',
    at: '08:00',
    bike: 'none',
    folding: false,
    arriveBy: false,
  });
  expect(store.recentTrips.list().map((t) => [t.from.name, t.to.name, t.time])).toEqual([['A', 'B', '08:00']]);
});
