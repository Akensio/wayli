// The catalogue: everything the search box can find, as one list of entries with one word index (engine/wordindex.ts).
// The address book's cities, streets and places and the timetables' stops and stations are all entries, and
// engine/find.ts searches them on one scale.
//
// Reading every name into words takes seconds, which a phone should not spend at each start, so the nightly build does
// it (pipeline/searchindex.ts: `buildCatalogue`, `catalogueFile`) and the app reads the result (`readCatalogue`). The
// file holds what took the time (the words, who has them, how long each name is) and the stops; what an entry of the
// address book is and where is read from the book itself, which the app has anyway. So a catalogue file belongs to
// one address book (its hash is in the header), and to no day: a stop is an entry by its id in the feed.
import { words, alphabetOf, nameLength } from './words.ts';
import { buildIndex, wordAt, packIndex, unpackIndex, type WordIndex } from './wordindex.ts';
import { readContainer, writeContainer, type ContainerHeader } from './container.ts';
import { isLandmark, type Places } from './places.ts';
import type { Timetable } from './raptor.ts';

export type EntryKind = 'city' | 'station' | 'stop' | 'street' | 'landmark' | 'place';
export const KINDS: EntryKind[] = ['city', 'station', 'stop', 'street', 'landmark', 'place'];
const [CITY, STATION, STOP, STREET, LANDMARK, PLACE] = [0, 1, 2, 3, 4, 5];

export type Catalogue = {
  n: number;
  /** What each entry is (an index into KINDS) and which: a city's, street's or place's index in the address book's
   *  lists, by its kind; a stop's id in the feed (a station's: that of one of its platforms). */
  kind: Uint8Array;
  ref: Int32Array;
  lat: Float32Array;
  lon: Float32Array;
  /** The entry's city (an index into the catalogue's cities), -1 for none; a city's entry: itself. */
  city: Int32Array;
  /** How many Hebrew words the entry's shortest name has, and how many in Latin letters (what was typed is weighed
   *  against them: the whole name, or a part of it). A number in a name counts in both; a word that only says what
   *  kind of place it is (פארק, Market) in neither (words.ts nameLength). */
  count: [Uint8Array, Uint8Array];
  /** City c's entries are `inCity[cityOff[c] .. cityOff[c + 1])`. */
  cityOff: Int32Array;
  inCity: Int32Array;
  /** Each city as the address book and the timetables say it (Hebrew), and its names as words of the index: typed
   *  words are the city when they are one of these names in full. */
  cityKeys: string[];
  cityNames: number[][][];
  /** The words of the names; a word's entries from `n` up are cities (entry n + c is city c, by its names' words). */
  ix: WordIndex;
  /** A house number on a street entry: how well the address book knows it (set by whoever holds the book). */
  numberOn?: (ref: number, number: number, suffix: string) => 'exact' | 'near' | null;
};

/** The entries that are stops, as the file lists them (the address book's entries are read from the book). */
type StopRows = { kind: Uint8Array; ref: Int32Array; lat: Float32Array; lon: Float32Array; city: Int32Array };
type Rows = Pick<Catalogue, 'n' | 'kind' | 'ref' | 'lat' | 'lon' | 'city'>;

/** The entries in their order, the same when the catalogue is built and when it is read: the book's cities, its
 *  streets, its places, then the stops. `cityIx`: a city's index by its Hebrew name. */
function rows(pl: Places | null, cityIx: (he: string) => number, stops: StopRows): Rows {
  const n = (pl ? pl.cities.length + pl.streets.length + pl.pois.length : 0) + stops.ref.length;
  const r: Rows = {
    n,
    kind: new Uint8Array(n),
    ref: new Int32Array(n),
    lat: new Float32Array(n),
    lon: new Float32Array(n),
    city: new Int32Array(n),
  };
  let e = 0;
  const put = (kind: number, ref: number, lat: number, lon: number, city: number): void => {
    r.kind[e] = kind;
    r.ref[e] = ref;
    r.lat[e] = lat;
    r.lon[e] = lon;
    r.city[e++] = city;
  };
  if (pl) {
    pl.cities.forEach((c, i) => put(CITY, i, c[1], c[2], cityIx(c[0])));
    pl.streets.forEach((s, i) => put(STREET, i, s[2], s[3], cityIx(s[1])));
    pl.pois.forEach((p, i) => put(isLandmark(p[1]) ? LANDMARK : PLACE, i, p[3], p[4], cityIx(p[2])));
  }
  r.kind.set(stops.kind, e);
  r.ref.set(stops.ref, e);
  r.lat.set(stops.lat, e);
  r.lon.set(stops.lon, e);
  r.city.set(stops.city, e);
  return r;
}
/** Each city's entries, as `cityOff` and `inCity` (the city's own entry is not one of them). */
function byCity(r: Rows, cities: number): Pick<Catalogue, 'cityOff' | 'inCity'> {
  const cityOff = new Int32Array(cities + 1),
    within = (e: number): boolean => r.city[e] >= 0 && r.kind[e] !== CITY;
  let all = 0;
  for (let e = 0; e < r.n; e++)
    if (within(e)) {
      cityOff[r.city[e] + 1]++;
      all++;
    }
  for (let c = 0; c < cities; c++) cityOff[c + 1] += cityOff[c];
  const at = cityOff.slice(0, cities),
    inCity = new Int32Array(all);
  for (let e = 0; e < r.n; e++) if (within(e)) inCity[at[r.city[e]]++] = e;
  return { cityOff, inCity };
}

/** What riders call a city, where it is not the name the data has: a name of its own (the whole of what was typed
 *  then, not a part of a longer name). */
const ALSO: Record<string, string[]> = {
  'תל אביב יפו': ['תל אביב', 'Tel Aviv', 'תא', 'TLV'],
  'מודיעין מכבים רעות': ['מודיעין', 'Modiin'],
  'באר שבע': ['בש'],
  'פתח תקווה': ['פת'],
  'ראשון לציון': ['ראשלצ', 'ראשון'],
};

/**
 * The catalogue of an address book and the stops of some days' timetables (every stop of any of them, once): the
 * book's cities, streets and places; a station with its platforms as one entry, any other stop its own. Where trains
 * or the light rail call is a station to a rider, whether or not the feed groups its platforms. With no book, the
 * stops alone (what the app searches until the night's catalogue has arrived).
 */
export function buildCatalogue(pl: Places | null, days: Timetable[]): Catalogue {
  const cityKeys: string[] = [],
    cityNamed: string[][] = [],
    cityAt = new Map<string, number>();
  const cityIx = (he: string, en = ''): number => {
    if (!he) return -1;
    let i = cityAt.get(he);
    if (i === undefined) {
      cityAt.set(he, (i = cityKeys.length));
      cityKeys.push(he);
      cityNamed.push([he, en, ...(ALSO[he] || [])]);
    }
    return i;
  };
  // every entry's names (Hebrew, English, a short name riders use: any of them finds it), in the order of `rows`
  const names: string[][] = [];
  if (pl) {
    for (const c of pl.cities) cityIx(c[0], c[3] || '');
    for (const c of pl.cities) names.push(cityNamed[cityIx(c[0])]);
    for (const s of pl.streets) names.push([s[0], s[4] || '']);
    for (const p of pl.pois) names.push([p[0], p[5] || '']);
  }
  const sk: number[] = [],
    sr: number[] = [],
    sla: number[] = [],
    slo: number[] = [],
    sc: number[] = [];
  const seen = new Set<string>(); // a stop by its id, a station by its own
  for (const tt of days) {
    const en = tt.names.en,
      rail = new Uint8Array(tt.stops.length);
    for (let p = 0; p < tt.patRoute.length; p++) {
      const type = tt.routes[tt.patRoute[p]][3];
      if (type === 2 || type === 0)
        for (let i = tt.patStopsOff[p]; i < tt.patStopsOff[p + 1]; i++) rail[tt.patStops[i]] = 1;
    }
    for (let s = 0; s < tt.stops.length; s++) {
      const p = tt.stopParent[s],
        key = p >= 0 ? 'p' + tt.stations[p][0] : tt.stops[s][0];
      if (seen.has(key)) continue;
      seen.add(key);
      const city = tt.stops[s][3] || '';
      sk.push(p >= 0 || rail[s] ? STATION : STOP);
      sr.push(Number(tt.stops[s][0]));
      sla.push(tt.stopLat[s]);
      slo.push(tt.stopLon[s]);
      sc.push(cityIx(city, (en && en.cities && en.cities[city]) || ''));
      names.push([
        p >= 0 ? tt.stations[p][1] : tt.stops[s][1],
        (en && (p >= 0 ? en.stations && en.stations[p] : en.stops && en.stops[s])) || '',
      ]);
    }
  }
  const r = rows(pl, cityIx, {
    kind: Uint8Array.from(sk),
    ref: Int32Array.from(sr),
    lat: Float32Array.from(sla),
    lon: Float32Array.from(slo),
    city: Int32Array.from(sc),
  });
  // the words of every name, and how long each entry's shortest name is in each alphabet
  const n = r.n,
    count: [Uint8Array, Uint8Array] = [new Uint8Array(n), new Uint8Array(n)],
    named: string[][] = new Array(n);
  for (let e = 0; e < n; e++) {
    const all: string[] = [],
      least = [255, 255];
    for (const name of names[e]) {
      const ws = words(name),
        of = (a: string): string[] => ws.filter((w) => alphabetOf(w) === a),
        [he, la, other] = [of('he'), of('la'), of('other')];
      // a name in both alphabets (מלון כנען - Canaan Hotel) is a name in each, of that alphabet's words; one with a
      // stray word of the other (רציפים B, קניון TLV) is a name in its own alphabet only, of all its words
      if (he.length >= 2 * la.length) least[0] = Math.min(least[0], nameLength(ws));
      else if (la.length >= 2 * he.length) least[1] = Math.min(least[1], nameLength(ws));
      else {
        least[0] = Math.min(least[0], nameLength([...he, ...other]));
        least[1] = Math.min(least[1], nameLength([...la, ...other]));
      }
      all.push(...ws);
    }
    count[0][e] = least[0] === 255 ? 0 : least[0];
    count[1][e] = least[1] === 255 ? 0 : least[1];
    named[e] = all;
  }
  const cityWords = cityNamed.map((list) => list.map(words).filter((ws) => ws.length));
  const ix = buildIndex(n + cityKeys.length, (e) => (e < n ? named[e] : cityWords[e - n].flat()));
  return {
    ...r,
    count,
    ...byCity(r, cityKeys.length),
    cityKeys,
    cityNames: cityWords.map((list) => list.map((ws) => ws.map((w) => wordAt(ix, w)))),
    ix,
  };
}

// ---------------------------------------------------------------- the catalogue as a file

type CatalogueSections =
  'countHe' | 'countLa' | 'stopKind' | 'stopRef' | 'stopLat' | 'stopLon' | 'stopCity' | 'shared' | 'posts' | 'sounds';
/** The file's header: the address book it was built from (its hash), the words and the sounds (as
 *  wordindex.ts packs them), and the cities with their names as words. */
export type CatalogueHeader = ContainerHeader & {
  format: number;
  built?: string;
  book: string;
  counts: { entries: number; stops: number; words: number; cities: number };
  keys: string;
  sKeys: string;
  cityKeys: string[];
  cityNames: number[][][];
};
const FORMAT = 1;

/** The file of a catalogue built from the address book `pl` (the container of engine/container.ts, without a build
 *  time or a hash: whoever writes it to disk adds them). */
export function catalogueFile(
  c: Catalogue,
  pl: Places,
): { header: Omit<CatalogueHeader, 'sections'>; file: ArrayBuffer } {
  const first = pl.cities.length + pl.streets.length + pl.pois.length, // the stops are the entries from here
    ix = packIndex(c.ix);
  const header = {
    format: FORMAT,
    book: pl.header.hash || '',
    counts: { entries: c.n, stops: c.n - first, words: c.ix.keys.length, cities: c.cityKeys.length },
    keys: ix.keys,
    sKeys: ix.sKeys,
    cityKeys: c.cityKeys,
    cityNames: c.cityNames,
  };
  const file = writeContainer(header, [
    { name: 'countHe', dtype: 'uint8', data: c.count[0] },
    { name: 'countLa', dtype: 'uint8', data: c.count[1] },
    { name: 'stopKind', dtype: 'uint8', data: c.kind.subarray(first) },
    { name: 'stopRef', dtype: 'int32', data: c.ref.subarray(first) },
    { name: 'stopLat', dtype: 'float32', data: c.lat.subarray(first) },
    { name: 'stopLon', dtype: 'float32', data: c.lon.subarray(first) },
    { name: 'stopCity', dtype: 'int32', data: c.city.subarray(first) },
    { name: 'shared', dtype: 'uint8', data: ix.shared },
    { name: 'posts', dtype: 'uint8', data: ix.posts },
    { name: 'sounds', dtype: 'uint8', data: ix.sounds },
  ]);
  return { header, file };
}
/** The catalogue from its file and the address book it was built from. Throws when the book is another one (the two
 *  are downloaded apart, and a phone may hold last night's of one). */
export function readCatalogue(ab: ArrayBuffer, pl: Places): Catalogue {
  const f = readContainer<CatalogueSections, CatalogueHeader>(ab),
    h = f.header;
  if (h.format !== FORMAT) throw new Error(`search catalogue of format ${h.format}, not ${FORMAT}`);
  if (h.book !== (pl.header.hash || '')) throw new Error('search catalogue of another address book');
  const cityAt = new Map(h.cityKeys.map((he, i) => [he, i]));
  const r = rows(pl, (he) => cityAt.get(he) ?? -1, {
    kind: f.stopKind as Uint8Array,
    ref: f.stopRef as Int32Array,
    lat: f.stopLat as Float32Array,
    lon: f.stopLon as Float32Array,
    city: f.stopCity as Int32Array,
  });
  if (r.n !== h.counts.entries) throw new Error('search catalogue of another address book');
  return {
    ...r,
    count: [f.countHe as Uint8Array, f.countLa as Uint8Array],
    ...byCity(r, h.cityKeys.length),
    cityKeys: h.cityKeys,
    cityNames: h.cityNames,
    ix: unpackIndex({
      keys: h.keys,
      sKeys: h.sKeys,
      shared: f.shared as Uint8Array,
      posts: f.posts as Uint8Array,
      sounds: f.sounds as Uint8Array,
    }),
  };
}
