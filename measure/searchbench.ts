// Scores the place search on the everyday searches of measure/searchcases.ts, over real data files and through the
// app's own path: the data worker's `search` operation, with the language and the position each case gives.
//   node measure/searchbench.ts data/timetable-YYYYMMDD.bin.gz data/places.bin.gz [-v]
// The catalogues are built here from the two files, by the code as it stands (what the nightly build will publish),
// and loaded the way the app loads them. Per case: where on the list the wanted row is (first, in the first three, on the
// list at all). Also what every search owes the rider: no row in two languages, no row twice, and an answer in time.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parsePlaces, streetName, poiName, cityOf, houseOn } from '../src/engine/places.ts';
import { parseTimetable, stopOrStationName, cityName } from '../src/engine/raptor.ts';
import { buildCatalogue, catalogueFile } from '../src/engine/catalogue.ts';
import type { SearchHit } from '../src/worker/ops.ts';
import { CASES, WHERE, type Want } from './searchcases.ts';

const args = process.argv.slice(2).filter((a) => a !== '-v'),
  verbose = process.argv.includes('-v');
const [ttFile, bookFile] = args;
if (!ttFile || !bookFile) {
  console.error('usage: node measure/searchbench.ts timetable.bin.gz places.bin.gz [-v]');
  process.exit(2);
}
const gunzip = (file: string): ArrayBuffer => {
  const b = gunzipSync(readFileSync(file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const raw = { tt: gunzip(ttFile), places: gunzip(bookFile) };
const tt = parseTimetable(raw.tt.slice(0)),
  pl = parsePlaces(raw.places.slice(0));
let t0 = performance.now();
const search = catalogueFile(buildCatalogue(pl, []), pl).file,
  stopsearch = catalogueFile(buildCatalogue(null, [tt]), null).file;
console.log(`catalogues built in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// the data worker, loaded as the app loads it (its files come through fetch)
const files: Record<string, ArrayBuffer> = { ...raw, search, stopsearch };
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

const LIMIT = 8;
/** Whether a row of the list is the one wanted. */
function is(row: SearchHit, w: Want): boolean {
  if (w.city && !w.city.test(row.city)) return false;
  if (w.number != null) {
    if (row.kind !== 'address' || row.approx != null) return false;
    const m = row.name.match(/^(.*) (\d+)$/);
    return !!m && Number(m[2]) === w.number && w.name.test(m[1]);
  }
  return (!w.kind || row.kind === w.kind) && w.name.test(row.name);
}
/** Whether the data has an entry that would make such a row, in `L`. */
function inData(w: Want, L: 'he' | 'en'): boolean {
  const city = (c: string): boolean => !w.city || w.city.test(c);
  if (w.number != null)
    return pl.streets.some(
      (s, i) => w.name.test(streetName(pl, i, L)) && city(cityOf(pl, s[1], L)) && houseOn(pl, i, w.number!, '')?.exact,
    );
  const kind = (k: string): boolean => !w.kind || w.kind === k;
  return (
    (kind('city') && !w.city && pl.cities.some((c) => w.name.test(cityOf(pl, c[0], L)))) ||
    (kind('street') && pl.streets.some((s, i) => w.name.test(streetName(pl, i, L)) && city(cityOf(pl, s[1], L)))) ||
    (kind('poi') && pl.pois.some((p, i) => w.name.test(poiName(pl, i, L)) && city(cityOf(pl, p[2], L)))) ||
    (kind('stop') && tt.stops.some((s, i) => w.name.test(stopOrStationName(tt, i, L)) && city(cityName(tt, s[3], L))))
  );
}
const show = (r: SearchHit): string =>
  `${r.name} · ${r.kind === 'poi' ? r.label : r.kind}${r.city ? ' · ' + r.city : ''}` +
  (r.kind !== 'stop' && r.approx != null ? ` (nearest ${r.approx})` : '');

type Tally = { n: number; first: number; three: number; listed: number };
const groups = new Map<string, Tally>(),
  times: number[] = [],
  absent: string[] = [],
  misses: string[] = [],
  doubles: string[] = [];
let mixed = 0,
  twice = 0,
  rows = 0;
for (const cs of CASES) {
  if (!inData(cs.want, cs.lang)) {
    absent.push(`"${cs.q}" [${cs.lang}]: no ${cs.want.name}${cs.want.number != null ? ' ' + cs.want.number : ''}`);
    continue;
  }
  const ask = { q: cs.q, limit: LIMIT, lang: cs.lang, near: cs.at ? WHERE[cs.at] : null };
  searchOps.search(ask); // once to warm up, then timed
  t0 = performance.now();
  const { results } = searchOps.search(ask);
  times.push(performance.now() - t0);
  const at = results.findIndex((r) => is(r, cs.want));
  const g = groups.get(cs.why) || { n: 0, first: 0, three: 0, listed: 0 };
  groups.set(cs.why, g);
  g.n++;
  if (at === 0) g.first++;
  if (at >= 0 && at < 3) g.three++;
  if (at >= 0) g.listed++;
  // what every list owes the rider
  const seen = new Set<string>();
  for (const r of results) {
    rows++;
    const text = show(r);
    if (cs.lang === 'en' && /[א-ת]/.test(text)) mixed++;
    const whole = text + (r.kind !== 'stop' && r.address ? ' · ' + r.address : '');
    if (seen.has(whole)) {
      twice++;
      doubles.push(`"${cs.q}" [${cs.lang}]: ${whole}`);
    }
    seen.add(whole);
  }
  if (at !== 0 || verbose) {
    const place = at < 0 ? 'not listed' : `at ${at + 1}`;
    misses.push(
      `"${cs.q}" [${cs.lang}${cs.at ? ', ' + cs.at : ''}] (${cs.why}): wanted ${cs.want.name}${cs.want.number != null ? ' ' + cs.want.number : ''}, ${place}\n` +
        results
          .slice(0, verbose ? LIMIT : 4)
          .map((r, i) => `      ${i === at ? '>' : ' '} ${i + 1}. ${show(r)} · ${r.rank.toFixed(0)}`)
          .join('\n'),
    );
  }
}
const all: Tally = { n: 0, first: 0, three: 0, listed: 0 };
console.log(`\n${'kind of search'.padEnd(22)}cases  first  in 3  listed`);
for (const [why, g] of groups) {
  console.log(
    `${why.padEnd(22)}${String(g.n).padStart(5)}${String(g.first).padStart(7)}${String(g.three).padStart(6)}${String(g.listed).padStart(8)}`,
  );
  for (const k of ['n', 'first', 'three', 'listed'] as const) all[k] += g[k];
}
console.log(
  `${'all'.padEnd(22)}${String(all.n).padStart(5)}${String(all.first).padStart(7)}${String(all.three).padStart(6)}${String(all.listed).padStart(8)}`,
);
times.sort((a, b) => a - b);
console.log(
  `\n${rows} rows: ${mixed} English rows with Hebrew letters, ${twice} rows shown twice; a search takes ` +
    `${times[times.length >> 1].toFixed(0)} ms (median), ${times[times.length - 1].toFixed(0)} ms (slowest)`,
);
if (doubles.length) console.log(`\nshown twice:\n  ${doubles.join('\n  ')}`);
if (absent.length) console.log(`\nnot in the data (not counted):\n  ${absent.join('\n  ')}`);
if (misses.length) console.log(`\n${verbose ? 'every case' : 'not first'}:\n  ${misses.join('\n  ')}`);
process.exit(0);
