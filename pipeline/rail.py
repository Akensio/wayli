"""OpenStreetMap railways to a small rail graph, so train rides can be drawn along the track: the
Ministry's feed has no shapes for trains (checked 2026-10-18: every rail trip lacks a shape_id).

Ways tagged railway=rail, except yards, sidings and spurs; every way node is kept (tracks curve);
edges carry metres. The compiler (compile.py --rail) routes each pair of consecutive stations over
this graph with A* and stores the course once per pair.

Container (like the others): u32 header length, JSON header, sections nodeLat/nodeLon int32 (1e-5
degrees), edgeOff int32[N+1], edgeTo int32, edgeLen int32 (metres).
"""
import argparse
import gzip
import heapq
import json
import math
import struct
import sys
import time
from collections import defaultdict

import numpy as np
import osmium

FORMAT_VERSION = 1
SKIP_SERVICE = {"yard", "siding", "spur"}


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


class WayPass(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []
        self.refs = set()

    def way(self, w):
        tags = dict(w.tags)
        if tags.get("railway") != "rail" or tags.get("service") in SKIP_SERVICE:
            return
        refs = [n.ref for n in w.nodes]
        if len(refs) < 2:
            return
        self.ways.append(refs)
        self.refs.update(refs)


class NodePass(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted = wanted
        self.coords = {}

    def node(self, n):
        if n.id in self.wanted:
            self.coords[n.id] = (n.location.lat, n.location.lon)


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def build(pbf):
    t0 = time.time()
    wp = WayPass()
    wp.apply_file(pbf)
    log(f"railway ways: {len(wp.ways)}, {len(wp.refs)} node refs, {time.time()-t0:.0f}s")
    npass = NodePass(wp.refs)
    npass.apply_file(pbf)
    coords = npass.coords
    log(f"nodes located: {len(coords)}, {time.time()-t0:.0f}s")
    index = {}
    lat, lon = [], []
    adj = defaultdict(list)
    for refs in wp.ways:
        prev = None
        for r in refs:
            if r not in coords:
                prev = None
                continue
            i = index.get(r)
            if i is None:
                i = len(lat)
                index[r] = i
                lat.append(coords[r][0])
                lon.append(coords[r][1])
            if prev is not None:
                d = int(round(haversine(lat[prev], lon[prev], lat[i], lon[i])))
                adj[prev].append((i, d))
                adj[i].append((prev, d))
            prev = i
    n = len(lat)
    off = np.zeros(n + 1, np.int32)
    to, ln = [], []
    for i in range(n):
        for j, d in adj.get(i, ()):
            to.append(j)
            ln.append(d)
        off[i + 1] = len(to)
    log(f"graph: {n} nodes, {len(to)} directed edges")
    return np.array(lat), np.array(lon), off, np.array(to, np.int32), np.array(ln, np.int32)


def write(path, lat, lon, off, to, ln):
    sections, blobs, o = [], [], 0
    for name, arr in (("nodeLat", np.round(lat * 1e5).astype(np.int32)), ("nodeLon", np.round(lon * 1e5).astype(np.int32)),
                      ("edgeOff", off), ("edgeTo", to), ("edgeLen", ln)):
        b = arr.astype("<i4").tobytes()
        sections.append({"name": name, "dtype": "int32", "offset": o, "length": int(arr.size)})
        blobs.append(b)
        o += len(b)
    header = {"format": FORMAT_VERSION, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "counts": {"nodes": int(len(lat)), "edges": int(len(to))}, "sections": sections}
    hjson = json.dumps(header, separators=(",", ":")).encode("utf-8")
    while (4 + len(hjson)) % 4:
        hjson += b" "
    raw = struct.pack("<I", len(hjson)) + hjson + b"".join(blobs)
    with gzip.open(path, "wb", compresslevel=6) as f:
        f.write(raw)
    return len(raw)


def load(path):
    with gzip.open(path, "rb") as f:
        raw = f.read()
    hlen = struct.unpack_from("<I", raw, 0)[0]
    header = json.loads(raw[4:4 + hlen].decode("utf-8"))
    base = 4 + hlen
    g = {"header": header}
    for s in header["sections"]:
        g[s["name"]] = np.frombuffer(raw, dtype="<i4", count=s["length"], offset=base + s["offset"])
    g["lat"] = g["nodeLat"].astype(np.float64) / 1e5
    g["lon"] = g["nodeLon"].astype(np.float64) / 1e5
    g["kx"] = 111320.0 * math.cos(math.radians(float(g["lat"].mean()))) if len(g["lat"]) else 1.0
    return g


def nearest(g, lat, lon, max_m=600.0):
    d = np.hypot((g["lon"] - lon) * g["kx"], (g["lat"] - lat) * 110540.0)
    i = int(np.argmin(d))
    return i if d[i] <= max_m else -1


def route(g, lat1, lon1, lat2, lon2):
    """The track between two points as [(lat, lon), ...], or None when the graph does not connect them
    within a sane detour."""
    a, b = nearest(g, lat1, lon1), nearest(g, lat2, lon2)
    if a < 0 or b < 0:
        return None
    straight = haversine(lat1, lon1, lat2, lon2)
    limit = 2.5 * straight + 3000
    lat, lon, off, to, ln = g["lat"], g["lon"], g["edgeOff"], g["edgeTo"], g["edgeLen"]
    kx, ky = g["kx"], 110540.0
    goal_x, goal_y = lon[b] * kx, lat[b] * ky

    def h(i):
        return math.hypot(lon[i] * kx - goal_x, lat[i] * ky - goal_y)
    dist = {a: 0.0}
    prev = {}
    heap = [(h(a), 0.0, a)]
    while heap:
        f, d, i = heapq.heappop(heap)
        if i == b:
            break
        if d > dist.get(i, math.inf) or d > limit:
            continue
        for k in range(off[i], off[i + 1]):
            j = int(to[k])
            nd = d + float(ln[k])
            if nd < dist.get(j, math.inf):
                dist[j] = nd
                prev[j] = i
                heapq.heappush(heap, (nd + h(j), nd, j))
    if b not in dist or dist[b] > limit:
        return None
    path = []
    i = b
    while True:
        path.append((float(lat[i]), float(lon[i])))
        if i == a:
            break
        i = prev[i]
    path.reverse()
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pbf")
    ap.add_argument("--out", default="data/rail.bin.gz")
    args = ap.parse_args()
    t0 = time.time()
    import os
    n = write(args.out, *build(args.pbf))
    log(f"wrote {args.out}: {n/1e6:.1f} MB raw, {os.path.getsize(args.out)/1e6:.2f} MB gzip, in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
