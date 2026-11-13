// Words, as the search compares them (engine/wordindex.ts, engine/find.ts): a name or what was typed split into words in
// one plain form; how far a typed word is from a word of a name, where a slip that is only another way to spell the
// same sound costs half; and a word's sounds, by which a Hebrew word meets the same word in Latin letters.
// Nothing here knows about streets, cities or stops.

const HE_FINAL: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
/** Words that say what kind of way a street is, or nothing at all: left out on both sides, so "שדרות רוטשילד",
 *  "רוטשילד" and "Rothschild Blvd" are one name. */
const NOISE = new Set(
  'רחוב רח שדרות שדרת שד סמטת סמ street st road rd boulevard blvd avenue ave lane alley rehov rechov sderot sd simtat the of'.split(
    ' ',
  ),
);

/** Short forms the feed and the maps write, as the words riders type: ת. מרכזית is תחנה מרכזית (744 stops are named
 *  so), בי"ח a בית חולים. A form of a word that says the same is that word (תחנת רכבת, תחנה). */
const WRITTEN_OUT = new Map(
  Object.entries({
    תחנת: 'תחנה',
    ביח: 'בית חולים',
    ביהח: 'בית חולים',
    ביס: 'בית ספר',
    ביהס: 'בית ספר',
    קופח: 'קופת חולים',
  }).map(([short, full]) => [short, words0(full)]),
);
/** Words that say what kind of place a name is of, in a name that has more than them: the rest is what riders call
 *  it by (המסילה for פארק המסילה, Carmel for Carmel Market). They are found like any word; they only do not count
 *  when a name's length is taken (`nameLength`). */
const KIND_WORDS = new Set(
  words0(
    'פארק גן קניון שוק חולים אוניברסיטה אוניברסיטת מכללה מכללת תיאטרון מוזיאון קולנוע אצטדיון חוף תחנה רכבת ' +
      'park garden mall market hospital university college theatre theater museum cinema stadium beach station railway train',
  ),
);
/** How many words a name is, for weighing how much of it was typed: its words but those that only say its kind. */
export const nameLength = (ws: string[]): number => ws.filter((w) => !KIND_WORDS.has(w)).length || ws.length;

/** The words of a name, or of what was typed, each in the form they are compared in: lower case, marks and vowel points
 *  off (a quote inside a word is part of it: ז'בוטינסקי, קק"ל), final letters as plain ones, a doubled ו or י (and any
 *  doubled Latin letter) once, no h after a Latin word's last vowel; a short form written out. */
export function words(text: string): string[] {
  const out: string[] = [];
  for (const w of words0(text)) {
    const full = WRITTEN_OUT.get(w);
    if (full) out.push(...full);
    else if (!NOISE.has(w)) out.push(w);
  }
  return out;
}
/** The words in their compared form, before short forms are written out and the noise is dropped. */
function words0(text: string): string[] {
  const out: string[] = [];
  const plain = String(text || '')
    .toLowerCase()
    .replace(/(?<![\p{L}\p{N}])ת\.(?=[\s\p{L}])/gu, 'תחנה ') // only with its dot: a ת alone is a word just begun
    .normalize('NFKD')
    .replace(/[̀-֑ͯ-ׇ]/g, '') // Latin accents, Hebrew points
    .replace(/(?<=\p{L})['"׳״`’]+(?=\p{L})/gu, '');
  for (const raw of plain.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const w = raw
      .replace(/[ךםןףץ]/g, (c) => HE_FINAL[c])
      .replace(/([וי])\1+/g, '$1')
      .replace(/([a-z])\1+/g, '$1')
      .replace(/(?<=[aeiou])h$/, ''); // Mesilah, Tikvah: the h says nothing
    out.push(w);
  }
  return out;
}

export type Alphabet = 'he' | 'la' | 'other';
/** The alphabet a word is written in, by its first letter (digits and other scripts: 'other'). */
export function alphabetOf(w: string): Alphabet {
  const c = w.charCodeAt(0);
  if (c >= 0x05d0 && c <= 0x05ea) return 'he';
  return c >= 97 && c <= 122 ? 'la' : 'other';
}

// ---------------------------------------------------------------- how far a typed word is from a word of a name
// In half typos: a letter wrong, missing, extra, or two swapped is a typo (2); a slip that only spells the same sound
// another way is half of one (1): a vowel letter more or less, a letter for its sound-alike.

/** Letters that mostly stand for a vowel, or for nothing: one more or less is how the same name is spelt by another
 *  (ויצמן and וייצמן, אלון and אילון, Mesila and Mesilah). */
const SOFT = new Set('אהויעaeiouyh');
/** Letters written for one another: the same sound, or near enough that riders mix them. Not one vowel for another:
 *  בלוק is not בלאק, nor "block" "black". */
const ALIKE = [
  'כק',
  'כח',
  'טת',
  'סש',
  'סצ',
  'בו',
  'זג',
  'אע',
  'אה',
  'ckq',
  'sz',
  'sc',
  'vw',
  'vb',
  'gj',
  'ie',
  'iy',
  'ey',
  'ou',
];
const alike = new Set<string>();
for (const g of ALIKE) for (const a of g) for (const b of g) if (a !== b) alike.add(a + b);

const gap = (c: string): number => (SOFT.has(c) ? 1 : 2); // a letter missing or extra
const swap = (a: string, b: string): number => {
  if (a === b) return 0;
  return alike.has(a + b) ? 1 : 2;
};
/** How many half typos a typed word of this length may carry and still be the word meant. */
export const budget = (len: number): number => {
  if (len <= 2) return 0;
  if (len === 3) return 1;
  if (len <= 5) return 2;
  return len <= 8 ? 3 : 4;
};
/** The same for a word still being typed, against the start of a longer word. */
export const prefixBudget = (len: number): number => {
  if (len < 2) return -1;
  if (len <= 3) return 0;
  return len <= 5 ? 1 : 2;
};

/** One row of the comparison, for one more letter `c` of the name's word: `prev` is the row before it and `prev2` the
 *  one before that (for two letters swapped, with `before` the name's letter before `c`). Row[j]: the cost of the
 *  word's letters so far against the first j typed letters. Returns the least value in the row. */
export function nextRow(
  typed: string,
  c: string,
  before: string,
  prev: Int16Array,
  prev2: Int16Array | null,
  row: Int16Array,
): number {
  let least = (row[0] = prev[0] + gap(c));
  for (let j = 1; j <= typed.length; j++) {
    const t = typed[j - 1];
    let v = Math.min(prev[j] + gap(c), row[j - 1] + gap(t), prev[j - 1] + swap(c, t));
    if (prev2 && j > 1 && c === typed[j - 2] && before === t) v = Math.min(v, prev2[j - 2] + 2);
    row[j] = v;
    if (v < least) least = v;
  }
  return least;
}
/** The row before any letter of the name's word: the typed letters alone. */
export function firstRow(typed: string, row: Int16Array): void {
  row[0] = 0;
  for (let j = 1; j <= typed.length; j++) row[j] = row[j - 1] + gap(typed[j - 1]);
}

// ---------------------------------------------------------------- a word's sounds, in either alphabet
// A word as consonants, with o for an o or u sound, in letters both alphabets share: בלוק and "bloc" are both "blok".
// A letter that may be said two ways gives two readings. Kept apart on purpose: ב is b or v and never w, ו is w or o
// and never b ("walk" is not בלק, nor "ballet" וולט), and a ו read as a vowel is an o where the Latin word has one.

const HE_SOUND: Record<string, string[]> = {
  א: [''], ע: [''], י: [''], ה: ['', 'h'], ו: ['w', 'o', 'wo'],
  ב: ['b', 'v'], ג: ['g'], ד: ['d'], ז: ['z', 'g'], ח: ['x', 'h'], ט: ['t'], ת: ['t'], כ: ['k', 'x'], ק: ['k'],
  ל: ['l'], מ: ['m'], נ: ['n'], ס: ['s'], ש: ['s'], פ: ['p', 'f'], צ: ['c'], ר: ['r'],
}; // prettier-ignore
// in this order: a pair of letters before its letters alone; the capitals are sounds still to be read two ways
const LA_SOUND: [RegExp, string][] = [
  [/x/g, 'ks'], [/sch|sh/g, 's'], [/tch|tz|ts/g, 'T'], [/ch|kh/g, 'x'], [/ph/g, 'f'], [/th/g, 't'], [/ck/g, 'k'],
  [/qu?/g, 'k'], [/c(?=[eiy])/g, 's'], [/c/g, 'k'], [/T/g, 'c'], [/j/g, 'g'], [/o[ouw]?/g, 'O'], [/u/g, 'U'],
  [/h/g, 'H'], [/v/g, 'V'], [/[aeiy]/g, ''],
]; // prettier-ignore
const LA_TWO: Record<string, string[]> = { U: ['o', ''], H: ['h', ''], V: ['v', 'w'], O: ['o'] };
const MOST = 24; // readings of one word kept
/** Every reading of a string of sounds whose letters may each be one of several. */
function readings(parts: string[][]): string[] {
  let out = [''];
  for (const alts of parts) {
    if (alts.length === 1) {
      if (alts[0]) for (let i = 0; i < out.length; i++) out[i] += alts[0];
      continue;
    }
    const next: string[] = [];
    for (const o of out) for (const a of alts) if (next.length < MOST) next.push(o + a);
    out = next;
  }
  return [...new Set(out.map((s) => s.replace(/(.)\1+/g, '$1')))];
}
/** The ways a word (as `words` gives it) may be said. Words of the two alphabets that share one are the same word by
 *  sound; fewer than three sounds say too little to go by, so those are left out. */
export function sounds(w: string): string[] {
  const a = alphabetOf(w);
  let parts: string[][];
  if (a === 'he') parts = [...w].map((c, i) => (c === 'ה' && i === w.length - 1 ? [''] : HE_SOUND[c] || ['']));
  else if (a === 'la') {
    let s = w;
    for (const [re, to] of LA_SOUND) s = s.replace(re, to);
    parts = [...s].map((c) => LA_TWO[c] || [c]);
  } else return [];
  return readings(parts).filter((s) => s.length >= 3);
}
