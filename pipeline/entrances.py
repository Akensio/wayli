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
MERGE_M = 40   # two doors this close, with the same letter and name, are one entrance (a hall's double door, a deck's two stairways)
NEAR_BUILD_M = 700   # the buildings and walking ways read around a station node, for the bridges and tunnels out of it
FORMAT = 4   # 1: lettered entrances of light rail and underground stations; 2: name_en, and train stations' doors (plain entrance nodes);
             # 3: rail stations only, doors only on a station building, entrances where walking ways meet it, twin doors merged;
             # 4: a door or meeting on a bridge or in a tunnel is carried to where it comes out (follow)


def is_station(t):
    """A node or area of a rail station: railway=station/halt, or public_transport=station of a rail mode (train=yes...)."""
    if t.get("railway") in STATION:
        return True
    return t.get("public_transport") == "station" and (t.get("station") in RAIL or any(t.get(m) == "yes" for m in RAIL))


def layer_of(t):
    try:
        return int(t.get("layer") or 0)
    except ValueError:
        return 0


def is_walking(t):
    return t.get("highway") in WALK and t.get("indoor") != "yes" and t.get("railway") != "platform" and t.get("public_transport") != "platform"


def is_elevated(t):
    """A way off the ground: a bridge or a tunnel, or on another layer."""
    return t.get("bridge") == "yes" or t.get("tunnel") == "yes" or layer_of(t) != 0


def is_ground(t):
    """A walking way on the ground: not elevated, not stairs or a lift (those lead to platforms as well), on level 0 or none."""
    return is_walking(t) and not is_elevated(t) and t.get("highway") not in ("steps", "elevator") and (t.get("level") or "0") in ("0", "0.0")


FOLLOW_M = 600   # how far a bridge or tunnel is followed from the station for its far end


def follow(start, ways, by_node, coords, outline, buildings, follow_m=FOLLOW_M):
    """Where a rider on a bridge or in a tunnel from the station (`start`, a node on its outline) is out of it: the first
    node, along the elevated walking ways (`ways`: id -> {nodes, up, ground, deck}; `by_node`: node -> way ids), that is
    on another building's outline (`buildings`: node -> name; the bridge meets Azrieli, where the tickets are) or on a
    walking way on the ground (its foot). None when it comes to nothing within follow_m (a sidewalk of a road bridge:
    the door itself is the entrance). The station's own outline (`outline`) is walked along but never a hit."""
    dist = {start: 0.0}
    queue = [start]
    while queue:
        u = queue.pop(0)
        for wid in by_node.get(u, ()):
            w = ways[wid]
            if not w["up"]:
                continue
            ns = w["nodes"]
            for k, x in enumerate(ns):
                if x != u:
                    continue
                for v in (ns[k - 1] if k else None, ns[k + 1] if k + 1 < len(ns) else None):
                    if v is None or v in dist or v not in coords:
                        continue
                    d = dist[u] + haversine(coords[u][0], coords[u][1], coords[v][0], coords[v][1])
                    if d > follow_m:
                        continue
                    dist[v] = d
                    if v not in outline:
                        if v in buildings or any(ways[o]["ground"] for o in by_node.get(v, ())):
                            return v
                    queue.append(v)
    return None


def read_osm(path):
    """Station nodes, entrance nodes, and stop areas (name, station node ids, entrance node ids). The entrances are the
    railway=*_entrance nodes anywhere; and at a station building (a closed way or multipolygon tagged as a station or
    building=train_station, not an underground footprint) its doors (entrance=* on the outline) and where an outdoor
    walking way meets the outline; a door or a meeting on a bridge or in a tunnel is carried to where that comes out
    (follow). Two passes: the first reads nodes, the station buildings and the other buildings near a station; the
    second the walking ways near a station."""
    import osmium  # BSD; a build-time tool, not part of the app

    class Near:
        """Whether a point is within NEAR_BUILD_M of a station node, by a grid of them."""
        def __init__(self, stations):
            self.cells = {}
            for s in stations.values():
                self.cells.setdefault((int(s["lat"] * 100), int(s["lon"] * 100)), []).append((s["lat"], s["lon"]))

        def __call__(self, lat, lon):
            cy, cx = int(lat * 100), int(lon * 100)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    for slat, slon in self.cells.get((cy + dy, cx + dx), ()):
                        if haversine(lat, lon, slat, slon) <= NEAR_BUILD_M:
                            return True
            return False

    class First(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.stations, self.entrances, self.doors, self.areas, self.buildings = {}, {}, {}, [], []
            self.others = {}   # node id -> name, on the outline of a building near a station that is not a station
            self.near = None

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
            station = t.get("building") == "train_station" or (t.get("building") and is_station(t)) or (not t.get("building") and is_station(t) and t.get("public_transport") != "stop_position")
            if not station and not t.get("building"):
                return
            if self.near is None:
                self.near = Near(self.stations)   # the nodes come before the ways and relations
            outline = {}
            for ring in a.outer_rings():
                for nd in ring:
                    if nd.location.valid():
                        outline[nd.ref] = (round(nd.location.lat, 6), round(nd.location.lon, 6))
            if not outline:
                return
            first = next(iter(outline.values()))
            if not station:
                if self.near(first[0], first[1]):
                    for nid in outline:
                        self.others[nid] = t.get("name") or t.get("building")
                return
            if t.get("location") == "underground" or t.get("tunnel") or (t.get("layer") or "0").startswith("-") or (t.get("level") or "0").startswith("-"):
                return   # an underground station's footprint: a footway crossing it above ground enters nothing
            self.buildings.append({"name": t.get("name") or "", "outline": outline,
                                   "lat": sum(p[0] for p in outline.values()) / len(outline), "lon": sum(p[1] for p in outline.values()) / len(outline)})

        def relation(self, r):
            t = dict(r.tags)
            if t.get("public_transport") == "stop_area":
                self.areas.append((t.get("name") or "", [m.ref for m in r.members if m.type == "n"]))

    class Walks(osmium.SimpleHandler):
        """The walking ways near a station: id -> {nodes, up (elevated), ground, deck (a closed way or area: a link, not
        a meeting)}, every node's coordinates, and node -> way ids."""
        def __init__(self, near):
            super().__init__()
            self.near, self.ways, self.coords, self.by_node = near, {}, {}, {}

        def way(self, w):
            t = dict(w.tags)
            if not is_walking(t) or not w.nodes or not w.nodes[0].location.valid() or not self.near(w.nodes[0].location.lat, w.nodes[0].location.lon):
                return
            ns = [nd.ref for nd in w.nodes]
            for nd in w.nodes:
                if nd.location.valid():
                    self.coords[nd.ref] = (round(nd.location.lat, 6), round(nd.location.lon, 6))
            self.ways[w.id] = {"nodes": ns, "up": is_elevated(t), "ground": is_ground(t), "deck": t.get("area") == "yes" or ns[0] == ns[-1]}
            for nid in ns:
                self.by_node.setdefault(nid, []).append(w.id)

    h = First()
    h.apply_file(path, locations=True, idx="flex_mem")
    walks = Walks(h.near or Near(h.stations))
    walks.apply_file(path, locations=True, idx="flex_mem")
    station_nodes = set(nid for b in h.buildings for nid in b["outline"])
    others = {nid: name for nid, name in h.others.items() if nid not in station_nodes}
    carried = doors = met = 0
    for b in h.buildings:
        outline = b["outline"]
        # the meetings: the doors on the outline, and the nodes where a walking way (not a deck) meets it
        meetings = {nid for nid in outline if nid in h.doors}
        for nid in outline:
            for wid in walks.by_node.get(nid, ()):
                if not walks.ways[wid]["deck"]:
                    meetings.add(nid)
        for nid in meetings:
            if nid in h.entrances:
                continue
            up = any(walks.ways[wid]["up"] for wid in walks.by_node.get(nid, ()))
            out = follow(nid, walks.ways, walks.by_node, walks.coords, outline, others) if up else None
            src = h.doors.get(nid) or {"ref": "", "name": "", "lat": outline[nid][0], "lon": outline[nid][1]}
            if out is not None:
                carried += 1
                h.entrances[nid] = dict(src, lat=walks.coords[out][0], lon=walks.coords[out][1])
            else:
                h.entrances[nid] = src
            doors += nid in h.doors
            met += nid not in h.doors
    log(f"{len(h.buildings)} station buildings, {doors} doors on them, {met} walking ways meeting them, {carried} of those carried over a bridge or through a tunnel to where it comes out")
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
