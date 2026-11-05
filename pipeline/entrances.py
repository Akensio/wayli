#!/usr/bin/env python3
"""Station entrances for the planner (data/entrances.json): where a light rail, underground or train station opens onto
the street, from OpenStreetMap.

    python3 -I pipeline/entrances.py data/osm/israel-and-palestine-latest.osm.pbf --out data/entrances.json

The feed has no pathways: a station is one point near its middle, while its entrances (lettered A to D at the Red
Line's underground stations) open up to 150 m away on different streets. OpenStreetMap maps them (railway=
subway_entrance or train_station_entrance, with `ref` the letter and sometimes a name) and ties most to their station
through a stop_area relation; an entrance in none is given to the nearest station node within NEAR_M. Written per
station: name, point and the entrances [{ref, name, lat, lon}]. The app ties each station to the timetable's rail
stops within NEAR_M of it (the feed names them many ways: "ת.רק''ל אלנבי", "גשר אם המושבות"; the timetable knows which
stops trains, light rail and the Carmelit call at) and picks the entrance nearest the rider's way (src/worker/exits.ts).
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
NEAR_M = 200


def read_osm(path):
    """Station nodes, entrance nodes, and stop areas (name, station node ids, entrance node ids)."""
    import osmium  # BSD; a build-time tool, not part of the app

    class H(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.stations, self.entrances, self.areas = {}, {}, []

        def node(self, n):
            t = dict(n.tags)
            if t.get("railway") in ENTRANCE:
                self.entrances[n.id] = {"ref": (t.get("ref") or "").strip()[:4], "name": (t.get("name") or "").strip(), "lat": round(n.location.lat, 6), "lon": round(n.location.lon, 6)}
            elif t.get("railway") in STATION or t.get("public_transport") == "station":
                self.stations[n.id] = {"name": t.get("name") or "", "lat": n.location.lat, "lon": n.location.lon}

        def relation(self, r):
            t = dict(r.tags)
            if t.get("public_transport") == "stop_area":
                self.areas.append((t.get("name") or "", [m.ref for m in r.members if m.type == "n"]))

    h = H()
    h.apply_file(path)
    return h.stations, h.entrances, h.areas


def group(stations, entrances, areas, near_m=NEAR_M):
    """Entrances by station: through the stop areas first, the rest to the nearest station within near_m. Returns
    [{name, lat, lon, entrances}] for stations that have any."""
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
        st = by_station.setdefault(sid, {"name": sname, "lat": centre[0], "lon": centre[1], "entrances": []})
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
        by_station.setdefault(best, {"name": s["name"], "lat": s["lat"], "lon": s["lon"], "entrances": []})["entrances"].append(e)
        placed.add(eid)
    out = []
    for st in by_station.values():
        st["entrances"].sort(key=lambda x: x["ref"])
        st["lat"], st["lon"] = round(st["lat"], 6), round(st["lon"], 6)
        out.append(st)
    return sorted(out, key=lambda s: (s["lat"], s["lon"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("pbf")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    t0 = time.time()
    stations, entrances, areas = read_osm(args.pbf)
    log(f"OSM: {len(stations)} station nodes, {len(entrances)} entrances, {len(areas)} stop areas, {time.time() - t0:.0f}s")
    out = group(stations, entrances, areas)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "near_m": NEAR_M, "stations": out},
                  f, ensure_ascii=False, separators=(",", ":"))
    log(f"{len(out)} stations with {sum(len(s['entrances']) for s in out)} entrances, wrote {args.out}")
    for s in out:
        log(f"  {s['name'] or '?'}: {[e['ref'] or e['name'] or '-' for e in s['entrances']]}")


if __name__ == "__main__":
    main()
