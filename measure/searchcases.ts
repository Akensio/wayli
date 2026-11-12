// Everyday place searches with their right answers, for measuring a search engine (measure/searchbench.ts): what a rider
// types, and the entry of the address book they mean. Written by hand, by the ways a search goes wrong; every answer is
// checked against the book before a run, so a case whose answer the data lacks is reported, not silently failed.
//
// `want`: the entry meant. `name` is tested against the entry's main name and its English one (case ignored); `city` is
// its city as the book spells it (Hebrew); `kind` narrows to a street, a place or a city. A case passes at k when one
// of the first k results is such an entry (a house number on a street counts as the street).

export type Want = { name: RegExp; city?: string; kind?: 'street' | 'poi' | 'city' };
export type Case = { q: string; want: Want; cat: Category; note?: string };
export type Category =
  | 'as written' // spelt as the data has it
  | 'another spelling' // the same name as riders also write it: a sound-alike letter, a vowel letter more or less
  | 'typo' // a slip of the finger: a letter missing, extra, wrong or swapped
  | 'Hebrew for a Latin name' // the place is named in Latin letters only
  | 'Latin letters' // typed in English
  | 'still typing' // the first letters only
  | 'city' // a city by itself
  | 'written form'; // abbreviations, a comma, "רח'"

const TLV = 'תל אביב יפו';
const street = (name: string, city: string): Want => ({ name: new RegExp(`^${name}$`), city, kind: 'street' });
const BLOC = /^(The Bloc TLV|Bloc Climbing|The Block)$/i; // the climbing gym under its two names, and the club

export const CASES: Case[] = [
  // --- as written
  { q: 'דיזנגוף 50 תל אביב', want: street('דיזנגוף', TLV), cat: 'as written' },
  { q: 'אבן גבירול תל אביב', want: street('אבן גבירול', TLV), cat: 'as written' },
  { q: 'הרצל 10 רחובות', want: street('הרצל', 'רחובות'), cat: 'as written' },
  { q: 'הרצל תל אביב', want: street('הרצל', TLV), cat: 'as written' },
  { q: 'ויצמן 12 כפר סבא', want: street('ויצמן', 'כפר סבא'), cat: 'as written' },
  { q: 'יפו ירושלים', want: street('יפו', 'ירושלים'), cat: 'as written', note: 'a street named after a city' },
  { q: 'חביבה רייך בת ים', want: street('חביבה רייך', 'בת ים'), cat: 'as written' },
  { q: 'דיזנגוף סנטר', want: { name: /^דיזנגוף סנטר$/, city: TLV, kind: 'poi' }, cat: 'as written' },
  { q: 'איקאה נתניה', want: { name: /^איקאה נתניה$/, kind: 'poi' }, cat: 'as written' },
  { q: 'בית חולים בילינסון', want: { name: /^בית חולים בילינסון$/, kind: 'poi' }, cat: 'as written' },
  { q: 'אצטדיון בלומפילד', want: { name: /^אצטדיון בלומפילד$/, kind: 'poi' }, cat: 'as written' },
  { q: 'אוניברסיטת בן גוריון', want: { name: /^אוניברסיטת בן גוריון בנגב$/, kind: 'poi' }, cat: 'as written' },
  { q: 'שוק הכרמל', want: { name: /שוק הכרמל/, city: TLV, kind: 'poi' }, cat: 'as written' },
  { q: 'עזריאלי', want: { name: /עזריאלי/, city: TLV, kind: 'poi' }, cat: 'as written' },
  // --- another spelling of the same name
  { q: 'חביבה רייק בת ים', want: street('חביבה רייך', 'בת ים'), cat: 'another spelling', note: 'ק for ך (2026-11-12)' },
  { q: 'חביבה רייק 4 בת ים', want: street('חביבה רייך', 'בת ים'), cat: 'another spelling' },
  { q: 'וייצמן כפר סבא', want: street('ויצמן', 'כפר סבא'), cat: 'another spelling' },
  { q: 'זבוטינסקי רמת גן', want: street("ז'בוטינסקי", 'רמת גן'), cat: 'another spelling', note: 'no geresh' },
  { q: "ג'בוטינסקי רמת גן", want: street("ז'בוטינסקי", 'רמת גן'), cat: 'another spelling' },
  { q: 'סוקולוף הרצליה', want: street('סוקולוב', 'הרצליה'), cat: 'another spelling' },
  { q: 'טשרנחובסקי תל אביב', want: street('טשרניחובסקי', TLV), cat: 'another spelling' },
  { q: "צ'רניחובסקי תל אביב", want: street('טשרניחובסקי', TLV), cat: 'another spelling' },
  { q: 'ארלוזרוב תל אביב', want: street('ארלוזורוב', TLV), cat: 'another spelling' },
  { q: 'ארלוזורוף תל אביב', want: street('ארלוזורוב', TLV), cat: 'another spelling' },
  { q: 'בן יהודא תל אביב', want: street('בן יהודה', TLV), cat: 'another spelling' },
  { q: 'לה גרדיה תל אביב', want: street('לה גוו?ארדיה', TLV), cat: 'another spelling' },
  { q: 'קרליבאך תל אביב', want: street('קרליבך', TLV), cat: 'another spelling' },
  { q: 'יגאל אילון תל אביב', want: street('יגאל אלון', TLV), cat: 'another spelling' },
  { q: 'קצנלסון גבעתיים', want: street('כצנלסון', 'גבעתיים'), cat: 'another spelling' },
  { q: 'שנקין תל אביב', want: street('שינקין', TLV), cat: 'another spelling' },
  { q: 'פרישמאן תל אביב', want: street('פרישמן', TLV), cat: 'another spelling' },
  { q: 'בוגרשוף תל אביב', want: street('בוגרשוב', TLV), cat: 'another spelling' },
  { q: 'שאול מלך תל אביב', want: street('שאול המלך', TLV), cat: 'another spelling', note: 'the article left out' },
  { q: 'אלמבי תל אביב', want: street('אלנבי', TLV), cat: 'another spelling', note: 'as it is heard' },
  // --- typos
  { q: 'דיזנגף תל אביב', want: street('דיזנגוף', TLV), cat: 'typo', note: 'a letter missing' },
  { q: 'דיזנגווף תל אביב', want: street('דיזנגוף', TLV), cat: 'typo', note: 'a letter extra' },
  { q: 'דיזגנוף תל אביב', want: street('דיזנגוף', TLV), cat: 'typo', note: 'two swapped' },
  { q: 'דיזנגוב תל אביב', want: street('דיזנגוף', TLV), cat: 'typo', note: 'a letter wrong' },
  { q: 'אבן גבירל תל אביב', want: street('אבן גבירול', TLV), cat: 'typo' },
  { q: 'רוטשליד תל אביב', want: street('רוטשילד', TLV), cat: 'typo' },
  { q: 'ארלוזורב תל אביב', want: street('ארלוזורוב', TLV), cat: 'typo' },
  { q: 'הרצך רחובות', want: street('הרצל', 'רחובות'), cat: 'typo', note: 'the key beside it' },
  { q: 'אונברסיטת בן גוריון', want: { name: /^אוניברסיטת בן גוריון בנגב$/, kind: 'poi' }, cat: 'typo' },
  // --- Hebrew typed for a place named in Latin letters only
  { q: 'בלוק תל אביב', want: { name: BLOC, city: TLV, kind: 'poi' }, cat: 'Hebrew for a Latin name' },
  { q: 'הבלוק תל אביב', want: { name: BLOC, city: TLV, kind: 'poi' }, cat: 'Hebrew for a Latin name' },
  {
    q: 'בלוק TLV',
    want: { name: /^The Bloc TLV$/, kind: 'poi' },
    cat: 'Hebrew for a Latin name',
    note: 'two alphabets',
  },
  { q: 'וולט', want: { name: /^wolt\b/i, kind: 'poi' }, cat: 'Hebrew for a Latin name' },
  { q: 'סטארבקס', want: { name: /^Starbucks/, kind: 'poi' }, cat: 'Hebrew for a Latin name' },
  { q: 'גוגל תל אביב', want: { name: /^Google/, city: TLV, kind: 'poi' }, cat: 'Hebrew for a Latin name' },
  { q: 'קרוספיט תל אביב', want: { name: /^CrossFit/i, city: TLV, kind: 'poi' }, cat: 'Hebrew for a Latin name' },
  { q: 'אדידס', want: { name: /^Adidas/, kind: 'poi' }, cat: 'Hebrew for a Latin name' },
  // --- typed in Latin letters
  { q: 'the block', want: { name: /^The Block$/, kind: 'poi' }, cat: 'Latin letters' },
  { q: 'bloc tlv', want: { name: /^The Bloc TLV$/, kind: 'poi' }, cat: 'Latin letters' },
  { q: 'dizengoff center', want: { name: /^דיזנגוף סנטר$/, kind: 'poi' }, cat: 'Latin letters' },
  { q: 'azrieli', want: { name: /עזריאלי/, kind: 'poi' }, cat: 'Latin letters' },
  { q: 'rothschild 22 tel aviv', want: street('רוטשילד', TLV), cat: 'Latin letters' },
  { q: 'ibn gabirol tel aviv', want: street('אבן גבירול', TLV), cat: 'Latin letters' },
  { q: 'ikea netanya', want: { name: /^איקאה נתניה$/, kind: 'poi' }, cat: 'Latin letters' },
  { q: 'carmel market', want: { name: /שוק הכרמל/, kind: 'poi' }, cat: 'Latin letters' },
  { q: 'weizman kfar saba', want: street('ויצמן', 'כפר סבא'), cat: 'Latin letters', note: 'the data has Weizmann' },
  { q: 'haviva reik bat yam', want: street('חביבה רייך', 'בת ים'), cat: 'Latin letters' },
  { q: 'jabotinsky ramat gan', want: street("ז'בוטינסקי", 'רמת גן'), cat: 'Latin letters' },
  { q: 'bloomfield stadium', want: { name: /^אצטדיון בלומפילד$/, kind: 'poi' }, cat: 'Latin letters' },
  // --- still typing
  { q: 'דיזנג', want: { name: /^דיזנגוף/ }, cat: 'still typing' },
  { q: 'עזריא', want: { name: /עזריאלי/ }, cat: 'still typing' },
  { q: 'אבן גב', want: { name: /^אבן גבירול$/ }, cat: 'still typing' },
  { q: 'ארלוז', want: { name: /^ארלוזורוב$/ }, cat: 'still typing' },
  { q: 'בלומפ', want: { name: /בלומפילד/ }, cat: 'still typing' },
  { q: 'dizeng', want: { name: /^דיזנגוף/ }, cat: 'still typing' },
  // --- a city by itself
  { q: 'ירושלים', want: { name: /^ירושלים$/, kind: 'city' }, cat: 'city' },
  { q: 'בת ים', want: { name: /^בת ים$/, kind: 'city' }, cat: 'city' },
  { q: 'תל אביב', want: { name: /^תל אביב יפו$/, kind: 'city' }, cat: 'city' },
  { q: 'חיפה', want: { name: /^חיפה$/, kind: 'city' }, cat: 'city' },
  { q: 'petah tikva', want: { name: /^פתח תקווה$/, kind: 'city' }, cat: 'city' },
  // --- written forms
  { q: 'דיזנגוף 50, תל אביב', want: street('דיזנגוף', TLV), cat: 'written form' },
  { q: "רח' הרצל 5 רמת גן", want: street('הרצל', 'רמת גן'), cat: 'written form' },
  { q: "שד' רוטשילד תל אביב", want: street('רוטשילד', TLV), cat: 'written form' },
  { q: 'בי"ח איכילוב', want: { name: /איכילוב/, city: TLV, kind: 'poi' }, cat: 'written form' },
  { q: 'קניון איילון', want: { name: /קניון איילון/, city: 'רמת גן', kind: 'poi' }, cat: 'written form' },
];
