// The word index: every distinct word of a set of names, in order, each with the entries whose names have it. A typed
// word is compared with the words (about 120,000 for the whole country), never with the entries (233,000, a million
// word places): the same word, a word close to it, a word it begins, or the same word in the other alphabet by sound
// (engine/words.ts says what "close" and "by sound" are). engine/find.ts turns the words found into entries.
import { alphabetOf, budget, prefixBudget, firstRow, nextRow, sounds } from './words.ts';

export type WordIndex = {
  /** The distinct words, sorted, and for each how many first letters it shares with the word before it. */
  keys: string[];
  shared: Uint8Array;
  /** Word i is in the entries `entries[off[i] .. off[i + 1])`. */
  off: Int32Array;
  entries: Int32Array;
  /** The sounds of the words (words.ts sounds), sorted, each with the words said so: `said[sOff[k] .. sOff[k + 1])`. */
  sKeys: string[];
  sOff: Int32Array;
  said: Int32Array;
};
/** A word of the index found for a typed word, and how good a match it is: 1 the word itself, less the further. */
export type Found = { word: number; quality: number };

const cmp = (a: string, b: string): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};
/** Lists as offsets and one flat array: item k's values are flat[off[k] .. off[k + 1]). `pairs` are (item, value). */
function grouped(items: number, item: Int32Array, value: Int32Array, n: number): { off: Int32Array; flat: Int32Array } {
  const off = new Int32Array(items + 1);
  for (let i = 0; i < n; i++) off[item[i] + 1]++;
  for (let k = 0; k < items; k++) off[k + 1] += off[k];
  const at = off.slice(0, items),
    flat = new Int32Array(n);
  for (let i = 0; i < n; i++) flat[at[item[i]]++] = value[i];
  return { off, flat };
}

/** Build the index of `n` entries from each one's words (every word of its names, as words.ts gives them). */
export function buildIndex(n: number, wordsOf: (entry: number) => Iterable<string>): WordIndex {
  // the distinct words in the order met, and every (word, entry) pair
  const id = new Map<string, number>();
  let pw = new Int32Array(1 << 16),
    pe = new Int32Array(1 << 16),
    pairs = 0;
  for (let e = 0; e < n; e++)
    for (const w of new Set(wordsOf(e))) {
      let i = id.get(w);
      if (i === undefined) id.set(w, (i = id.size));
      if (pairs === pw.length) {
        const w2 = new Int32Array(pairs * 2),
          e2 = new Int32Array(pairs * 2);
        w2.set(pw);
        e2.set(pe);
        pw = w2;
        pe = e2;
      }
      pw[pairs] = i;
      pe[pairs++] = e;
    }
  // the words sorted, and each pair's word renamed to its place in that order
  const keys = [...id.keys()].sort(cmp),
    place = new Int32Array(keys.length);
  keys.forEach((k, i) => (place[id.get(k)!] = i));
  for (let i = 0; i < pairs; i++) pw[i] = place[pw[i]];
  const { off, flat: entries } = grouped(keys.length, pw, pe, pairs);
  const shared = new Uint8Array(keys.length);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i];
    let k = 0;
    while (k < a.length && k < b.length && k < 255 && a[k] === b[k]) k++;
    shared[i] = k;
  }
  // the words by their sounds
  const sId = new Map<string, number>(),
    sw: number[] = [],
    ss: number[] = [];
  keys.forEach((k, i) => {
    for (const s of sounds(k)) {
      let j = sId.get(s);
      if (j === undefined) sId.set(s, (j = sId.size));
      ss.push(j);
      sw.push(i);
    }
  });
  const sKeys = [...sId.keys()].sort(cmp),
    sPlace = new Int32Array(sKeys.length);
  sKeys.forEach((k, i) => (sPlace[sId.get(k)!] = i));
  const sItem = Int32Array.from(ss, (j) => sPlace[j]);
  const g = grouped(sKeys.length, sItem, Int32Array.from(sw), sw.length);
  return { keys, shared, off, entries, sKeys, sOff: g.off, said: g.flat };
}

// ---------------------------------------------------------------- the index as a file's parts
// Small, since every phone downloads it: each word as the letters it does not share with the word before it; each list
// of numbers (a word's entries, a sound's words) as its length and the steps between its numbers, a byte or two each
// where a plain number takes four. A third of the plain arrays' size once gzipped.

/** The index as it is stored: the words' and the sounds' texts (one per line) for a file's header, the rest bytes. */
export type PackedIndex = { keys: string; sKeys: string; shared: Uint8Array; posts: Uint8Array; sounds: Uint8Array };

/** Lists of rising numbers as bytes: per list its length, its first number, then each step to the next, all as
 *  varints (seven bits a byte, the high bit saying another byte follows). */
function packLists(off: Int32Array, flat: Int32Array): Uint8Array {
  const out: number[] = [];
  const put = (v: number): void => {
    if (v < 0) throw new Error('a list to pack must rise');
    for (; v >= 128; v = Math.floor(v / 128)) out.push((v % 128) | 128);
    out.push(v);
  };
  for (let k = 0; k + 1 < off.length; k++) {
    put(off[k + 1] - off[k]);
    for (let i = off[k]; i < off[k + 1]; i++) put(i === off[k] ? flat[i] : flat[i] - flat[i - 1]);
  }
  return Uint8Array.from(out);
}
/** `lists` lists back from their bytes. */
function unpackLists(bytes: Uint8Array, lists: number): { off: Int32Array; flat: Int32Array } {
  let at = 0;
  const get = (): number => {
    let v = 0,
      scale = 1;
    for (;;) {
      const b = bytes[at++];
      v += (b & 127) * scale;
      if (b < 128) return v;
      scale *= 128;
    }
  };
  const off = new Int32Array(lists + 1);
  let flat = new Int32Array(Math.max(16, bytes.length)), // never more numbers than bytes
    n = 0;
  for (let k = 0; k < lists; k++) {
    const len = get();
    let v = 0;
    for (let i = 0; i < len; i++) flat[n++] = v += get();
    off[k + 1] = n;
  }
  flat = flat.slice(0, n);
  return { off, flat };
}
export function packIndex(ix: WordIndex): PackedIndex {
  return {
    keys: ix.keys.map((k, i) => k.slice(ix.shared[i])).join('\n'),
    sKeys: ix.sKeys.join('\n'),
    shared: ix.shared,
    posts: packLists(ix.off, ix.entries),
    sounds: packLists(ix.sOff, ix.said),
  };
}
export function unpackIndex(p: PackedIndex): WordIndex {
  const keys = p.shared.length ? p.keys.split('\n') : [];
  for (let i = 1; i < keys.length; i++) keys[i] = keys[i - 1].slice(0, p.shared[i]) + keys[i];
  const sKeys = p.sKeys ? p.sKeys.split('\n') : [];
  const posts = unpackLists(p.posts, keys.length),
    sounds = unpackLists(p.sounds, sKeys.length);
  return {
    keys,
    shared: p.shared,
    off: posts.off,
    entries: posts.flat,
    sKeys,
    sOff: sounds.off,
    said: sounds.flat,
  };
}

/** The index's number for a word, or -1 when no name has it. */
export const wordAt = (ix: WordIndex, word: string): number => at(ix.keys, word);
/** Where `key` is in a sorted list, or -1. */
function at(list: string[], key: string): number {
  let lo = 0,
    hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1,
      c = cmp(list[mid], key);
    if (c === 0) return mid;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
/** The first word not before `key`. */
function from(list: string[], key: string): number {
  let lo = 0,
    hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const QUALITY_PER_HALF_TYPO = 0.15, // another spelling keeps 0.85 of a word's worth, a typo 0.7
  BEGINS = 0.9, // a word the typed one only begins
  BY_SOUND = 0.8; // the same word in the other alphabet: above a typo, below another spelling
const rows: Int16Array[] = [];
const rowAt = (d: number, width: number): Int16Array => {
  if (!rows[d] || rows[d].length < width) rows[d] = new Int16Array(Math.max(width, 48));
  return rows[d];
};

/**
 * The words of the index a typed word may be, best first. `typing`: it is the last word typed and may be unfinished,
 * so a word it begins counts too.
 *
 * The words are walked in order, and the comparison (words.ts nextRow, one row per letter) is kept for the letters a
 * word shares with the one before it, so each distinct beginning is compared once; a beginning already too far from
 * what was typed is left with every word that has it.
 */
export function wordsFor(ix: WordIndex, typed: string, typing: boolean): Found[] {
  const out = new Map<number, number>();
  const put = (word: number, quality: number): void => {
    if (quality > (out.get(word) || 0)) out.set(word, quality);
  };
  const alphabet = alphabetOf(typed);
  if (alphabet === 'other') {
    // a number, or a script the app has no rules for: the word itself, or one it begins
    const i = at(ix.keys, typed);
    if (i >= 0) put(i, 1);
    if (typing)
      for (let k = from(ix.keys, typed); k < ix.keys.length && ix.keys[k].startsWith(typed); k++) put(k, BEGINS);
    return [...out].map(([word, quality]) => ({ word, quality }));
  }
  const m = typed.length,
    whole = budget(m),
    begun = typing ? prefixBudget(m) : -1,
    far = Math.max(whole, begun);
  // only the words of the typed word's alphabet: they are together in the order
  const lo = from(ix.keys, alphabet === 'he' ? 'א' : 'a'),
    hi = from(ix.keys, alphabet === 'he' ? '׫' : '{');
  firstRow(typed, rowAt(0, m + 1));
  const begins: number[] = [m === 0 ? 0 : 99]; // per depth: the least cost of the typed word against a beginning this long or shorter
  let have = 0; // rows 0..have stand for the first `have` letters of the word at hand
  for (let i = lo; i < hi;) {
    const w = ix.keys[i];
    have = Math.min(have, i > lo ? ix.shared[i] : 0, w.length);
    let dead = -1;
    for (let d = have; d < w.length; d++) {
      const least = nextRow(
        typed,
        w[d],
        d ? w[d - 1] : '',
        rowAt(d, m + 1),
        d ? rowAt(d - 1, m + 1) : null,
        rowAt(d + 1, m + 1),
      );
      begins[d + 1] = Math.min(begins[d], rows[d + 1][m]);
      have = d + 1;
      if (least > far && begins[d + 1] > begun) {
        dead = d + 1; // no word beginning with these letters can be it
        break;
      }
    }
    if (dead >= 0) {
      i++;
      while (i < hi && ix.shared[i] >= dead) i++;
      have = Math.min(have, dead);
      continue;
    }
    const cost = rows[w.length][m];
    if (cost <= whole) put(i, 1 - QUALITY_PER_HALF_TYPO * cost);
    if (begins[w.length - 1] <= begun) put(i, BEGINS * (1 - QUALITY_PER_HALF_TYPO * begins[w.length - 1]));
    i++;
  }
  // the same word in the other alphabet
  for (const s of sounds(typed)) {
    const k = at(ix.sKeys, s);
    if (k < 0) continue;
    for (let j = ix.sOff[k]; j < ix.sOff[k + 1]; j++)
      if (alphabetOf(ix.keys[ix.said[j]]) !== alphabet) put(ix.said[j], BY_SOUND);
  }
  return [...out].map(([word, quality]) => ({ word, quality })).sort((a, b) => b.quality - a.quality);
}
