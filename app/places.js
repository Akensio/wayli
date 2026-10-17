// Wayli: offline address book (streets, house numbers, cities, notable places) from pipeline/places.py.
// Free-text search that understands "הורדים 4, גבעתיים", "דיזנגוף סנטר", "חיפה".

const TYPES = { int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array, float32: Float32Array };
const PUNCT = /[.'"״׳`/()\-,:]+/g;

export function norm(s) { return String(s || '').toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim(); }
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
  return km <= 3 ? 3 : km >= 30 ? 0 : 3 * (30 - km) / 27;
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

/** Does every query word prefix-match a word of the name? Returns a score, or 0. */
function matchWords(qWords, nameWords) {
  let score = 0;
  for (const q of qWords) {
    let best = 0;
    for (let i = 0; i < nameWords.length; i++) {
      const w = nameWords[i];
      if (w === q) { best = Math.max(best, q.length < 2 ? 1 : i === 0 ? 4 : 3); }
      else if (q.length >= 2 && w.startsWith(q)) { best = Math.max(best, i === 0 ? 2.5 : 2); }
      else if (q.length >= 3 && w.includes(q)) { best = Math.max(best, 1); }
    }
    if (!best) return 0;
    score += best;
  }
  return score - nameWords.length * 0.05;
}

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
    const m = t.match(/^(\d{1,5})([א-ת]?)$/);
    if (m && number === null) { number = Number(m[1]); suffix = m[2]; } else rest.push(t);
  }
  const findCity = (text) => {
    const t = CITY_ALIASES[text] || text;
    let ci = pl.cityNorm.indexOf(t);
    if (ci < 0 && t.length >= 3) ci = pl.cityNorm.findIndex((c) => c.startsWith(t + ' ') || c === t);
    return ci;
  };
  // trailing words that name a city, when no comma was used (longest match first)
  let cityIdx = -1;
  if (!cityText && rest.length >= 2) {
    for (let k = Math.min(3, rest.length - 1); k >= 1; k--) {
      const ci = findCity(rest.slice(-k).join(' '));
      if (ci >= 0) { cityIdx = ci; rest.splice(-k, k); break; }
    }
  } else if (cityText) {
    cityIdx = findCity(cityText);
    if (cityIdx < 0) cityIdx = pl.cityNorm.findIndex((c) => c.startsWith(cityText));
  }
  return { words: rest.map(canon).filter(Boolean), number, suffix, cityIdx, cityText };
}

/** What is at (lat, lon): the nearest house number within 120 m, else a notable place within 150 m, else the nearest street within 400 m. */
export function reverseGeocode(pl, lat, lon) {
  let best = null, bd = 120;
  for (let i = 0; i < pl.addrLat.length; i++) {
    const dlat = (pl.addrLat[i] - lat) * 111000, dlon = (pl.addrLon[i] - lon) * 111000 * Math.cos(lat * Math.PI / 180);
    const d = Math.sqrt(dlat * dlat + dlon * dlon);
    if (d < bd) { bd = d; best = i; }
  }
  if (best !== null) {
    const st = pl.streets[pl.addrStreet[best]];
    return { kind: 'address', name: `${st[0]} ${pl.addrNumber[best]}${pl.addrSuffix[best] || ''}`, city: st[1], distance: Math.round(bd) };
  }
  let bp = null; bd = 150;
  for (let p = 0; p < pl.pois.length; p++) {
    const d = haversine(lat, lon, pl.pois[p][3], pl.pois[p][4]);
    if (d < bd) { bd = d; bp = p; }
  }
  if (bp !== null) return { kind: 'poi', name: pl.pois[bp][0], city: pl.pois[bp][2], distance: Math.round(bd) };
  let bs = null; bd = 400;
  for (let s = 0; s < pl.streets.length; s++) {
    const d = haversine(lat, lon, pl.streets[s][2], pl.streets[s][3]);
    if (d < bd) { bd = d; bs = s; }
  }
  if (bs !== null) return { kind: 'street', name: pl.streets[bs][0], city: pl.streets[bs][1], distance: Math.round(bd) };
  return null;
}

/** Results: [{kind:'address'|'street'|'city'|'poi', name, city, lat, lon, score, approx?}] */
export function searchPlaces(pl, text, limit = 8, near = null) {
  const q = parseQuery(pl, text);
  const out = [];
  const cityName = q.cityIdx >= 0 ? pl.cityNorm[q.cityIdx] : (q.cityText || '');

  // a city by itself
  if (q.words.length && q.number === null) {
    const whole = q.words.join(' ');
    pl.cities.forEach((c, i) => {
      const cw = words(c[0]).join(' ');
      const alias = CITY_ALIASES[whole] === norm(c[0]);
      if (cw === whole || alias) out.push({ kind: 'city', name: c[0], city: '', lat: c[1], lon: c[2], score: 15 });
      else if (whole.length >= 3 && cw.startsWith(whole + ' ')) out.push({ kind: 'city', name: c[0], city: '', lat: c[1], lon: c[2], score: 14 + proximity(near, c[1], c[2]) / 3 });
      else if (whole.length >= 2 && cw.startsWith(whole)) out.push({ kind: 'city', name: c[0], city: '', lat: c[1], lon: c[2], score: 2 + proximity(near, c[1], c[2]) / 3 });
    });
  }
  if (q.words.length) {
    // streets (and addresses on them)
    for (let s = 0; s < pl.streets.length; s++) {
      let score = matchWords(q.words, pl.streetWords[s]);
      if (!score) continue;
      const st = pl.streets[s];
      const sc = pl.streetCity[s];
      if (cityName) { if (sc === cityName || (sc && sc.startsWith(cityName))) score += 3; else score -= 2.5; }
      score += proximity(near, st[2], st[3]);
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
          out.push({ kind: 'address', name: `${st[0]} ${q.number}${q.suffix}`, city: st[1], lat: pl.addrLat[i], lon: pl.addrLon[i],
                     score: score + (exact >= 0 ? 5 : 3), approx: exact < 0 ? pl.addrNumber[i] : null });
        } else {
          out.push({ kind: 'street', name: st[0], city: st[1], lat: st[2], lon: st[3], score: score + 0.5, noNumbers: true });
        }
      } else {
        out.push({ kind: 'street', name: st[0], city: st[1], lat: st[2], lon: st[3], score });
      }
    }
    // notable places
    for (let p = 0; p < pl.pois.length; p++) {
      let score = matchWords(q.words, pl.poiWords[p]);
      if (!score) continue;
      if (cityName) { if (pl.poiCity[p] === cityName) score += 3; else score -= 1.5; }
      const poi = pl.pois[p];
      score += 1 + (IMPORTANT.has(poi[1]) ? 1.5 : 0) + proximity(near, poi[3], poi[4]);
      out.push({ kind: 'poi', name: poi[0], poiKind: poi[1], city: poi[2], lat: poi[3], lon: poi[4], score });
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
