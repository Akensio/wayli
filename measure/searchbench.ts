// Scores a place search on the everyday searches of measure/searchcases.ts against a real address book:
//   node measure/searchbench.ts data/places.bin.gz          (the app's own search, src/engine/places.ts)
// For each case: does the entry the rider means come first, in the first three, in the first eight (a list's length)?
// By the kind of search, with the misses listed. Another engine is scored the same way by handing `score` its search
// (a library under trial: give it `docsOf` to index).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parsePlaces, searchPlaces, type Places } from '../src/engine/places.ts';
import { CASES, type Case, type Want } from './searchcases.ts';

/** One entry as a search answers with it: its kind, its main name (Hebrew, or Latin where the data has no other), its
 *  English name where the data has one, and its city in Hebrew ('' for a city itself). */
export type Entry = { kind: 'street' | 'poi' | 'city'; name: string; en: string; city: string; cityEn: string };
export type Engine = (q: string, limit: number) => Entry[];

export function readBook(file: string): Places {
  const b = gunzipSync(readFileSync(file));
  return parsePlaces(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
/** Every street, place and city of the book, for an engine that builds its own index. */
export function docsOf(pl: Places): Entry[] {
  const cityEn = new Map(pl.cities.map((c) => [c[0], c[3] || '']));
  return [
    ...pl.streets.map((s): Entry => ({
      kind: 'street',
      name: s[0],
      en: s[4] || '',
      city: s[1],
      cityEn: cityEn.get(s[1]) || '',
    })),
    ...pl.pois.map((p): Entry => ({
      kind: 'poi',
      name: p[0],
      en: p[5] || '',
      city: p[2],
      cityEn: cityEn.get(p[2]) || '',
    })),
    ...pl.cities.map((c): Entry => ({ kind: 'city', name: c[0], en: c[3] || '', city: '', cityEn: '' })),
  ];
}
export const meets = (e: Entry, w: Want): boolean =>
  (!w.kind || e.kind === w.kind) && (!w.city || e.city === w.city) && (w.name.test(e.name) || w.name.test(e.en));

/** The app's own search as an engine: a house number on a street is the street. */
export const appEngine =
  (pl: Places): Engine =>
  (q, limit) =>
    searchPlaces(pl, q, limit, null, 'he').map((h) => ({
      kind: h.kind === 'address' ? 'street' : h.kind,
      name: h.kind === 'address' ? h.name.replace(/\s+\d+\S*$/, '') : h.name,
      en: '',
      city: h.city,
      cityEn: '',
    }));

export type Outcome = { c: Case; rank: number; top: Entry[]; ms: number }; // rank: where the answer came (0-based), -1 not in the list
/** Run every case: where its answer came, and how long the search took (the best of three, ms). */
export function score(engine: Engine, cases: Case[] = CASES, limit = 8): Outcome[] {
  return cases.map((c) => {
    let top: Entry[] = [],
      ms = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      top = engine(c.q, limit);
      ms = Math.min(ms, performance.now() - t0);
    }
    return { c, rank: top.findIndex((e) => meets(e, c.want)), top, ms };
  });
}
/** Cases whose answer the book does not hold (the data changed, or the case is wrong): to fix before reading a score. */
export const unanswerable = (pl: Places, cases: Case[] = CASES): Case[] => {
  const docs = docsOf(pl);
  return cases.filter((c) => !docs.some((d) => meets(d, c.want)));
};
/** First, in three, in eight, of how many: over all the cases and by kind of search. */
export function summary(out: Outcome[]): Record<string, { first: number; three: number; eight: number; of: number }> {
  const s: Record<string, { first: number; three: number; eight: number; of: number }> = {};
  for (const o of out)
    for (const k of ['all', o.c.cat]) {
      const x = (s[k] ||= { first: 0, three: 0, eight: 0, of: 0 });
      x.of++;
      if (o.rank === 0) x.first++;
      if (o.rank >= 0 && o.rank < 3) x.three++;
      if (o.rank >= 0 && o.rank < 8) x.eight++;
    }
  return s;
}

if (process.argv[1]?.endsWith('searchbench.ts')) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node measure/searchbench.ts places.bin.gz');
    process.exit(2);
  }
  const pl = readBook(file);
  for (const c of unanswerable(pl))
    console.log(`no such entry in this book: "${c.q}" wants ${c.want.name} ${c.want.city || ''}`);
  const out = score(appEngine(pl));
  for (const [k, v] of Object.entries(summary(out)))
    console.log(`${k.padEnd(26)} first ${v.first}/${v.of}  in three ${v.three}/${v.of}  in eight ${v.eight}/${v.of}`);
  const times = out.map((o) => o.ms).sort((a, b) => a - b);
  console.log(
    `a search: ${times[times.length >> 1].toFixed(0)} ms typical, ${times[times.length - 1].toFixed(0)} ms the slowest`,
  );
  for (const o of out.filter((x) => x.rank !== 0))
    console.log(
      `${o.rank < 0 ? 'missing' : 'at ' + (o.rank + 1)}  [${o.c.cat}] "${o.c.q}"  →  ${o.top
        .slice(0, 3)
        .map((e) => `${e.name}${e.city ? ' · ' + e.city : ''}`)
        .join(' | ')}`,
    );
}
