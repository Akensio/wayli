// Wayli: the offline address book (streets, house numbers, cities, notable places) from pipeline/places.py: its file
// read into arrays, its entries named in the rider's language, a place's kind in words, and what is at a point.
import { inLatin } from './latin.ts';
import { haversine, scaleAt } from './geo.ts';
import { readContainer, type Container, type ContainerHeader } from './container.ts';

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
/** The address book as parsePlaces builds it: the container and the header's lists at hand. Everything is by index: street s is `streets[s]`, its addresses are `addrOff[s]` up to `addrOff[s + 1]`. */
export type Places = Container<PlacesSections, PlacesHeader> & {
  streets: StreetRow[];
  cities: CityRow[];
  pois: PoiRow[];
  addrSuffix: Record<string, string>;
  /** Per street, the index of its first address; the next street's is where its addresses end (length streets + 1). */
  addrOff: Int32Array;
  cityEnByHe: Map<string, string>; // a city's English name by its Hebrew one, for the cities that have one
};

/** The address book from its file: the container and the header's lists at hand. */
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
  pl.cityEnByHe = new Map(pl.cities.filter((c) => c[3]).map((c): [string, string] => [c[0], c[3]]));
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
// two kinds pipeline/overture.py gives where Overture's word is wider than the landmark's (a mall, a university)
const OVERTURE_HE = { 'shopping=shopping_center': 'מרכז קניות', 'education=college_university': 'מכללה' };
const KIND_HE: Record<string, string> = { ...LANDMARK_HE, ...EVERYDAY_HE, ...OVERTURE_HE };
/** A place's kind, an OpenStreetMap tag "key=value": one the search has a label for, or any other of the pipeline's
 *  (a shop or an office not named here gets a general label). */
export type PoiKind = keyof typeof LANDMARK_HE | keyof typeof EVERYDAY_HE | (string & {});
/** Overture's places whose category the app has no word for carry their group ("food_and_drink=winery",
 *  pipeline/overture.py): the group's word. */
const GROUP_HE: Record<string, string> = {
  food_and_drink: 'אוכל ושתייה',
  shopping: 'חנות',
  health_care: 'בריאות',
  education: 'חינוך',
  sports_and_recreation: 'ספורט ופנאי',
  lodging: 'לינה',
  arts_and_entertainment: 'תרבות ובידור',
  cultural_and_historic: 'מורשת',
  travel_and_transportation: 'תחבורה',
  community_and_government: 'שירות ציבורי',
  geographic_entities: 'מקום',
};
/** A place's kind in words: the Hebrew label, else a general one ("חנות", "משרד", "מקום"); in English the tag's own value. */
export function kindLabel(kind: PoiKind, lang: Lang = 'he'): string {
  if (lang !== 'he') return (kind.split('=')[1] ?? kind).replace(/_/g, ' ');
  if (KIND_HE[kind]) return KIND_HE[kind];
  const group = GROUP_HE[kind.split('=')[0]];
  if (group) return group;
  if (kind.startsWith('shop=')) return 'חנות';
  if (kind.startsWith('office=')) return 'משרד';
  return 'מקום';
}

// names as the rider's language wants them: English where the data has it, else Hebrew
// names as the rider's language wants them: English where the data has it, else Hebrew, which in English goes through
// the app's own transliteration so no Hebrew letters reach an English screen (engine/latin.ts, docs/principles.md rule 3)
const own = (name: string, lang: Lang): string => (lang === 'en' ? inLatin(name) : name);
export const streetName = (pl: Places, s: number, lang: Lang): string =>
  (lang === 'en' && pl.streets[s][4]) || own(pl.streets[s][0], lang);
export const poiName = (pl: Places, p: number, lang: Lang): string =>
  (lang === 'en' && pl.pois[p][5]) || own(pl.pois[p][0], lang);
export const cityOf = (pl: Places, he: string, lang: Lang): string =>
  (lang === 'en' && he && pl.cityEnByHe.get(he)) || own(he || '', lang);

/** What an entry of the book is: a house number on a street, a street, a city, a notable or everyday place. */
export type PlaceKind = 'address' | 'street' | 'city' | 'poi';
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
