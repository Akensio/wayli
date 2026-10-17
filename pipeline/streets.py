#!/usr/bin/env python3
"""Compile an OpenStreetMap extract into Wayli's compact street graph.

    python3 -I pipeline/streets.py data/osm/israel-and-palestine-latest.osm.pbf --out data/streets.bin.gz

Walking and cycling only. Nodes are intersections and way ends; edges carry
length in metres and per-direction flags (walk allowed, bike allowed, kind for
the speed). The container has the same shape as the timetable: u32 header
length, JSON header, typed-array sections.
"""
import argparse
import datetime
import gzip
import json
import math
import struct
import sys
import time
from collections import defaultdict

import numpy as np
import osmium

FORMAT_VERSION = 2
# kind: 0 road, 1 cycleway, 2 footway/pedestrian, 3 path/track, 4 steps, 5 living/service
KIND = {
    "motorway": None, "motorway_link": None,
    "trunk": None, "trunk_link": None,  # allowed only with explicit foot/bicycle/sidewalk tags, see below
    "primary": 0, "primary_link": 0, "secondary": 0, "secondary_link": 0,
    "tertiary": 0, "tertiary_link": 0, "unclassified": 0, "residential": 0, "road": 0,
    "living_street": 5, "service": 5,
    "pedestrian": 2, "footway": 2, "corridor": 2, "crossing": 2,
    "path": 3, "track": 3, "bridleway": 3,
    "cycleway": 1,
    "steps": 4,
}
# metres per second by kind, walking and cycling
WALK_SPEED = {0: 1.2, 1: 1.2, 2: 1.2, 3: 1.1, 4: 0.7, 5: 1.2}
BIKE_SPEED = {0: 4.2, 1: 4.5, 2: 1.5, 3: 3.0, 4: 0.6, 5: 3.5}
F_WALK, F_BIKE = 1, 2
MIN_COMPONENT = 50  # drop islands smaller than this many nodes


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def classify(tags):
    """-> (kind, walk_ok, bike_fwd, bike_back) or None"""
    hw = tags.get("highway")
    if hw is None or hw not in KIND:
        return None
    kind = KIND[hw]
    access = tags.get("access", "")
    foot = tags.get("foot", "")
    bicycle = tags.get("bicycle", "")
    sidewalk = tags.get("sidewalk", "")
    if kind is None:
        # motorway/trunk: only with explicit permission
        kind = 0
        walk = foot in ("yes", "designated", "permissive") or sidewalk in ("both", "left", "right", "yes")
        bike = bicycle in ("yes", "designated", "permissive")
        if not walk and not bike:
            return None
    else:
        walk = foot not in ("no", "private")
        bike = bicycle not in ("no", "private")
        if hw in ("footway", "pedestrian", "corridor", "crossing", "steps") and bicycle not in ("yes", "designated", "permissive"):
            bike = True  # pushing the bike, at walking speed or slower (kind 2/4 speeds)
        if hw == "cycleway" and foot in ("no",):
            walk = False
    if access in ("private", "no"):
        walk = walk and foot in ("yes", "designated", "permissive")
        bike = bike and bicycle in ("yes", "designated", "permissive")
    if tags.get("railway") == "platform" and hw is None:
        return None
    if not walk and not bike:
        return None
    oneway = tags.get("oneway", "")
    ob = tags.get("oneway:bicycle", "")
    cw = tags.get("cycleway", "") + tags.get("cycleway:left", "") + tags.get("cycleway:right", "")
    bike_fwd = bike
    bike_back = bike
    if bike and oneway in ("yes", "1", "true") and ob != "no" and "opposite" not in cw:
        bike_back = False
    if bike and oneway == "-1":
        bike_fwd = False
    return kind, walk, bike_fwd, bike_back


class WayPass(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []          # (refs list, kind, walk, bike_fwd, bike_back)
        self.use = defaultdict(int)
        self.n_seen = 0

    def way(self, w):
        self.n_seen += 1
        c = classify(dict(w.tags))
        if c is None:
            return
        refs = [n.ref for n in w.nodes]
        if len(refs) < 2:
            return
        self.ways.append((refs, *c))
        for r in refs:
            self.use[r] += 1
        self.use[refs[0]] += 1   # way ends always become graph nodes
        self.use[refs[-1]] += 1


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pbf")
    ap.add_argument("--out", default="data/streets.bin.gz")
    args = ap.parse_args()
    t0 = time.time()

    wp = WayPass()
    wp.apply_file(args.pbf)
    log(f"ways: {wp.n_seen} seen, {len(wp.ways)} usable, {len(wp.use)} node refs, {time.time()-t0:.0f}s")
    npass = NodePass(wp.use)
    npass.apply_file(args.pbf)
    coords = npass.coords
    log(f"nodes: {len(coords)} located, {time.time()-t0:.0f}s")

    # graph nodes: used by >1 way, or way ends (use count bumped above)
    graph_ids = {}
    def gid(ref):
        i = graph_ids.get(ref)
        if i is None:
            i = len(graph_ids)
            graph_ids[ref] = i
        return i

    edges = []  # (a, b, length_m, kind, walk, bike_fwd, bike_back)
    missing = 0
    for refs, kind, walk, bf, bb in wp.ways:
        start = None
        length = 0.0
        prev = None
        for r in refs:
            c = coords.get(r)
            if c is None:
                missing += 1
                start = None; prev = None; length = 0.0
                continue
            if prev is not None:
                length += haversine(prev[0], prev[1], c[0], c[1])
            if start is None:
                start = r; length = 0.0
            elif wp.use[r] > 1 or r == refs[-1]:
                if length > 0:
                    edges.append((gid(start), gid(r), length, kind, walk, bf, bb))
                start = r; length = 0.0
            prev = c
    N = len(graph_ids)
    log(f"graph: {N} nodes, {len(edges)} edges, {missing} refs without coordinates, {time.time()-t0:.0f}s")

    # adjacency (both directions), then drop small components
    adj = [[] for _ in range(N)]
    for a, b, length, kind, walk, bf, bb in edges:
        adj[a].append((b, length, kind, walk, bf))
        adj[b].append((a, length, kind, walk, bb))
    comp = np.full(N, -1, np.int32)
    sizes = []
    for s in range(N):
        if comp[s] >= 0:
            continue
        cid = len(sizes)
        stack = [s]; comp[s] = cid; n = 0
        while stack:
            u = stack.pop(); n += 1
            for v, *_ in adj[u]:
                if comp[v] < 0:
                    comp[v] = cid; stack.append(v)
        sizes.append(n)
    keep_comp = {i for i, n in enumerate(sizes) if n >= MIN_COMPONENT}
    keep = np.array([comp[i] in keep_comp for i in range(N)])
    remap = np.full(N, -1, np.int32)
    remap[keep] = np.arange(int(keep.sum()), dtype=np.int32)
    log(f"components: {len(sizes)}, keeping {len(keep_comp)} with >= {MIN_COMPONENT} nodes = {int(keep.sum())} nodes")

    inv = [None] * N
    for ref, i in graph_ids.items():
        inv[i] = ref
    M = int(keep.sum())
    lat = np.zeros(M, np.float64); lon = np.zeros(M, np.float64)
    for i in range(N):
        j = remap[i]
        if j >= 0:
            c = coords[inv[i]]
            lat[j], lon[j] = c
    # sort nodes by grid cell so a cell index is a range
    CELL = 0.01
    cell_key = (np.floor(lat / CELL).astype(np.int64) * 100000 + np.floor(lon / CELL).astype(np.int64))
    order = np.argsort(cell_key, kind="stable")
    rank = np.empty(M, np.int64); rank[order] = np.arange(M)
    lat = lat[order]; lon = lon[order]; cell_key = cell_key[order]
    final = np.full(N, -1, np.int64)
    for i in range(N):
        if remap[i] >= 0:
            final[i] = rank[remap[i]]

    out_adj = [[] for _ in range(M)]
    n_edges = 0
    for a, b, length, kind, walk, bf, bb in edges:
        fa, fb = final[a], final[b]
        if fa < 0 or fb < 0:
            continue
        L = min(65535, int(round(length)))
        out_adj[fa].append((fb, L, kind | (F_WALK if walk else 0) << 4 | (F_BIKE if bf else 0) << 4))
        out_adj[fb].append((fa, L, kind | (F_WALK if walk else 0) << 4 | (F_BIKE if bb else 0) << 4))
        n_edges += 2
    edge_off = np.zeros(M + 1, np.int32)
    edge_to = np.zeros(n_edges, np.int32)
    edge_len = np.zeros(n_edges, np.uint16)
    edge_flags = np.zeros(n_edges, np.uint8)
    k = 0
    for i in range(M):
        edge_off[i] = k
        for b, L, f in out_adj[i]:
            edge_to[k] = b; edge_len[k] = L; edge_flags[k] = f; k += 1
    edge_off[M] = k

    # cell index: distinct cells with node ranges
    cells, starts = np.unique(cell_key, return_index=True)
    cell_end = np.append(starts[1:], M)
    log(f"final: {M} nodes, {n_edges} directed edges, {len(cells)} grid cells, {time.time()-t0:.0f}s")

    sections = []
    body = bytearray()
    def add(name, arr, dtype):
        a = np.ascontiguousarray(np.asarray(arr, dtype=dtype))
        while len(body) % 4:
            body.append(0)
        sections.append({"name": name, "dtype": dtype, "offset": len(body), "length": int(a.size)})
        body.extend(a.astype("<" + np.dtype(dtype).str[1:]).tobytes())
    # coordinates as u16 offsets inside the node's grid cell (about 2 cm steps), edges as deltas from
    # the source node: both compress far better than absolute values
    cy = np.floor(lat / CELL); cx = np.floor(lon / CELL)
    lat_off = np.clip(np.round((lat / CELL - cy) * 65535), 0, 65535)
    lon_off = np.clip(np.round((lon / CELL - cx) * 65535), 0, 65535)
    edge_src = np.repeat(np.arange(M, dtype=np.int64), np.diff(edge_off))
    add("nodeLatOff", lat_off, "uint16")
    add("nodeLonOff", lon_off, "uint16")
    add("edgeOff", edge_off, "int32")
    add("edgeToDelta", edge_to.astype(np.int64) - edge_src, "int32")
    add("edgeLen", edge_len, "uint16")
    add("edgeFlags", edge_flags, "uint8")
    add("cellKey", cells, "int32")
    add("cellStart", starts, "int32")
    add("cellEnd", cell_end, "int32")
    header = {
        "format": FORMAT_VERSION, "source": args.pbf.split("/")[-1],
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"nodes": M, "edges": n_edges, "cells": len(cells)},
        "cell_deg": CELL, "cell_key": "floor(lat/cell)*100000 + floor(lon/cell), lat and lon >= 0",
        "flags": {"walk": F_WALK, "bike": F_BIKE, "flag_shift": 4, "kind_mask": 15},
        "walk_speed": WALK_SPEED, "bike_speed": BIKE_SPEED,
        "sections": sections,
    }
    hjson = json.dumps(header, separators=(",", ":")).encode()
    while (4 + len(hjson)) % 4:
        hjson += b" "
    raw = struct.pack("<I", len(hjson)) + hjson + bytes(body)
    with gzip.open(args.out, "wb", compresslevel=9) as f:
        f.write(raw)
    import os
    log(f"wrote {args.out}: {len(raw)/1e6:.1f} MB raw, {os.path.getsize(args.out)/1e6:.1f} MB gzip, {time.time()-t0:.0f}s")
    print(json.dumps({"nodes": M, "edges": n_edges, "raw_bytes": len(raw), "gz_bytes": os.path.getsize(args.out), "seconds": round(time.time() - t0)}))


if __name__ == "__main__":
    main()
