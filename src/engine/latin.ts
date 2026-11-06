// One language on screen (docs/principles.md, rule 3): a name shown in English never carries Hebrew letters. The data
// brings English where it has it (the feed's translations, OpenStreetMap's names, the build's own transliterations in
// the address book and the timetable, pipeline/english.py); this is the last resort in the app itself, for a name that
// reaches the screen with no English at all: the same rule transliteration as the build's third layer, ported, so the
// worst case is a readable guess ("Piter") and never a Hebrew word in an English sentence. Every name helper that
// hands a name to the screen in English goes through `inLatin` (engine/raptor.ts stop, station, city and headsign
// names; engine/places.ts streets, places and cities); tests/latin.test.ts holds them to it.
const HEB = /[א-ת]/;
const CONS: Record<string, string> = {
  ב: 'v',
  ג: 'g',
  ד: 'd',
  ז: 'z',
  ח: 'ch',
  ט: 't',
  כ: 'kh',
  ך: 'kh',
  ל: 'l',
  מ: 'm',
  ם: 'm',
  נ: 'n',
  ן: 'n',
  ס: 's',
  פ: 'f',
  ף: 'f',
  צ: 'tz',
  ץ: 'tz',
  ק: 'k',
  ר: 'r',
  ש: 'sh',
  ת: 't',
};
const VOWELS = new Set('אהוי');
const VAV_YOD = new Set('וי');
const PREFIX_LETTERS: Record<string, string> = { ל: 'e', כ: 'e', ש: 'e', מ: 'i' };
const QUOTES = new Set('"\'״׳`');
const ONE_LETTER: Record<string, string> = { א: 'A', ע: 'A', ה: 'H', ו: 'V', י: 'Y' };
const CONSONANT = /^[bcdfgjklmnpqrstvxz]/;
const DROP = new Set(['ע"ש', 'ע״ש', 'עש', 'בע"מ', 'בע״מ', 'בעמ']);
const SEP = /([\s.,;:!?()[\]/\-–—]+)/;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A Hebrew word in Latin letters by rule, capitalised (pipeline/english.py translit, the same rules). */
export function latinWord(w: string): string {
  if (w.length === 1) return ONE_LETTER[w] || (CONS[w] || w).toUpperCase();
  if (w.length > 3 && w[0] === 'ה' && !VOWELS.has(w[1])) return 'Ha' + latinWord(w.slice(1)); // the article: HaFranki
  const out: string[] = [];
  if (w.length > 3 && PREFIX_LETTERS[w[0]] && !VOWELS.has(w[1]) && !QUOTES.has(w[1])) w = w[0] + '\0' + w.slice(1);
  const n = w.length;
  for (let i = 0; i < n; i++) {
    const c = w[i],
      prev = i ? w[i - 1] : '',
      nxt = i + 1 < n ? w[i + 1] : '',
      last = i === n - 1;
    if (c === '\0') out.push(PREFIX_LETTERS[prev]);
    else if (c === 'א') {
      if (i === 0 && nxt === 'י')
        out.push('i'); // איתן: the yod is this vowel
      else if (!last && VAV_YOD.has(prev) && nxt === 'ה' && i + 2 === n)
        out.push('a'); // רפואה
      else if (!last) out.push(!VAV_YOD.has(nxt) && !VAV_YOD.has(prev) ? 'a' : '');
      else out.push(!VOWELS.has(prev) ? 'a' : '');
    } else if (c === 'ע') out.push(!last && !VAV_YOD.has(nxt) && !VAV_YOD.has(prev) ? 'a' : '');
    else if (c === 'ה') {
      if (i === 0 && !last) out.push('ha');
      else if (!last) out.push('h');
      else out.push(!VOWELS.has(prev) ? 'a' : '');
    } else if (c === 'ו') {
      if (i === 0) out.push('v');
      else if (prev === 'ו') {
        /* וו: one v, written for the first */
      } else if (nxt === 'ו') out.push('v');
      else out.push('o');
    } else if (c === 'י') {
      if (i === 0) out.push('y');
      else if (prev === 'א' && i === 1) {
        /* the alef wrote it */
      } else if (prev === 'ה' && i === 1)
        out.push('y'); // הישן
      else if (prev === 'ו' && i === 1 && nxt !== 'י')
        out.push('i'); // ויצמן
      else if (nxt === 'י')
        out.push(!VOWELS.has(prev) ? 'a' : ''); // יי between consonants: a-yi (חיים)
      else if (prev === 'י') {
        if (i === 2 && w[0] === 'ו')
          out.push('ai'); // וייס
        else out.push(nxt && !VOWELS.has(nxt) ? 'yi' : 'y');
      } else if ('אעו'.includes(prev)) out.push('y');
      else out.push('i');
    } else if (c === 'ב') out.push(i === 0 || prev === '\0' ? 'b' : 'v');
    else if (c === 'כ') out.push(i === 0 || prev === '\0' ? 'k' : 'kh');
    else if (c === 'פ') out.push(i === 0 || prev === '\0' ? 'p' : 'f');
    else if (QUOTES.has(c)) {
      const l = out[out.length - 1];
      if (l === 'g') out[out.length - 1] = 'j';
      else if (l === 'tz') out[out.length - 1] = 'ch';
      else if (l === 'z') out[out.length - 1] = 'zh';
    } else if (CONS[c]) out.push(CONS[c]);
    else out.push(c);
  }
  // a light vowel between consonant clusters, as the build does it
  const units = out.join('').match(/ch|kh|sh|tz|zh|[a-z]/g) || [];
  const cons = units.map((u) => CONSONANT.test(u));
  const segolate = units.length === 3 && cons.every(Boolean);
  for (let i = 0; i + 2 < units.length; i++)
    if (cons[i] && cons[i + 1] && cons[i + 2]) {
      const at = i === 0 ? i + 1 : i + 2;
      units.splice(at, 0, segolate ? 'e' : 'a');
      cons.splice(at, 0, false);
    }
  if (units.length === 2 && cons[0] && cons[1]) units.splice(1, 0, 'a');
  else if (units.length === 3 && cons[0] && cons[1] && !cons[2]) units.splice(1, 0, 'a');
  else if (
    units.length >= 3 &&
    cons[units.length - 1] &&
    cons[units.length - 2] &&
    units[units.length - 2] !== units[units.length - 1]
  )
    units.splice(units.length - 1, 0, 'e');
  return cap(units.join(''));
}

/** `name` fit for an English screen: as it is when it has no Hebrew letters; else each Hebrew word transliterated by
 *  rule, the rest (Latin words, digits, punctuation) kept. '' stays ''. */
export function inLatin(name: string): string {
  if (!name || !HEB.test(name)) return name;
  return name
    .split(SEP)
    .map((part) => {
      if (!HEB.test(part)) return part;
      const bare = part.replace(/^["'״׳`]+|["'״׳`]+$/g, '');
      if (!bare || DROP.has(bare)) return '';
      return latinWord(bare);
    })
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
/** Whether a string carries Hebrew letters: what must never reach an English screen (tests/latin.test.ts). */
export const hasHebrew = (s: string): boolean => HEB.test(s);
