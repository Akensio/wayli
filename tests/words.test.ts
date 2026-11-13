// Words as the search compares them (src/engine/words.ts, wordindex.ts): one plain form for a name and for what is
// typed, a slip allowed by the word's length, the same word in the other alphabet by its sounds, and what must not be
// taken for the same word.
import { test, expect } from 'vitest';
import { words, sounds, nameLength } from '../src/engine/words.ts';
import { buildIndex, wordsFor, packIndex, unpackIndex } from '../src/engine/wordindex.ts';

test('a name and what is typed come to the same words', () => {
  expect(words('שדרות רוטשילד')).toEqual(words('רוטשילד'));
  expect(words('Rothschild Blvd.')).toEqual(['rothschild']);
  expect(words('ירושלים')).toEqual(['ירושלימ']); // final letters as plain ones
  expect(words("ז'בוטינסקי")).toEqual(words('זבוטינסקי'));
  expect(words('קק"ל')).toEqual(words("קק''ל")); // the feed writes the mark as two apostrophes
  expect(words('וייצמן')).toEqual(words('ויצמן'));
  expect(words('Park HaMesilah')).toEqual(words('park hamesila'));
  expect(words('שׁוּק הַכַּרְמֶל')).toEqual(words('שוק הכרמל')); // vowel points off
});
test('short forms are written out', () => {
  expect(words('ת. מרכזית ירושלים')).toEqual(words('תחנה מרכזית ירושלים'));
  expect(words('ת. רכבת השלום')).toEqual(words('תחנת רכבת השלום'));
  expect(words('בי"ח איכילוב')).toEqual(words('בית חולים איכילוב'));
  expect(words('דיזנגוף 50 ת')).toEqual(['דיזנגופ', '50', 'ת']); // a ת with no dot is a word just begun
});
test('a word that only says what kind of place it is does not count in the length of the name', () => {
  expect(nameLength(words('פארק המסילה'))).toBe(1);
  expect(nameLength(words('Carmel Market'))).toBe(1);
  expect(nameLength(words('דיזנגוף סנטר'))).toBe(2);
  expect(nameLength(words('שוק'))).toBe(1); // a name of nothing else is its own length
});
test('the same word in the other alphabet, by its sounds', () => {
  const same = (a: string, b: string): boolean => sounds(a).some((s) => sounds(b).includes(s));
  expect(same('בלוק', 'bloc')).toBe(true);
  expect(same('בלוק', 'block')).toBe(true);
  expect(same('דיזנגופ', 'dizengoff')).toBe(true);
  expect(same('המסילה', 'hamesila')).toBe(true);
  expect(same('איכילוב', 'ichilov')).toBe(true);
  expect(same('רוטשילד', 'rothschild')).toBe(true);
  // only look alike: ב is never w, ו is never b
  expect(same('בלק', 'walk')).toBe(false);
  expect(same('וולט', 'ballet')).toBe(false);
  expect(sounds('תא')).toEqual([]); // too few sounds to go by
});

const NAMES = ['דיזנגוף', 'דיזנגוף סנטר', 'בלוך', 'block', 'black', 'bloc', 'ויצמן', 'רוטשילד', 'tel aviv', 'אלון'];
const ix = buildIndex(NAMES.length, (e) => words(NAMES[e]));
const found = (typed: string, typing = false): string[] =>
  wordsFor(ix, words(typed)[0], typing).map((f) => ix.keys[f.word]);
test('a typed word finds itself, a word a slip away, and while typing a word it begins', () => {
  expect(found('דיזנגוף')).toEqual(['דיזנגופ']);
  expect(found('דיזנגף')).toEqual(['דיזנגופ']); // a letter missing
  expect(found('דזינגוף')).toEqual(['דיזנגופ']); // two letters swapped
  expect(found('וייצמן')).toEqual(['ויצמנ']);
  expect(found('דיז')).toEqual([]); // a whole word: three letters are not seven
  expect(found('דיז', true)).toEqual(['דיזנגופ']);
  expect(found('סנט', true)).toEqual(['סנטר']);
  expect(found('אילון')).toEqual(['אלונ']); // a vowel letter more or less is half a slip
});
test('a slip costs, and by sound one vowel is not another', () => {
  // a wrong letter is a slip a five-letter word may have: found, as a worse match than the word itself
  const quality = new Map(wordsFor(ix, 'block', false).map((f) => [ix.keys[f.word], f.quality]));
  expect(quality.get('block')).toBe(1);
  expect(quality.get('black')).toBeLessThan(1);
  // by sound, though, a vowel is that vowel: בלוק is not "black"
  expect(found('בלוק')).not.toContain('black');
  expect(found('בלוק').sort()).toEqual(['bloc', 'block', 'בלוכ']); // ק for כ: the same sound, half a slip
  expect(found('tel')).toEqual(['tel']);
});
test('the index reads back from its packed form as it was', () => {
  const back = unpackIndex(packIndex(ix));
  expect(back.keys).toEqual(ix.keys);
  expect(back.sKeys).toEqual(ix.sKeys);
  for (const k of ['shared', 'off', 'entries', 'sOff', 'said'] as const)
    expect(Array.from(back[k])).toEqual(Array.from(ix[k]));
});
