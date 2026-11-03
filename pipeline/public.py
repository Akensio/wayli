#!/usr/bin/env python3
"""Places from Israel's public bodies, for the address book (places.py --public): businesses with their trade names
from municipal licensing records, and the Survey of Israel's institutions (schools, kindergartens, colleges...).

    python3 -I pipeline/public.py --out data/public.json.gz

The sources, each read whole and each optional (one that does not answer is logged and left out; the run fails only
when none answers, so the workflow keeps the previous file):
  - Tel Aviv-Yafo's GIS, layer 964 "licensed businesses" (gisn.tel-aviv.gov.il, behind the city's open-data portal;
    its terms: the data may be shared and put to any use, "as is"): every business with a licence or permit, its
    trade name (about half have one; the rest are skipped), the licence's description of the business and a point.
    Refreshed nightly by the city.
  - Be'er Sheva's signage survey of businesses (data.gov.il, "Other (Open)"): trade name, kind and a point.
  - The Survey of Israel's institution layers on data.gov.il (the national database's open part, "Other (Open)"):
    schools, kindergartens, academic institutions, universities, research institutes and yeshivot, named
    "type - name" in the Israeli grid (EPSG:2039), converted here.
Each place is written as [name, English name, kind, lat, lon], the kind an OpenStreetMap-style tag the app has a
word for (KINDS), read from the licence's description. places.py drops the ones OpenStreetMap or Overture already
have (same name within 150 m), so these fill gaps rather than replace.
"""
import argparse
import gzip
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log

TLV_LAYER = "https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/964/query"
DATA_GOV = "https://data.gov.il/api/3/action"
BEER_SHEVA_SIGNS = "5f4f8927-b890-42ed-bb25-58d48b5f180f"   # resource: מאגר עסקים קולטי קהל (dataset unified_businesses-br7)
# the Survey of Israel's layers: dataset name -> the kind when the name's own type word says nothing
SURVEY_LAYERS = {
    "school": "amenity=school", "kindergarten": "amenity=kindergarten", "academic": "amenity=college",
    "universities": "amenity=university", "researchinstitute": "office=research", "talmudiccollege": "amenity=school",
}
PAGE = 2000

# What a licence's description (or a signage survey's kind) says the place is, first match wins: the specific before
# the general ("בית קפה" before "מסעדה", since a café's licence often says both), food before shops.
KINDS = [
    (r"בית מרקחת", "amenity=pharmacy"),
    (r"מלון|אכסני|הוסטל", "tourism=hotel"),
    (r"בית קפה|קפיטרי|בתי קפה|תה וקפה", "amenity=cafe"),
    (r"פאב", "amenity=pub"),
    (r"גלידה|גלידרי", "amenity=ice_cream"),
    (r"מאפי|אפיית|אפייה|אפית|קונדיטור", "shop=bakery"),
    (r"פיצה|בורקס|פלאפל|שווארמה|שוארמה|המבורגר|מזנון|מזון מהיר|כריכים|שניצל", "amenity=fast_food"),
    (r"מסעד|בית אוכל|בתי אוכל|אוכל", "amenity=restaurant"),
    (r"משקאות משכרים\s*-\s*הגשתם|הגשת משקאות משכרים", "amenity=bar"),   # a licence for serving drinks and nothing else
    (r"קיוסק", "shop=kiosk"),
    (r"מכולת|מכלת|מינימרקט|מיני מרקט", "shop=convenience"),
    (r"מרכול|סופרמרקט|סופר מרקט|סופר", "shop=supermarket"),
    (r"אטליז|בשר", "shop=butcher"),
    (r"ירקות|פירות|ירקן", "shop=greengrocer"),
    (r"פרחים|משתלה", "shop=florist"),
    (r"מספרה|מספרת|מעצב שיער|עיצוב שיער", "shop=hairdresser"),
    (r"קוסמטיק|יופי|מניקור|ציפורניים|טיפוח", "shop=beauty"),
    (r"חדר כושר|מכון כושר|סטודיו לכושר|כושר", "leisure=fitness_centre"),
    (r"בריכ", "leisure=swimming_pool"),
    (r"אולם שמחות|אולם אירועים|אולם ארועים|גן אירועים|אולמות", "amenity=events_venue"),
    (r"מוסך", "shop=car_repair"),
    (r"יין|יינות|משקאות משכרים שלא לצריכה", "shop=alcohol"),
    (r"אופטיק", "shop=optician"),
    (r"צעצוע", "shop=toys"),
    (r"ספרים", "shop=books"),
    (r"הלבשה|בגדים|אופנה|ביגוד", "shop=clothes"),
    (r"נעלי|הנעלה", "shop=shoes"),
    (r"רהיט|ריהוט", "shop=furniture"),
    (r"אלקטרוניק|מחשבים|סלולר|טלפונים|חשמל", "shop=electronics"),
    (r"תכשיט", "shop=jewelry"),
    (r"חיות מחמד|חיות", "shop=pet"),
    (r"מכבסה", "shop=laundry"),
    (r"קעקע", "shop=tattoo"),
    (r"מחול|ריקוד", "leisure=dance"),
    (r"גן ילדים|מעון|פעוטון", "amenity=kindergarten"),
    (r"בית ספר|בי\"ס|תיכון|חטיבת", "amenity=school"),
    (r"בית כנסת", "amenity=place_of_worship"),
    (r"שיניים", "amenity=dentist"),
    (r"וטרינר", "amenity=veterinary"),
    (r"מרפא|רופא|קליניק", "amenity=doctors"),
    (r"בנק", "amenity=bank"),
    (r"דואר", "amenity=post_office"),
    (r"קולנוע", "amenity=cinema"),
    (r"תיאטרון", "amenity=theatre"),
    (r"מוזיאון|מוזאון", "tourism=museum"),
    (r"גלריה", "tourism=gallery"),
    (r"חנות|מכירת|מכירה|ממכר|מסחר|שיווק", "shop=other"),
]
# businesses nobody travels to by name: storage, production, offices, infrastructure
NOT_A_DESTINATION = re.compile(r"אחסנה|מחסן|ייצור|מפעל|חניון|חניה|אנטנ|תחנת דלק|משרד|הפקה|עיבוד|מעבדה|קייטרינג|הסעות|מונית|שינוע|הובל")
# the Survey's "type - name": the type word gives the kind
SURVEY_TYPES = [
    (r"^גן ילדים|^מעון|^פעוטון", "amenity=kindergarten"),
    (r"^בית ספר|^בי\"ס|^תיכון|^חטיב|^פנימי|^ישיב|^כולל|^תלמוד|^סמינר", "amenity=school"),
    (r"^מכלל|^מכינ|^בית מדרש|^מדרש", "amenity=college"),
    (r"^אוניברסיט|^האוניברסיט", "amenity=university"),
    (r"^מכון|^המכון|^מרכז|^המרכז", "office=research"),
]
PHONE = re.compile(r"^[\d\s\-+*#]+$")
HEBREW = re.compile(r"[א-ת]")


def kind_of(text):
    """The app's kind for a licence's description, None when it is no destination or says nothing recognisable."""
    t = text or ""
    if NOT_A_DESTINATION.search(t) and not re.search(r"מסעד|בית אוכל|בית קפה|מזנון|פאב", t):
        return None
    for pat, kind in KINDS:
        if re.search(pat, t):
            return kind
    return None


def clean_name(name):
    """A trade name as the rider would type it: quotes around it and the company suffix gone; '' when it is not a name
    (a phone number, digits, one letter)."""
    n = re.sub(r"\s+", " ", (name or "")).strip()
    n = re.sub(r"\s*(בע\"מ|בע״מ|בעמ|בע'מ)\s*$", "", n).strip()   # the company suffix first, then quotes around what is left
    n = n.strip("\"'״׳ ").strip()
    if len(n) < 2 or PHONE.match(n):
        return ""
    return n


def fetch_json(url, timeout=120):
    req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            body = gzip.decompress(body)
    return json.loads(body)


def tel_aviv():
    """Tel Aviv's licensed businesses with a trade name: [name, '', kind, lat, lon]..."""
    out, off, named, skipped = [], 0, 0, 0
    while True:
        q = urllib.parse.urlencode({"where": "1=1", "outFields": "t_shem_esek,t_hesber_mahut_esek", "outSR": 4326,
                                    "resultRecordCount": PAGE, "resultOffset": off, "f": "json"})
        d = fetch_json(f"{TLV_LAYER}?{q}")
        if "error" in d:
            raise RuntimeError(d["error"])
        feats = d.get("features", [])
        for f in feats:
            a, g = f.get("attributes") or {}, f.get("geometry")
            name = clean_name(a.get("t_shem_esek"))
            if not name or not g:
                continue
            named += 1
            kind = kind_of(f"{a.get('t_hesber_mahut_esek') or ''} {name}")
            if not kind:
                skipped += 1
                continue
            out.append([name, "", kind, round(g["y"], 6), round(g["x"], 6)])
        if not d.get("exceededTransferLimit") or not feats:
            break
        off += len(feats)
        time.sleep(0.3)
    log(f"Tel Aviv: {off + len(feats)} licensed businesses, {named} with a trade name, {len(out)} kept ({skipped} not a destination or unrecognised)")
    return out


def datastore(resource, fields=None):
    """Every record of a data.gov.il datastore resource."""
    recs, off = [], 0
    while True:
        q = {"resource_id": resource, "limit": 10000, "offset": off}
        if fields:
            q["fields"] = ",".join(fields)
        d = fetch_json(f"{DATA_GOV}/datastore_search?{urllib.parse.urlencode(q)}")["result"]
        recs += d["records"]
        if len(d["records"]) < 10000:
            return recs
        off += 10000


def beer_sheva():
    """Be'er Sheva's signage survey: businesses with a name and a point."""
    out, skipped = [], 0
    recs = datastore(BEER_SHEVA_SIGNS, ["business_name", "business_kind", "location_lat", "location_lng"])
    for r in recs:
        name = clean_name(r.get("business_name"))
        lat, lon = r.get("location_lat"), r.get("location_lng")
        if not name or not lat or not lon:
            continue
        kind = kind_of(f"{r.get('business_kind') or ''} {name}")
        if not kind:
            skipped += 1
            continue
        out.append([name, "", kind, round(float(lat), 6), round(float(lon), 6)])
    log(f"Be'er Sheva: {len(recs)} surveyed businesses, {len(out)} kept ({skipped} not a destination or unrecognised)")
    return out


GENERIC = re.compile(r"^(בית ספר|בי\"ס|גן ילדים|גן|מעון|ישיבה|ישיבת|כולל|מכללה|אוניברסיטה|מכון|תיכון|חטיבת ביניים|יסודי|מגרש חניה|חניון|חניה.*)$")


def survey_name(raw):
    """'גן ילדים - גן דולב' -> 'גן דולב'; 'בית ספר - ברנקו וייס' -> 'בית ספר ברנקו וייס'; '' for a bare type ('בית ספר')."""
    raw = re.sub(r"\s+", " ", raw or "").strip()
    if " - " not in raw:
        return "" if GENERIC.match(raw) else raw
    kind_word, rest = (s.strip() for s in raw.split(" - ", 1))
    if not rest:
        return ""
    first = kind_word.split(" ")[0]
    return rest if rest.split(" ")[0] in (first, first.lstrip("ה")) else f"{kind_word} {rest}"


def survey_of_israel():
    """The Survey of Israel's institutions, named and in WGS84."""
    from pyproj import Transformer  # MIT; a build-time tool, not part of the app
    itm = Transformer.from_crs("EPSG:2039", "EPSG:4326", always_xy=True)
    out = []
    for dataset, default in SURVEY_LAYERS.items():
        pkg = fetch_json(f"{DATA_GOV}/package_show?id={dataset}")["result"]
        resource = next(r["id"] for r in pkg["resources"] if (r.get("format") or "").upper() == "CSV")
        recs = datastore(resource, ["NAME", "LATIN_NAME", "E_ORD", "N_ORD"])
        kept = 0
        for r in recs:
            raw = r.get("NAME") or ""
            name = survey_name(raw)
            if not name or not r.get("E_ORD") or not r.get("N_ORD"):
                continue
            kind = next((k for pat, k in SURVEY_TYPES if re.search(pat, raw)), default)
            lon, lat = itm.transform(float(r["E_ORD"]), float(r["N_ORD"]))
            en = (r.get("LATIN_NAME") or "").strip()
            out.append([name, en if en and not HEBREW.search(en) else "", kind, round(lat, 6), round(lon, 6)])
            kept += 1
        log(f"Survey of Israel {dataset}: {len(recs)} rows, {kept} named")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    t0 = time.time()
    places, sources = [], {}
    for name, fetch in (("tel_aviv", tel_aviv), ("beer_sheva", beer_sheva), ("survey_of_israel", survey_of_israel)):
        try:
            got = fetch()
        except Exception as e:  # a source down leaves the others in; the workflow keeps the last file if none answers
            log(f"{name}: not read ({e})")
            continue
        sources[name] = len(got)
        places += got
    if not places:
        log("no source answered")
        sys.exit(1)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with gzip.open(args.out, "wt", encoding="utf-8") as f:
        json.dump({"sources": sources, "places": places}, f, ensure_ascii=False, separators=(",", ":"))
    log(f"kept {len(places)} places from {len(sources)} sources, wrote {args.out}, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
