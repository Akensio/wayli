// One language on screen (docs/principles.md, rule 3): in English, no name helper hands out Hebrew letters, whatever
// the data lacks; the app's own strings in English carry none either. src/engine/latin.ts is the last resort.
import { test, expect } from 'vitest';
import { inLatin, latinWord, hasHebrew } from '../src/engine/latin';
import { STR } from '../src/common/i18n';
import { stopName, stationName, cityName, routeHeadsign } from '../src/engine/raptor.ts';
import { parsePlaces, searchPlaces, reverseGeocode } from '../src/engine/places.ts';
import { tinyTimetable, writeContainer } from './tinytt.ts';

test('a Hebrew word by rule, a mixed string word by word, and nothing else touched', () => {
  // the same words as pipeline/english.py translit gives them (the build's third layer; checked against it 2026-11-06)
  for (const [he, en] of [
    ['פיטר', 'Piter'],
    ['הרצל', 'HaRetzel'], // a guess, readable: the real spelling comes from the data
    ['ארלוזורוב', 'Arlozorov'],
    ['ויצמן', 'Vitzman'],
    ['חיים', 'Chayim'],
    ['רפואה', 'Rfoa'],
    ['איתן', 'Iten'],
    ['וייס', 'Vais'],
  ])
    expect(latinWord(he)).toBe(en);
  expect(inLatin("ת. רק''ל אלנבי/יהודה הלוי")).toBe('T. Rekel Alnavi/Yhoda HaLoy'); // a mixed string, word by word
  expect(inLatin('Dizengoff 50')).toBe('Dizengoff 50'); // nothing to do
  expect(inLatin('')).toBe('');
  expect(hasHebrew(inLatin('בית ספר ברנקו וייס 12'))).toBe(false);
});

test("the app's own English strings carry no Hebrew", () => {
  const bad = Object.entries(STR).filter(
    ([, v]) => Array.isArray(v) && typeof v[1] === 'string' && hasHebrew(v[1] as string),
  );
  expect(bad.map(([k]) => k)).toEqual([]);
});

test('the timetable names in English never carry Hebrew, translated or not', () => {
  const tt = tinyTimetable({
    stops: [
      { name: 'ארלוזורוב', lat: 32.0816, lon: 34.7965, city: 'תל אביב יפו' },
      { name: 'אבא הלל', lat: 32.0831, lon: 34.8036, city: 'רמת גן' },
    ],
    routes: [{ short: '1', long: 'אלנבי<->קרית אריה-1#', type: 0 }],
    patterns: [{ route: 0, stops: [0, 1], trips: [[36000, 36120]] }],
  });
  for (let s = 0; s < tt.stops.length; s++) expect(hasHebrew(stopName(tt, s, 'en'))).toBe(false);
  for (let p = 0; p < tt.stations.length; p++) expect(hasHebrew(stationName(tt, p, 'en'))).toBe(false);
  for (const s of tt.stops) expect(hasHebrew(cityName(tt, s[3], 'en'))).toBe(false);
  for (let r = 0; r < tt.routes.length; r++) expect(hasHebrew(routeHeadsign(tt, r, 'en'))).toBe(false);
  // and in Hebrew the feed's own names stand
  expect(stopName(tt, 0, 'he')).toBe(tt.stops[0][1]);
});

test('the address book names in English never carry Hebrew, even for entries the book has no English for', () => {
  const TLV = 'תל אביב יפו';
  const book = parsePlaces(
    writeContainer(
      {
        format: 4,
        counts: { streets: 1, addresses: 0, pois: 2, cities: 1 },
        streets: [['יהודה הלוי', TLV, 32.062, 34.774, '']],
        pois: [
          ['חומוס פיטר', 'amenity=restaurant', TLV, 32.0505, 34.7575, ''],
          ['פארק המסילה', 'leisure=park', TLV, 32.06, 34.767, 'Park HaMesilah'],
        ],
        cities: [[TLV, 32.08, 34.78, '']],
      },
      [
        { name: 'addrStreet', dtype: 'int32', data: [] },
        { name: 'addrNumber', dtype: 'uint16', data: [] },
        { name: 'addrLat', dtype: 'float32', data: [] },
        { name: 'addrLon', dtype: 'float32', data: [] },
      ],
    ),
  );
  for (const q of ['חומוס פיטר', 'יהודה הלוי', 'פארק המסילה', 'תל אביב'])
    for (const h of searchPlaces(book, q, 5, null, 'en')) {
      expect(hasHebrew(h.name)).toBe(false);
      expect(hasHebrew(h.city)).toBe(false);
    }
  const r = reverseGeocode(book, 32.0505, 34.7575, 'en');
  expect(r && hasHebrew(r.name + r.city)).toBe(false);
});
