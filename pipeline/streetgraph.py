"""Read Wayli's compact street graph and compute stop-to-stop walking times.

Used by compile.py when --streets is given. The graph comes from streets.py.
"""
import gzip
import heapq
import json
import math
import struct
import time
import sys

import numpy as np

SNAP_RADIUS = 250.0   # m: a stop farther than this from any walkable node keeps only straight-line footpaths


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def load(path):
    with gzip.open(path, "rb") as f:
        raw = f.read()
    hlen = struct.unpack_from("<I", raw, 0)[0]
    header = json.loads(raw[4:4 + hlen].decode())
    base = 4 + hlen
    g = {"header": header}
    dt = {"int32": "<i4", "uint16": "<u2", "uint8": "u1", "float32": "<f4"}
    for s in header["sections"]:
        g[s["name"]] = np.frombuffer(raw, dtype=dt[s["dtype"]], count=s["length"], offset=base + s["offset"])
    g["M"] = header["counts"]["nodes"]
    if header["format"] >= 2:
        M, cell = g["M"], header["cell_deg"]
        lat = np.zeros(M, np.float64); lon = np.zeros(M, np.float64)
        for key, a, b in zip(g["cellKey"], g["cellStart"], g["cellEnd"]):
            cy, cx = int(key) // 100000, int(key) % 100000
            lat[a:b] = (cy + g["nodeLatOff"][a:b] / 65535.0) * cell
            lon[a:b] = (cx + g["nodeLonOff"][a:b] / 65535.0) * cell
        g["nodeLat"] = lat.astype(np.float32); g["nodeLon"] = lon.astype(np.float32)
        src = np.repeat(np.arange(M, dtype=np.int64), np.diff(g["edgeOff"]))
        g["edgeTo"] = (src + g["edgeToDelta"]).astype(np.int32)
    fl = header["flags"]
    kind = g["edgeFlags"] & fl["kind_mask"]
    walk_ok = (g["edgeFlags"] >> fl["flag_shift"]) & fl["walk"]
    speed = np.array([header["walk_speed"][str(k)] for k in range(6)], np.float64)
    sec = g["edgeLen"] / speed[kind]
    c = header.get("climb")
    if c and "edgeUp" in g:   # climbs, as the app counts them on foot (src/engine/streets.js secondsOn)
        up = g["edgeUp"].astype(np.float64); down = g["edgeDown"].astype(np.float64)
        extra = c["walk_up"] * up + np.where(down > c["steep"] * g["edgeLen"], c["walk_down_steep"] * down, 0.0)
        sec = sec + np.where(kind == 4, 0.0, extra)
    g["walkSec"] = np.where(walk_ok > 0, sec, np.inf).astype(np.float32)
    g["cell"] = header["cell_deg"]
    g["cellIndex"] = {int(k): (int(a), int(b)) for k, a, b in zip(g["cellKey"], g["cellStart"], g["cellEnd"])}
    # nodes that have at least one walkable edge
    has_walk = np.zeros(g["M"], bool)
    src = np.repeat(np.arange(g["M"]), np.diff(g["edgeOff"]))
    np.logical_or.at(has_walk, src[walk_ok > 0], True)
    g["hasWalk"] = has_walk
    return g


def cell_key(g, lat, lon):
    c = g["cell"]
    return int(math.floor(lat / c)) * 100000 + int(math.floor(lon / c))


def nodes_near(g, lat, lon, rings=1):
    """Node index ranges of the (2*rings+1)^2 cells around (lat, lon)."""
    c = g["cell"]
    cy, cx = int(math.floor(lat / c)), int(math.floor(lon / c))
    out = []
    for dy in range(-rings, rings + 1):
        for dx in range(-rings, rings + 1):
            r = g["cellIndex"].get((cy + dy) * 100000 + (cx + dx))
            if r:
                out.append(r)
    return out


def haversine_np(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))


def snap(g, lat, lon):
    """Nearest walkable node within SNAP_RADIUS, or -1."""
    best, best_d = -1, SNAP_RADIUS
    for a, b in nodes_near(g, lat, lon):
        d = haversine_np(lat, lon, g["nodeLat"][a:b].astype(np.float64), g["nodeLon"][a:b].astype(np.float64))
        d = np.where(g["hasWalk"][a:b], d, np.inf)
        i = int(np.argmin(d))
        if d[i] < best_d:
            best_d, best = float(d[i]), a + i
    return best, best_d


def walking_times(g, stop_lat, stop_lon, max_seconds, buffer_seconds, on_progress=None):
    """For every stop: (snapped node, {other stop: walking seconds}) within max_seconds on the street graph."""
    S = len(stop_lat)
    stop_node = np.full(S, -1, np.int32)
    snap_dist = np.zeros(S, np.float64)
    for i in range(S):
        stop_node[i], snap_dist[i] = snap(g, float(stop_lat[i]), float(stop_lon[i]))
    log(f"snapped {int((stop_node >= 0).sum())} of {S} stops to the street graph (within {SNAP_RADIUS:.0f} m)")
    # stops per node, for collecting targets during the search
    node_stops = {}
    for i in range(S):
        n = int(stop_node[i])
        if n >= 0:
            node_stops.setdefault(n, []).append(i)
    edge_off, edge_to, w = g["edgeOff"], g["edgeTo"], g["walkSec"]
    walk_speed = 1.2
    result = [dict() for _ in range(S)]
    t0 = time.time()
    for i in range(S):
        n0 = int(stop_node[i])
        if n0 < 0:
            continue
        start = snap_dist[i] / walk_speed
        dist = {n0: start}
        heap = [(start, n0)]
        found = result[i]
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist.get(u, np.inf):
                continue
            for s in node_stops.get(u, ()):
                if s != i:
                    t = d + snap_dist[s] / walk_speed + buffer_seconds
                    if t <= max_seconds + buffer_seconds and t < found.get(s, np.inf):
                        found[s] = t
            for e in range(edge_off[u], edge_off[u + 1]):
                nd = d + w[e]
                if nd > max_seconds:
                    continue
                v = int(edge_to[e])
                if nd < dist.get(v, np.inf):
                    dist[v] = nd
                    heapq.heappush(heap, (nd, v))
        if on_progress and i % 5000 == 4999:
            on_progress(i + 1, S, time.time() - t0)
    return stop_node, result
