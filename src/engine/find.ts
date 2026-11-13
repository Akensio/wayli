// The search behind the search box: what was typed, to the entries meant, best first. One rule decides what is found:
// every word typed is in the entry's name or names its city (as a word of the index says it, engine/wordindex.ts: the
// word itself, one close to it, one it begins, or the same word in the other alphabet). One number orders what is found:
// how well the words matched and how much of the name they are, what kind of thing the entry is, how near it is, and
// whether its city was typed. Streets, places, cities and stops are all entries of one catalogue (engine/catalogue.ts),
// on that one scale.
import { words, alphabetOf } from './words.ts';
import { wordsFor, wordAt } from './wordindex.ts';
import { haversine, type LatLon } from './geo.ts';
import { KINDS, type Catalogue, type EntryKind } from './catalogue.ts';

/** What a kind of entry is worth before anything is typed: a city above a station, a park above a kiosk (a city:
 *  a big one; a smaller one in proportion). */
const WORTH: Record<EntryKind, number> = { city: 30, station: 15, landmark: 10, street: 6, stop: 4, place: 0 };

/** One entry found: which (its `ref`, read by its kind: engine/catalogue.ts), how good (higher first), and for a
 *  street with a house number typed, the number and whether that very number is known there. */
export type Hit = {
  ref: number;
  kind: EntryKind;
  score: number;
  number?: { number: number; suffix: string; exact: boolean };
};

// what the score is made of, on a scale where the words typed are worth up to 100
const TEXT = 100,
  IN_CITY = 15, // the city typed is the entry's
  NEAR = 30, // right here, fading to nothing by FAR_KM (and faster at first: half of it is gone by a dozen km)
  FAR_KM = 40,
  BIG_CITY = 3.5, // a city of 10^3.5 entries or more (some 3,000: Herzliya, Ashdod) is as much a city as any
  PART = 0.75, // a name of which only a part was typed keeps this much (דיזנגוף for דיזנגוף סנטר: between the two)
  HOUSE = 15, // the house number typed is on the street; half for the nearest number to it
  IN_NAME = 5, // the number typed is a word of the name ("Bloc 39")
  MISSING = 40, // a word typed that is nowhere in the entry (allowed once, when nothing has them all)
  MOST_WORDS = 12; // typed words looked at

// scratch for one search: what each entry has matched so far
type Scratch = {
  stamp: Int32Array; // the search that last touched the entry
  inName: Int32Array; // the typed words found in its name, one bit each
  byCity: Int32Array; // the typed words that are words of its city's names, one bit each
  worst: Float32Array; // how well the worst-matched typed word of those is matched
  lastQuality: Float32Array; // how well the last of them is (a typed word may be two words of a name: the better counts)
  latin: Uint8Array; // the alphabet of the name's words found: 0 Hebrew, 1 Latin
};
const scratch = new WeakMap<Catalogue, Scratch>();
let search = 0;
/** How many bits are set. */
function bits(v: number): number {
  let n = 0;
  for (; v; v &= v - 1) n++;
  return n;
}

/** What was typed, read once for every catalogue searched. */
type Typed = {
  names: string[]; // the words an entry must have: the words typed, or the numbers when nothing else was
  typing: boolean; // the last word may still be growing
  number: { number: number; suffix: string } | null; // the first number typed: a house number, unless it is a name
  numberWords: string[];
  numbersAreNames: boolean;
};
function read(text: string): Typed {
  const typing = !/\s$/.test(text);
  let number: Typed['number'] = null;
  const typed: string[] = [],
    numberWords: string[] = [];
  for (const w of words(text)) {
    const m = w.match(/^(\d{1,5})([א-תa-z]?)$/);
    if (m) {
      number ||= { number: Number(m[1]), suffix: m[2] };
      numberWords.push(w);
    } else typed.push(w);
  }
  // only numbers typed: they are the name ("22" finds nothing else)
  const names = (typed.length ? typed : numberWords).slice(0, MOST_WORDS);
  // a single letter after other words is a word just begun, which says nothing yet: the words before it stand
  if (typing && names.length > 1 && names[names.length - 1].length === 1) names.pop();
  return { names, typing, number, numberWords, numbersAreNames: !typed.length };
}

/**
 * Find what was typed in the catalogues (the address book's and the stops', or either): up to `limit` hits, best
 * first, on one scale. `near`: where the rider is, if known. `only`: the kinds of entry wanted (all, when not given).
 *
 * Every word typed has to be in the entry's name or to name its city, and the words that name the city have to be one
 * of the city's names in full, or as far as it is typed yet ("תל אביב", not "אביב" beside a place called תל). A number
 * typed is a house number, or part of a name; it is never a word the entry must have. When nothing in any catalogue
 * has every word, what lacks one is offered.
 */
export function find(
  catalogues: Catalogue[],
  text: string,
  { near = null, limit = 10, only = null }: { near?: LatLon | null; limit?: number; only?: EntryKind[] | null } = {},
): Hit[] {
  const q = read(text);
  if (!q.names.length) return [];
  const rate = catalogues.map((c) => matched(c, q, near, only));
  let out = rate.flatMap((r) => r(0));
  // nothing has every word: what has all but one ("חומוס אבו חסן" for אבו חסן)
  if (!out.length && q.names.length > 1) out = rate.flatMap((r) => r(1));
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** One catalogue's entries that the typed words touch, as a function that rates them: the hits that lack at most
 *  `allowed` of the words. */
function matched(
  c: Catalogue,
  { names, typing, number, numberWords, numbersAreNames }: Typed,
  near: LatLon | null,
  only: EntryKind[] | null,
): (allowed: number) => Hit[] {
  let s = scratch.get(c);
  if (!s) {
    s = {
      stamp: new Int32Array(c.n),
      inName: new Int32Array(c.n),
      byCity: new Int32Array(c.n),
      worst: new Float32Array(c.n),
      lastQuality: new Float32Array(c.n),
      latin: new Uint8Array(c.n),
    };
    scratch.set(c, s);
  }
  const sc = s,
    touched: number[] = [];
  search++;
  const touch = (e: number): void => {
    if (sc.stamp[e] === search) return;
    sc.stamp[e] = search;
    sc.inName[e] = sc.byCity[e] = 0;
    sc.worst[e] = 1;
    touched.push(e);
  };
  // each typed word: the index words it may be, their entries by name, then every entry of a city so named
  const found = names.map((w, j) => {
    const may = new Set<number>(),
      cities = new Set<number>(),
      fresh: number[] = [], // the entries with this word in their name
      bit = 1 << j;
    for (const f of wordsFor(c.ix, w, typing && j === names.length - 1)) {
      may.add(f.word);
      const latin = alphabetOf(c.ix.keys[f.word]) === 'he' ? 0 : 1;
      for (let k = c.ix.off[f.word]; k < c.ix.off[f.word + 1]; k++) {
        const e = c.ix.entries[k];
        if (e >= c.n) {
          cities.add(e - c.n);
          continue;
        }
        touch(e);
        if (!(sc.inName[e] & bit)) {
          if (!sc.inName[e]) sc.latin[e] = latin;
          sc.inName[e] |= bit;
          sc.lastQuality[e] = f.quality;
          fresh.push(e);
        } else if (f.quality > sc.lastQuality[e]) sc.lastQuality[e] = f.quality;
      }
    }
    for (const e of fresh) if (sc.lastQuality[e] < sc.worst[e]) sc.worst[e] = sc.lastQuality[e];
    for (const city of cities)
      for (let k = c.cityOff[city]; k < c.cityOff[city + 1]; k++) {
        const e = c.inCity[k];
        touch(e);
        sc.byCity[e] |= bit;
      }
    return may;
  });
  // whether the typed words of `bits` name the city: each of them a word of one of its names, and that name said in
  // full, or as far as it has been typed yet (its first words, when the last word typed is among them)
  const named = new Map<number, boolean>();
  const stillTyping = typing ? 1 << (names.length - 1) : 0;
  const namesIt = (city: number, bits: number): boolean => {
    const key = city * 4096 + bits;
    let is = named.get(key);
    if (is === undefined) {
      const js = names.map((_, j) => j).filter((j) => bits & (1 << j));
      is = c.cityNames[city].some((name) => {
        if (!js.every((j) => name.some((w) => found[j].has(w)))) return false;
        const said = name.map((w) => js.some((j) => found[j].has(w)));
        if (said.every(Boolean)) return true;
        return (bits & stillTyping) !== 0 && said[0] && !said.slice(said.indexOf(false)).some(Boolean);
      });
      named.set(key, is);
    }
    return is;
  };
  const numbered = new Set<number>(); // the entries with the number typed in their name
  if (number && !numbersAreNames)
    for (const w of numberWords) {
      const i = wordAt(c.ix, w);
      if (i >= 0) for (let k = c.ix.off[i]; k < c.ix.off[i + 1]; k++) numbered.add(c.ix.entries[k]);
    }
  const wanted = only && new Set(only.map((k) => KINDS.indexOf(k)));
  return (allowed: number): Hit[] => {
    const out: Hit[] = [];
    for (const e of touched) {
      const got = bits(sc.inName[e]);
      if (!got || (wanted && !wanted.has(c.kind[e]))) continue; // only its city was typed, or not a kind asked for
      // the words that are not in the name have to say the city. Where every word is in the name, the city may be
      // said inside it (נמל תל אביב, The Bloc TLV): the entry is then as much in the city typed as one beside it,
      // if more than the city was typed (תל אביב alone is the city, not a wish for names that have it)
      const beside = sc.byCity[e] & ~sc.inName[e],
        more = sc.inName[e] & ~sc.byCity[e];
      const inCity = sc.byCity[e] !== 0 && (beside || more) !== 0 && namesIt(c.city[e], beside || sc.byCity[e]);
      const missing = names.length - got - (inCity ? bits(beside) : 0);
      if (missing > allowed) continue;
      const kind = KINDS[c.kind[e]];
      const has = c.count[sc.latin[e]][e] || c.count[1 - sc.latin[e]][e] || 1;
      const whole = Math.min(1, got / has); // how much of the name was typed
      // a match is as good as its worst word: two words typed right do not make a third, loosely matched, any surer
      let score = TEXT * sc.worst[e] * (PART + (1 - PART) * whole) - MISSING * missing;
      if (inCity) score += IN_CITY;
      const nearness = near
        ? Math.max(0, 1 - haversine(near.lat, near.lon, c.lat[e], c.lon[e]) / 1000 / FAR_KM) ** 2
        : 0;
      if (kind === 'city') {
        // a big city is where riders go to, as often far as near: distance says nothing about it. A village is a
        // place like any other, and a city only as much as it is big (by how much the catalogue has in it)
        const city = c.city[e],
          big = city < 0 ? 0 : Math.min(1, Math.log10(1 + c.cityOff[city + 1] - c.cityOff[city]) / BIG_CITY);
        score += WORTH.city * big + NEAR * (big / 2 + (1 - big) * nearness);
      } else score += WORTH[kind] + NEAR * nearness;
      const hit: Hit = { ref: c.ref[e], kind, score };
      if (number && !numbersAreNames) {
        if (numbered.has(e)) hit.score += IN_NAME;
        else if (kind === 'street' && c.numberOn) {
          const known = c.numberOn(c.ref[e], number.number, number.suffix);
          if (known) {
            hit.score += known === 'exact' ? HOUSE : HOUSE / 2;
            hit.number = { ...number, exact: known === 'exact' };
          }
        }
      }
      out.push(hit);
    }
    return out;
  };
}
