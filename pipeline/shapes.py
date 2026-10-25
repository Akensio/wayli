"""GTFS shapes.txt to Wayli's compact shapes file: the course of every vehicle route.

Each shape is simplified (Douglas-Peucker, 6 m by default) and stored as int32 coordinates in
1e-5 degrees. The timetable compiler (compile.py --shapes) then records, per pattern, which shape it
runs on and where each of its stops falls along it, so the app can draw a ride between two stops
along the road or the track instead of a straight line.

Container (like the timetable): u32 header length, JSON header, sections. Sections: shapeId int32[S]
(GTFS shape ids, ascending), shapeOff int32[S+1] (point offsets), ptLat int32[N], ptLon int32[N].
"""
import argparse
import csv
import gzip
import io
import json
import math
import struct
import sys
import time
import zipfile

import numpy as np

FORMAT_VERSION = 1


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def simplify_mask(lat, lon, tol_m):
    """Douglas-Peucker on a polyline (degrees): which points to keep."""
    n = len(lat)
    if n <= 2:
        return np.ones(n, bool)
    ky = 110540.0
    kx = 111320.0 * math.cos(math.radians(float(lat.mean())))
    x = lon * kx
    y = lat * ky
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        dx = x[b] - x[a]
        dy = y[b] - y[a]
        seg2 = dx * dx + dy * dy
        px = x[a + 1:b] - x[a]
        py = y[a + 1:b] - y[a]
        if seg2 == 0:
            d = np.hypot(px, py)
        else:
            t = np.clip((px * dx + py * dy) / seg2, 0.0, 1.0)
            d = np.hypot(px - t * dx, py - t * dy)
        i = int(np.argmax(d))
        if d[i] > tol_m:
            m = a + 1 + i
            keep[m] = True
            stack.append((a, m))
            stack.append((m, b))
    return keep


def read_shapes_txt(zf, tol_m):
    """shape_id -> (lat, lon) float64 arrays, simplified. Rows are grouped by shape in the feed; a
    shape split across the file is merged."""
    shapes = {}
    n_rows = 0
    with zf.open("shapes.txt") as raw:
        f = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        reader = csv.reader(f)
        header = next(reader)
        col = {name: i for i, name in enumerate(header)}
        ci, cla, clo, cs = col["shape_id"], col["shape_pt_lat"], col["shape_pt_lon"], col["shape_pt_sequence"]
        cur = None
        buf = None

        def flush(sid, b):
            seq = np.array(b[0], np.int64)
            order = np.argsort(seq, kind="stable")
            lat = np.array(b[1], np.float64)[order]
            lon = np.array(b[2], np.float64)[order]
            if sid in shapes:  # the shape continued later in the file: merge by sequence
                plat, plon, pseq = shapes[sid]
                seq2 = np.concatenate([pseq, seq[order]])
                order2 = np.argsort(seq2, kind="stable")
                lat = np.concatenate([plat, lat])[order2]
                lon = np.concatenate([plon, lon])[order2]
                seq = seq2[order2]
            else:
                seq = seq[order]
            shapes[sid] = (lat, lon, seq)

        for row in reader:
            n_rows += 1
            sid = int(row[ci])
            if sid != cur:
                if cur is not None:
                    flush(cur, buf)
                cur = sid
                buf = [[], [], []]
            buf[0].append(int(row[cs]))
            buf[1].append(float(row[cla]))
            buf[2].append(float(row[clo]))
            if n_rows % 2_000_000 == 0:
                log(f"  shapes.txt: {n_rows/1e6:.0f}M rows")
        if cur is not None:
            flush(cur, buf)
    log(f"shapes.txt: {n_rows} rows, {len(shapes)} shapes")
    out = {}
    n_in = n_out = 0
    for sid, (lat, lon, _) in shapes.items():
        # drop repeated points, then simplify
        d = np.ones(len(lat), bool)
        d[1:] = (np.diff(lat) != 0) | (np.diff(lon) != 0)
        lat, lon = lat[d], lon[d]
        keep = simplify_mask(lat, lon, tol_m)
        n_in += len(lat)
        n_out += int(keep.sum())
        out[sid] = (lat[keep], lon[keep])
    log(f"simplified {n_in} -> {n_out} points ({tol_m} m)")
    return out


def write(path, shapes):
    ids = np.array(sorted(shapes), np.int32)
    offs = np.zeros(len(ids) + 1, np.int32)
    lats, lons = [], []
    for i, sid in enumerate(ids):
        lat, lon = shapes[int(sid)]
        offs[i + 1] = offs[i] + len(lat)
        lats.append(np.round(lat * 1e5).astype(np.int32))
        lons.append(np.round(lon * 1e5).astype(np.int32))
    pt_lat = np.concatenate(lats) if lats else np.zeros(0, np.int32)
    pt_lon = np.concatenate(lons) if lons else np.zeros(0, np.int32)
    sections, blobs, off = [], [], 0
    for name, arr in (("shapeId", ids), ("shapeOff", offs), ("ptLat", pt_lat), ("ptLon", pt_lon)):
        b = arr.astype("<i4").tobytes()
        sections.append({"name": name, "dtype": "int32", "offset": off, "length": len(arr)})
        blobs.append(b)
        off += len(b)
    header = {"format": FORMAT_VERSION, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "counts": {"shapes": int(len(ids)), "points": int(len(pt_lat))}, "sections": sections}
    hjson = json.dumps(header, separators=(",", ":")).encode("utf-8")
    while (4 + len(hjson)) % 4:
        hjson += b" "
    raw = struct.pack("<I", len(hjson)) + hjson + b"".join(blobs)
    with gzip.open(path, "wb", compresslevel=6) as f:
        f.write(raw)
    return len(raw)


def read_shapes(path):
    """The compact file back: {shape_id: (lat, lon) float64 arrays}, for the compiler."""
    with gzip.open(path, "rb") as f:
        raw = f.read()
    hlen = struct.unpack_from("<I", raw, 0)[0]
    header = json.loads(raw[4:4 + hlen].decode("utf-8"))
    base = 4 + hlen
    arrs = {}
    for s in header["sections"]:
        arrs[s["name"]] = np.frombuffer(raw, dtype="<i4", count=s["length"], offset=base + s["offset"])
    ids, offs = arrs["shapeId"], arrs["shapeOff"]
    lat, lon = arrs["ptLat"].astype(np.float64) / 1e5, arrs["ptLon"].astype(np.float64) / 1e5
    return {int(ids[i]): (lat[offs[i]:offs[i + 1]], lon[offs[i]:offs[i + 1]]) for i in range(len(ids))}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("gtfs")
    ap.add_argument("--out", default="data/shapes.bin.gz")
    ap.add_argument("--tolerance", type=float, default=6.0, help="metres: simplification tolerance")
    args = ap.parse_args()
    t0 = time.time()
    zf = zipfile.ZipFile(args.gtfs)
    shapes = read_shapes_txt(zf, args.tolerance)
    n = write(args.out, shapes)
    import os
    log(f"wrote {args.out}: {n/1e6:.1f} MB raw, {os.path.getsize(args.out)/1e6:.1f} MB gzip, {len(shapes)} shapes, in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
