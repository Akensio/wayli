#!/usr/bin/env python3
"""Which street an address joins (places.py street_for): python3 -I pipeline/test_places.py (exits 1 on a failure;
the build workflow runs it). The cases:
  - the only street of the name is in another city, far away: the address starts its own street in its city (Tel
    Aviv's Begin Road numbers had joined Tiberias's, 106 km away; 2026-10-31);
  - the next address of that street joins the street the first one started;
  - a street of the name in the address's own city wins over a nearer one in the next city;
  - an address whose city is not known (no stop near) joins a street of its name close by;
  - with no city known, same-named streets far apart stay apart (grouped by a 5 km square instead).
"""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from places import street_for, add_places  # noqa: E402
from public import kind_of, clean_name, survey_name  # noqa: E402
import english  # noqa: E402

TLV, TIB, RG = "תל אביב יפו", "טבריה", "רמת גן"
# the city a point is in: Tiberias in the north, Ramat Gan east of 34.81, Tel Aviv elsewhere; none far at sea
def city_near(lat, lon):
    if lon < 34.75 or lat < 31.6 or lon > 35.1:
        return ""
    if lat > 32.5:
        return TIB
    return RG if lon > 34.81 else TLV

def book(*streets):
    street_list, street_index, by_name = [], {}, defaultdict(list)
    for name, city, lat, lon in streets:
        street_index[(name, city)] = len(street_list)
        street_list.append([name, city, lat, lon, ""])
        by_name[name].append((city, street_index[(name, city)]))
    return street_list, street_index, by_name

failures = 0
def check(what, got, want):
    global failures
    ok = got == want
    failures += not ok
    print(("ok  " if ok else "FAIL") + f" {what}: {got!r}" + ("" if ok else f", want {want!r}"))

BEGIN = "דרך מנחם בגין"
sl, si, bn = book((BEGIN, TIB, 32.79, 35.53))
a = street_for(BEGIN, BEGIN, "", 32.0745, 34.7924, bn, sl, si, city_near)
check("Begin Road 136 in Tel Aviv: a street of its own, in Tel Aviv", (a != 0, sl[a][1]), (True, TLV))
b = street_for(BEGIN, BEGIN, "", 32.0790, 34.7960, bn, sl, si, city_near)
check("Begin Road 150 joins it", b, a)
check("Tiberias keeps its own", street_for(BEGIN, BEGIN, "", 32.791, 35.531, bn, sl, si, city_near), 0)

sl, si, bn = book(("ז'בוטינסקי", RG, 32.085, 34.812), ("ז'בוטינסקי", TLV, 32.090, 34.775))
check("its own city's street wins over a nearer one next door",
      street_for("ז'בוטינסקי", "ז'בוטינסקי", "", 32.086, 34.808, bn, sl, si, city_near), 1)

sl, si, bn = book(("הים", TLV, 32.080, 34.769))
check("no city known: the street of its name close by",
      street_for("הים", "הים", "", 32.081, 34.745, bn, sl, si, city_near), 0)

SALAH = "صلاح الدين"
sl, si, bn = book((SALAH, "@629,688", 31.45, 34.40))  # a street with no city, in its square
far = street_for(SALAH, SALAH, "", 32.22, 35.26, bn, sl, si, city_near)
check("no city known, the same name 100 km away: a street of its own, without a city", (far != 0, sl[far][1]), (True, ""))
check("an address in the first street's square joins it", street_for(SALAH, SALAH, "", 31.451, 34.401, bn, sl, si, city_near), 0)

# Overture's places beside OpenStreetMap's: the same name (or one the start of the other) within 150 m is the same place
import gzip, json, tempfile  # noqa: E401,E402
osm = [["ארומה", "amenity=cafe", TLV, 32.0750, 34.7800, "Aroma"], ["מיזנון", "amenity=restaurant", TLV, 32.0760, 34.7810, ""]]
ov = [["ארומה דיזנגוף", "Aroma", "amenity=cafe", 32.0751, 34.7801],   # the same café, a longer name: dropped
      ["Miznon", "Miznon", "amenity=restaurant", 32.0761, 34.7811],    # the English name of an OSM place without one: kept
      ["ארומה", "", "amenity=cafe", 32.0900, 34.7800],                  # another branch, 1.7 km away: kept
      ["טאיזו", "Taizu", "amenity=restaurant", 32.0710, 34.7890],       # new: kept
      ["טאיזו", "Taizu", "amenity=restaurant", 32.0711, 34.7891]]       # Overture's own repeat: dropped
with tempfile.NamedTemporaryFile(suffix=".json.gz", delete=False) as f:
    f.write(gzip.compress(json.dumps({"places": ov}).encode()))
pois = [list(p) for p in osm]
added = add_places(pois, f.name, city_near)
check("Overture: a longer name of the same café nearby is the same place; another branch and a new place join",
      [p[0] for p in pois[2:]], ["Miznon", "ארומה", "טאיזו"])
check("Overture: how many added", added, 3)

# public bodies' places (public.py): what a licence's description makes of a place, and the Survey's names
check("licence: a café whose licence also says restaurant is a café", kind_of("בית קפה, מסעדה לרבות משקאות משכרים"), "amenity=cafe")
check("licence: a hummus eatery", kind_of("בית אוכל להכנה והגשת חומוס פול"), "amenity=restaurant")
check("licence: a falafel stand is fast food", kind_of("4.2ב - מזנון, בית אוכל אחר להכנת ומכירת פלאפל"), "amenity=fast_food")
check("licence: storage is no destination", kind_of("אחסנה - מקום המיועד לאחסנה"), None)
check("licence: a shop of unnamed goods is a shop", kind_of("מכירת קסטות"), "shop=other")
check("licence: a description that says nothing is skipped", kind_of("1.4ב"), None)
check("name: quotes and the company suffix go", clean_name('"יופיטר" בע"מ'), "יופיטר")
check("name: a phone number is not a name", clean_name("054-4962836"), "")
check("Survey: the type word is dropped when the name repeats it", survey_name("גן ילדים - גן דולב"), "גן דולב")
check("Survey: else the type word stays", survey_name("בית ספר - ברנקו וייס"), "בית ספר ברנקו וייס")
check("Survey: a bare type is no name", survey_name("בית ספר"), "")

# English names for Hebrew-only entries (english.py): the learned spelling, the generic words in English order, the rule
lex = english.learn([("אליהו הנביא", "Eliyahu HaNavi"), ("קניון גבעתיים", "Givatayim Mall"), ("ים המלח", "Dead Sea"),
                     ("הרצל", "Herzl"), ("הרצל", "Herzl"), ("הרצל", "Hertzel"), ("מרכז העיר", "City Center")])
check("lexicon: a spelling is learned when it sounds like the word", lex.get("אליהו"), "Eliyahu")
check("lexicon: a reordered translation still teaches the word that sounds alike", lex.get("גבעתיים"), "Givatayim")
check("lexicon: a translation is never learned (ים המלח stays Yam HaMelach)", (lex.get("ים"), lex.get("המלח"), lex.get("העיר")), (None, None, None))
check("lexicon: the spelling most names agree on", lex.get("הרצל"), "Herzl")
station_lex = english.learn([("תחנת רכבת בית יהושע", "Beit Yehoshua Railway Station")] * 3)
check("lexicon: a word pairs only with an English word no other word owns (רכבת is not Beit)", (station_lex.get("בית"), station_lex.get("רכבת")), ("Beit", None))
check("name: the article before a known word, and before a word spelt by rule", (english.english_name("ההרצל", lex), english.translit("הנסיך")), ("HaHerzl", "HaNsikh"))
park_pairs = [("פארק המסילה", "HaMessila Park"), ("פארק המסילה", "The Track Park"), ("פארק המסילה", "HaMessila Park")]
whole, park_lex = english.whole_names(park_pairs), english.learn(park_pairs)
check("whole name: an entry takes the book's English for its name, the spelling most agree on", english.english_name("פארק המסילה", park_lex, whole), "HaMessila Park")
check("whole name: only for that very name; the words still teach their spelling", english.english_name("פארק המסילה הישן", park_lex, whole), "HaMessila HaYashan Park")
check("name: generic words in English order", english.english_name("בית ספר דקל וייס", lex), "Dekel Vais School")
check("name: a generic that stays first", english.english_name("חומוס פיטר", lex), "Hummus Piter")
check("name: a generic mid-name keeps its Latin spelling", english.english_name("מור מרכז לטיפוח", lex), "Mor Merkaz Letifoch")
check("name: the Latin part of a two-language name is the English", english.english_name("מלון כנען ספא - canaan spa hotel", lex), "canaan spa hotel")
check("name: the company suffix goes", english.english_name("מאפיית לוטם בע\"מ", lex), "Lotem Bakery")
check("name: Arabic script is left alone", english.english_name("مطعم ماجد", lex), "")
check("rule: double yod, initial alef-yod, final he", (english.translit("שיניים"), english.translit("איתן"), english.translit("חנה")), ("Shinayim", "Iten", "Chana"))
check("rule: a vowel between consonant clusters, in two-letter words and in segolates", (english.translit("פיטר"), english.translit("חם"), english.translit("רכב")), ("Piter", "Cham", "Rekhev"))

sys.exit(1 if failures else 0)
