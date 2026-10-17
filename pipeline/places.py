#!/usr/bin/env python3
"""Compile an offline address book from OpenStreetMap: streets, house numbers, cities, notable places.

    python3 -I pipeline/places.py data/osm/israel-and-palestine-latest.osm.pbf --gtfs data/gtfs.zip --out data/places.bin.gz

Streets get their city from the nearest transit stop (the GTFS stop_desc carries
the city), addresses from their own addr:city when present. Output is the usual
container: u32 header length, JSON header (names), typed-array sections.
"""
import argparse
import csv
import datetime
import gzip
import io
import json
import math
import re
import struct
import sys
import time
import zipfile
from collections import defaultdict

import numpy as np
import osmium

FORMAT_VERSION = 1
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
CITY_RE = re.compile(r"עיר:\s*(.*?)\s*רציף:")
PUNCT = re.compile(r"[.'\"״׳`/()\-,:]+")


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def norm(s):
    return re.sub(r"\s+", " ", PUNCT.sub(" ", s.lower())).strip()


def hebrew_name(tags):
    return tags.get("name:he") or tags.get("name") or ""


def split_number(s):
    """'4א' -> (4, 'א'); '12-14' -> (12, '-14'); 'בלי' -> None"""
    m = re.match(r"^\s*(\d{1,5})\s*(.*)$", s)
    if not m:
        return None
    return int(m.group(1)), m.group(2).strip()[:4]


class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.streets = []     # (name, lat, lon)
        self.addresses = []   # (street, number, suffix, city, lat, lon)
        self.pois = []        # (name, kind, lat, lon)
        self.n = 0

    def _poi(self, tags):
        for key, values in POI_TAGS.items():
            v = tags.get(key)
            if v and v in values:
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
                self.pois.append((name, kind, n.location.lat, n.location.lon))

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
            self.streets.append((name, lat, lon))
        hn, st = t.get("addr:housenumber"), t.get("addr:street")
        if hn and st:
            num = split_number(hn)
            if num:
                self.addresses.append((st, num[0], num[1], t.get("addr:city", ""), lat, lon))
        if name:
            kind = self._poi(t)
            if kind:
                self.pois.append((name, kind, lat, lon))

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
            self.pois.append((name, kind, lat, lon))
        if hn and st:
            num = split_number(hn)
            if num:
                self.addresses.append((st, num[0], num[1], t.get("addr:city", ""), lat, lon))


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pbf")
    ap.add_argument("--gtfs", required=True, help="GTFS zip, for the city of each stop")
    ap.add_argument("--out", default="data/places.bin.gz")
    args = ap.parse_args()
    t0 = time.time()

    # stops with cities, as a grid, to give streets a city
    stops = []
    with zipfile.ZipFile(args.gtfs) as zf:
        with io.TextIOWrapper(zf.open("stops.txt"), encoding="utf-8-sig", newline="") as f:
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
    for name, lat, lon in h.streets:
        city = city_near(lat, lon)
        key = (norm(name), city)
        groups[key].append((lat, lon))
        display.setdefault(key, name)
    street_list = []   # [name, city, lat, lon]
    street_index = {}
    for key, pts in sorted(groups.items()):
        street_index[key] = len(street_list)
        street_list.append([display[key], key[1], round(sum(p[0] for p in pts) / len(pts), 6), round(sum(p[1] for p in pts) / len(pts), 6)])
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
                street_list.append([st, c, round(lat, 6), round(lon, 6)])
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
    for name, kind, lat, lon in h.pois:
        key = (norm(name), kind, round(lat, 3), round(lon, 3))
        if key in seen:
            continue
        seen.add(key)
        poi_list.append([name, kind, city_near(lat, lon), round(lat, 6), round(lon, 6)])
    poi_list.sort(key=lambda p: (p[0], p[2]))

    sections = []
    body = bytearray()

    def add(name, arr, dtype):
        a = np.ascontiguousarray(np.asarray(arr, dtype=dtype))
        while len(body) % 4:
            body.append(0)
        sections.append({"name": name, "dtype": dtype, "offset": len(body), "length": int(a.size)})
        body.extend((a.astype("<" + np.dtype(dtype).str[1:]) if a.dtype.itemsize > 1 else a).tobytes())

    add("addrStreet", [a[0] for a in addr], "int32")
    add("addrNumber", [min(a[1], 65535) for a in addr], "uint16")
    add("addrLat", [a[3] for a in addr], "float32")
    add("addrLon", [a[4] for a in addr], "float32")
    suffixes = {i: a[2] for i, a in enumerate(addr) if a[2]}
    header = {
        "format": FORMAT_VERSION, "source": args.pbf.split("/")[-1],
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"streets": len(street_list), "addresses": len(addr), "pois": len(poi_list), "cities": len(cities)},
        "sections": sections,
        "streets": street_list,
        "cities": [[c[0], round(c[1], 6), round(c[2], 6)] for c in cities],
        "pois": poi_list,
        "addrSuffix": suffixes,
    }
    hjson = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode()
    while (4 + len(hjson)) % 4:
        hjson += b" "
    raw = struct.pack("<I", len(hjson)) + hjson + bytes(body)
    with gzip.open(args.out, "wb", compresslevel=9) as f:
        f.write(raw)
    import os
    log(f"wrote {args.out}: {len(raw)/1e6:.1f} MB raw, {os.path.getsize(args.out)/1e6:.1f} MB gzip, {time.time()-t0:.0f}s")
    print(json.dumps({"streets": len(street_list), "addresses": len(addr), "pois": len(poi_list), "cities": len(cities),
                      "raw_bytes": len(raw), "gz_bytes": os.path.getsize(args.out), "seconds": round(time.time() - t0)}))


if __name__ == "__main__":
    main()
