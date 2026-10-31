// Wayli: offline address book (streets, house numbers, cities, notable places) from pipeline/places.py.
// Free-text search that understands "הורדים 4, גבעתיים", "דיזנגוף סנטר", "חיפה", and the same typed in
// Latin letters ("Havradim 4 givatayim", "Dizengoff Center", "Haifa").
import { haversine, scaleAt, type LatLon } from './geo.ts';
import { readContainer, type Container, type ContainerHeader } from './container.ts';
import { norm, byScore } from './text.ts';

/** The language names are given in: Hebrew, or English where the data has it (else Hebrew). */
import type { Lang } from './text.ts';
export type { Lang };
/** A street as the header lists it: its Hebrew name, its city (Hebrew, from the nearest stop; '' when none), where it
 *  is (the mean of its ways, degrees), and OpenStreetMap's English name ('' when none). */
export type StreetRow = [name: string, city: string, lat: number, lon: number, nameEn: string];
/** A city as the feed spells it, where it is (the mean of its stops, degrees), and the feed's English name ('' when none). */
export type CityRow = [name: string, lat: number, lon: number, nameEn: string];
/** A notable or everyday place: its Hebrew name, its kind (the OpenStreetMap tag, "key=value"), its city, where it is
 *  (degrees), and its English name ('' when none). */
export type PoiRow = [name: string, kind: string, city: string, lat: number, lon: number, nameEn: string];
/** The address book's header (pipeline/places.py): the names, which are too irregular for typed arrays. */
export type PlacesHeader = ContainerHeader & {
  format?: number;
  source?: string;
  built?: string;
  counts: { streets: number; addresses: number; pois: number; cities: number };
  streets: StreetRow[];
  cities: CityRow[];
  pois: PoiRow[];
  /** address index → its suffix (the "א" of 4א), only for the addresses that have one. */
  addrSuffix?: Record<string, string>;
};
/** The sections, one entry per address (sorted by street, then number): the street's index in `streets`, the house
 *  number (uint16), and where it is (degrees). */
export type PlacesSections = 'addrStreet' | 'addrNumber' | 'addrLat' | 'addrLon';
/** The address book as parsePlaces builds it: the container, the header's lists at hand, and the indexes the search
 *  needs. Everything is by index: street s is `streets[s]`, its addresses are `addrOff[s]` up to `addrOff[s + 1]`. */
export type Places = Container<PlacesSections, PlacesHeader> & {
  streets: StreetRow[];
  cities: CityRow[];
  pois: PoiRow[];
  addrSuffix: Record<string, string>;
  /** Per street, the index of its first address; the next street's is where its addresses end (length streets + 1). */
  addrOff: Int32Array;
  streetWords: string[][]; // per street, the words of its Hebrew name in their looser form (canon)
  streetCity: string[]; // per street, its city, normalised
  cityNorm: string[]; // per city, its Hebrew name, normalised
  cityEnNorm: string[]; // per city, its English name, normalised ('' when none)
  cityEnByHe: Map<string, string>; // a city's English name by its Hebrew one, for the cities that have one
  poiWords: string[][]; // per place, the words of its Hebrew name in their looser form
  poiCity: string[]; // per place, its city, normalised
  // built on the first query in Latin letters (ensureLatin), absent until then
  streetEn?: string[][]; // per street, the words of its English name, without the street-type words
  streetSk?: string[][][]; // per street, per Hebrew word, the consonant skeletons it may be spelt as
  poiEn?: string[][];
  poiSk?: string[][][];
  citySk?: string[][][];
  cityEnWords?: string[][];
};

/** Looser form for matching Hebrew: drop a leading ה, collapse doubled ו/י, drop common street-word prefixes. */
function canon(word: string): string {
  let w = word.replace(/^(רחוב|רח|שדרות|שד|דרך|סמטת|כיכר|ככר)$/, '');
  if (!w) return '';
  if (w.length > 2 && w[0] === 'ה') w = w.slice(1);
  w = w.replace(/וו/g, 'ו').replace(/יי/g, 'י');
  return w;
}
const words = (s: string): string[] => norm(s).split(' ').filter(Boolean).map(canon).filter(Boolean);
/** Everyday names for cities the feed spells in full. */
const CITY_ALIASES: Record<string, string> = {
  'תל אביב': 'תל אביב יפו',
  'ת א': 'תל אביב יפו',
  תא: 'תל אביב יפו',
  'ב ש': 'באר שבע',
  בש: 'באר שבע',
  'ראשל צ': 'ראשון לציון',
  ראשלצ: 'ראשון לציון',
  'פ ת': 'פתח תקווה',
  פת: 'פתח תקווה',
  'כ ס': 'כפר סבא',
  'ר ג': 'רמת גן',
  רג: 'רמת גן',
  'י ם': 'ירושלים',
  ים: 'ירושלים',
  מודיעין: 'מודיעין מכבים רעות',
  'נוף הגליל': 'נוף הגליל',
  'נצרת עילית': 'נוף הגליל',
};
const IMPORTANT = new Set([
  'amenity=hospital',
  'healthcare=hospital',
  'amenity=university',
  'amenity=college',
  'shop=mall',
  'railway=station',
  'amenity=bus_station',
  'aeroway=aerodrome',
  'aeroway=terminal',
  'tourism=museum',
  'leisure=stadium',
  'amenity=townhall',
]);
/** Up to +3 for places within a few km of `near`, fading out by 30 km. */
function proximity(near: LatLon | null, lat: number, lon: number): number {
  if (!near) return 0;
  const km = haversine(near.lat, near.lon, lat, lon) / 1000;
  if (km <= 3) return 3 - km * 0.05; // nearer first, even among places close by
  if (km >= 30) return 0;
  return (2.85 * (30 - km)) / 27;
}

/** The address book from its file: the container, the header's lists at hand, and the search's indexes. */
export function parsePlaces(ab: ArrayBuffer): Places {
  const pl = readContainer<PlacesSections, PlacesHeader>(ab) as Places,
    header = pl.header;
  Object.assign(pl, {
    streets: header.streets,
    cities: header.cities,
    pois: header.pois,
    addrSuffix: header.addrSuffix || {},
  });
  // address ranges per street (addresses are sorted by street, then number)
  const S = pl.streets.length,
    A = pl.addrStreet.length;
  const off = new Int32Array(S + 1);
  for (let i = 0; i < A; i++) off[pl.addrStreet[i] + 1]++;
  for (let s = 0; s < S; s++) off[s + 1] += off[s];
  pl.addrOff = off;
  pl.streetWords = pl.streets.map((s) => words(s[0]));
  pl.streetCity = pl.streets.map((s) => norm(s[1]));
  pl.cityNorm = pl.cities.map((c) => norm(c[0]));
  pl.cityEnNorm = pl.cities.map((c) => norm(c[3] || ''));
  pl.cityEnByHe = new Map(pl.cities.filter((c) => c[3]).map((c): [string, string] => [c[0], c[3]]));
  pl.poiWords = pl.pois.map((p) => words(p[0]));
  pl.poiCity = pl.pois.map((p) => norm(p[2]));
  return pl;
}

/** Landmarks: the kinds the search ranks above streets (pipeline/places.py POI_TAGS). */
const LANDMARK_HE = {
  'amenity=hospital': 'בית חולים',
  'healthcare=hospital': 'בית חולים',
  'amenity=clinic': 'מרפאה',
  'amenity=university': 'אוניברסיטה',
  'amenity=college': 'מכללה',
  'amenity=library': 'ספרייה',
  'amenity=townhall': 'עירייה',
  'amenity=cinema': 'קולנוע',
  'amenity=theatre': 'תיאטרון',
  'amenity=courthouse': 'בית משפט',
  'amenity=police': 'משטרה',
  'amenity=community_centre': 'מתנ"ס',
  'amenity=marketplace': 'שוק',
  'amenity=bus_station': 'תחנה מרכזית',
  'amenity=ferry_terminal': 'נמל',
  'amenity=conference_centre': 'מרכז כנסים',
  'shop=mall': 'קניון',
  'shop=department_store': 'חנות כלבו',
  'shop=supermarket': 'סופרמרקט',
  'leisure=park': 'פארק',
  'leisure=stadium': 'אצטדיון',
  'leisure=sports_centre': 'מרכז ספורט',
  'leisure=beach_resort': 'חוף',
  'leisure=nature_reserve': 'שמורת טבע',
  'leisure=water_park': 'פארק מים',
  'tourism=attraction': 'אתר',
  'tourism=museum': 'מוזיאון',
  'tourism=zoo': 'גן חיות',
  'tourism=theme_park': 'פארק שעשועים',
  'tourism=viewpoint': 'תצפית',
  'tourism=aquarium': 'אקווריום',
  'railway=station': 'תחנת רכבת',
  'public_transport=station': 'תחנה',
  'aeroway=aerodrome': 'שדה תעופה',
  'aeroway=terminal': 'טרמינל',
  'natural=beach': 'חוף',
  'historic=archaeological_site': 'אתר עתיקות',
  'historic=castle': 'מבצר',
  'historic=monument': 'אנדרטה',
  'office=government': 'משרד ממשלתי',
};
/** Everyday places (pipeline/places.py EVERYDAY_TAGS), ranked level with streets; shops and offices not named here get a general label. */
const EVERYDAY_HE = {
  'amenity=restaurant': 'מסעדה',
  'amenity=cafe': 'בית קפה',
  'amenity=fast_food': 'מזון מהיר',
  'amenity=bar': 'בר',
  'amenity=pub': 'פאב',
  'amenity=ice_cream': 'גלידריה',
  'amenity=food_court': 'מתחם אוכל',
  'amenity=nightclub': 'מועדון',
  'amenity=pharmacy': 'בית מרקחת',
  'amenity=bank': 'בנק',
  'amenity=post_office': 'דואר',
  'amenity=school': 'בית ספר',
  'amenity=kindergarten': 'גן ילדים',
  'amenity=place_of_worship': 'בית תפילה',
  'amenity=arts_centre': 'מרכז אמנויות',
  'amenity=events_venue': 'אולם אירועים',
  'amenity=dentist': 'מרפאת שיניים',
  'amenity=doctors': 'רופא',
  'amenity=veterinary': 'וטרינר',
  'amenity=bicycle_rental': 'השכרת אופניים',
  'amenity=car_rental': 'השכרת רכב',
  'tourism=hotel': 'מלון',
  'tourism=hostel': 'אכסניה',
  'tourism=guest_house': 'צימר',
  'tourism=gallery': 'גלריה',
  'leisure=fitness_centre': 'חדר כושר',
  'leisure=swimming_pool': 'בריכה',
  'leisure=garden': 'גן',
  'shop=bakery': 'מאפייה',
  'shop=convenience': 'מכולת',
  'shop=clothes': 'חנות בגדים',
  'shop=books': 'חנות ספרים',
  'shop=florist': 'חנות פרחים',
  'shop=bicycle': 'חנות אופניים',
  'shop=hairdresser': 'מספרה',
  'shop=greengrocer': 'ירקן',
  'shop=butcher': 'אטליז',
  'shop=optician': 'אופטיקה',
  'shop=electronics': 'אלקטרוניקה',
  'shop=mobile_phone': 'טלפונים',
  'shop=furniture': 'רהיטים',
  'shop=hardware': 'כלי עבודה',
  'shop=doityourself': 'עשה זאת בעצמך',
  'shop=kiosk': 'קיוסק',
  'shop=alcohol': 'משקאות',
  'shop=beauty': 'קוסמטיקה',
  'shop=jewelry': 'תכשיטים',
  'shop=shoes': 'נעליים',
  'shop=toys': 'צעצועים',
  'shop=pet': 'חיות מחמד',
  'shop=deli': 'מעדנייה',
  'shop=pastry': 'קונדיטוריה',
};
const KIND_HE: Record<string, string> = { ...LANDMARK_HE, ...EVERYDAY_HE };
const LANDMARK = new Set(Object.keys(LANDMARK_HE));
/** A place's kind, an OpenStreetMap tag "key=value": one the search has a label for, or any other of the pipeline's
 *  (a shop or an office not named here gets a general label). */
export type PoiKind = keyof typeof LANDMARK_HE | keyof typeof EVERYDAY_HE | (string & {});
/** A place's kind in words: the Hebrew label, else a general one ("חנות", "משרד", "מקום"); in English the tag's own value. */
export function kindLabel(kind: PoiKind, lang: Lang = 'he'): string {
  if (lang !== 'he') return kind.split('=')[1].replace(/_/g, ' ');
  if (KIND_HE[kind]) return KIND_HE[kind];
  if (kind.startsWith('shop=')) return 'חנות';
  if (kind.startsWith('office=')) return 'משרד';
  return 'מקום';
}

// ---------------------------------------------------------------- names typed in Latin letters
// Streets and places carry OpenStreetMap's English name beside the Hebrew; cities the feed's. Where there is
// none, or the rider spells it their own way (Havradim, HaVradim, Ha-Vradim), both scripts reduce to a
// consonant skeleton: vowels dropped, letters that sound alike merged, doubled letters collapsed.
const LATIN_STOP = new Set([
  'street',
  'st',
  'road',
  'rd',
  'boulevard',
  'blvd',
  'avenue',
  'ave',
  'alley',
  'lane',
  'way',
  'square',
  'sq',
  'rehov',
  'rechov',
  'sderot',
  'sd',
  'derech',
  'derekh',
  'kikar',
  'simtat',
  'the',
]);
const isLatin = (w: string): boolean => /[a-z]/.test(w);
/** The words of an English name, lower case, without the street-type words. */
function wordsEn(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((w) => w && !LATIN_STOP.has(w));
}
const HEB_SK: Record<string, string> = {
  ב: 'v',
  ג: 'g',
  ד: 'd',
  ה: 'h',
  ו: 'V',
  ז: 'z',
  ח: 'X',
  ט: 't',
  כ: 'K',
  ך: 'K',
  ל: 'l',
  מ: 'm',
  ם: 'm',
  נ: 'n',
  ן: 'n',
  ס: 's',
  פ: 'p',
  ף: 'p',
  צ: 'z',
  ץ: 'z',
  ק: 'k',
  ר: 'r',
  ש: 's',
  ת: 't',
}; // א ע י: dropped
const squash = (s: string): string => s.replace(/(.)\1+/g, '$1');
/** 'hVrdm' -> ['hvrdm', 'hrdm'] (V: ו, a consonant or a vowel); K: כ, written k or kh/ch (x); X: ח, written h or kh/ch. */
// the letters a Latin spelling may stand for: V may be silent (a vav read as a vowel), K may be a kaf or a khaf, X a het or a khaf
const LATIN_ALTS: Record<string, string[]> = { V: ['v', ''], K: ['k', 'x'], X: ['h', 'x'] };
function expand(s: string): string[] {
  let out = [''];
  for (const c of s) {
    const alts = LATIN_ALTS[c] || [c];
    const next: string[] = [];
    for (const o of out) for (const a of alts) next.push(o + a);
    out = next.length > 16 ? next.slice(0, 16) : next;
  }
  return [...new Set(out.map(squash))].filter(Boolean);
}
function skelHe(word: string): string[] {
  const chars = [...word];
  let s = '';
  chars.forEach((c, i) => {
    if (c === 'ה' && i === chars.length - 1 && chars.length > 1) return; // a final ה is a vowel
    s += HEB_SK[c] ?? (/\d/.test(c) ? c : '');
  });
  return expand(s);
}
function skelLatin(word: string): string[] {
  const w = word.toLowerCase();
  let s = w
    .replace(/sch/g, 's')
    .replace(/sh/g, 's')
    .replace(/tch/g, 'z')
    .replace(/ch|kh/g, 'x')
    .replace(/ts|tz/g, 'z')
    .replace(/th/g, 't')
    .replace(/ph/g, 'p')
    .replace(/ck/g, 'k')
    .replace(/[qc]/g, 'k')
    .replace(/[bw]/g, 'v')
    .replace(/f/g, 'p')
    .replace(/j/g, 'J'); // x: a guttural (ח or כ)
  const bases: string[] = [];
  const vowelH = /[aeiouy]h$/.test(w); // "Tikvah": a bare final h after a vowel is a vowel (ה) or a consonant (ח); "Petach" is ח
  for (const b of vowelH ? [s, s.slice(0, -1)] : [s]) {
    const c = b.replace(/[aeiouy]/g, '').replace(/[^a-z0-9J]/g, ''); // x stays: the guttural
    if (c.includes('J')) bases.push(c.replace(/J/g, 'z'), c.replace(/J/g, 'g'));
    else bases.push(c); // ז' and ג' are both j
  }
  const out: string[] = [];
  for (const b of bases) {
    out.push(squash(b));
    if (w.startsWith('ha') && b.length > 2) out.push(squash(b.slice(1))); // "HaVradim": the article, which Hebrew matching drops
  }
  return [...new Set(out)].filter(Boolean);
}
/** A query word with what it can match: a Hebrew word as it is (`sk` null), a Latin word by the English name or by the
 *  skeletons it may stand for. */
type QueryWord = { w: string; latin: boolean; sk: string[] | null };
/** The query's words with what each can match: Hebrew words as they are, Latin words by English name or skeleton. */
const queryWords = (words: string[]): QueryWord[] =>
  words.map((w) => ({ w, latin: isLatin(w), sk: isLatin(w) ? skelLatin(w) : null }));
/** English names and skeletons of every street, place and city, built on the first Latin query. */
function ensureLatin(pl: Places): void {
  if (pl.streetSk) return;
  pl.streetEn = pl.streets.map((s) => wordsEn(s[4] || ''));
  pl.streetSk = pl.streetWords.map((ws) => ws.map(skelHe));
  pl.poiEn = pl.pois.map((p) => wordsEn(p[5] || ''));
  pl.poiSk = pl.poiWords.map((ws) => ws.map(skelHe));
  pl.citySk = pl.cities.map((c) => words(c[0]).map(skelHe));
  pl.cityEnWords = pl.cities.map((c) => wordsEn(c[3] || ''));
}

function wordScore(q: string, w: string, i: number, firstWordNames: boolean): number {
  if (w === q) {
    if (q.length < 2) return 1;
    if (!firstWordNames) return 4;
    return i === 0 ? 5 : 3;
  }
  if (q.length >= 2 && w.startsWith(q)) return i === 0 ? 2.5 : 2;
  if (q.length >= 3 && w.includes(q)) return 1;
  return 0;
}
function skelScore(qv: string[], wv: string[], i: number, firstWordNames: boolean): number {
  let best = 0;
  for (const a of qv)
    for (const b of wv) {
      if (a === b) {
        // two consonants say little ("hs": Hish, Yehoash); only a street's first word counts as exact
        let exact = 2.9;
        if (a.length < 3) exact = 1.5;
        else if (firstWordNames && i === 0) exact = 4.5;
        best = Math.max(best, exact);
      } else if (a.length >= 2 && b.startsWith(a)) best = Math.max(best, i === 0 ? 2.2 : 1.8);
    }
  return best;
}
/**
 * Does every query word match a word of the name? Returns a score, or 0. A street is named by its
 * first word, so an exact match there counts most; a place's words count alike (מרכז עזריאלי, קניון עזריאלי).
 * A name typed in full beats partial matches. A Latin word matches the English name, or the skeleton of the
 * Hebrew one (a little lower, so a spelled-out English name wins over a sound-alike).
 */
function matchEntry(
  qs: QueryWord[],
  he: string[],
  en: string[] | null,
  sk: string[][] | null,
  firstWordNames = true,
): number {
  let score = 0,
    exact = 0,
    latin = false;
  for (const q of qs) {
    let best = 0;
    if (!q.latin) {
      for (let i = 0; i < he.length; i++) best = Math.max(best, wordScore(q.w, he[i], i, firstWordNames));
    } else {
      latin = true;
      if (en) for (let i = 0; i < en.length; i++) best = Math.max(best, wordScore(q.w, en[i], i, firstWordNames));
      if (sk) for (let i = 0; i < sk.length; i++) best = Math.max(best, skelScore(q.sk!, sk[i], i, firstWordNames));
    }
    if (!best) return 0;
    if (best >= 3) exact++;
    score += best;
  }
  const n = latin && en && en.length ? en.length : he.length;
  if (exact === qs.length && qs.length === n) score += 1;
  return score - n * 0.05;
}
const sameSkel = (a: string[][], b: string[][]): boolean =>
  a.length === b.length && a.every((qa, i) => qa.some((x) => b[i].includes(x)));
const prefixSkel = (a: string[][], b: string[][]): boolean =>
  a.length <= b.length && a.every((qa, i) => qa.some((x) => b[i].includes(x))); // "tel aviv" for תל אביב יפו

/** A query parsed: the words to match (in their looser form), the house number typed and its suffix, the city named
 *  (its index in `cities`, -1 when none) and the text that named it. */
type ParsedQuery = { words: string[]; number: number | null; suffix: string; cityIdx: number; cityText: string };
/**
 * Parse free text: words, an optional house number, an optional city (after a comma, or trailing words naming a city).
 */
function parseQuery(pl: Places, text: string): ParsedQuery {
  const parts = String(text || '')
    .split(',')
    .map(norm)
    .filter(Boolean); // the city after a comma (norm makes a comma a space)
  let main = parts[0] || '',
    cityText = parts.slice(1).join(' ');
  const toks = main.split(' ').filter(Boolean);
  let number: number | null = null,
    suffix = '';
  const rest: string[] = [];
  for (const t of toks) {
    const m = t.match(/^(\d{1,5})([א-תa-z]?)$/);
    if (m && number === null) {
      number = Number(m[1]);
      suffix = m[2];
    } else rest.push(t);
  }
  if (isLatin(main) || isLatin(cityText)) ensureLatin(pl);
  const findCity = (text: string): number => {
    const t = CITY_ALIASES[text] || text;
    let ci = pl.cityNorm.indexOf(t);
    if (ci < 0) ci = pl.cityEnNorm.indexOf(t);
    if (ci < 0 && t.length >= 3)
      ci = pl.cityNorm.findIndex((c, i) => c.startsWith(t + ' ') || pl.cityEnNorm[i].startsWith(t + ' '));
    if (ci < 0 && isLatin(t)) {
      const sk = t.split(' ').map(skelLatin);
      ci = pl.citySk!.findIndex((cs) => prefixSkel(sk, cs));
    } // Givatayim, Petach Tikvah
    return ci;
  };
  let cityIdx = -1;
  // the whole text names a city ("petach tikva", "tel aviv"): nothing else to look for
  if (!cityText && number === null && rest.length >= 2) {
    const ci = findCity(rest.join(' '));
    if (ci >= 0) return { words: [], number, suffix, cityIdx: ci, cityText: rest.join(' ') };
  }
  // trailing words that name a city, when no comma was used (longest match first)
  if (!cityText && rest.length >= 2) {
    for (let k = Math.min(3, rest.length - 1); k >= 1; k--) {
      const ci = findCity(rest.slice(-k).join(' '));
      if (ci >= 0) {
        cityIdx = ci;
        rest.splice(-k, k);
        break;
      }
    }
  } else if (cityText) {
    cityIdx = findCity(cityText);
    if (cityIdx < 0)
      cityIdx = pl.cityNorm.findIndex((c, i) => c.startsWith(cityText) || pl.cityEnNorm[i].startsWith(cityText));
  }
  return { words: rest.map(canon).filter(Boolean), number, suffix, cityIdx, cityText };
}

// names as the rider's language wants them: English where the data has it, else Hebrew
const streetName = (pl: Places, s: number, lang: Lang): string =>
  (lang === 'en' && pl.streets[s][4]) || pl.streets[s][0];
const poiName = (pl: Places, p: number, lang: Lang): string => (lang === 'en' && pl.pois[p][5]) || pl.pois[p][0];
const cityOf = (pl: Places, he: string, lang: Lang): string =>
  (lang === 'en' && he && pl.cityEnByHe.get(he)) || he || '';

/** What is at a point (reverseGeocode): the nearest address, place or street, named in the rider's language, its city
 *  ('' when none), and how far it is from the point (metres). */
export type NearestPlace = { kind: 'address' | 'poi' | 'street'; name: string; city: string; distance: number };
/** What is at (lat, lon): the nearest house number within 120 m, else a notable place within 150 m, else the nearest street within 400 m. */
export function reverseGeocode(pl: Places, lat: number, lon: number, lang: Lang = 'he'): NearestPlace | null {
  let best: number | null = null,
    bd = 120;
  const { kx, ky } = scaleAt(lat);
  for (let i = 0; i < pl.addrLat.length; i++) {
    const d = Math.hypot((pl.addrLon[i] - lon) * kx, (pl.addrLat[i] - lat) * ky);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (best !== null) {
    const s = pl.addrStreet[best];
    return {
      kind: 'address',
      name: `${streetName(pl, s, lang)} ${pl.addrNumber[best]}${pl.addrSuffix[best] || ''}`,
      city: cityOf(pl, pl.streets[s][1], lang),
      distance: Math.round(bd),
    };
  }
  let bp: number | null = null;
  bd = 150;
  for (let p = 0; p < pl.pois.length; p++) {
    const d = haversine(lat, lon, pl.pois[p][3], pl.pois[p][4]);
    if (d < bd) {
      bd = d;
      bp = p;
    }
  }
  if (bp !== null)
    return {
      kind: 'poi',
      name: poiName(pl, bp, lang),
      city: cityOf(pl, pl.pois[bp][2], lang),
      distance: Math.round(bd),
    };
  let bs: number | null = null;
  bd = 400;
  for (let s = 0; s < pl.streets.length; s++) {
    const d = haversine(lat, lon, pl.streets[s][2], pl.streets[s][3]);
    if (d < bd) {
      bd = d;
      bs = s;
    }
  }
  if (bs !== null)
    return {
      kind: 'street',
      name: streetName(pl, bs, lang),
      city: cityOf(pl, pl.streets[bs][1], lang),
      distance: Math.round(bd),
    };
  return null;
}

/**
 * A stored place named again in `lang`: the address-book entry exactly at (lat, lon) whose name, in either language and
 * the way a chosen search result is written ("name, city"; a city alone), is the stored `name`. Several entries can share
 * a point (house numbers of one building, a venue and its building's address), so the stored name picks among them.
 * null when none matches.
 */
export function placeAt(pl: Places, lat: number, lon: number, lang: Lang, name: string): string | null {
  const at = (a: number, b: number): boolean => Math.abs(a - lat) < 2e-6 && Math.abs(b - lon) < 2e-6;
  const withCity = (n: string, city: string): string => (city ? `${n}, ${city}` : n);
  const both = (f: (L: Lang) => string): string | null => {
    const he = f('he'),
      en = f('en');
    if (he !== name && en !== name) return null;
    return lang === 'en' ? en : he;
  };
  let hit: string | null = null;
  for (let i = 0; i < pl.addrLat.length && !hit; i++) {
    if (!at(pl.addrLat[i], pl.addrLon[i])) continue;
    const st = pl.addrStreet[i];
    hit = both((L) =>
      withCity(
        `${streetName(pl, st, L)} ${pl.addrNumber[i]}${pl.addrSuffix[i] || ''}`,
        cityOf(pl, pl.streets[st][1], L),
      ),
    );
    // a number the map lacks was placed at the street's nearest one: same street and city, the number as typed
    for (const L of ['he', 'en'] as const) {
      if (hit) break;
      const head = streetName(pl, st, L) + ' ',
        city = cityOf(pl, pl.streets[st][1], L),
        tail = city ? ', ' + city : '';
      if (!name.startsWith(head) || !name.endsWith(tail)) continue;
      const num = name.slice(head.length, name.length - tail.length);
      if (/^\d+\S{0,3}$/.test(num))
        hit = withCity(`${streetName(pl, st, lang)} ${num}`, cityOf(pl, pl.streets[st][1], lang));
    }
  }
  for (let p = 0; p < pl.pois.length && !hit; p++)
    if (at(pl.pois[p][3], pl.pois[p][4])) hit = both((L) => withCity(poiName(pl, p, L), cityOf(pl, pl.pois[p][2], L)));
  for (let st = 0; st < pl.streets.length && !hit; st++)
    if (at(pl.streets[st][2], pl.streets[st][3]))
      hit = both((L) => withCity(streetName(pl, st, L), cityOf(pl, pl.streets[st][1], L)));
  for (const c of pl.cities) if (!hit && at(c[1], c[2])) hit = both((L) => (L === 'en' && c[3]) || c[0]);
  return hit;
}

/** What a search hit is: a house number, a street, a city, or a place. */
export type PlaceKind = 'address' | 'street' | 'city' | 'poi';
/** One hit of the address-book search (searchPlaces): named in the rider's language where the data allows, where it
 *  is (degrees), and how well it matched (`score`, what byScore ranks on; the worker puts it on one scale with the
 *  stops). An address whose number is not on the map is the street's nearest one, with the number typed in its name
 *  and the one found in `approx`; a street with no numbers, when a number was typed, says so (`noNumbers`); a place
 *  carries its kind, for kindLabel. */
export type PlaceHit = {
  kind: PlaceKind;
  name: string;
  city: string; // '' for a city, or where unknown
  lat: number;
  lon: number;
  score: number;
  approx?: number | null;
  noNumbers?: boolean;
  poiKind?: PoiKind;
};
/** Results (PlaceHit), best first, one per (kind, name, city), named in `lang` where the data allows. */
export function searchPlaces(
  pl: Places,
  text: string,
  limit = 8,
  near: LatLon | null = null,
  lang: Lang = 'he',
): PlaceHit[] {
  const q = parseQuery(pl, text);
  const out: PlaceHit[] = [];
  const cityName = q.cityIdx >= 0 ? pl.cityNorm[q.cityIdx] : q.cityText || '';
  const qs = queryWords(q.words);
  const latin = qs.some((w) => w.latin);
  if (latin) ensureLatin(pl);

  const cityRow = (i: number, score: number): PlaceHit => {
    const c = pl.cities[i];
    return { kind: 'city', name: (lang === 'en' && c[3]) || c[0], city: '', lat: c[1], lon: c[2], score };
  };
  if (!q.words.length && q.cityIdx >= 0) return [cityRow(q.cityIdx, 15)]; // the whole text named a city
  // a city by itself
  if (q.words.length && q.number === null) {
    const whole = q.words.join(' ');
    const wsk = latin ? q.words.map((w) => (isLatin(w) ? skelLatin(w) : skelHe(w))) : null;
    pl.cities.forEach((c, i) => {
      const cw = latin ? pl.cityEnWords![i].join(' ') : words(c[0]).join(' ');
      const alias = CITY_ALIASES[whole] === norm(c[0]);
      if (cw === whole || alias) out.push(cityRow(i, 15));
      else if (cw && whole.length >= 3 && cw.startsWith(whole + ' '))
        out.push(cityRow(i, 14 + proximity(near, c[1], c[2]) / 3));
      else if (wsk && sameSkel(wsk, pl.citySk![i]))
        out.push(cityRow(i, 7 + proximity(near, c[1], c[2]) / 3)); // sounds like it: below a name that is it
      else if (cw && whole.length >= 2 && cw.startsWith(whole))
        out.push(cityRow(i, 2 + proximity(near, c[1], c[2]) / 3));
    });
  }
  if (qs.length) {
    // streets (and addresses on them)
    for (let s = 0; s < pl.streets.length; s++) {
      let score = matchEntry(qs, pl.streetWords[s], latin ? pl.streetEn![s] : null, latin ? pl.streetSk![s] : null);
      if (!score) continue;
      const st = pl.streets[s];
      const sc = pl.streetCity[s];
      if (cityName) {
        if (sc === cityName || (sc && sc.startsWith(cityName))) score += 3;
        else score -= 2.5;
      }
      score += proximity(near, st[2], st[3]);
      const name = streetName(pl, s, lang),
        city = cityOf(pl, st[1], lang);
      if (q.number !== null) {
        const a0 = pl.addrOff[s],
          a1 = pl.addrOff[s + 1];
        if (a1 > a0) {
          let exact = -1,
            nearest = -1,
            nd = Infinity;
          for (let i = a0; i < a1; i++) {
            const n = pl.addrNumber[i];
            if (n === q.number && (!q.suffix || (pl.addrSuffix[i] || '') === q.suffix)) {
              exact = i;
              break;
            }
            const d = Math.abs(n - q.number);
            if (d < nd) {
              nd = d;
              nearest = i;
            }
          }
          const i = exact >= 0 ? exact : nearest;
          out.push({
            kind: 'address',
            name: `${name} ${q.number}${q.suffix}`,
            city,
            lat: pl.addrLat[i],
            lon: pl.addrLon[i],
            score: score + (exact >= 0 ? 5 : 3),
            approx: exact < 0 ? pl.addrNumber[i] : null,
          });
        } else {
          out.push({ kind: 'street', name, city, lat: st[2], lon: st[3], score: score + 0.5, noNumbers: true });
        }
      } else {
        out.push({ kind: 'street', name, city, lat: st[2], lon: st[3], score });
      }
    }
    // notable places
    for (let p = 0; p < pl.pois.length; p++) {
      let score = matchEntry(qs, pl.poiWords[p], latin ? pl.poiEn![p] : null, latin ? pl.poiSk![p] : null, false);
      if (!score) continue;
      if (cityName) {
        if (pl.poiCity[p] === cityName) score += 3;
        else score -= 1.5;
      }
      const poi = pl.pois[p];
      score += (LANDMARK.has(poi[1]) ? 1 : 0) + (IMPORTANT.has(poi[1]) ? 1.5 : 0) + proximity(near, poi[3], poi[4]);
      out.push({
        kind: 'poi',
        name: poiName(pl, p, lang),
        poiKind: poi[1],
        city: cityOf(pl, poi[2], lang),
        lat: poi[3],
        lon: poi[4],
        score,
      });
    }
  }
  out.sort(byScore);
  // one entry per (kind, name, city)
  const seen = new Set<string>();
  const uniq: PlaceHit[] = [];
  for (const r of out) {
    const k = `${r.kind}|${norm(r.name)}|${norm(r.city)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
    if (uniq.length >= limit) break;
  }
  return uniq;
}
