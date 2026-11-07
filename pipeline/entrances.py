#!/usr/bin/env python3
"""Station entrances for the planner (data/entrances.json): where a light rail, underground or train station opens onto
the street, from OpenStreetMap.

    python3 -I pipeline/entrances.py data/osm/israel-and-palestine-latest.osm.pbf --out data/entrances.json
    python3 -I pipeline/entrances.py --check data/entrances.json   # exit 0 when the file is of this script's format

The feed has no pathways: a station is one point near its middle, while its entrances (lettered A to D at the Red
Line's underground stations) open up to 150 m away on different streets. OpenStreetMap maps them (railway=
subway_entrance or train_station_entrance, with `ref` the letter and sometimes a name) and ties most to their station
through a stop_area relation; an entrance in none is given to the nearest station node within NEAR_M. Train stations are
mapped more loosely: a door is a plain entrance=* node on the station building's outline, and a hall's entrance is often
no node at all, only the place where a footway meets the building, so both count as entrances when they are on a
building tagged as a station (a door of the mall across the street is not); a hall's double door is one entrance
(MERGE_M). Stations are rail only (is_station): a bus terminal's doors are not shown. Written per station: name, point
and the entrances [{ref, name, lat, lon}]. The app ties each station to the timetable's rail stops within NEAR_M of it
(the feed names them many ways: "ת.רק''ל אלנבי", "גשר אם המושבות"; the timetable knows which stops trains, light rail
and the Carmelit call at) and picks the entrance nearest the rider's way (src/worker/exits.ts).
"""
import argparse
import datetime
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log, haversine

ENTRANCE = {"subway_entrance", "train_station_entrance"}
STATION = {"station", "halt"}
RAIL = {"train", "light_rail", "subway", "monorail", "funicular"}   # a station of these modes; a bus terminal is not a station here
DOOR = {"main", "yes", "exit", "entrance"}   # entrance=* on a station building's outline: a train station's doors (mapped so, not as railway=)
WALK = {"footway", "steps", "path", "pedestrian", "corridor", "elevator", "living_street", "residential", "service", "unclassified", "cycleway"}
NEAR_M = 200
MERGE_M = 25   # two doors this close, with the same letter and name, are one entrance (a hall's double door)
FORMAT = 3   # 1: lettered entrances of light rail and underground stations; 2: name_en, and train stations' doors (plain entrance nodes);
             # 3: rail stations only, doors only on a station building, entrances where walking ways meet it, twin doors merged


def is_station(t):
    """A node or area of a rail station: railway=station/halt, or public_transport=station of a rail mode (train=yes...)."""
    if t.get("railway") in STATION:
        return True
    return t.get("public_transport") == "station" and (t.get("station") in RAIL or any(t.get(m) == "yes" for m in RAIL))


def read_osm(path):
    """Station nodes, entrance nodes (railway=*_entrance anywhere; entrance=* only on a station building's outline, and
    where an outdoor walking way meets that outline), and stop areas (name, station node ids, entrance node ids).
    Two passes: the first reads nodes and the station buildings (closed ways or multipolygons tagged as a station or
    building=train_station, with their outlines' node ids); the second reads the walking ways against those outlines."""
    import osmium  # BSD; a build-time tool, not part of the app

    class First(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.stations, self.entrances, self.doors, self.areas, self.buildings = {}, {}, {}, [], []

        def node(self, n):
            t = dict(n.tags)
            if t.get("railway") in ENTRANCE:
                self.entrances[n.id] = {"ref": (t.get("ref") or "").strip()[:4], "name": (t.get("name") or "").strip(), "lat": round(n.location.lat, 6), "lon": round(n.location.lon, 6)}
            elif t.get("entrance") in DOOR:
                self.doors[n.id] = {"ref": (t.get("ref") or "").strip()[:4], "name": (t.get("name") or "").strip(), "lat": round(n.location.lat, 6), "lon": round(n.location.lon, 6)}
            elif is_station(t):
                self.stations[n.id] = {"name": t.get("name") or "", "name_en": (t.get("name:en") or "").strip(),
                                       "lat": n.location.lat, "lon": n.location.lon}

        def area(self, a):
            t = dict(a.tags)
            if not (t.get("building") == "train_station" or (t.get("building") and is_station(t)) or (not t.get("building") and is_station(t) and t.get("public_transport") != "stop_position")):
                return
            if t.get("location") == "underground" or t.get("tunnel") or (t.get("layer") or "0").startswith("-") or (t.get("level") or "0").startswith("-"):
                return   # an underground station's footprint: a footway crossing it above ground enters nothing
            outline = {}
            for ring in a.outer_rings():
                for nd in ring:
                    if nd.location.valid():
                        outline[nd.ref] = (round(nd.location.lat, 6), round(nd.location.lon, 6))
            if outline:
                self.buildings.append({"name": t.get("name") or "", "outline": outline,
                                       "lat": sum(p[0] for p in outline.values()) / len(outline), "lon": sum(p[1] for p in outline.values()) / len(outline)})

        def relation(self, r):
            t = dict(r.tags)
            if t.get("public_transport") == "stop_area":
                self.areas.append((t.get("name") or "", [m.ref for m in r.members if m.type == "n"]))

    class Walks(osmium.SimpleHandler):
        """The nodes where an outdoor walking way meets a station building's outline: {node id: (lat, lon)}."""
        def __init__(self, outlines):
            super().__init__()
            self.outlines, self.met = outlines, {}

        def way(self, w):
            t = dict(w.tags)
            if t.get("highway") not in WALK or t.get("area") == "yes" or t.get("indoor") == "yes" or t.get("railway") == "platform" or t.get("public_transport") == "platform":
                return   # a pedestrian area's outline shares nodes with a building's without entering it
            for nd in w.nodes:
                if nd.ref in self.outlines:
                    self.met[nd.ref] = self.outlines[nd.ref]

    h = First()
    h.apply_file(path, locations=True, idx="flex_mem")
    outlines = {nid: p for b in h.buildings for nid, p in b["outline"].items()}
    walks = Walks(outlines)
    walks.apply_file(path)
    # a door tagged on a station building, or a walking way's meeting with its outline, is one of that station's
    # entrances (a door of some other building nearby is not); a tagged entrance node on the outline stays as it is
    for b in h.buildings:
        for nid in b["outline"]:
            if nid in h.entrances:
                continue
            if nid in h.doors:
                h.entrances[nid] = h.doors[nid]
            elif nid in walks.met:
                h.entrances[nid] = {"ref": "", "name": "", "lat": walks.met[nid][0], "lon": walks.met[nid][1]}
    log(f"{len(h.buildings)} station buildings, {sum(1 for nid in h.doors if nid in h.entrances)} doors on them, {sum(1 for nid in walks.met if nid in h.entrances and nid not in h.doors)} walking ways meeting them")
    return h.stations, h.entrances, h.areas


def merge(entrances, merge_m=MERGE_M):
    """One entrance for doors within merge_m of each other with the same letter and name (a hall's double door), at
    their middle; the rest as they are."""
    out = []   # each with its first door as the anchor, so a chain of doors cannot creep along a building
    for e in entrances:
        for o in out:
            if o["ref"] == e["ref"] and o["name"] == e["name"] and haversine(o["at"][0], o["at"][1], e["lat"], e["lon"]) <= merge_m:
                n = o["n"]
                o["lat"], o["lon"], o["n"] = (o["lat"] * n + e["lat"]) / (n + 1), (o["lon"] * n + e["lon"]) / (n + 1), n + 1
                break
        else:
            out.append(dict(e, n=1, at=(e["lat"], e["lon"])))
    for o in out:
        o["lat"], o["lon"] = round(o["lat"], 6), round(o["lon"], 6)
        del o["n"], o["at"]
    return out


def group(stations, entrances, areas, near_m=NEAR_M):
    """Entrances by station: through the stop areas first, the rest to the nearest station within near_m; twin doors
    merged (merge). Returns [{name, lat, lon, entrances}] for stations that have any."""
    by_station = {}
    placed = set()
    for name, members in areas:
        ents = [m for m in members if m in entrances]
        if not ents:
            continue
        sts = [m for m in members if m in stations]
        if sts:
            sid = sts[0]
            centre = (stations[sid]["lat"], stations[sid]["lon"])
            sname = stations[sid]["name"] or name
        else:
            sid = ("area", name)
            centre = (sum(entrances[e]["lat"] for e in ents) / len(ents), sum(entrances[e]["lon"] for e in ents) / len(ents))
            sname = name
        st = by_station.setdefault(sid, {"name": sname, "name_en": stations[sid].get("name_en", "") if sts else "", "lat": centre[0], "lon": centre[1], "entrances": []})
        for e in ents:
            if e not in placed:
                st["entrances"].append(entrances[e])
                placed.add(e)
    for eid, e in entrances.items():
        if eid in placed:
            continue
        best, bd = None, near_m
        for sid, s in stations.items():
            d = haversine(e["lat"], e["lon"], s["lat"], s["lon"])
            if d < bd:
                best, bd = sid, d
        if best is None:
            continue
        s = stations[best]
        by_station.setdefault(best, {"name": s["name"], "name_en": s.get("name_en", ""), "lat": s["lat"], "lon": s["lon"], "entrances": []})["entrances"].append(e)
        placed.add(eid)
    out = []
    for st in by_station.values():
        st["entrances"] = sorted(merge(st["entrances"]), key=lambda x: x["ref"])
        st["lat"], st["lon"] = round(st["lat"], 6), round(st["lon"], 6)
        out.append(st)
    return sorted(out, key=lambda s: (s["lat"], s["lon"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("pbf", nargs="?")
    ap.add_argument("--out")
    ap.add_argument("--check", metavar="FILE", help="exit 0 if FILE is of this script's format (the build rebuilds an older one)")
    args = ap.parse_args()
    if args.check:
        try:
            with open(args.check, encoding="utf-8") as f:
                sys.exit(0 if json.load(f).get("format") == FORMAT else 1)
        except (OSError, ValueError):
            sys.exit(1)
    if not args.pbf or not args.out:
        ap.error("pbf and --out are required to build")
    t0 = time.time()
    stations, entrances, areas = read_osm(args.pbf)
    log(f"OSM: {len(stations)} station nodes, {len(entrances)} entrances, {len(areas)} stop areas, {time.time() - t0:.0f}s")
    out = group(stations, entrances, areas)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"format": FORMAT, "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "near_m": NEAR_M, "stations": out},
                  f, ensure_ascii=False, separators=(",", ":"))
    log(f"{len(out)} stations with {sum(len(s['entrances']) for s in out)} entrances, wrote {args.out}")
    for s in out:
        log(f"  {s['name'] or '?'}: {[e['ref'] or e['name'] or '-' for e in s['entrances']]}")


if __name__ == "__main__":
    main()
