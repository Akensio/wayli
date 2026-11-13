// The search box, asked the way the app asks it: the data worker's `search` (and the Stop tab's `stopGroups`) over a
// small world in the real file formats, loaded as the app loads it (the timetable, the address book, then the
// catalogue as the nightly build writes it), with the language the app is in and where the rider is. Each test is a
// thing a rider typed and what they must see for it.
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { parsePlaces } from '../src/engine/places.ts';
import { buildCatalogue, catalogueFile, readCatalogue } from '../src/engine/catalogue.ts';
import type { SearchHit } from '../src/worker/ops.ts';
import { tinyContainer, tinyTimetable, writeContainer, T, type TinySpec } from './tinytt.ts';

const TLV = 'תל אביב יפו';
const DIZENGOFF_CENTER = { lat: 32.0775, lon: 34.7745 },
  HAIFA = { lat: 32.793, lon: 35.037 };
// [name, city, lat, lon, English name], and the house numbers each street has
const streets: [string, string, number, number, string, number[]][] = [
  ['דיזנגוף', TLV, 32.078, 34.774, 'Dizengoff', [50, 99]],
  ['דיזנגוף', 'נתניה', 32.33, 34.856, 'Dizengoff', [50]],
  ['שדרות רוטשילד', TLV, 32.064, 34.774, 'Rothschild Boulevard', [1, 22]],
  ['חביבה רייך', 'בת ים', 32.017, 34.75, 'Haviva Reich', [2, 4, 6]],
  ['הרצל', TLV, 32.06, 34.77, 'Herzl', [16]],
  ['הרצל', 'חיפה', 32.81, 35.0, 'Herzl', [16]],
  ['ירושלים', TLV, 32.05, 34.757, 'Jerusalem', []], // a street named after a city
  ['יפו', 'ירושלים', 31.783, 35.218, 'Jaffa', [23]],
  ['ויצמן', 'רחובות', 31.894, 34.811, 'Weizmann', []], // the same street twice in the data, one with its numbers
  ['חיים ויצמן', 'רחובות', 31.895, 34.812, 'Haim Weizmann', [2]],
];
// [name, kind, city, lat, lon, English name]
const pois: [string, string, string, number, number, string][] = [
  ['פארק המסילה', 'leisure=park', TLV, 32.06, 34.767, 'Park HaMesilah'],
  ['המסילה', 'amenity=cafe', 'הרצליה', 32.165, 34.845, 'HaMesila'],
  ['פארק המסילה', 'leisure=park', 'ירושלים', 31.762, 35.219, 'Park HaMesilah'],
  ['כניסה א', 'amenity=parking_entrance', TLV, 32.0776, 34.7746, 'Entrance A'], // beside the rider, and nothing asked for
  ['The Bloc TLV', 'leisure=sports_centre', TLV, 32.0514, 34.7727, 'The Bloc TLV'], // named in Latin letters only
  ['The Block', 'amenity=nightclub', TLV, 32.056, 34.78, 'The Block'],
  ['Black Hole', 'shop=books', TLV, 32.066, 34.771, 'Black Hole'],
  ['דיזנגוף סנטר', 'shop=mall', TLV, 32.0753, 34.7748, 'Dizengoff Center'],
  ['שוק הכרמל', 'amenity=marketplace', TLV, 32.068, 34.768, 'Carmel Market'],
  ['בי"ח איכילוב', 'amenity=hospital', TLV, 32.08, 34.789, 'Ichilov Hospital'],
  ['נמל תל אביב', 'tourism=attraction', TLV, 32.097, 34.773, 'Tel Aviv Port'],
  ['נמל יפו', 'tourism=attraction', TLV, 32.052, 34.75, 'Jaffa Port'],
  ['חוף תל ברוך', 'natural=beach', TLV, 32.118, 34.781, 'Tel Baruch Beach'], // a תל that is not the city's
  ['אבו חסן', 'amenity=restaurant', TLV, 32.049, 34.757, 'Abu Hassan'],
  ['שרונה מרקט', 'amenity=marketplace', TLV, 32.071, 34.787, 'Sarona Market'],
];
const cities: [string, number, number, string][] = [
  [TLV, 32.08, 34.78, 'Tel Aviv-Yafo'],
  ['ירושלים', 31.78, 35.22, 'Jerusalem'],
  ['חיפה', 32.8, 35.0, 'Haifa'],
  ['בת ים', 32.02, 34.75, 'Bat Yam'],
  ['נתניה', 32.33, 34.86, 'Netanya'],
  ['רחובות', 31.89, 34.81, 'Rehovot'],
  ['הרצליה', 32.16, 34.84, 'Herzliya'],
  ['שרונה', 32.72, 35.47, 'Sharona'], // a village with the name of a place in Tel Aviv
];
// a city is as much a city as it is big (find.ts): the two big ones get the thousands of entries real ones have
for (const [city, lat, lon] of [
  [TLV, 32.07, 34.78],
  ['ירושלים', 31.78, 35.21],
] as const)
  for (let i = 0; i < 3200; i++) streets.push([`מגרש ${1000 + i}`, city, lat + (i % 80) * 1e-4, lon, '', []]);
const addresses = streets.flatMap((s, i) => s[5].map((n, k) => ({ street: i, n, lat: s[2] + k * 1e-4, lon: s[3] })));
const bookFile = (hash: string): ArrayBuffer =>
  writeContainer(
    {
      format: 4,
      hash,
      counts: { streets: streets.length, addresses: addresses.length, pois: pois.length, cities: cities.length },
      streets: streets.map((s) => s.slice(0, 5)),
      pois,
      cities,
    },
    [
      { name: 'addrStreet', dtype: 'int32', data: addresses.map((a) => a.street) },
      { name: 'addrNumber', dtype: 'uint16', data: addresses.map((a) => a.n) },
      { name: 'addrLat', dtype: 'float32', data: addresses.map((a) => a.lat) },
      { name: 'addrLon', dtype: 'float32', data: addresses.map((a) => a.lon) },
    ],
  );
// the day's stops; tomorrow has one more, which the catalogue knows and today's timetable does not
const day: TinySpec = {
  stops: [
    { name: 'ת. רכבת השלום', lat: 32.0735, lon: 34.793, city: TLV }, // 0
    { name: 'דיזנגוף/ארלוזורוב', lat: 32.0868, lon: 34.7745, city: TLV, code: '21001' }, // 1
    { name: 'דיזנגוף/ארלוזורוב', lat: 32.0869, lon: 34.7747, city: TLV, code: '21002' }, // 2: across the street
    { name: 'ת. מרכזית ירושלים/יפו', lat: 31.789, lon: 35.203, city: 'ירושלים', code: '31001' }, // 3
    { name: 'אלנבי', lat: 32.0655, lon: 34.771, city: TLV }, // 4: the light rail, one stop each way
    { name: 'אלנבי', lat: 32.0656, lon: 34.7712, city: TLV }, // 5
    { name: 'ת. רכבת חיפה מרכז', lat: 32.822, lon: 34.997, city: 'חיפה' }, // 6
  ],
  routes: [
    { short: '5', type: 3 },
    { short: 'R1', type: 0 },
    { short: '', type: 2 },
  ],
  patterns: [
    { route: 0, stops: [1, 3], trips: [[T(8, 0), T(9, 0)]] },
    { route: 0, stops: [3, 2], trips: [[T(10, 0), T(11, 0)]] },
    { route: 1, stops: [4, 5], trips: [[T(8, 0), T(8, 1)]] },
    { route: 2, stops: [0, 6], trips: [[T(8, 0), T(9, 0)]] },
  ],
};
const tomorrow: TinySpec = {
  ...day,
  stops: [...day.stops, { name: 'כיכר המדינה', lat: 32.0868, lon: 34.79, city: TLV, code: '21009' }],
  patterns: [...day.patterns, { route: 0, stops: [1, 7], trips: [[T(12, 0), T(12, 10)]] }],
};
const book = parsePlaces(bookFile('book-1'));
const built = buildCatalogue(book, [tinyTimetable(day), tinyTimetable(tomorrow)]);
const files: Record<string, ArrayBuffer> = {
  tt: tinyContainer(day),
  places: bookFile('book-1'),
  search: catalogueFile(built, book).file,
};

let data: typeof import('../src/worker/data.ts'),
  searchOps: typeof import('../src/worker/search.ts').searchOps,
  stopsOps: typeof import('../src/worker/stops.ts').stopsOps;
beforeAll(async () => {
  (globalThis as { self?: unknown }).self = { postMessage() {}, location: { href: 'http://test/' } };
  vi.stubGlobal('fetch', async (url: string) => new Response(files[String(url).split('/').pop()!].slice(0)));
  data = await import('../src/worker/data.ts');
  await data.dataOps.loadTimetable({ url: 'http://test/tt' });
  searchOps = (await import('../src/worker/search.ts')).searchOps;
  stopsOps = (await import('../src/worker/stops.ts')).stopsOps;
});
type Ask = { lang?: 'he' | 'en'; near?: { lat: number; lon: number } | null };
const rows = (q: string, { lang = 'he', near = DIZENGOFF_CENTER }: Ask = {}): SearchHit[] =>
  searchOps.search({ q, lang, near, limit: 8 }).results;
/** A row as the list reads: its name, and its city where it has one. */
const read = (r: SearchHit | undefined): string | null => (r ? r.name + (r.city ? ', ' + r.city : '') : null);
const first = (q: string, ask: Ask = {}): string | null => read(rows(q, ask)[0]);

describe('before the catalogue has arrived', () => {
  test('stops are found, and the answer says the rest is still to come', () => {
    const r = searchOps.search({ q: 'אלנבי', lang: 'he', near: null });
    expect(r.placesLoaded).toBe(false);
    expect(r.results.map(read)).toEqual([`אלנבי, ${TLV}`]);
    // no place yet; with nothing that has both words, a stop that has one of them is offered
    expect(searchOps.search({ q: 'דיזנגוף סנטר', lang: 'he', near: null }).results.map(read)).toEqual([
      `דיזנגוף/ארלוזורוב, ${TLV}`,
    ]);
  });
});

describe('the search box', () => {
  beforeAll(async () => {
    await data.dataOps.loadPlaces({ url: 'http://test/places' });
    await data.dataOps.loadSearch({ url: 'http://test/search' });
  });

  test('a part of a name finds the place of that name, and nothing that lacks the word', () => {
    // the maintainer's search of 2026-11-13: "hamesila" in Tel Aviv showed "Entrance A" and no park
    const en = rows('hamesila', { lang: 'en' });
    expect(read(en[0])).toBe('Park HaMesilah, Tel Aviv-Yafo');
    expect(en.every((r) => /mesila/i.test(r.name))).toBe(true);
    expect(first('המסילה')).toBe(`פארק המסילה, ${TLV}`);
    expect(first('הכרמל')).toBe(`שוק הכרמל, ${TLV}`);
    expect(first('carmel', { lang: 'en' })).toBe('Carmel Market, Tel Aviv-Yafo');
  });
  test('a street, a house number and a city: that address, and only it', () => {
    // typed with ק where the data has ך: the same sound
    const r = rows('חביבה רייק 4 בת ים');
    expect(r.map(read)).toEqual(['חביבה רייך 4, בת ים']);
    expect(r[0]).toMatchObject({ kind: 'address', approx: null });
    expect(first('haviva reich 4 bat yam', { lang: 'en' })).toBe('Haviva Reich 4, Bat Yam');
  });
  test('a house number the street does not have: the nearest it has, said as such', () => {
    expect(rows('חביבה רייך 5 בת ים')[0]).toMatchObject({ kind: 'address', name: 'חביבה רייך 5' });
    expect([4, 6]).toContain((rows('חביבה רייך 5 בת ים')[0] as { approx: number }).approx);
  });
  test('of two streets of one name, the one with the number typed', () => {
    expect(first('ויצמן 2 רחובות')).toBe('חיים ויצמן 2, רחובות');
  });
  test('the list holds while the city is being typed', () => {
    const text = 'דיזנגוף 50 תל אביב';
    for (let n = 'דיזנגוף 50'.length; n <= text.length; n++)
      expect(first(text.slice(0, n)), text.slice(0, n)).toBe(`דיזנגוף 50, ${TLV}`);
    // with no position, the city typed decides between the two streets as soon as it is a word
    expect(first('דיזנגוף 50 נת', { near: null })).toBe('דיזנגוף 50, נתניה');
  });
  test('the same street in two cities: the one here, unless a city is typed', () => {
    expect(first('הרצל 16', { near: HAIFA })).toBe('הרצל 16, חיפה');
    expect(first('הרצל 16')).toBe(`הרצל 16, ${TLV}`);
    expect(first('הרצל 16 חיפה')).toBe('הרצל 16, חיפה');
    expect(first('herzl 16 tel aviv', { lang: 'en', near: HAIFA })).toBe('Herzl 16, Tel Aviv-Yafo');
  });
  test("a city's name is the city: first, and not a word of some other name", () => {
    const r = rows('תל אביב');
    expect(r[0]).toMatchObject({ kind: 'city', name: TLV });
    expect(r.map((x) => x.name)).not.toContain('חוף תל ברוך'); // a תל in a city with an אביב in its name
    expect(rows('tel aviv', { lang: 'en' })[0]).toMatchObject({ kind: 'city', name: 'Tel Aviv-Yafo' });
    // a street in Tel Aviv is named Jerusalem: the city all the same, far as it is
    expect(rows('ירושלים')[0]).toMatchObject({ kind: 'city', name: 'ירושלים' });
  });
  test('a village named like a place in town does not come before the place', () => {
    expect(first('שרונה')).toBe(`שרונה מרקט, ${TLV}`);
    expect(rows('שרונה').map((r) => r.kind)).toContain('city');
  });
  test('a city said inside a name belongs to the name', () => {
    expect(first('נמל תל אביב')).toBe(`נמל תל אביב, ${TLV}`);
    expect(rows('נמל תל אביב').map((r) => r.name)).toContain('נמל יפו'); // a port in Tel Aviv too, after it
  });
  test('typed in the other alphabet', () => {
    expect(first('בלוק TLV')).toBe(`The Bloc TLV, ${TLV}`);
    expect(rows('הבלוק תל אביב').map((r) => r.name)).toEqual(expect.arrayContaining(['The Block', 'The Bloc TLV']));
    expect(rows('בלוק').map((r) => r.name)).not.toContain('Black Hole'); // one vowel is not another
    expect(first('dizengoff')).toBe(`דיזנגוף, ${TLV}`);
    expect(first('דיזנגוף סנטר', { lang: 'en' })).toBe('Dizengoff Center, Tel Aviv-Yafo');
    expect(first('ichilov')).toBe(`בי"ח איכילוב, ${TLV}`);
  });
  test('a slip, another spelling, a word still being typed', () => {
    expect(first('דיזנגף סנטר')).toBe(`דיזנגוף סנטר, ${TLV}`);
    expect(first('dizengof center', { lang: 'en' })).toBe('Dizengoff Center, Tel Aviv-Yafo');
    expect(first('דיזנג')).toBe(`דיזנגוף, ${TLV}`);
    expect(first('רוטשילד 22')).toBe(`שדרות רוטשילד 22, ${TLV}`); // שדרות says what kind of street it is
    expect(first('בית חולים איכילוב')).toBe(`בי"ח איכילוב, ${TLV}`); // בי"ח written out
  });
  test('one word more than the name has still finds it', () => {
    expect(first('חומוס אבו חסן')).toBe(`אבו חסן, ${TLV}`);
  });
  test('an English list has no Hebrew in it', () => {
    for (const q of ['hamesila', 'דיזנגוף', 'tel aviv', 'השלום', 'herzl 16', 'אלנבי', 'בלוק', 'jerusalem'])
      for (const r of rows(q, { lang: 'en' }))
        expect(`${r.name} ${r.city} ${r.kind !== 'stop' ? (r.label ?? '') + (r.address ?? '') : ''}`, q).not.toMatch(
          /[א-ת]/,
        );
  });
  test('stops: a station by its name, the feed’s short forms written out, both sides of a street as one place', () => {
    expect(rows('השלום')[0]).toMatchObject({ kind: 'stop', name: 'ת. רכבת השלום', stops: [0] });
    expect(rows('תחנת רכבת השלום')[0]).toMatchObject({ kind: 'stop', stops: [0] });
    expect(rows('תחנה מרכזית ירושלים')[0]).toMatchObject({ kind: 'stop', stops: [3] });
    const both = rows('דיזנגוף ארלוזורוב');
    expect(both.filter((r) => r.kind === 'stop')).toHaveLength(1);
    expect(both[0]).toMatchObject({ kind: 'stop', stops: [1, 2], platforms: 1 });
    expect(rows('אלנבי')[0]).toMatchObject({ kind: 'stop', stops: [4, 5], platforms: 2 });
  });
  test('a stop the day’s timetable does not have is not offered', () => {
    expect(rows('כיכר המדינה')).toEqual([]);
  });
  test('the Stop tab: by name, with a slip, by the number on the sign, by kind', () => {
    const named = stopsOps.stopGroups({ q: 'ארלוזורב' });
    expect(named.map((g) => g.code).sort()).toEqual(['21001', '21002']); // each sign its own row there
    expect(stopsOps.stopGroups({ q: '21002' })[0]).toMatchObject({ code: '21002', stops: [2] });
    expect(stopsOps.stopGroups({ q: 'השלום', mode: 'rail' }).map((g) => g.stops)).toEqual([[0]]);
    expect(stopsOps.stopGroups({ q: 'השלום', mode: 'bus' })).toEqual([]);
    expect(stopsOps.stopGroups({ q: 'אלנבי', mode: 'lrt' }).map((g) => g.stops)).toEqual([[4, 5]]);
  });
});

describe('the catalogue file', () => {
  test('reads back as it was built', () => {
    const back = readCatalogue(files.search.slice(0), book);
    for (const k of ['kind', 'ref', 'lat', 'lon', 'city', 'cityOff', 'inCity'] as const)
      expect(Array.from(back[k]), k).toEqual(Array.from(built[k]));
    expect(back.ix.keys).toEqual(built.ix.keys);
    expect(back.ix.sKeys).toEqual(built.ix.sKeys);
    for (const k of ['off', 'entries', 'sOff', 'said', 'shared'] as const)
      expect(Array.from(back.ix[k]), k).toEqual(Array.from(built.ix[k]));
    expect(back.cityNames).toEqual(built.cityNames);
  });
  test('is refused with another address book than the one it was built from', () => {
    expect(() => readCatalogue(files.search.slice(0), parsePlaces(bookFile('book-2')))).toThrow(/another address book/);
  });
});
