// Wayli: offline address book (streets, house numbers, cities, notable places) from pipeline/places.py.
// Free-text search that understands "הורדים 4, גבעתיים", "דיזנגוף סנטר", "חיפה", and the same typed in
// Latin letters ("Havradim 4 givatayim", "Dizengoff Center", "Haifa").

const TYPES = { int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array, float32: Float32Array };
const PUNCT = /[.'"״׳`/()\-,:]+/g;
const INNER_QUOTE = /(?<=[\p{L}])['"״׳`]+(?=[\p{L}])/gu;   // הל"ה, צה"ל, ג'וליס, Far'a: the mark is part of the word

/** Lower case, one space between words; a quote mark inside a word is dropped (הל"ה -> הלה), other punctuation separates. */
export function norm(s) { return String(s || '').toLowerCase().replace(INNER_QUOTE, '').replace(PUNCT, ' ').replace(/\s+/g, ' ').trim(); }
/** Looser form for matching Hebrew: drop a leading ה, collapse doubled ו/י, drop common street-word prefixes. */
export function canon(word) {
  let w = word.replace(/^(רחוב|רח|שדרות|שד|דרך|סמטת|כיכר|ככר)$/, '');
  if (!w) return '';
  if (w.length > 2 && w[0] === 'ה') w = w.slice(1);
  w = w.replace(/וו/g, 'ו').replace(/יי/g, 'י');
  return w;
}
const words = (s) => norm(s).split(' ').filter(Boolean).map(canon).filter(Boolean);
/** Everyday names for cities the feed spells in full. */
const CITY_ALIASES = { 'תל אביב': 'תל אביב יפו', 'ת א': 'תל אביב יפו', 'תא': 'תל אביב יפו', 'ב ש': 'באר שבע', 'בש': 'באר שבע',
  'ראשל צ': 'ראשון לציון', 'ראשלצ': 'ראשון לציון', 'פ ת': 'פתח תקווה', 'פת': 'פתח תקווה', 'כ ס': 'כפר סבא', 'ר ג': 'רמת גן', 'רג': 'רמת גן',
  'י ם': 'ירושלים', 'ים': 'ירושלים', 'מודיעין': 'מודיעין מכבים רעות', 'נוף הגליל': 'נוף הגליל', 'נצרת עילית': 'נוף הגליל' };
const IMPORTANT = new Set(['amenity=hospital', 'healthcare=hospital', 'amenity=university', 'amenity=college', 'shop=mall', 'railway=station',
  'amenity=bus_station', 'aeroway=aerodrome', 'aeroway=terminal', 'tourism=museum', 'leisure=stadium', 'amenity=townhall']);
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/** Up to +3 for places within a few km of `near`, fading out by 30 km. */
export function proximity(near, lat, lon) {
  if (!near) return 0;
  const km = haversine(near.lat, near.lon, lat, lon) / 1000;
  return km <= 3 ? 3 - km * 0.05 : km >= 30 ? 0 : 2.85 * (30 - km) / 27;   // nearer first, even among places close by
}

export function parsePlaces(ab) {
  const headerLen = new DataView(ab).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, headerLen)));
  const base = 4 + headerLen;
  const pl = { header, streets: header.streets, cities: header.cities, pois: header.pois, addrSuffix: header.addrSuffix || {} };
  for (const s of header.sections) pl[s.name] = new TYPES[s.dtype](ab, base + s.offset, s.length);
  // address ranges per street (addresses are sorted by street, then number)
  const S = pl.streets.length, A = pl.addrStreet.length;
  const off = new Int32Array(S + 1);
  for (let i = 0; i < A; i++) off[pl.addrStreet[i] + 1]++;
  for (let s = 0; s < S; s++) off[s + 1] += off[s];
  pl.addrOff = off;
  pl.streetWords = pl.streets.map((s) => words(s[0]));
  pl.streetCity = pl.streets.map((s) => norm(s[1]));
  pl.cityNorm = pl.cities.map((c) => norm(c[0]));
  pl.cityEnNorm = pl.cities.map((c) => norm(c[3] || ''));
  pl.cityEnByHe = new Map(pl.cities.filter((c) => c[3]).map((c) => [c[0], c[3]]));
  pl.poiWords = pl.pois.map((p) => words(p[0]));
  pl.poiCity = pl.pois.map((p) => norm(p[2]));
  return pl;
}

const KIND_HE = {
  'amenity=hospital': 'בית חולים', 'healthcare=hospital': 'בית חולים', 'amenity=clinic': 'מרפאה', 'amenity=university': 'אוניברסיטה',
  'amenity=college': 'מכללה', 'amenity=library': 'ספרייה', 'amenity=townhall': 'עירייה', 'amenity=cinema': 'קולנוע',
  'amenity=theatre': 'תיאטרון', 'amenity=courthouse': 'בית משפט', 'amenity=police': 'משטרה', 'amenity=community_centre': 'מתנ"ס',
  'amenity=marketplace': 'שוק', 'amenity=bus_station': 'תחנה מרכזית', 'amenity=ferry_terminal': 'נמל', 'amenity=conference_centre': 'מרכז כנסים',
  'shop=mall': 'קניון', 'shop=department_store': 'חנות כלבו', 'shop=supermarket': 'סופרמרקט', 'leisure=park': 'פארק', 'leisure=stadium': 'אצטדיון',
  'leisure=sports_centre': 'מרכז ספורט', 'leisure=beach_resort': 'חוף', 'leisure=nature_reserve': 'שמורת טבע', 'leisure=water_park': 'פארק מים',
  'tourism=attraction': 'אתר', 'tourism=museum': 'מוזיאון', 'tourism=zoo': 'גן חיות', 'tourism=theme_park': 'פארק שעשועים', 'tourism=viewpoint': 'תצפית',
  'tourism=aquarium': 'אקווריום', 'railway=station': 'תחנת רכבת', 'public_transport=station': 'תחנה', 'aeroway=aerodrome': 'שדה תעופה',
  'aeroway=terminal': 'טרמינל', 'natural=beach': 'חוף', 'historic=archaeological_site': 'אתר עתיקות', 'historic=castle': 'מבצר',
  'historic=monument': 'אנדרטה', 'office=government': 'משרד ממשלתי',
};
export function kindLabel(kind, lang = 'he') { return lang === 'he' ? (KIND_HE[kind] || 'מקום') : kind.split('=')[1].replace(/_/g, ' '); }

// ---------------------------------------------------------------- names typed in Latin letters
// Streets and places carry OpenStreetMap's English name beside the Hebrew; cities the feed's. Where there is
// none, or the rider spells it their own way (Havradim, HaVradim, Ha-Vradim), both scripts reduce to a
// consonant skeleton: vowels dropped, letters that sound alike merged, doubled letters collapsed.
const LATIN_STOP = new Set(['street', 'st', 'road', 'rd', 'boulevard', 'blvd', 'avenue', 'ave', 'alley', 'lane', 'way', 'square', 'sq',
  'rehov', 'rechov', 'sderot', 'sd', 'derech', 'derekh', 'kikar', 'simtat', 'the']);
export const isLatin = (w) => /[a-z]/.test(w);
/** The words of an English name, lower case, without the street-type words. */
export function wordsEn(s) { return norm(s).split(' ').filter((w) => w && !LATIN_STOP.has(w)); }
const HEB_SK = { 'ב': 'v', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'V', 'ז': 'z', 'ח': 'X', 'ט': 't', 'כ': 'K', 'ך': 'K', 'ל': 'l', 'מ': 'm', 'ם': 'm',
  'נ': 'n', 'ן': 'n', 'ס': 's', 'פ': 'p', 'ף': 'p', 'צ': 'z', 'ץ': 'z', 'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't' };   // א ע י: dropped
const squash = (s) => s.replace(/(.)\1+/g, '$1');
/** 'hVrdm' -> ['hvrdm', 'hrdm'] (V: ו, a consonant or a vowel); K: כ, written k or kh/ch (x); X: ח, written h or kh/ch. */
function expand(s) {
  let out = [''];
  for (const c of s) {
    const alts = c === 'V' ? ['v', ''] : c === 'K' ? ['k', 'x'] : c === 'X' ? ['h', 'x'] : [c];
    const next = [];
    for (const o of out) for (const a of alts) next.push(o + a);
    out = next.length > 16 ? next.slice(0, 16) : next;
  }
  return [...new Set(out.map(squash))].filter(Boolean);
}
export function skelHe(word) {
  const chars = [...word];
  let s = '';
  chars.forEach((c, i) => {
    if (c === 'ה' && i === chars.length - 1 && chars.length > 1) return;   // a final ה is a vowel
    s += HEB_SK[c] ?? (/\d/.test(c) ? c : '');
  });
  return expand(s);
}
export function skelLatin(word) {
  const w = word.toLowerCase();
  let s = w.replace(/sch/g, 's').replace(/sh/g, 's').replace(/tch/g, 'z').replace(/ch|kh/g, 'x').replace(/ts|tz/g, 'z').replace(/th/g, 't')
    .replace(/ph/g, 'p').replace(/ck/g, 'k').replace(/[qc]/g, 'k').replace(/[bw]/g, 'v').replace(/f/g, 'p').replace(/j/g, 'J');   // x: a guttural (ח or כ)
  const bases = [];
  const vowelH = /[aeiouy]h$/.test(w);   // "Tikvah": a bare final h after a vowel is a vowel (ה) or a consonant (ח); "Petach" is ח
  for (const b of vowelH ? [s, s.slice(0, -1)] : [s]) {
    const c = b.replace(/[aeiouy]/g, '').replace(/[^a-z0-9J]/g, '');   // x stays: the guttural
    if (c.includes('J')) bases.push(c.replace(/J/g, 'z'), c.replace(/J/g, 'g')); else bases.push(c);   // ז' and ג' are both j
  }
  const out = [];
  for (const b of bases) {
    out.push(squash(b));
    if (w.startsWith('ha') && b.length > 2) out.push(squash(b.slice(1)));   // "HaVradim": the article, which Hebrew matching drops
  }
  return [...new Set(out)].filter(Boolean);
}
/** The query's words with what each can match: Hebrew words as they are, Latin words by English name or skeleton. */
const queryWords = (words) => words.map((w) => ({ w, latin: isLatin(w), sk: isLatin(w) ? skelLatin(w) : null }));
/** English names and skeletons of every street, place and city, built on the first Latin query. */
function ensureLatin(pl) {
  if (pl.streetSk) return;
  pl.streetEn = pl.streets.map((s) => wordsEn(s[4] || ''));
  pl.streetSk = pl.streetWords.map((ws) => ws.map(skelHe));
  pl.poiEn = pl.pois.map((p) => wordsEn(p[5] || ''));
  pl.poiSk = pl.poiWords.map((ws) => ws.map(skelHe));
  pl.citySk = pl.cities.map((c) => words(c[0]).map(skelHe));
  pl.cityEnWords = pl.cities.map((c) => wordsEn(c[3] || ''));
}

function wordScore(q, w, i, firstWordNames) {
  if (w === q) return q.length < 2 ? 1 : !firstWordNames ? 4 : i === 0 ? 5 : 3;
  if (q.length >= 2 && w.startsWith(q)) return i === 0 ? 2.5 : 2;
  if (q.length >= 3 && w.includes(q)) return 1;
  return 0;
}
function skelScore(qv, wv, i, firstWordNames) {
  let best = 0;
  for (const a of qv) for (const b of wv) {
    if (a === b) best = Math.max(best, a.length < 3 ? 1.5 : firstWordNames && i === 0 ? 4.5 : 2.9);   // two consonants say little ("hs": Hish, Yehoash); only a street's first word counts as exact
    else if (a.length >= 2 && b.startsWith(a)) best = Math.max(best, i === 0 ? 2.2 : 1.8);
  }
  return best;
}
/**
 * Does every query word match a word of the name? Returns a score, or 0. A street is named by its
 * first word, so an exact match there counts most; a place's words count alike (מרכז עזריאלי, קניון עזריאלי).
 * A name typed in full beats partial matches. A Latin word matches the English name, or the skeleton of the
 * Hebrew one (a little lower, so a spelled-out English name wins over a sound-alike).
 */
function matchEntry(qs, he, en, sk, firstWordNames = true) {
  let score = 0, exact = 0, latin = false;
  for (const q of qs) {
    let best = 0;
    if (!q.latin) { for (let i = 0; i < he.length; i++) best = Math.max(best, wordScore(q.w, he[i], i, firstWordNames)); }
    else {
      latin = true;
      if (en) for (let i = 0; i < en.length; i++) best = Math.max(best, wordScore(q.w, en[i], i, firstWordNames));
      if (sk) for (let i = 0; i < sk.length; i++) best = Math.max(best, skelScore(q.sk, sk[i], i, firstWordNames));
    }
    if (!best) return 0;
    if (best >= 3) exact++;
    score += best;
  }
  const n = latin && en && en.length ? en.length : he.length;
  if (exact === qs.length && qs.length === n) score += 1;
  return score - n * 0.05;
}
const sameSkel = (a, b) => a.length === b.length && a.every((qa, i) => qa.some((x) => b[i].includes(x)));
const prefixSkel = (a, b) => a.length <= b.length && a.every((qa, i) => qa.some((x) => b[i].includes(x)));   // "tel aviv" for תל אביב יפו

/**
 * Parse free text: words, an optional house number, an optional city (after a comma, or trailing words naming a city).
 */
export function parseQuery(pl, text) {
  const parts = norm(text).split(/\s*,\s*/).filter(Boolean);
  let main = parts[0] || '', cityText = parts.slice(1).join(' ');
  const toks = main.split(' ').filter(Boolean);
  let number = null, suffix = '';
  const rest = [];
  for (const t of toks) {
    const m = t.match(/^(\d{1,5})([א-תa-z]?)$/);
    if (m && number === null) { number = Number(m[1]); suffix = m[2]; } else rest.push(t);
  }
  if (isLatin(main) || isLatin(cityText)) ensureLatin(pl);
  const findCity = (text) => {
    const t = CITY_ALIASES[text] || text;
    let ci = pl.cityNorm.indexOf(t);
    if (ci < 0) ci = pl.cityEnNorm.indexOf(t);
    if (ci < 0 && t.length >= 3) ci = pl.cityNorm.findIndex((c, i) => c.startsWith(t + ' ') || pl.cityEnNorm[i].startsWith(t + ' '));
    if (ci < 0 && isLatin(t)) { const sk = t.split(' ').map(skelLatin); ci = pl.citySk.findIndex((cs) => prefixSkel(sk, cs)); }   // Givatayim, Petach Tikvah
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
      if (ci >= 0) { cityIdx = ci; rest.splice(-k, k); break; }
    }
  } else if (cityText) {
    cityIdx = findCity(cityText);
    if (cityIdx < 0) cityIdx = pl.cityNorm.findIndex((c, i) => c.startsWith(cityText) || pl.cityEnNorm[i].startsWith(cityText));
  }
  return { words: rest.map(canon).filter(Boolean), number, suffix, cityIdx, cityText };
}

// names as the rider's language wants them: English where the data has it, else Hebrew
const streetName = (pl, s, lang) => (lang === 'en' && pl.streets[s][4]) || pl.streets[s][0];
const poiName = (pl, p, lang) => (lang === 'en' && pl.pois[p][5]) || pl.pois[p][0];
const cityOf = (pl, he, lang) => (lang === 'en' && he && pl.cityEnByHe.get(he)) || he || '';

/** What is at (lat, lon): the nearest house number within 120 m, else a notable place within 150 m, else the nearest street within 400 m. */
export function reverseGeocode(pl, lat, lon, lang = 'he') {
  let best = null, bd = 120;
  for (let i = 0; i < pl.addrLat.length; i++) {
    const dlat = (pl.addrLat[i] - lat) * 111000, dlon = (pl.addrLon[i] - lon) * 111000 * Math.cos(lat * Math.PI / 180);
    const d = Math.sqrt(dlat * dlat + dlon * dlon);
    if (d < bd) { bd = d; best = i; }
  }
  if (best !== null) {
    const s = pl.addrStreet[best];
    return { kind: 'address', name: `${streetName(pl, s, lang)} ${pl.addrNumber[best]}${pl.addrSuffix[best] || ''}`, city: cityOf(pl, pl.streets[s][1], lang), distance: Math.round(bd) };
  }
  let bp = null; bd = 150;
  for (let p = 0; p < pl.pois.length; p++) {
    const d = haversine(lat, lon, pl.pois[p][3], pl.pois[p][4]);
    if (d < bd) { bd = d; bp = p; }
  }
  if (bp !== null) return { kind: 'poi', name: poiName(pl, bp, lang), city: cityOf(pl, pl.pois[bp][2], lang), distance: Math.round(bd) };
  let bs = null; bd = 400;
  for (let s = 0; s < pl.streets.length; s++) {
    const d = haversine(lat, lon, pl.streets[s][2], pl.streets[s][3]);
    if (d < bd) { bd = d; bs = s; }
  }
  if (bs !== null) return { kind: 'street', name: streetName(pl, bs, lang), city: cityOf(pl, pl.streets[bs][1], lang), distance: Math.round(bd) };
  return null;
}

/** Results: [{kind:'address'|'street'|'city'|'poi', name, city, lat, lon, score, approx?}], named in `lang` where the data allows. */
export function searchPlaces(pl, text, limit = 8, near = null, lang = 'he') {
  const q = parseQuery(pl, text);
  const out = [];
  const cityName = q.cityIdx >= 0 ? pl.cityNorm[q.cityIdx] : (q.cityText || '');
  const qs = queryWords(q.words);
  const latin = qs.some((w) => w.latin);
  if (latin) ensureLatin(pl);

  const cityRow = (i, score) => { const c = pl.cities[i]; return { kind: 'city', name: (lang === 'en' && c[3]) || c[0], city: '', lat: c[1], lon: c[2], score }; };
  if (!q.words.length && q.cityIdx >= 0) return [cityRow(q.cityIdx, 15)];   // the whole text named a city
  // a city by itself
  if (q.words.length && q.number === null) {
    const whole = q.words.join(' ');
    const wsk = latin ? q.words.map((w) => (isLatin(w) ? skelLatin(w) : skelHe(w))) : null;
    pl.cities.forEach((c, i) => {
      const cw = latin ? pl.cityEnWords[i].join(' ') : words(c[0]).join(' ');
      const alias = CITY_ALIASES[whole] === norm(c[0]);
      if (cw === whole || alias) out.push(cityRow(i, 15));
      else if (cw && whole.length >= 3 && cw.startsWith(whole + ' ')) out.push(cityRow(i, 14 + proximity(near, c[1], c[2]) / 3));
      else if (wsk && sameSkel(wsk, pl.citySk[i])) out.push(cityRow(i, 7 + proximity(near, c[1], c[2]) / 3));   // sounds like it: below a name that is it
      else if (cw && whole.length >= 2 && cw.startsWith(whole)) out.push(cityRow(i, 2 + proximity(near, c[1], c[2]) / 3));
    });
  }
  if (qs.length) {
    // streets (and addresses on them)
    for (let s = 0; s < pl.streets.length; s++) {
      let score = matchEntry(qs, pl.streetWords[s], latin ? pl.streetEn[s] : null, latin ? pl.streetSk[s] : null);
      if (!score) continue;
      const st = pl.streets[s];
      const sc = pl.streetCity[s];
      if (cityName) { if (sc === cityName || (sc && sc.startsWith(cityName))) score += 3; else score -= 2.5; }
      score += proximity(near, st[2], st[3]);
      const name = streetName(pl, s, lang), city = cityOf(pl, st[1], lang);
      if (q.number !== null) {
        const a0 = pl.addrOff[s], a1 = pl.addrOff[s + 1];
        if (a1 > a0) {
          let exact = -1, nearest = -1, nd = Infinity;
          for (let i = a0; i < a1; i++) {
            const n = pl.addrNumber[i];
            if (n === q.number && (!q.suffix || (pl.addrSuffix[i] || '') === q.suffix)) { exact = i; break; }
            const d = Math.abs(n - q.number);
            if (d < nd) { nd = d; nearest = i; }
          }
          const i = exact >= 0 ? exact : nearest;
          out.push({ kind: 'address', name: `${name} ${q.number}${q.suffix}`, city, lat: pl.addrLat[i], lon: pl.addrLon[i],
                     score: score + (exact >= 0 ? 5 : 3), approx: exact < 0 ? pl.addrNumber[i] : null });
        } else {
          out.push({ kind: 'street', name, city, lat: st[2], lon: st[3], score: score + 0.5, noNumbers: true });
        }
      } else {
        out.push({ kind: 'street', name, city, lat: st[2], lon: st[3], score });
      }
    }
    // notable places
    for (let p = 0; p < pl.pois.length; p++) {
      let score = matchEntry(qs, pl.poiWords[p], latin ? pl.poiEn[p] : null, latin ? pl.poiSk[p] : null, false);
      if (!score) continue;
      if (cityName) { if (pl.poiCity[p] === cityName) score += 3; else score -= 1.5; }
      const poi = pl.pois[p];
      score += 1 + (IMPORTANT.has(poi[1]) ? 1.5 : 0) + proximity(near, poi[3], poi[4]);
      out.push({ kind: 'poi', name: poiName(pl, p, lang), poiKind: poi[1], city: cityOf(pl, poi[2], lang), lat: poi[3], lon: poi[4], score });
    }
  }
  out.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  // one entry per (kind, name, city)
  const seen = new Set();
  const uniq = [];
  for (const r of out) {
    const k = `${r.kind}|${norm(r.name)}|${norm(r.city)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
    if (uniq.length >= limit) break;
  }
  return uniq;
}
