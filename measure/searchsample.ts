// The long tail: random entries of the real data (small streets, restaurants, shops, stops), each searched the ways a
// rider might type it, through the worker's `search` as the app asks it. Where measure/searchbench.ts asks whether
// the well-known answers come first, this asks whether anything at all can be found.
//   node measure/searchsample.ts data/timetable-YYYYMMDD.bin.gz data/places.bin.gz [per-kind=300] [seed=1]
// Per kind of entry and way of typing: how often the entry is on the list of eight, and how often first. The ways:
// its name, from 2 km away; its name and city, with no position; the name with one letter dropped; the name in Latin
// letters by the app's own rule (src/engine/latin.ts: another spelling than the data's English name); the data's
// English name. A street is asked with one of its house numbers. `-v` lists what was not found.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parsePlaces, streetName, poiName, cityOf } from '../src/engine/places.ts';
import { parseTimetable, stopOrStationName } from '../src/engine/raptor.ts';
import { buildCatalogue, catalogueFile } from '../src/engine/catalogue.ts';
import { inLatin } from '../src/engine/latin.ts';
import { haversine } from '../src/engine/geo.ts';
import type { SearchHit } from '../src/worker/ops.ts';

const args = process.argv.slice(2).filter((a) => a !== '-v'),
  verbose = process.argv.includes('-v');
const [ttFile, bookFile, perKind = '300', seedText = '1'] = args;
if (!ttFile || !bookFile) {
  console.error('usage: node measure/searchsample.ts timetable.bin.gz places.bin.gz [per-kind] [seed] [-v]');
  process.exit(2);
}
const gunzip = (file: string): ArrayBuffer => {
  const b = gunzipSync(readFileSync(file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const raw = { tt: gunzip(ttFile), places: gunzip(bookFile) };
const tt = parseTimetable(raw.tt.slice(0)),
  pl = parsePlaces(raw.places.slice(0));
const files: Record<string, ArrayBuffer> = {
  ...raw,
  search: catalogueFile(buildCatalogue(pl, []), pl).file,
  stopsearch: catalogueFile(buildCatalogue(null, [tt]), null).file,
};
Object.assign(globalThis, {
  self: { postMessage() {}, location: { href: 'http://bench/' } },
  fetch: async (url: string) => new Response(files[String(url).split('/').pop()!]),
});
const data = await import('../src/worker/data.ts');
await data.dataOps.loadTimetable({ url: 'http://bench/tt' });
await data.dataOps.loadStopSearch({ url: 'http://bench/stopsearch' });
await data.dataOps.loadPlaces({ url: 'http://bench/places' });
await data.dataOps.loadSearch({ url: 'http://bench/search' });
const { searchOps } = await import('../src/worker/search.ts');

// a random number generator with a seed, so a run can be repeated
let seed = Number(seedText) || 1;
const random = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(list: T[], n: number): T[] => {
  const from = list.slice(),
    out: T[] = [];
  while (out.length < n && from.length) out.push(from.splice(Math.floor(random() * from.length), 1)[0]);
  return out;
};
/** One entry to look for: its names, where it is, and whether a row of the list is it. */
type Entry = {
  he: string;
  en: string;
  city: string;
  cityEn: string;
  lat: number;
  lon: number;
  is: (r: SearchHit) => boolean;
};
const hebrew = (s: string): boolean => /[א-ת]/.test(s);
const here =
  (lat: number, lon: number, name: (r: SearchHit) => boolean) =>
  (r: SearchHit): boolean =>
    haversine(lat, lon, r.lat, r.lon) < 40 || name(r);
const place = (i: number): Entry => {
  const p = pl.pois[i],
    names = [poiName(pl, i, 'he'), poiName(pl, i, 'en')],
    cities = [cityOf(pl, p[2], 'he'), cityOf(pl, p[2], 'en')];
  return {
    he: p[0],
    en: p[5] || '',
    city: p[2],
    cityEn: cities[1],
    lat: p[3],
    lon: p[4],
    is: here(p[3], p[4], (r) => r.kind === 'poi' && names.includes(r.name) && cities.includes(r.city)),
  };
};
const street = (i: number): Entry => {
  const s = pl.streets[i],
    a = pl.addrOff[i] + Math.floor(random() * (pl.addrOff[i + 1] - pl.addrOff[i])),
    n = ` ${pl.addrNumber[a]}`,
    names = [streetName(pl, i, 'he') + n, streetName(pl, i, 'en') + n];
  return {
    he: s[0] + n,
    en: s[4] ? s[4] + n : '',
    city: s[1],
    cityEn: cityOf(pl, s[1], 'en'),
    lat: pl.addrLat[a],
    lon: pl.addrLon[a],
    is: (r) =>
      r.kind === 'address' &&
      r.approx == null &&
      names.includes(r.name) &&
      haversine(pl.addrLat[a], pl.addrLon[a], r.lat, r.lon) < 400,
  };
};
const stop = (i: number): Entry => ({
  he: stopOrStationName(tt, i, 'he'),
  en: stopOrStationName(tt, i, 'en'),
  city: tt.stops[i][3],
  cityEn: '',
  lat: tt.stopLat[i],
  lon: tt.stopLon[i],
  is: (r) => r.kind === 'stop' && r.stops.includes(i),
});
const N = Number(perKind);
const eat = /^amenity=(restaurant|cafe|bar|fast_food|pub)$/,
  all = pl.pois.map((_, i) => i),
  named = (i: number): boolean => hebrew(pl.pois[i][0]);
const rail = new Set<number>();
for (let p = 0; p < tt.patRoute.length; p++)
  if ([0, 2].includes(tt.routes[tt.patRoute[p]][3]))
    for (let k = tt.patStopsOff[p]; k < tt.patStopsOff[p + 1]; k++) rail.add(tt.patStops[k]);
const KINDS: [string, Entry[]][] = [
  [
    'restaurants, cafes, bars',
    pick(
      all.filter((i) => eat.test(pl.pois[i][1]) && named(i)),
      N,
    ).map(place),
  ],
  [
    'places named in Latin only',
    pick(
      all.filter((i) => !named(i) && /[a-z]/i.test(pl.pois[i][0])),
      N,
    ).map(place),
  ],
  [
    'other places',
    pick(
      all.filter((i) => !eat.test(pl.pois[i][1]) && named(i)),
      N,
    ).map(place),
  ],
  [
    'addresses',
    pick(
      pl.streets
        .map((_, i) => i)
        .filter((i) => pl.addrOff[i + 1] > pl.addrOff[i] && hebrew(pl.streets[i][0]) && pl.streets[i][1]),
      N,
    ).map(street),
  ],
  [
    'bus stops',
    pick(
      tt.stops.map((_, i) => i).filter((i) => !rail.has(i) && tt.stopParent[i] < 0),
      N,
    ).map(stop),
  ],
  ['train and light rail stations', pick([...rail], N).map(stop)],
];
/** A word of five letters or more with one of its inner letters dropped: a slip. */
function slip(text: string): string | null {
  const ws = text.split(' '),
    long = ws.map((w, i) => (w.replace(/[^\p{L}]/gu, '').length >= 5 && !/\d/.test(w) ? i : -1)).filter((i) => i >= 0);
  if (!long.length) return null;
  const i = long[Math.floor(random() * long.length)],
    at = 1 + Math.floor(random() * (ws[i].length - 2));
  ws[i] = ws[i].slice(0, at) + ws[i].slice(at + 1);
  return ws.join(' ');
}
type Way = {
  name: string;
  lang: 'he' | 'en';
  ask: (e: Entry) => { q: string; near: { lat: number; lon: number } | null } | null;
};
const away = (e: Entry) => ({ lat: e.lat + 0.018, lon: e.lon }); // 2 km north
const WAYS: Way[] = [
  { name: 'its name, from 2 km', lang: 'he', ask: (e) => ({ q: e.he, near: away(e) }) },
  {
    name: 'name and city, no position',
    lang: 'he',
    ask: (e) => (e.city ? { q: `${e.he} ${e.city}`, near: null } : null),
  },
  {
    name: 'a letter dropped, from 2 km',
    lang: 'he',
    ask: (e) => {
      const q = slip(e.he);
      return q ? { q, near: away(e) } : null;
    },
  },
  {
    name: 'in Latin letters by rule',
    lang: 'en',
    ask: (e) => (hebrew(e.he) ? { q: inLatin(e.he), near: away(e) } : null),
  },
  {
    name: "the data's English name",
    lang: 'en',
    ask: (e) => (e.en && e.en !== e.he ? { q: e.en, near: away(e) } : null),
  },
];
const pct = (a: number, n: number): string => (n ? `${Math.round((100 * a) / n)}%`.padStart(4) : '   -');
const lost: string[] = [];
console.log(`${N} of each kind, seed ${seedText}: found on the list of eight / found first`);
console.log(' '.repeat(32) + WAYS.map((w) => w.name.slice(0, 26).padEnd(28)).join(''));
for (const [kind, entries] of KINDS) {
  let line = kind.padEnd(32);
  for (const way of WAYS) {
    let n = 0,
      listed = 0,
      first = 0;
    for (const e of entries) {
      const a = way.ask(e);
      if (!a || !a.q.trim()) continue;
      n++;
      const rows = searchOps.search({ q: a.q, limit: 8, lang: way.lang, near: a.near }).results,
        at = rows.findIndex(e.is);
      if (at >= 0) listed++;
      if (at === 0) first++;
      if (at < 0 && lost.length < 400)
        lost.push(
          `${kind} | ${way.name} | "${a.q}" (${e.he}, ${e.city}) -> ${
            rows
              .slice(0, 2)
              .map((r) => r.name + (r.city ? ', ' + r.city : ''))
              .join(' ; ') || 'nothing'
          }`,
        );
    }
    line += `${pct(listed, n)} /${pct(first, n)}  (${String(n).padStart(3)})`.padEnd(28);
  }
  console.log(line);
}
if (verbose) console.log('\nnot found:\n  ' + lost.join('\n  '));
process.exit(0);
