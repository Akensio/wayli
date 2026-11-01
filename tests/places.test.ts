// The address book's search (src/engine/places.ts) on a tiny book in the real file format: a name found as typed
// first, then spelt another way or with one slip, and nothing loose that a short word could reach by chance.
import { test, expect } from 'vitest';
import { parsePlaces, searchPlaces } from '../src/engine/places.ts';
import { writeContainer } from './tinytt.ts';

const TLV = 'תל אביב יפו';
// [name, city, lat, lon, English name]
const streets = [
  ['דיזנגוף', TLV, 32.078, 34.774, 'Dizengoff'],
  ['רוטשילד', TLV, 32.064, 34.774, 'Rothschild'],
  ['קפלן', TLV, 32.073, 34.787, 'Kaplan'],
  ['רביבים', TLV, 32.1, 34.8, ''],
];
// [name, kind, city, lat, lon, English name]
const pois = [
  ['ארומה', 'amenity=cafe', TLV, 32.075, 34.78, ''],
  ['מגדלי עזריאלי', 'tourism=attraction', TLV, 32.074, 34.792, 'Azrieli Towers'],
  ["מקדונלד'ס", 'amenity=fast_food', TLV, 32.07, 34.78, ''],
  ['בי"ח איכילוב', 'amenity=hospital', TLV, 32.08, 34.789, ''],
  ['פורט סעיד', 'amenity=bar', TLV, 32.064, 34.772, 'Port Said'],
  ['שוק הכרמל', 'amenity=marketplace', TLV, 32.068, 34.768, ''],
  ['Benedict', 'amenity=restaurant', TLV, 32.071, 34.789, 'Benedict'], // named only in English (from Overture)
  ['מיזנון', 'amenity=restaurant', TLV, 32.076, 34.781, ''],
  ['מוזיאון תל אביב', 'tourism=museum', TLV, 32.077, 34.787, ''],
  ['מלון כנען ספא', 'tourism=hotel', 'צפת', 32.97, 35.5, ''],
  ['קניון לב צפת', 'shop=mall', 'צפת', 32.965, 35.497, ''],
  ['מלון כנען ספא - canaan spa hotel', 'tourism=hotel', 'צפת', 32.977, 35.507, ''], // both languages in one name
];
const cities = [
  [TLV, 32.08, 34.78, 'Tel Aviv-Yafo'],
  ['סעד', 31.47, 34.53, "Sa'ad"],
  ['כרמיאל', 32.92, 35.3, 'Karmiel'],
  ['צפת', 32.962, 35.505, 'Safed'],
];
const book = parsePlaces(
  writeContainer({ format: 4, counts: { streets: 4, addresses: 0, pois: 12, cities: 4 }, streets, pois, cities }, [
    { name: 'addrStreet', dtype: 'int32', data: [] },
    { name: 'addrNumber', dtype: 'uint16', data: [] },
    { name: 'addrLat', dtype: 'float32', data: [] },
    { name: 'addrLon', dtype: 'float32', data: [] },
  ]),
);
const top = (q: string) => searchPlaces(book, q, 3, null, 'he')[0]?.name ?? null;

test('found as typed, as before', () => {
  expect(top('דיזנגוף')).toBe('דיזנגוף');
  expect(top('ארומה')).toBe('ארומה');
  expect(top('dizengoff')).toBe('דיזנגוף');
});

test('the same name spelt another way', () => {
  expect(top('עזראלי')).toBe('מגדלי עזריאלי'); // a letter of the Hebrew spelling left out
  expect(top('אזריאלי')).toBe('מגדלי עזריאלי'); // א for ע
  expect(top('רוטשלד')).toBe('רוטשילד');
  expect(top('קאפלן')).toBe('קפלן');
  expect(top('rotshild')).toBe('רוטשילד'); // the t before sh is not ts
});

test('one slip', () => {
  expect(top('ארומא')).toBe('ארומה'); // the written word one letter off ranks above names that only share consonants
  expect(top('מקדולנדס')).toBe("מקדונלד'ס"); // two letters swapped
  expect(top('דיזנגוב')).toBe('דיזנגוף');
});

test('abbreviations either way', () => {
  expect(top('בית חולים איכילוב')).toBe('בי"ח איכילוב');
  expect(top('ביח איכילוב')).toBe('בי"ח איכילוב');
});

test('every word said by sound, and a trailing word that only sounds like a city is not one', () => {
  expect(top('port said')).toBe('פורט סעיד'); // not Sa'ad
  expect(top('shuk hacarmel')).toBe('שוק הכרמל'); // not Karmiel
});

test('a name found as typed lists before one found loosely', () => {
  const hits = searchPlaces(book, 'רביבים', 5, null, 'he').map((h) => h.name);
  expect(hits[0]).toBe('רביבים');
});

test('short words get no loose match', () => {
  expect(searchPlaces(book, 'קפ', 5, null, 'he').map((h) => h.name)).toEqual(['קפלן']); // only the start, as typed
});

test('a Latin word finds a Hebrew name by sound (miznon), but an English-only name only by its English', () => {
  expect(top('miznon')).toBe('מיזנון'); // two separate n's: not the museum, whose ו and י drop to leave one
  expect(searchPlaces(book, 'בנדיקט', 5, null, 'he').map((h) => h.name)).not.toContain('Benedict'); // no transliteration
});

test('English to English: exact, also inside a two-language name, and with typos as search engines allow', () => {
  expect(top('benedict')).toBe('Benedict');
  expect(top('bendict')).toBe('Benedict'); // one letter missing
  expect(top('benedcit')).toBe('Benedict'); // two swapped
  expect(top('canaan spa hotel')).toBe('מלון כנען ספא - canaan spa hotel'); // English inside the main name
  expect(top('canan spa')).toBe('מלון כנען ספא - canaan spa hotel'); // and with a typo
  expect(searchPlaces(book, 'bx', 5, null, 'he')).toEqual([]); // two letters: no typos allowed
});

test('two passes give what one would: the loose pass only fills what the exact one leaves', () => {
  expect(searchPlaces(book, 'מוזיאון', 5, null, 'he').map((h) => h.name)[0]).toBe('מוזיאון תל אביב');
});

test('a letter dropped as a vowel keeps its neighbours apart, and a vav is silent only where the Latin has a vowel for it', () => {
  expect(top('knaan spa')).toMatch(/^מלון כנען ספא/); // כנען keeps both nuns, as "knaan" does (either record)
  const inSafed = searchPlaces(book, 'knaan safed', 5, null, 'he').map((h) => h.name);
  expect(inSafed).toContain('מלון כנען ספא');
  expect(inSafed).not.toContain('קניון לב צפת'); // קניון's ו is a consonant for "knaan"
  expect(top('kanyon lev')).toBe('קניון לב צפת'); // and silent for "kanyon"
});
