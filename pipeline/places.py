#!/usr/bin/env python3
"""Compile an offline address book from OpenStreetMap: streets, house numbers, cities, notable places.

    python3 -I pipeline/places.py data/osm/israel-and-palestine-latest.osm.pbf --gtfs data/gtfs.zip --out data/places.bin.gz

Streets get their city from the nearest transit stop (the GTFS stop_desc carries
the city), addresses from their own addr:city when present. Names are Hebrew, with
the English name beside it where OpenStreetMap has one (name:en; 90% of streets) and,
for cities, where the feed's translations.txt has one. Output is the usual
container: u32 header length, JSON header (names), typed-array sections.
"""
import argparse
import csv
import datetime
import json
import os
import re
import sys
import time
import zipfile
from collections import defaultdict

import osmium

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import container
from common import log, member, haversine

FORMAT_VERSION = 3   # 2: English names beside the Hebrew (streets, places, cities); 3: everyday places too (food, shops, hotels...)
STREET_TYPES = {"primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
                "residential", "living_street", "pedestrian", "road", "service", "footway", "path", "cycleway", "track"}
POI_TAGS = {
    "amenity": {"hospital", "clinic", "university", "college", "library", "townhall", "cinema", "theatre", "courthouse",
                "police", "community_centre", "marketplace", "bus_station", "ferry_terminal", "conference_centre"},
    "shop": {"mall", "department_store", "supermarket"},
    "leisure": {"park", "stadium", "sports_centre", "beach_resort", "nature_reserve", "water_park"},
    "tourism": {"attraction", "museum", "zoo", "theme_park", "viewpoint", "aquarium"},
    "railway": {"station"},
    "aeroway": {"aerodrome", "terminal"},
    "natural": {"beach"},
    "historic": {"archaeological_site", "castle", "monument"},
    "office": {"government"},
    "healthcare": {"hospital"},
    "public_transport": {"station"},
}
# Everyday places a rider goes to by name: food and drink, hotels, shops, services, schools, synagogues, offices.
# The search ranks them below the landmarks above, level with streets, so a street search is not buried in shops.
# Left out: kinds that are rarely named or rarely a destination by transit (fuel, parking, playgrounds, benches).
EVERYDAY_TAGS = {
    "amenity": {"restaurant", "cafe", "fast_food", "bar", "pub", "ice_cream", "food_court", "nightclub", "pharmacy", "bank",
                "post_office", "school", "kindergarten", "place_of_worship", "arts_centre", "events_venue", "dentist", "doctors",
                "veterinary", "bicycle_rental", "car_rental"},
    "tourism": {"hotel", "hostel", "guest_house", "gallery"},
    "leisure": {"fitness_centre", "swimming_pool", "garden"},
    "shop": None,     # any named shop
    "office": None,   # any named office (people go to work there)
}
CITY_RE = re.compile(r"עיר:\s*(.*?)\s*רציף:")
PUNCT = re.compile(r"[.'\"״׳`/()\-,:]+")
INNER_QUOTE = re.compile(r"(?<=[^\W\d_])['\"״׳`]+(?=[^\W\d_])")   # a quote inside a word (הל"ה, ג'וליס) belongs to it


def norm(s):
    return re.sub(r"\s+", " ", PUNCT.sub(" ", INNER_QUOTE.sub("", s.lower()))).strip()


def hebrew_name(tags):
    return tags.get("name:he") or tags.get("name") or ""


def english_name(tags):
    return (tags.get("name:en") or "").strip()


def read_city_translations(zf):
    """City names in English from the feed's translations.txt (pre-2020 layout: trans_id, lang, translation)."""
    out = {}
    if "translations.txt" not in set(zf.namelist()):
        return out
    with member(zf, "translations.txt") as f:
        for r in csv.DictReader(f):
            if (r.get("lang") or "").strip().upper() == "EN" and r.get("trans_id") and r.get("translation"):
                out[r["trans_id"].strip()] = r["translation"].strip()
    return out


def format_of(path):
    """The format version of a compiled address book, or -1."""
    try:
        return int(container.read_header(path).get("format", -1))
    except Exception:
        return -1


def split_number(s):
    """'4א' -> (4, 'א'); '12-14' -> (12, '-14'); 'בלי' -> None"""
    m = re.match(r"^\s*(\d{1,5})\s*(.*)$", s)
    if not m:
        return None
    return int(m.group(1)), m.group(2).strip()[:4]


class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.streets = []     # (name, lat, lon, name_en)
        self.addresses = []   # (street, number, suffix, city, lat, lon)
        self.pois = []        # (name, kind, lat, lon, name_en)
        self.n = 0

    def _poi(self, tags):
        for key, values in POI_TAGS.items():
            v = tags.get(key)
            if v and v in values:
                return f"{key}={v}"
        for key, values in EVERYDAY_TAGS.items():
            v = tags.get(key)
            if v and v not in ("yes", "no", "vacant") and (values is None or v in values):
                return f"{key}={v}"
        return None

    def node(self, n):
        t = dict(n.tags)
        if not t:
            return
        hn, st = t.get("addr:housenumber"), t.get("addr:street")
        if hn and st:
            num = split_number(hn)
            if num:
                self.addresses.append((st, num[0], num[1], t.get("addr:city", ""), n.location.lat, n.location.lon))
        name = hebrew_name(t)
        if name:
            kind = self._poi(t)
            if kind:
                self.pois.append((name, kind, n.location.lat, n.location.lon, english_name(t)))

    def way(self, w):
        self.n += 1
        t = dict(w.tags)
        if not t:
            return
        try:
            lats = [nd.lat for nd in w.nodes if nd.location.valid()]
            lons = [nd.lon for nd in w.nodes if nd.location.valid()]
        except osmium.InvalidLocationError:
            return
        if not lats:
            return
        lat, lon = sum(lats) / len(lats), sum(lons) / len(lons)
        hw = t.get("highway")
        name = hebrew_name(t)
        if hw in STREET_TYPES and name:
            self.streets.append((name, lat, lon, english_name(t)))
        hn, st = t.get("addr:housenumber"), t.get("addr:street")
        if hn and st:
            num = split_number(hn)
            if num:
                self.addresses.append((st, num[0], num[1], t.get("addr:city", ""), lat, lon))
        if name:
            kind = self._poi(t)
            if kind:
                self.pois.append((name, kind, lat, lon, english_name(t)))

    def area(self, a):
        # multipolygon relations and closed ways: campuses, malls, parks, stations
        t = dict(a.tags)
        if not t:
            return
        name = hebrew_name(t)
        kind = self._poi(t) if name else None
        hn, st = t.get("addr:housenumber"), t.get("addr:street")
        if not kind and not (hn and st):
            return
        lats, lons = [], []
        try:
            for ring in a.outer_rings():
                for nd in ring:
                    if nd.location.valid():
                        lats.append(nd.lat); lons.append(nd.lon)
        except Exception:
            return
        if not lats:
            return
        lat, lon = sum(lats) / len(lats), sum(lons) / len(lons)
        if kind:
            self.pois.append((name, kind, lat, lon, english_name(t)))
        if hn and st:
            num = split_number(hn)
            if num:
                self.addresses.append((st, num[0], num[1], t.get("addr:city", ""), lat, lon))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pbf", nargs="?")
    ap.add_argument("--gtfs", help="GTFS zip, for the city of each stop and the English city names")
    ap.add_argument("--out", default="data/places.bin.gz")
    ap.add_argument("--check", default=None, help="exit 0 when this compiled file has the current format, else 1 (for the build)")
    args = ap.parse_args()
    if args.check:
        sys.exit(0 if format_of(args.check) == FORMAT_VERSION else 1)
    if not args.pbf or not args.gtfs:
        ap.error("pbf and --gtfs are required")
    t0 = time.time()

    # stops with cities, as a grid, to give streets a city
    stops = []
    with zipfile.ZipFile(args.gtfs) as zf:
        city_en = read_city_translations(zf)
        with member(zf, "stops.txt") as f:
            for r in csv.DictReader(f):
                m = CITY_RE.search(r.get("stop_desc", "") or "")
                city = m.group(1).strip() if m else ""
                if city:
                    stops.append((float(r["stop_lat"]), float(r["stop_lon"]), city))
    cell = 0.01
    grid = defaultdict(list)
    for lat, lon, city in stops:
        grid[(int(lat / cell), int(lon / cell))].append((lat, lon, city))

    def city_near(lat, lon, radius=1500):
        best, bd = "", radius
        cy, cx = int(lat / cell), int(lon / cell)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for slat, slon, c in grid.get((cy + dy, cx + dx), ()):
                    d = haversine(lat, lon, slat, slon)
                    if d < bd:
                        bd, best = d, c
        return best

    city_pts = defaultdict(list)
    for lat, lon, city in stops:
        city_pts[city].append((lat, lon))
    cities = sorted((name, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), len(pts))
                    for name, pts in city_pts.items())
    log(f"{len(stops)} stops with a city, {len(cities)} cities")

    h = Handler()
    h.apply_file(args.pbf, locations=True, idx="flex_mem")
    log(f"OSM: {len(h.streets)} named street ways, {len(h.addresses)} addresses, {len(h.pois)} places, {time.time()-t0:.0f}s")

    # streets: group ways by (normalised name, city)
    groups = defaultdict(list)
    display = {}
    display_en = {}
    for name, lat, lon, en in h.streets:
        city = city_near(lat, lon)
        key = (norm(name), city)
        groups[key].append((lat, lon))
        display.setdefault(key, name)
        if en:
            display_en.setdefault(key, en)
    street_list = []   # [name, city, lat, lon, name_en]
    street_index = {}
    for key, pts in sorted(groups.items()):
        street_index[key] = len(street_list)
        street_list.append([display[key], key[1], round(sum(p[0] for p in pts) / len(pts), 6), round(sum(p[1] for p in pts) / len(pts), 6), display_en.get(key, "")])
    log(f"{sum(1 for s in street_list if s[4])} of {len(street_list)} streets have an English name")
    log(f"{len(street_list)} streets after grouping")

    # addresses: attach to a street (same name; same city when known, else nearest street of that name)
    by_name = defaultdict(list)
    for (n, c), i in street_index.items():
        by_name[n].append((c, i))
    addr = []
    missing = 0
    for st, num, suffix, city, lat, lon in h.addresses:
        n = norm(st)
        cands = by_name.get(n)
        if not cands:
            # a street with addresses but no mapped way: create it from the addresses
            c = city or city_near(lat, lon)
            key = (n, c)
            if key not in street_index:
                street_index[key] = len(street_list)
                street_list.append([st, c, round(lat, 6), round(lon, 6), ""])
                by_name[n].append((c, street_index[key]))
            cands = by_name[n]
        if len(cands) == 1:
            si = cands[0][1]
        else:
            c = city or city_near(lat, lon)
            same = [i for cc, i in cands if cc == c]
            if same:
                si = same[0]
            else:
                si = min(cands, key=lambda ci: haversine(lat, lon, street_list[ci[1]][2], street_list[ci[1]][3]))[1]
        addr.append((si, num, suffix, lat, lon))
    addr.sort()
    log(f"{len(addr)} addresses attached, {missing} unmatched")

    # places
    poi_list = []
    seen = set()
    for name, kind, lat, lon, en in h.pois:
        key = (norm(name), kind, round(lat, 3), round(lon, 3))
        if key in seen:
            continue
        seen.add(key)
        poi_list.append([name, kind, city_near(lat, lon), round(lat, 6), round(lon, 6), en])
    poi_list.sort(key=lambda p: (p[0], p[2]))

    sec = container.Sections()
    add = sec.add

    add("addrStreet", [a[0] for a in addr], "int32")
    add("addrNumber", [min(a[1], 65535) for a in addr], "uint16")
    add("addrLat", [a[3] for a in addr], "float32")
    add("addrLon", [a[4] for a in addr], "float32")
    suffixes = {i: a[2] for i, a in enumerate(addr) if a[2]}
    header = {
        "format": FORMAT_VERSION, "source": args.pbf.split("/")[-1],
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"streets": len(street_list), "addresses": len(addr), "pois": len(poi_list), "cities": len(cities)},
        "sections": sec.list,
        "streets": street_list,
        "cities": [[c[0], round(c[1], 6), round(c[2], 6), city_en.get(c[0], "")] for c in cities],
        "pois": poi_list,
        "addrSuffix": suffixes,
    }
    raw_n = container.write(args.out, header, sec, ascii_only=False)[0]
    log(f"wrote {args.out}: {raw_n/1e6:.1f} MB raw, {os.path.getsize(args.out)/1e6:.1f} MB gzip, {time.time()-t0:.0f}s")
    print(json.dumps({"streets": len(street_list), "addresses": len(addr), "pois": len(poi_list), "cities": len(cities),
                      "raw_bytes": raw_n, "gz_bytes": os.path.getsize(args.out), "seconds": round(time.time() - t0)}))


if __name__ == "__main__":
    main()
