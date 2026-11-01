#!/usr/bin/env python3
"""Everyday places from Overture Maps, for the address book (places.py --overture): restaurants, cafés, shops,
clinics, schools, gyms, hotels and the like, which OpenStreetMap maps only in part.

    python3 -I pipeline/overture.py --out data/overture.json.gz

Overture's places (https://docs.overturemaps.org/guides/places/) come mostly from Meta, Microsoft and Foursquare,
under CDLA-Permissive-2.0, Apache-2.0 and CC0 (each record says which); they are read from Overture's public
bucket (no key) with DuckDB, newest release first. Kept: Israel and the Palestinian territories, confidence 0.5 and
up (below it the names thin out into closed and one-off pages), not closed, of the kinds a rider travels to (KEEP_TOP, less SKIP). Each place is written as
[name, English name, kind, lat, lon], its kind an OpenStreetMap-style tag where the app has a word for it (KIND),
else "<group>=<category>" (the app names the group). places.py drops the ones OpenStreetMap already has.
"""
import argparse
import gzip
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log

BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
BBOX = (34.2, 29.45, 35.9, 33.35)  # west, south, east, north: Israel and the Palestinian territories, with a margin
COUNTRIES = {"IL", "PS"}
MIN_CONFIDENCE = 0.5
# the groups of Overture's taxonomy a rider travels to
KEEP_TOP = {"food_and_drink", "shopping", "health_care", "education", "sports_and_recreation", "lodging",
            "arts_and_entertainment", "cultural_and_historic", "travel_and_transportation", "community_and_government",
            "geographic_entities"}
# within them, kinds that are not a destination for a trip, or that the timetable and OpenStreetMap already cover
SKIP = {"bus_station", "bus_stop", "train_station", "light_rail_station", "metro_station", "transportation",
        "travel_and_transportation", "travel_service", "parking", "taxi_service", "car_rental"}
# Overture's category to the kind the app has a word for. Kinds that rank higher in the search (hospital, mall,
# university...) are left to OpenStreetMap: Overture names many small clinics and shopping centres so.
KIND = {
    "restaurant": "amenity=restaurant", "casual_eatery": "amenity=restaurant", "fast_food_restaurant": "amenity=fast_food",
    "pizza_restaurant": "amenity=restaurant", "burger_restaurant": "amenity=fast_food", "cafe": "amenity=cafe",
    "coffee_shop": "amenity=cafe", "bar": "amenity=bar", "pub": "amenity=pub", "bakery": "shop=bakery",
    "ice_cream_shop": "amenity=ice_cream", "pharmacy_and_drug_store": "amenity=pharmacy", "hotel": "tourism=hotel",
    "lodging": "tourism=hotel", "hostel": "tourism=hostel", "bed_and_breakfast": "tourism=guest_house",
    "bank_or_credit_union": "amenity=bank", "dental_clinic": "amenity=dentist", "gym": "leisure=fitness_centre",
    "fitness_studio": "leisure=fitness_centre", "sport_or_fitness_facility": "leisure=sports_centre", "park": "leisure=park",
    "beach": "natural=beach", "art_gallery": "tourism=gallery", "museum": "tourism=museum",
    "elementary_school": "amenity=school", "high_school": "amenity=school", "preschool": "amenity=kindergarten",
    "music_venue": "amenity=events_venue", "event_space": "amenity=events_venue", "cinema": "amenity=cinema",
    "movie_theater": "amenity=cinema", "theater": "amenity=theatre", "library": "amenity=library",
    "post_office": "amenity=post_office", "veterinarian": "amenity=veterinary", "grocery_store": "shop=supermarket",
    "supermarket": "shop=supermarket", "convenience_store": "shop=convenience", "fashion_and_apparel_store": "shop=clothes",
    "clothing_store": "shop=clothes", "shoe_store": "shop=shoes", "book_store": "shop=books", "bookstore": "shop=books",
    "electronics_store": "shop=electronics", "mobile_phone_store": "shop=mobile_phone", "furniture_store": "shop=furniture",
    "hardware_home_and_garden_store": "shop=hardware", "flowers_and_gifts_store": "shop=florist",
    "jewelry_store": "shop=jewelry", "toy_store": "shop=toys", "pet_store": "shop=pet", "optician": "shop=optician",
    "eyewear_store": "shop=optician", "bicycle_store": "shop=bicycle", "liquor_store": "shop=alcohol",
    "christian_place_of_worship": "amenity=place_of_worship", "jewish_place_of_worship": "amenity=place_of_worship",
    "muslim_place_of_worship": "amenity=place_of_worship", "place_of_worship": "amenity=place_of_worship",
    "community_center": "amenity=community_centre", "historic_site": "historic=monument",
    "hospital": "amenity=clinic", "shopping_mall": "shopping=shopping_center", "college_university": "education=college_university",
}
HEBREW = re.compile(r"[א-ת]")
LATIN = re.compile(r"[A-Za-z]")


def latest_release():
    """The newest release in Overture's bucket (release/YYYY-MM-DD.N/)."""
    with urllib.request.urlopen(f"{BUCKET}/?list-type=2&prefix=release/&delimiter=/", timeout=60) as r:
        found = re.findall(r"<Prefix>release/(\d{4}-\d\d-\d\d\.\d+)/</Prefix>", r.read().decode())
    if not found:
        raise RuntimeError("no release found in Overture's bucket")
    return sorted(found)[-1]


def kind_of(cat, top):
    """The app's kind for an Overture category (KIND), else its group and category."""
    return KIND.get(cat) or f"{top}={cat}"


def names_of(primary, he, en):
    """[name, English name]: the Hebrew name where there is one, else the primary (English or Arabic); the English one
    where there is one, else the primary when it is in Latin letters."""
    primary = (primary or "").strip()
    he = (he or "").strip() or (primary if HEBREW.search(primary) else "")
    en = (en or "").strip() or (primary if LATIN.search(primary) and not HEBREW.search(primary) else "")
    return [he or primary, en]


def fetch(release):
    import duckdb  # MIT; a build-time tool, not part of the app
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    # the bucket is public: empty keys, so credentials in the environment are not sent
    con.execute("CREATE SECRET overture (TYPE s3, PROVIDER config, KEY_ID '', SECRET '', REGION 'us-west-2');")
    w, s, e, n = BBOX
    return con.execute(f"""
        SELECT names.primary, names.common['he'], names.common['en'], basic_category, taxonomy.hierarchy[1],
               bbox.ymin, bbox.xmin, addresses[1].country
        FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}
          AND confidence >= {MIN_CONFIDENCE} AND coalesce(operating_status, 'open') = 'open'
    """).fetchall()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True)
    ap.add_argument("--release", default=None, help="an Overture release (default: the newest)")
    args = ap.parse_args()
    t0 = time.time()
    release = args.release or latest_release()
    rows = fetch(release)
    log(f"Overture {release}: {len(rows)} places in the box at confidence {MIN_CONFIDENCE}+, {time.time() - t0:.0f}s")
    out, skipped = [], 0
    for primary, he, en, cat, top, lat, lon, country in rows:
        # Israel and the Palestinian territories; a place without a country only west of the Jordan
        if (country and country not in COUNTRIES) or (not country and lon > 35.55):
            skipped += 1
            continue
        if not cat or top not in KEEP_TOP or cat in SKIP or not primary:
            skipped += 1
            continue
        name, name_en = names_of(primary, he, en)
        out.append([name, name_en, kind_of(cat, top), round(lat, 6), round(lon, 6)])
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with gzip.open(args.out, "wt", encoding="utf-8") as f:
        json.dump({"release": release, "places": out}, f, ensure_ascii=False, separators=(",", ":"))
    log(f"kept {len(out)} places ({skipped} outside or not a destination), wrote {args.out}")


if __name__ == "__main__":
    main()
