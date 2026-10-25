// Text as the searches compare it: the stop search (raptor.js) and the address book (places.js) normalise both what
// is typed and the names they hold the same way, and rank their matches the same way.
const PUNCT = /[.'"״׳`/()\-,:]+/g;
const INNER_QUOTE = /(?<=[\p{L}])['"״׳`]+(?=[\p{L}])/gu;   // הל"ה, צה"ל, ג'וליס, Far'a: the mark is part of the word

/** Lower case, one space between words; a quote mark inside a word is dropped (הל"ה -> הלה), other punctuation separates. */
export function norm(s) { return String(s || '').toLowerCase().replace(INNER_QUOTE, '').replace(PUNCT, ' ').replace(/\s+/g, ' ').trim(); }
/** Best match first; of two as good, the shorter name (the plain "Haifa" before "Haifa Bay"). */
export const byScore = (a, b) => b.score - a.score || a.name.length - b.name.length;
