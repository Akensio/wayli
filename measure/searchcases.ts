// What riders type into the search box, and what they mean by it: the cases measure/searchbench.ts scores the search
// on. Each is asked as the app asks it: the text, the language the app is in, and where the rider is (a public
// landmark, or nowhere when the phone gives no position). The answer wanted is said loosely, as a rider would know it
// on the list (a name, and where it matters the city, the kind of thing or the house number), and the bench first
// checks that the data has such an entry at all: a case whose answer is not in the data says so instead of counting
// as a miss, so a wrong expectation cannot pass for a fault of the search (or hide one).
export type Where = 'tlv' | 'jlm' | 'haifa' | 'b7' | null;
/** Public landmarks to search from: Dizengoff Center, Jerusalem's central bus station, Haifa's Merkazit HaMifrats,
 *  Be'er Sheva's central bus station. */
export const WHERE: Record<Exclude<Where, null>, { lat: number; lon: number }> = {
  tlv: { lat: 32.0775, lon: 34.7745 },
  jlm: { lat: 31.789, lon: 35.203 },
  haifa: { lat: 32.793, lon: 35.037 },
  b7: { lat: 31.243, lon: 34.797 },
};
/** The row wanted: its name as shown, its city, its kind; `number`, an address at that very house number, with `name`
 *  then the street's. */
export type Want = { name: RegExp; city?: RegExp; kind?: 'stop' | 'street' | 'poi' | 'city'; number?: number };
export type Case = { q: string; lang: 'he' | 'en'; at: Where; want: Want; why: string };

const TA = /תל אביב/,
  TA_EN = /Tel Aviv/;
const c = (why: string, q: string, lang: 'he' | 'en', at: Where, want: Want): Case => ({ q, lang, at, want, why });

export const CASES: Case[] = [
  // ---- a name as it is written
  c('as written', 'דיזנגוף סנטר', 'he', 'tlv', { name: /דיזנגוף סנטר/, city: TA }),
  c('as written', 'Dizengoff Center', 'en', 'tlv', { name: /Dizengoff Cent/, city: TA_EN }),
  c('as written', 'שוק הכרמל', 'he', 'tlv', { name: /שוק הכרמל/, city: TA }),
  c('as written', 'פארק המסילה', 'he', 'tlv', { name: /^פארק המסילה$/, city: TA }),
  c('as written', 'park hamesila', 'en', 'tlv', { name: /Park HaMes+ilah?|HaMes+ila Park/i, city: TA_EN }),
  c('as written', 'איכילוב', 'he', 'tlv', { name: /איכילוב/, city: TA }),
  c('as written', 'הדסה עין כרם', 'he', 'jlm', { name: /הדסה עין כרם/ }),
  c('as written', 'הטכניון', 'he', 'haifa', { name: /טכניון/, city: /חיפה/ }),
  c('as written', 'technion', 'en', 'haifa', { name: /Technion/i }),
  c('as written', 'אוניברסיטת בן גוריון', 'he', 'b7', { name: /אוניברסיטת בן.גוריון/ }),
  c('as written', 'the block', 'en', 'tlv', { name: /^The Block$/i, city: TA_EN }),
  c('as written', 'bloc tlv', 'en', 'tlv', { name: /The Bloc TLV/ }),
  c('as written', 'sarona market', 'en', 'tlv', { name: /Sarona Market/i }),
  c('as written', 'שרונה', 'he', 'tlv', { name: /שרונה/, city: TA }),
  c('as written', 'ikea', 'en', null, { name: /ikea/i }),
  c('as written', 'נמל תל אביב', 'he', 'tlv', { name: /נמל תל.אביב/ }),
  // ---- a part of the name: the well-known thing of that name, here
  c('a part of the name', 'hamesila', 'en', 'tlv', { name: /Park HaMes+ilah?|HaMes+ila Park/i, city: TA_EN }),
  c('a part of the name', 'המסילה', 'he', 'tlv', { name: /פארק המסילה/, city: TA }),
  c('a part of the name', 'עזריאלי', 'he', 'tlv', { name: /עזריאלי/, city: TA }),
  c('a part of the name', 'azrieli', 'en', 'tlv', { name: /Azrieli/i, city: TA_EN }),
  c('a part of the name', 'דיזנגוף', 'he', 'tlv', { name: /^דיזנגוף$/, city: TA, kind: 'street' }),
  c('a part of the name', 'carmel market', 'en', 'tlv', { name: /Carmel Market/i }),
  c('a part of the name', 'הכותל', 'he', 'jlm', { name: /^הכותל( המערבי)?$/ }),
  c('a part of the name', 'western wall', 'en', 'jlm', { name: /Western Wall/i }),
  // ---- cities
  c('a city', 'תל אביב', 'he', null, { name: TA, kind: 'city' }),
  c('a city', 'tel aviv', 'en', null, { name: TA_EN, kind: 'city' }),
  c('a city', 'תל אביב', 'he', 'tlv', { name: TA, kind: 'city' }),
  c('a city', 'ירושלים', 'he', 'tlv', { name: /^ירושלים$/, kind: 'city' }),
  c('a city', 'tel aviv', 'en', 'tlv', { name: TA_EN, kind: 'city' }),
  c('a city', 'חיפה', 'he', 'tlv', { name: /^חיפה$/, kind: 'city' }),
  c('a city', 'jerusalem', 'en', 'tlv', { name: /^Jerusalem$/, kind: 'city' }),
  c('a city', 'באר שבע', 'he', null, { name: /^באר שבע$/, kind: 'city' }),
  c('a city', 'petah tikva', 'en', null, { name: /Peta[hc]h? Tikva/i, kind: 'city' }),
  c('a city', 'ראשון', 'he', null, { name: /ראשון לציון/, kind: 'city' }),
  // ---- addresses: street, number, city
  c('an address', 'חביבה רייק 4 בת ים', 'he', 'tlv', { name: /^חביבה ריי[קך]$/, city: /בת ים/, number: 4 }),
  c('an address', 'haviva reich 4 bat yam', 'en', 'tlv', { name: /Haviva Rei[ck]h?/i, city: /Bat Yam/, number: 4 }),
  c('an address', 'דיזנגוף 50', 'he', 'tlv', { name: /^דיזנגוף$/, city: TA, number: 50 }),
  c('an address', 'dizengoff 50 tel aviv', 'en', null, { name: /^Dizengoff$/, city: TA_EN, number: 50 }),
  c('an address', 'הרצל 12 חיפה', 'he', 'tlv', { name: /^הרצל$/, city: /^חיפה$/, number: 12 }),
  c('an address', 'יפו 23 ירושלים', 'he', null, { name: /^יפו$/, city: /ירושלים/, number: 23 }),
  c('an address', 'jaffa 23 jerusalem', 'en', null, { name: /^(Jaffa|Yafo)$/i, city: /Jerusalem/, number: 23 }),
  c('an address', 'רוטשילד 22 תא', 'he', null, { name: /רוטשילד/, city: TA, number: 22 }),
  c('an address', 'אבן גבירול 71', 'he', 'tlv', { name: /אבן גבירול/, city: TA, number: 71 }),
  c('an address', 'ibn gabirol 71', 'en', 'tlv', { name: /Ga?[bv]i?rol/i, city: TA_EN, number: 71 }),
  c('an address', 'ויצמן 2 רחובות', 'he', 'tlv', { name: /ויצמן/, city: /רחובות/, number: 2 }),
  c('an address', 'רחוב הנביאים 14 ירושלים', 'he', null, { name: /^הנביאים$/, city: /ירושלים/, number: 14 }),
  c('an address', "שד' רוטשילד 1 תל אביב", 'he', null, { name: /רוטשילד/, city: TA, number: 1 }),
  c('an address', 'rothschild blvd 1 tel aviv', 'en', null, { name: /Rothschild/i, city: TA_EN, number: 1 }),
  c('an address', 'הרצל 1 באר שבע', 'he', 'tlv', { name: /^הרצל$/, city: /באר שבע/, number: 1 }),
  // ---- the same street name in many cities: the one here, unless a city is typed
  c('the one here', 'הרצל 16', 'he', 'haifa', { name: /^הרצל$/, city: /^חיפה$/, number: 16 }),
  c('the one here', 'הרצל 16', 'he', 'tlv', { name: /^הרצל$/, city: TA, number: 16 }),
  c('the one here', 'ויצמן', 'he', 'tlv', { name: /^ויצמן$/, city: TA, kind: 'street' }),
  c('the one here', 'hashalom', 'en', 'tlv', { name: /Ha-?Shalom/i, kind: 'stop' }),
  c('the one here', 'central bus station', 'en', 'jlm', { name: /Central (Bus )?Station/i, city: /Jerusalem/ }),
  // ---- a slip or another spelling
  c('a slip', 'דיזנגף', 'he', 'tlv', { name: /^דיזנגוף$/, city: TA, kind: 'street' }),
  c('a slip', 'דיזינגוף סנטר', 'he', 'tlv', { name: /דיזנגוף סנטר/ }),
  c('a slip', 'dizengof center', 'en', 'tlv', { name: /Dizengoff Cent/ }),
  c('a slip', 'rotshild', 'en', 'tlv', { name: /Rot+h?s?c?hild/i, city: TA_EN, kind: 'street' }),
  c('a slip', 'azriely', 'en', 'tlv', { name: /Azrieli/i }),
  c('a slip', 'אבן גבירל', 'he', 'tlv', { name: /אבן גבירול/, city: TA }),
  c('a slip', 'וייצמן 2 רחובות', 'he', null, { name: /ויצמן/, city: /רחובות/, number: 2 }),
  c('a slip', 'איכלוב', 'he', 'tlv', { name: /איכי?לוב/ }),
  c('a slip', 'חביבה רייך 4 בת ים', 'he', 'tlv', { name: /^חביבה ריי[קך]$/, city: /בת ים/, number: 4 }),
  // ---- still typing
  c('still typing', 'דיזנג', 'he', 'tlv', { name: /^דיזנגוף$/, city: TA, kind: 'street' }),
  c('still typing', 'dizeng', 'en', 'tlv', { name: /^Dizengoff$/, city: TA_EN, kind: 'street' }),
  c('still typing', 'חביבה רי', 'he', 'tlv', { name: /^חביבה ריי[קך]$/ }),
  c('still typing', 'דיזנגוף 50 תל א', 'he', null, { name: /^דיזנגוף$/, city: TA, number: 50 }),
  c('still typing', 'דיזנגוף 50 ת', 'he', null, { name: /^דיזנגוף$/, city: TA, number: 50 }),
  c('still typing', 'herzl 12 hai', 'en', null, { name: /^Herzl$/, city: /Haifa/, number: 12 }),
  c('still typing', 'park hames', 'en', 'tlv', { name: /Park HaMes+ilah?|HaMes+ila Park/i, city: TA_EN }),
  // ---- typed in the other alphabet
  c('the other alphabet', 'הבלוק תל אביב', 'he', 'tlv', { name: /The Bloc/ }),
  c('the other alphabet', 'בלוק TLV', 'he', 'tlv', { name: /The Bloc TLV/ }),
  c('the other alphabet', 'sarona', 'he', 'tlv', { name: /שרונה|Sarona/ }),
  c('the other alphabet', 'dizengoff', 'he', 'tlv', { name: /^(דיזנגוף|Dizengoff)$/, city: TA, kind: 'street' }),
  c('the other alphabet', 'איקאה', 'he', null, { name: /ikea|איקאה/i }),
  c('the other alphabet', 'מקדונלדס', 'he', 'tlv', { name: /מקדונלד|McDonald/i }),
  c('the other alphabet', 'rothschild 22', 'he', 'tlv', { name: /רוטשילד/, city: TA, number: 22 }),
  // ---- stops and stations
  c('a stop', 'סבידור', 'he', 'tlv', { name: /סבידור/, kind: 'stop' }),
  c('a stop', 'savidor', 'en', 'tlv', { name: /Savidor/i, kind: 'stop' }),
  c('a stop', 'השלום', 'he', 'tlv', { name: /^השלום$/, kind: 'stop' }),
  c('a stop', 'אלנבי', 'he', 'tlv', { name: /^אלנבי$/, kind: 'stop' }),
  c('a stop', 'allenby', 'en', 'tlv', { name: /^Allenby$/i, kind: 'stop' }),
  c('a stop', 'קרליבך', 'he', 'tlv', { name: /^קרליבך$/, kind: 'stop' }),
  c('a stop', 'מרכזית המפרץ', 'he', null, { name: /מרכזית המפרץ/, kind: 'stop' }),
  c('a stop', 'תחנה מרכזית ירושלים', 'he', null, { name: /מרכזית ירושלים/, kind: 'stop' }),
  c('a stop', 'ארלוזורוב', 'he', 'tlv', { name: /ארלוזורוב/, city: TA }),
  c('a stop', 'בנייני האומה', 'he', 'jlm', { name: /בנייני האומה/ }),
  c('a stop', 'haifa center', 'en', null, { name: /Haifa.*(Center|Merkaz)/i, kind: 'stop' }),
  c('a stop', 'נתבג', 'he', null, { name: /נתב.?.?ג/, kind: 'stop' }),
];
